export type PreparedImage = { mediaType: "image/jpeg"; data: string };

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Downscale to max 1568px and re-encode as JPEG so the upload stays small and under the model's image limit. */
export async function prepareImage(file: File, maxSide = 1568, quality = 0.85): Promise<PreparedImage> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", quality));
  return { mediaType: "image/jpeg", data: b64(new Uint8Array(await blob.arrayBuffer())) };
}

/** First bytes of the ORIGINAL file (before resizing strips metadata) for server-side forensic checks. */
export async function readHead(file: File, bytes = 96 * 1024) {
  const buf = new Uint8Array(await file.slice(0, bytes).arrayBuffer());
  return { headB64: b64(buf), size: file.size, type: file.type || "application/octet-stream" };
}
