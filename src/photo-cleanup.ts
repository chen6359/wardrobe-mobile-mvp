type CleanupProgress = {
  phase: "loading" | "removing" | "arranging";
  progress: number;
};

type ProgressCallback = (value: CleanupProgress) => void;

type RawImageLike = {
  toCanvas: () => HTMLCanvasElement;
};

type BackgroundRemover = (image: string) => Promise<RawImageLike[]>;

let removerPromise: Promise<BackgroundRemover> | null = null;

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function progressValue(event: unknown) {
  if (!event || typeof event !== "object") return null;
  const value = "progress" in event ? Number(event.progress) : Number.NaN;
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : null;
}

async function getBackgroundRemover(onProgress: ProgressCallback) {
  if (!removerPromise) {
    removerPromise = import("@huggingface/transformers").then(async ({ env, pipeline }) => {
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const remover = await pipeline("background-removal", "Xenova/modnet", {
        dtype: "q8",
        device: "wasm",
        progress_callback: (event: unknown) => {
          const progress = progressValue(event);
          if (progress !== null) onProgress({ phase: "loading", progress: Math.min(.72, progress * .72) });
        },
      });
      return remover as unknown as BackgroundRemover;
    }).catch((error) => {
      removerPromise = null;
      throw error;
    });
  }
  return removerPromise;
}

function alphaBounds(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取图片");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  let visible = 0;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (pixels[(y * canvas.width + x) * 4 + 3] < 22) continue;
      visible += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const sampled = Math.ceil(canvas.width / 2) * Math.ceil(canvas.height / 2);
  const coverage = visible / sampled;
  if (right < left || bottom < top || coverage < .015 || coverage > .96) {
    throw new Error("没有找到清晰的衣物主体");
  }
  const paddingX = (right - left) * .055;
  const paddingY = (bottom - top) * .055;
  return {
    x: Math.max(0, left - paddingX),
    y: Math.max(0, top - paddingY),
    width: Math.min(canvas.width, right + paddingX) - Math.max(0, left - paddingX),
    height: Math.min(canvas.height, bottom + paddingY) - Math.max(0, top - paddingY),
  };
}

function colorDistance(red: number, green: number, blue: number, background: number[]) {
  const redMean = (red + background[0]) / 2;
  const redDelta = red - background[0];
  const greenDelta = green - background[1];
  const blueDelta = blue - background[2];
  return Math.sqrt(
    (2 + redMean / 256) * redDelta * redDelta
      + 4 * greenDelta * greenDelta
      + (2 + (255 - redMean) / 256) * blueDelta * blueDelta,
  );
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function uniformBackgroundCutout(source: string) {
  const image = await loadImage(source);
  const scale = Math.min(1, 900 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取照片背景");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  const borderSamples: number[][] = [];
  const addSample = (x: number, y: number) => {
    const offset = (y * canvas.width + x) * 4;
    borderSamples.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
  };
  const step = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / 140));
  for (let x = 0; x < canvas.width; x += step) {
    addSample(x, 0);
    addSample(x, canvas.height - 1);
  }
  for (let y = step; y < canvas.height - step; y += step) {
    addSample(0, y);
    addSample(canvas.width - 1, y);
  }
  const background = [0, 1, 2].map((channel) => median(borderSamples.map((sample) => sample[channel])));
  const uniformity = borderSamples.filter((sample) => colorDistance(sample[0], sample[1], sample[2], background) < 42).length / borderSamples.length;
  if (uniformity < .72) throw new Error("背景不是单一颜色");

  const width = canvas.width;
  const height = canvas.height;
  const total = width * height;
  const backgroundMask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let queueStart = 0;
  let queueEnd = 0;
  const canRemove = (index: number) => {
    const offset = index * 4;
    return colorDistance(pixels[offset], pixels[offset + 1], pixels[offset + 2], background) < 58;
  };
  const enqueue = (index: number) => {
    if (backgroundMask[index] || !canRemove(index)) return;
    backgroundMask[index] = 1;
    queue[queueEnd] = index;
    queueEnd += 1;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (queueStart < queueEnd) {
    const index = queue[queueStart];
    queueStart += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  let subjectPixels = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    if (backgroundMask[index]) {
      pixels[offset + 3] = 0;
      continue;
    }
    subjectPixels += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const touchesBackground = (x > 0 && backgroundMask[index - 1])
      || (x + 1 < width && backgroundMask[index + 1])
      || (y > 0 && backgroundMask[index - width])
      || (y + 1 < height && backgroundMask[index + width]);
    if (touchesBackground) {
      const distance = colorDistance(pixels[offset], pixels[offset + 1], pixels[offset + 2], background);
      pixels[offset + 3] = Math.max(90, Math.min(255, Math.round((distance - 34) / 24 * 255)));
    }
  }
  const coverage = subjectPixels / total;
  if (coverage < .018 || coverage > .86) throw new Error("衣物主体边界不清楚");
  context.putImageData(frame, 0, 0);
  return canvas;
}

function hasLargeInteriorHoles(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return true;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const total = canvas.width * canvas.height;
  const outside = new Uint8Array(total);
  const queue = new Int32Array(total);
  let start = 0;
  let end = 0;
  const isTransparent = (index: number) => data[index * 4 + 3] < 32;
  const enqueue = (index: number) => {
    if (outside[index] || !isTransparent(index)) return;
    outside[index] = 1;
    queue[end] = index;
    end += 1;
  };
  for (let x = 0; x < canvas.width; x += 1) {
    enqueue(x);
    enqueue((canvas.height - 1) * canvas.width + x);
  }
  for (let y = 1; y < canvas.height - 1; y += 1) {
    enqueue(y * canvas.width);
    enqueue(y * canvas.width + canvas.width - 1);
  }
  while (start < end) {
    const index = queue[start];
    start += 1;
    const x = index % canvas.width;
    const y = Math.floor(index / canvas.width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < canvas.width) enqueue(index + 1);
    if (y > 0) enqueue(index - canvas.width);
    if (y + 1 < canvas.height) enqueue(index + canvas.width);
  }
  let opaque = 0;
  let enclosed = 0;
  for (let index = 0; index < total; index += 1) {
    if (data[index * 4 + 3] >= 32) opaque += 1;
    else if (!outside[index]) enclosed += 1;
  }
  return opaque === 0 || enclosed / opaque > .025;
}

function neutralCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法整理图片");
  const gradient = context.createLinearGradient(0, 0, 900, 900);
  gradient.addColorStop(0, "#f8f8f6");
  gradient.addColorStop(1, "#eceeea");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 900, 900);
  return { canvas, context };
}

