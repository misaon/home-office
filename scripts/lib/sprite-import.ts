import { blank, keyOut, setPixel, type Rgba } from "./png.ts";

export const trimTransparent = (image: Rgba): Rgba => {
  let left = image.width;
  let right = -1;
  let top = image.height;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top) {
    throw new Error("Cannot trim an empty image");
  }
  const result = blank(right - left + 1, bottom - top + 1);
  for (let y = 0; y < result.height; y += 1) {
    const from = ((top + y) * image.width + left) * 4;
    result.data.set(image.data.subarray(from, from + result.width * 4), y * result.width * 4);
  }
  return result;
};

export const resize = (image: Rgba, size: number): Rgba => {
  const result = blank(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.floor(((x + 0.5) * image.width) / size);
      const sy = Math.floor(((y + 0.5) * image.height) / size);
      const i = (sy * image.width + sx) * 4;
      setPixel(result, x, y, [
        image.data[i] ?? 0,
        image.data[i + 1] ?? 0,
        image.data[i + 2] ?? 0,
        image.data[i + 3] ?? 0,
      ]);
    }
  }
  return result;
};

export const removeChroma = (result: Rgba): void => {
  keyOut(result);
  // The generator leaves dark chroma fringes; remove only magenta-dominant pixels.
  for (let i = 0; i < result.data.length; i += 4) {
    const r = result.data[i] ?? 0;
    const g = result.data[i + 1] ?? 0;
    const b = result.data[i + 2] ?? 0;
    if (r > 60 && b > 60 && r > b * 0.7 && b > r * 0.7 && g < Math.min(r, b) * 0.65) {
      result.data[i + 3] = 0;
    }
  }
};
