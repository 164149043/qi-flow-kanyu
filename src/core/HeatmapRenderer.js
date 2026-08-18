// HeatmapRenderer.js —— 三模式热力图渲染（对齐 xunqi 参考版 heat-canvas.js）
// 浅色地板 + 热成像浓度：炁流/采光=绿黄红，风场=深蓝青白黄红气动色
// 双线性亚像素采样（平滑无锯齿）+ gamma 提升低值可见度 + 地板 alpha 混合
// 风场=速度40%+涡量60%（涡旋清晰）+ 伪3D气动（迎风压缩/背风暗影/屋面加速）+ 边界裁剪
import { bearingToDir } from '../fengshui/Bazhai.js';

// 热力色图（绿→黄→红）：energy/light 用
const STOPS = [
  [0.00, 10, 90, 36], [0.18, 63, 174, 42], [0.38, 165, 212, 0],
  [0.55, 255, 230, 0], [0.75, 255, 140, 0], [1.00, 255, 30, 0],
];
// 气动色图（深蓝→青→白→黄→红）：speed 用
const STOPS_AERO = [
  [0.00, 10, 20, 80], [0.15, 20, 60, 180], [0.35, 30, 160, 220],
  [0.55, 120, 220, 230], [0.75, 255, 220, 80], [1.00, 255, 50, 30],
];
const FLOOR_RGB = [225, 229, 235];   // 地板浅灰
const WALL_RGB = [248, 249, 251];    // 墙体近白
const GLASS_RGB = [186, 216, 238];   // 玻璃浅蓝
const SPEED_MAX = 22;                // 风场速度归一化上限（提高：风口speed提升后避免全场饱和满屏）

