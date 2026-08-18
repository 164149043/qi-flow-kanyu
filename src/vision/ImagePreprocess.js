// ImagePreprocess.js —— 户型图预处理 + 二值化（升级版）
// 灰度 → 中值滤波 → 直方图拉伸 → Sauvola自适应阈值（替代Otsu，浅线/底纹鲁棒）→ 形态学膨胀

// ImageData → Uint8 灰度
export function toGray(img) {
  const { data, width, height } = img;
  const n = width * height;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    gray[i] = (data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114) | 0;
  }
  return gray;
}

// 中值滤波 3×3（去椒盐噪、保边）
export function medianFilter(gray, w, h) {
  const out = new Uint8Array(w * h);
  const win = new Uint8Array(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx < 0 ? 0 : (x + dx >= w ? w - 1 : x + dx);
          const yy = y + dy < 0 ? 0 : (y + dy >= h ? h - 1 : y + dy);
          win[n++] = gray[yy * w + xx];
        }
      }
      win.sort();
      out[y * w + x] = win[4];
    }
  }
  return out;
}

// 直方图拉伸（分位拉伸增强对比）
export function histogramStretch(gray, w, h, lowPct = 0.02, highPct = 0.98) {
  const hist = new Array(256).fill(0);
  const n = w * h;
  for (let i = 0; i < n; i++) hist[gray[i]]++;
  let acc = 0, low = 0, high = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc / n < lowPct) low = v;
    if (acc / n < highPct) high = v;
  }
  if (high <= low) high = low + 1;
  const scale = 255 / (high - low);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let v = (gray[i] - low) * scale;
    out[i] = v < 0 ? 0 : (v > 255 ? 255 : v | 0);
  }
  return out;
}

// Otsu 全局阈值（保留，作为对比/后备）
export function otsuThreshold(gray, w, h) {
  const hist = new Array(256).fill(0);
  const n = w * h;
  for (let i = 0; i < n; i++) hist[gray[i]]++;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0, wB = 0, maxVar = 0, thr = 127;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += v * hist[v];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; thr = v; }
  }
  return thr;
}

// Sauvola 自适应阈值二值化（积分图加速，O(1)/像素）
// 每像素阈值 T = m*(1 + k*(s/R - 1))，m=局部均值 s=局部标准差 R=128
// 对浅线/底纹/光照不均鲁棒，文档线图标准算法。返回二值图：深色(墙)=1
export function sauvolaBinarize(gray, w, h, opts = {}) {
  const halfWin = opts.window ?? 15;   // 窗口半边长，实际窗口 2*halfWin+1
  const k = opts.k ?? 0.2;
  const R = 128;
  const n = w * h;
  // 积分图（像素和 + 像素平方和）
  const sum = new Float64Array(n);
  const sq = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    let rs = 0, rsq = 0;
    const yw = y * w, yw0 = (y - 1) * w;
    for (let x = 0; x < w; x++) {
      const v = gray[yw + x];
      rs += v; rsq += v * v;
      sum[yw + x] = rs + (y > 0 ? sum[yw0 + x] : 0);
      sq[yw + x] = rsq + (y > 0 ? sq[yw0 + x] : 0);
    }
  }
  const area = (I, x0, y0, x1, y1) => {
    const A = I[y1 * w + x1];
    const B = x0 > 0 ? I[y1 * w + x0 - 1] : 0;
    const C = y0 > 0 ? I[(y0 - 1) * w + x1] : 0;
    const D = (x0 > 0 && y0 > 0) ? I[(y0 - 1) * w + x0 - 1] : 0;
    return A - B - C + D;
  };
  const out = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = y > halfWin ? y - halfWin : 0;
    const y1 = y + halfWin < h - 1 ? y + halfWin : h - 1;
    for (let x = 0; x < w; x++) {
      const x0 = x > halfWin ? x - halfWin : 0;
      const x1 = x + halfWin < w - 1 ? x + halfWin : w - 1;
      const cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
      const s = area(sum, x0, y0, x1, y1);
      const sqs = area(sq, x0, y0, x1, y1);
      const m = s / cnt;
      const varr = sqs / cnt - m * m;
      const sd = Math.sqrt(varr > 0 ? varr : 0);
      const T = m * (1 + k * (sd / R - 1));
      out[y * w + x] = gray[y * w + x] <= T ? 1 : 0;   // 深(墙)<=T
    }
  }
  return out;
}

// 形态学膨胀 3×3（连接细线/断线，让细线变粗便于网格捕获）
export function dilate(bin, w, h, times = 1) {
  let cur = bin;
  for (let t = 0; t < times; t++) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const yw = y * w;
      for (let x = 0; x < w; x++) {
        const i = yw + x;
        if (cur[i]) { out[i] = 1; continue; }
        if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) ||
            (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w])) out[i] = 1;
      }
    }
    cur = out;
  }
  return cur;
}