function composeCutout(subject: HTMLCanvasElement) {
  const bounds = alphaBounds(subject);
  const { canvas, context } = neutralCanvas();
  const maxWidth = 730;
  const maxHeight = 760;
  const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2 - 5;

  context.save();
  context.shadowColor = "rgba(20, 40, 61, .16)";
  context.shadowBlur = 30;
  context.shadowOffsetY = 16;
  context.drawImage(subject, bounds.x, bounds.y, bounds.width, bounds.height, x, y, width, height);
  context.restore();
  context.drawImage(subject, bounds.x, bounds.y, bounds.width, bounds.height, x, y, width, height);
  return canvas.toDataURL("image/jpeg", .86);
}

export async function arrangePhotoWithoutCutout(source: string) {
  const image = await loadImage(source);
  const { canvas, context } = neutralCanvas();
  const scale = Math.min(820 / image.width, 820 / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  context.save();
  context.shadowColor = "rgba(20, 40, 61, .12)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 12;
  context.drawImage(image, x, y, width, height);
  context.restore();
  context.drawImage(image, x, y, width, height);
  return canvas.toDataURL("image/jpeg", .84);
}

export async function removeBackgroundAndArrange(source: string, onProgress: ProgressCallback) {
  onProgress({ phase: "removing", progress: .08 });
  try {
    const productCutout = await uniformBackgroundCutout(source);
    onProgress({ phase: "arranging", progress: .86 });
    const cleaned = composeCutout(productCutout);
    onProgress({ phase: "arranging", progress: 1 });
    return cleaned;
  } catch {
    // A varied background needs the semantic model. Product photos stay on the faster, detail-preserving path above.
  }
  onProgress({ phase: "loading", progress: .12 });
  const remover = await getBackgroundRemover(onProgress);
  onProgress({ phase: "removing", progress: .78 });
  const result = await remover(source);
  if (!result[0]) throw new Error("没有生成衣物主体");
  const cutout = result[0].toCanvas();
  if (hasLargeInteriorHoles(cutout)) throw new Error("衣物细节不完整");
  onProgress({ phase: "arranging", progress: .93 });
  const cleaned = composeCutout(cutout);
  onProgress({ phase: "arranging", progress: 1 });
  return cleaned;
}
