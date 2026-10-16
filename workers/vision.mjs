// On-server image checks, run as a separate process started on demand by src/lib/vision.ts, so its
// memory never touches the app. Exits after 5 idle minutes or when the app stops.
//   nsfw  — nudity check (nsfwjs MobileNetV2Mid, bundled in the npm package)
//   faces — face detection + 128-number face descriptors (@vladmandic/face-api, models bundled)
// Input pixels are raw RGB prepared by the app (sharp). Nothing is stored here.
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const tf = require("@tensorflow/tfjs");
const faceapi = require("@vladmandic/face-api/dist/face-api.node-wasm.js");

let ready = null;
async function init() {
  ready ??= (async () => {
    await tf.setBackend("wasm").catch(() => tf.setBackend("cpu"));
    await tf.ready();
  })();
  return ready;
}
let nsfwModel = null;
async function nsfw() {
  nsfwModel ??= (async () => { const n = await import("nsfwjs"); return n.load("MobileNetV2Mid"); })();
  return nsfwModel;
}
let faceModels = null;
async function faces() {
  faceModels ??= (async () => {
    const dir = path.join(path.dirname(require.resolve("@vladmandic/face-api/package.json")), "model");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(dir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(dir);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(dir);
  })();
  return faceModels;
}

let idle = null;
const touch = () => { clearTimeout(idle); idle = setTimeout(() => process.exit(0), 5 * 60_000); };

process.on("message", async (msg) => {
  touch();
  try {
    await init();
    const px = new Uint8Array(Buffer.from(msg.rgb, "base64"));
    const x = tf.tensor3d(px, [msg.h, msg.w, 3], "int32");
    try {
      if (msg.task === "nsfw") {
        const preds = await (await nsfw()).classify(x);
        process.send({ id: msg.id, ok: true, result: Object.fromEntries(preds.map((p) => [p.className, p.probability])) });
      } else {
        await faces();
        const found = await faceapi.detectAllFaces(x, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks().withFaceDescriptors();
        process.send({ id: msg.id, ok: true, result: found.map((f) => ({ score: f.detection.score, box: f.detection.box, descriptor: Array.from(f.descriptor) })) });
      }
    } finally { x.dispose(); }
  } catch (e) {
    process.send({ id: msg.id, ok: false, error: String(e?.message ?? e) });
  }
});
touch();
process.on("disconnect", () => process.exit(0)); // the app stopped