function stopLerp(stops, t) {
  for (let s = 0; s < stops.length - 1; s++) {
    const t0 = stops[s][0], t1 = stops[s + 1][0];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        stops[s][1] + (stops[s + 1][1] - stops[s][1]) * f,
        stops[s][2] + (stops[s + 1][2] - stops[s][2]) * f,
        stops[s][3] + (stops[s + 1][3] - stops[s][3]) * f,
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

export class HeatmapRenderer {
  constructor(canvas, W, H, scale = 4) {
    this.W = W; this.H = H; this.scale = scale;
    canvas.width = W * scale;
    canvas.height = H * scale;
    this.ctx = canvas.getContext('2d');
    this.img = this.ctx.createImageData(canvas.width, canvas.height);
    this.dyeMaxEMA = 0.001;     // dye EMA 归一化（energy/speed）
    this.lightMaxEMA = 0.001;   // light EMA 归一化（light）
  }

  setMode(m) { /* 色带按 render 的 mode 参数走，无需状态 */ }

  /** 双线性插值采样（亚像素平滑，对齐 FluidSolver.sample）*/
  _sample(f0, x, y, SW) {
    const { W, H } = this;
    if (x < 0.5) x = 0.5; else if (x > W + 0.5) x = W + 0.5;
    if (y < 0.5) y = 0.5; else if (y > H + 0.5) y = H + 0.5;
    const i0 = x | 0, i1 = i0 + 1;
    const j0 = y | 0, j1 = j0 + 1;
    const s1 = x - i0, s0 = 1 - s1;
    const t1 = y - j0, t0 = 1 - t1;
    return s0 * (t0 * f0[i0 + SW * j0] + t1 * f0[i0 + SW * j1]) +
           s1 * (t0 * f0[i1 + SW * j0] + t1 * f0[i1 + SW * j1]);
  }

  /**
   * 渲染一帧
   * @param mode 'energy'|'speed'|'light'
   * @param dye  dye 场（light 模式时传 light 场）
   * @param u,v  速度场（speed 模式用）
   * @param solid,glass 掩码
   */
  render(mode, dye, u, v, curl, solid, glass, SW, windDir = 180) {
    const { W, H, scale, img, ctx } = this;
    const W2 = W * scale, H2 = H * scale;
    const isSpeed = mode === 'speed';
    const isLight = mode === 'light';

    // EMA 自适应归一化（防爆红）—— 风场也用（风迹 dye 需归一化）
    let curMax = 0.0001;
    for (let j = 1; j <= H; j++) {
      const jSW = j * SW;
      for (let i = 1; i <= W; i++) {
        const c = i + jSW;
        if (!solid[c] && isFinite(dye[c]) && dye[c] > curMax) curMax = dye[c];
      }
    }
    if (isLight) {
      this.lightMaxEMA = Math.max(Math.min(curMax, this.lightMaxEMA * 1.3), this.lightMaxEMA * 0.92);
      if (!isFinite(this.lightMaxEMA) || this.lightMaxEMA <= 0) this.lightMaxEMA = 0.001;
    } else {
      this.dyeMaxEMA = Math.max(Math.min(curMax, this.dyeMaxEMA * 1.3), this.dyeMaxEMA * 0.92);
      if (!isFinite(this.dyeMaxEMA) || this.dyeMaxEMA <= 0) this.dyeMaxEMA = 0.001;
    }
    const norm = (isLight ? this.lightMaxEMA : this.dyeMaxEMA) * 0.9;

    // 风场伪3D气动方向向量（迎风/背风/屋面判断用）
    const wd = ((Math.round(windDir) % 360) + 360) % 360;
    const wdir = bearingToDir(wd);
    const wnx = wdir.x, wnz = wdir.z;

    const px = img.data;
    for (let py = 0; py < H2; py++) {
      const gy = (py + 0.5) / scale;
      const gj = Math.min(H - 1, gy | 0);
      const pyRow = py * W2;
      for (let pxx = 0; pxx < W2; pxx++) {
        const gx = (pxx + 0.5) / scale;
        const gi = Math.min(W - 1, gx | 0);
        const c = (gi + 1) + SW * (gj + 1);
        const o = (pyRow + pxx) * 4;

        // 墙 / 玻璃
        if (solid[c]) {
          // 风场边界裁剪：外边界墙画地板色低 alpha（开放边界，不显示风能）
          if (isSpeed && (gi === 0 || gi === W - 1 || gj === 0 || gj === H - 1)) {
            px[o] = FLOOR_RGB[0]; px[o + 1] = FLOOR_RGB[1]; px[o + 2] = FLOOR_RGB[2]; px[o + 3] = 180;
            continue;
          }
          const rgb = glass[c] ? GLASS_RGB : WALL_RGB;
          px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
          continue;
        }

        // 归一化场值 t（双线性亚像素采样）
        let t;
        if (isSpeed) {
          // 风场=速度40% + 涡量60%（涡旋清晰，对齐原站 renderHeat）
          const su = this._sample(u, gx + 1, gy + 1, SW);
          const sv = this._sample(v, gx + 1, gy + 1, SW);
          const sc = this._sample(curl, gx + 1, gy + 1, SW);
          const speedT = Math.min(1, Math.hypot(su, sv) / SPEED_MAX);
          const curlT = Math.min(1, Math.abs(sc) * 3.0);
          const dyeT = Math.min(1, Math.abs(this._sample(dye, gx + 1, gy + 1, SW)) / norm);   // 风迹 dye 流动痕迹
          t = Math.max(speedT * 0.4 + curlT * 0.6, dyeT);   // 速度涡量结构 + dye 流动痕迹
          // 伪3D气动（solid 当建筑：迎风压缩/背风空腔/屋面加速）
          const gi3 = Math.round(gx), gj3 = Math.round(gy);
          if (gi3 >= 1 && gi3 <= W && gj3 >= 1 && gj3 <= H) {
            const fi = Math.round(gi3 + wnx), fj = Math.round(gj3 + wnz);   // 迎风方向邻格
            const bi = Math.round(gi3 - wnx), bj = Math.round(gj3 - wnz);    // 背风方向邻格
            if (fi >= 1 && fi <= W && fj >= 1 && fj <= H && solid[fi + SW * fj]) t = Math.min(1, t + 0.25);  // 迎风压缩高亮
            if (bi >= 1 && bi <= W && bj >= 1 && bj <= H && solid[bi + SW * bj]) t *= 0.55;                  // 背风空腔暗影
            let nearB = false;                                                                                // 屋面加速
            for (let nb = -1; nb <= 1 && !nearB; nb++)
              for (let mb = -1; mb <= 1 && !nearB; mb++) {
                const ni = gi3 + mb, nj = gj3 + nb;
                if (ni >= 1 && ni <= W && nj >= 1 && nj <= H && solid[ni + SW * nj]) nearB = true;
              }
            if (nearB) t = Math.min(1, t * 1.15);
          }
        } else {
          t = this._sample(dye, gx + 1, gy + 1, SW) / norm;
        }
        if (!isFinite(t) || t < 0) t = 0; else if (t > 1) t = 1;
        t = Math.pow(t, isSpeed ? 0.5 : 0.75);   // gamma：提升中低浓度可见度

        // 地板混合：极弱→地板色，否则热力色按 alpha 混入
        if (t < 0.03) {
          px[o] = FLOOR_RGB[0]; px[o + 1] = FLOOR_RGB[1]; px[o + 2] = FLOOR_RGB[2]; px[o + 3] = 255;
        } else {
          const col = stopLerp(isSpeed ? STOPS_AERO : STOPS, t);
          const a = Math.min(1, t * (isSpeed ? 1.6 : 2.0)) * (isSpeed ? 0.88 : 0.95);
          px[o]     = FLOOR_RGB[0] * (1 - a) + col[0] * a;
          px[o + 1] = FLOOR_RGB[1] * (1 - a) + col[1] * a;
          px[o + 2] = FLOOR_RGB[2] * (1 - a) + col[2] * a;
          px[o + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
