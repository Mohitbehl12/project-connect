// iPhone and Android: converts the picked photo (HEIC on iPhone, often 5–12 MB) to a JPEG of at most
// 1600 px on the long side before upload, so the server can always read it and uploads stay quick.
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const MAX_SIDE = 1600;

export async function appendPhoto(form: FormData, asset: { uri: string; width?: number; height?: number }, name = "photo.jpg") {
  const w = asset.width ?? 0, h = asset.height ?? 0;
  const resize = Math.max(w, h) > MAX_SIDE ? [{ resize: w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE } }] : [];
  let uri = asset.uri;
  try {
    uri = (await manipulateAsync(asset.uri, resize, { compress: 0.85, format: SaveFormat.JPEG })).uri;
  } catch { /* fall back to the original file; the server explains if it can't read it */ }
  form.append("file", { uri, name, type: "image/jpeg" } as any);
}
