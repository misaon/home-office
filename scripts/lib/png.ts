import sharp from "sharp";

export type Rgba = { width: number; height: number; data: Uint8Array };

export const blank = (width: number, height: number): Rgba => ({
  width,
  height,
  data: new Uint8Array(width * height * 4),
});

const setPixel = (
  img: Rgba,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
    return;
  }
  const i = (y * img.width + x) * 4;
  img.data.set(rgba, i);
};

export const fillRect = (
  img: Rgba,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: readonly [number, number, number, number],
): void => {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      setPixel(img, xx, yy, rgba);
    }
  }
};

export const encodePng = (img: Rgba): Promise<Buffer> =>
  sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

export async function decodePng(bytes: Uint8Array): Promise<Rgba> {
  const image = sharp(bytes, { limitInputPixels: 4096 * 4096, failOn: "warning" });
  const metadata = await image.metadata();
  if (metadata.format !== "png") {
    throw new Error("expected a PNG image");
  }
  const { data, info } = await image
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}
