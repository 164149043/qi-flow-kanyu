// LineDetector.js —— 墙体识别管线（升级版：Sauvola 自适应阈值 + 形态学膨胀 + 可调灵敏度/去噪）
// 分步导出供 PlanEditor 缓存复用：binarize（重）→ binToGridSolid（轻，滑块实时触发）

import {
  toGray, medianFilter, histogramStretch, otsuThreshold, sauvolaBinarize, dilate
} from './ImagePreprocess.js';

// Sobel 边缘强度（备用）
export function sobel(gray, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1]
        + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
        + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      const mag = Math.sqrt(gx * gx + gy * gy);
      out[i] = mag > 255 ? 255 : mag | 0;
    }
  }
  return out;
}

// 预处理：ImageData → 增强灰度
// 注意：medianFilter 默认关——它会抹掉 1px 细线（3×3 窗口里细线被背景中值吞掉）
// 椒盐噪点改由 Sauvola + denoise(minSize) 处理，保留细墙线
export function preprocessImage(imgData, opts = {}) {
  const { width, height } = imgData;
  let gray = toGray(imgData);
  if (opts.median) gray = medianFilter(gray, width, height);
  gray = histogramStretch(gray, width, height);
  return { gray, w: width, h: height };
}

// 二值化：gray → bin（墙=1）。method: 'sauvola'(默认,浅线鲁棒) | 'otsu'
export function binarize(gray, w, h, opts = {}) {
  const method = opts.method ?? 'sauvola';
  if (method === 'otsu') {
    const thr = otsuThreshold(gray, w, h);
    const bin = new Uint8Array(w * h);
    for (let i = 0; i < bin.length; i++) bin[i] = gray[i] <= thr ? 1 : 0;
    return { bin, threshold: thr };
  }
  const bin = sauvolaBinarize(gray, w, h, { window: opts.window ?? 15, k: opts.k ?? 0.2 });
  return { bin, threshold: -1 };
}

// 去噪：删除小连通区域（对照原站 wallCleanThreshold）
export function denoiseSolid(solid, W, H, SW, minSize) {
  const visited = new Uint8Array(SW * (H + 2));
  const stack = [];
  const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let j = 1; j <= H; j++) {
    for (let i = 1; i <= W; i++) {
      const start = i + SW * j;
      if (!solid[start] || visited[start]) continue;
      const comp = [];
      stack.length = 0; stack.push(start); visited[start] = 1;
      while (stack.length) {
        const c = stack.pop();
        comp.push(c);
        const ci = c % SW, cj = (c / SW) | 0;
        for (let k = 0; k < 4; k++) {
          const ni = ci + nbrs[k][0], nj = cj + nbrs[k][1];
          if (ni < 1 || ni > W || nj < 1 || nj > H) continue;
          const nc = ni + SW * nj;
          if (solid[nc] && !visited[nc]) { visited[nc] = 1; stack.push(nc); }
        }
      }
      if (comp.length < minSize) for (const c of comp) solid[c] = 0;
    }
  }
}

// 二值图 → 网格 solid：膨胀(连细线) + downsample(wallRatio灵敏度) + 去噪(minSize)
export function binToGridSolid(bin, imgW, imgH, gridW, gridH, opts = {}) {
  const dilateTimes = opts.dilate ?? 1;
  const wallRatio = opts.wallRatio ?? 0.10;
  const minSize = opts.minSize ?? Math.max(3, Math.round(gridW * gridH * 0.0008));
  const b = dilateTimes > 0 ? dilate(bin, imgW, imgH, dilateTimes) : bin;
  const SW = gridW + 2;
  const solid = new Uint8Array(SW * (gridH + 2));
  const cellW = imgW / gridW, cellH = imgH / gridH;
  for (let gj = 0; gj < gridH; gj++) {
    for (let gi = 0; gi < gridW; gi++) {
      let wall = 0, total = 0;
      const x0 = Math.floor(gi * cellW), x1 = Math.floor((gi + 1) * cellW);
      const y0 = Math.floor(gj * cellH), y1 = Math.floor((gj + 1) * cellH);
      const step = Math.max(1, Math.floor(Math.min(cellW, cellH) / 8));
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) {
          total++;
          if (b[y * imgW + x]) wall++;
        }
      }
      if (total > 0 && wall / total > wallRatio) solid[(gi + 1) + SW * (gj + 1)] = 1;
    }
  }
  denoiseSolid(solid, gridW, gridH, SW, minSize);
  return { solid, SW };
}

// 兼容旧接口：图片 → solid（全流程，默认 Sauvola）
export function recognizePlan(imgData, gridW, gridH, opts = {}) {
  const { gray, w, h } = preprocessImage(imgData);
  const { bin, threshold } = binarize(gray, w, h, opts);
  const result = binToGridSolid(bin, w, h, gridW, gridH, opts);
  return { solid: result.solid, SW: result.SW, threshold };
}

// 兼容旧导出
export { otsuThreshold };
