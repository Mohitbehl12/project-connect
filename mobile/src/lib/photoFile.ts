// Web: turns whatever the phone gives us (an iPhone HEIC photo, a 12 MB camera shot, a PNG screenshot)
// into a JPEG of at most 1600 px on the long side before it's uploaded. Safari decodes HEIC itself,
// so drawing it onto a canvas converts it. Smaller files also upload much faster on mobile data.
const MAX_SIDE = 1600;

export async function photoBlob(asset: { uri: string }): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new (globalThis as any).Image() as HTMLImageElement;
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("This browser can't open that photo. Try another photo, or a screenshot of it."));
    el.src = asset.uri;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = (globalThis as any).document.createElement("canvas") as HTMLCanvasElement;
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare that photo. Try another one."))), "image/jpeg", 0.85));
}

/** Adds the photo to a form as "file" (a JPEG). */
export async function appendPhoto(form: FormData, asset: { uri: string; width?: number; height?: number }, name = "photo.jpg") {
  form.append("file", await photoBlob(asset), name);
}
