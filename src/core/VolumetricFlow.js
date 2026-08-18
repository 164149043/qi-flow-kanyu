// VolumetricFlow.js —— 3D 体积能量粒子云
// 核心思路：能量场不是贴在地板上的色块，而是悬浮在空间中的发光粒子云
// 高度=能量强度，颜色=能量类型，大小=能量浓度，粒子随场呼吸脉动
// 炁流：靛紫→翡翠→金 的能量山峦 | 风场：风口定向发射的流动粒子 | 采光：暗琥珀→暖金的光毯

import * as THREE from 'three';

const PARTICLE_COUNT = 4000;
const BREATH_SPEED = 1.8;      // 呼吸频率
const BREATH_AMP = 0.06;       // 呼吸振幅（米）
const DRIFT_SPEED = 0.3;       // 无风时微漂速度
const WIND_FLOW = 0.5;         // 风场粒子漂移系数（速度场量级 ~25 时 ≈12格/秒，流畅不瞬移）

// 顶点着色器：per-particle 位置/大小/颜色/透明度（uFade=整云淡入淡出，模式切换用）
const VERT = `
attribute float psize;
attribute vec3 pcolor;
attribute float palpha;
uniform float uFade;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = pcolor;
  vAlpha = palpha * uFade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * (240.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

// 片元着色器：柔和圆点 + additive blending
const FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  if (d > 1.0) discard;
  float alpha = pow(1.0 - d, 2.2);
  gl_FragColor = vec4(vColor, alpha * vAlpha);
}
`;

export class VolumetricFlow {
  constructor(scene, W, H, SW, CELL) {
    this.W = W; this.H = H; this.SW = SW; this.CELL = CELL;
    this.FW = W * CELL;
    this.FD = H * CELL;
    this.count = PARTICLE_COUNT;
    this.mode = 'energy';
    this.time = 0;
    this.fade = 1; this.fadeTarget = 1; this.fadeDip = 0;   // 整云淡入淡出（模式切换过渡）
    this.lightMaxEMA = 0.001;   // 采光 EMA 自适应归一化
    this.dyeMaxEMA = 0.001;     // 炁流 EMA 自适应归一化

    // ---- 粒子状态（grid 坐标 + 世界高度 + 生命）----
    this.gx = new Float32Array(this.count);
    this.gy = new Float32Array(this.count);
    this.life = new Float32Array(this.count);    // 当前年龄
    this.maxLife = new Float32Array(this.count); // 寿命
    this.seed = new Float32Array(this.count);    // 随机种子（相位/速度差异）
    this.driftA = new Float32Array(this.count);  // 漂移角度

    this._initParticles();

    // ---- Three.js 渲染 ----
    const pos = new Float32Array(this.count * 3);
    const col = new Float32Array(this.count * 3);
    const alp = new Float32Array(this.count);
    const siz = new Float32Array(this.count);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 3));
    this.geo.setAttribute('palpha', new THREE.BufferAttribute(alp, 1));
    this.geo.setAttribute('psize', new THREE.BufferAttribute(siz, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uFade: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,   // 浅色背景上 Normal 混合（additive 会发白消失）
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  _initParticles() {
    for (let i = 0; i < this.count; i++) {
      this.gx[i] = 2 + Math.random() * (this.W - 4);
      this.gy[i] = 2 + Math.random() * (this.H - 4);
      this.life[i] = Math.random() * 5;
      this.maxLife[i] = 4 + Math.random() * 5;
      this.seed[i] = Math.random() * Math.PI * 2;
      this.driftA[i] = Math.random() * Math.PI * 2;
    }
  }

  setMode(m) {
    if (this.mode !== m && this.fadeTarget > 0) this.fadeDip = 0.85;   // energy↔light 色带互切：dip 一下遮住颜色硬跳
    this.mode = m;
  }
  setVisible(v) { this.fadeTarget = v ? 1 : 0; }   // 渐变显隐（tickFade 推进）

  /** 整云淡入淡出推进（每帧由主循环调用，speed 模式 update 停跑也要淡出）*/
  tickFade(dt) {
    this.fadeDip *= Math.pow(0.004, dt);
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 3.5);
    const fade = this.fade * (1 - this.fadeDip);
    this.mat.uniforms.uFade.value = fade;
    this.points.visible = fade > 0.01;
  }

  /** 双线性插值采样（匹配 FluidSolver.sample）*/
  _sample(f0, x, y) {
    const { W, H, SW } = this;
    if (x < 0.5) x = 0.5; else if (x > W + 0.5) x = W + 0.5;
    if (y < 0.5) y = 0.5; else if (y > H + 0.5) y = H + 0.5;
    const i0 = x | 0, i1 = i0 + 1;
    const j0 = y | 0, j1 = j0 + 1;
    const s1 = x - i0, s0 = 1 - s1;
    const t1 = y - j0, t0 = 1 - t1;
    return s0 * (t0 * f0[i0 + SW * j0] + t1 * f0[i0 + SW * j1]) +
           s1 * (t0 * f0[i1 + SW * j0] + t1 * f0[i1 + SW * j1]);
  }

  /** 网格 → 世界 */
  _toWorld(gx, gy) {
    return [
      (gx - 0.5) * this.CELL - this.FW / 2,
      (gy - 0.5) * this.CELL - this.FD / 2,
    ];
  }

  /** 炁流配色（浅色背景深色系）：深青 → 翠绿 → 橙红（与热力图绿黄红呼应）*/
  _colQi(t) {
    const c = Math.min(1, t);
    if (c < 0.35) {
      const f = c / 0.35;
      return [0.06 + f * 0.20, 0.35 + f * 0.35, 0.25 + f * 0.10];   // 深青 → 翠绿
    } else if (c < 0.70) {
      const f = (c - 0.35) / 0.35;
      return [0.26 + f * 0.55, 0.70 + f * 0.10, 0.35 - f * 0.20];   // 翠绿 → 金黄
    } else {
      const f = (c - 0.70) / 0.30;
      return [0.81 + f * 0.19, 0.80 - f * 0.55, 0.15 - f * 0.08];   // 金黄 → 朱红
    }
  }

  /** 风场配色（浅色背景深色系）：深蓝 → 青 → 白黄 */
  _colWind(t) {
    const c = Math.min(1, t);
    if (c < 0.5) {
      const f = c / 0.5;
      return [0.08 + f * 0.05, 0.18 + f * 0.45, 0.55 + f * 0.30];   // 深蓝 → 青
    } else {
      const f = (c - 0.5) / 0.5;
      return [0.13 + f * 0.75, 0.63 + f * 0.25, 0.85 - f * 0.45];   // 青 → 亮黄白
    }
  }

  /** 采光配色（浅色背景深色系）：深琥珀 → 橙 → 金 */
  _colLight(t) {
    const c = Math.min(1, t);
    return [0.35 + c * 0.60, 0.12 + c * 0.60, 0.02 + c * 0.25];
  }

  /** 随机找一个非墙位置 */
  _randomFreePos(solid) {
    for (let t = 0; t < 20; t++) {
      const gx = 2 + Math.random() * (this.W - 4);
      const gy = 2 + Math.random() * (this.H - 4);
      if (!solid[(gx | 0) + this.SW * (gy | 0)]) return [gx, gy];
    }
    return [this.W / 2, this.H / 2];
  }

  /** 主更新：每帧调用。windSrcs 用于风场模式粒子从风口发射 */
  update(dt, dye, u, v, light, solid, windSrcs) {
    this.time += dt;
    const posAttr = this.geo.attributes.position;
    const colAttr = this.geo.attributes.pcolor;
    const alpAttr = this.geo.attributes.palpha;
    const sizAttr = this.geo.attributes.psize;

    const pos = posAttr.array;
    const col = colAttr.array;
    const alp = alpAttr.array;
    const siz = sizAttr.array;

    const time = this.time;
    const isEnergy = this.mode === 'energy';
    const isSpeed = this.mode === 'speed';
    const isLight = this.mode === 'light';

    // ---- EMA 自适应归一化（炁流 dye / 采光 light）----
    if (isEnergy || isLight) {
      const field = isEnergy ? dye : light;
      let curMax = 0.0001;
      if (field) {
        for (let j = 1; j <= this.H; j += 2) {   // 隔行采样加速
          const jSW = j * this.SW;
          for (let i = 1; i <= this.W; i += 2) {
            const c = i + jSW;
            if (!solid[c] && field[c] > curMax) curMax = field[c];
          }
        }
      }
      if (isEnergy) {
        const ema = this.dyeMaxEMA;
        this.dyeMaxEMA = Math.max(Math.min(curMax, ema * 1.25), ema * 0.93);
      } else {
        const ema = this.lightMaxEMA;
        this.lightMaxEMA = Math.max(Math.min(curMax, ema * 1.25), ema * 0.93);
      }
    }
    const dyeNorm = Math.max(0.0001, this.dyeMaxEMA);
    const lightNorm = Math.max(0.0001, this.lightMaxEMA);

    // 风场：有风口时，粒子死亡优先从风口重生
    const hasWindSrcs = isSpeed && windSrcs && windSrcs.length;

    for (let i = 0; i < this.count; i++) {
      let gx = this.gx[i];
      let gy = this.gy[i];
      this.life[i] += dt;

      // 边界/墙/寿终 → 重生
      const ci = gx | 0, cj = gy | 0;
      const dead = this.life[i] > this.maxLife[i];
      const blocked = ci < 1 || cj < 1 || ci > this.W || cj > this.H || solid[ci + this.SW * cj];
      if (dead || blocked) {
        if (hasWindSrcs && Math.random() < 0.7) {
          // 从随机风口的前方锥形区域重生（风口喷涌方向可见）
          const s = windSrcs[(Math.random() * windSrcs.length) | 0];
          const rad = ((s.bearing !== undefined) ? s.bearing : 180) * Math.PI / 180;
          const fdx = Math.sin(rad), fdz = -Math.cos(rad);   // 风口吹出方向
          const dist = 1 + Math.random() * 4.5;              // 前方 1~5.5 格
          const lat = (Math.random() - 0.5) * 3.2;           // 侧向散布
          gx = s.i + fdx * dist - fdz * lat;
          gy = s.j + fdz * dist + fdx * lat;
          if (gx < 1 || gy < 1 || gx > this.W || gy > this.H ||
              solid[(gx | 0) + this.SW * (gy | 0)]) {
            [gx, gy] = this._randomFreePos(solid);
          }
        } else {
          [gx, gy] = this._randomFreePos(solid);
        }
        this.life[i] = 0;
        this.maxLife[i] = isSpeed ? 2.5 + Math.random() * 3 : 4 + Math.random() * 5;
      }

      const c = Math.max(0, Math.min(this.SW * (this.H + 1) + this.W, (gx | 0) + this.SW * (gy | 0)));
      const d = dye ? dye[c] : 0;
      const ux = u ? u[c] : 0, uy = v ? v[c] : 0;
      const speed = Math.sqrt(ux * ux + uy * uy);
      const lt = light ? light[c] : 0;

      let wx, wz, wy, r, g, b, sz, al;

      if (isEnergy) {
        // 炁流：粒子锁网格，高度=能量浓度（EMA 归一化），呼吸脉动
        const t = Math.min(1, d / dyeNorm);
        [wx, wz] = this._toWorld(gx, gy);
        wy = 0.03 + t * 1.8;
        const phase = this.seed[i] + time * BREATH_SPEED;
        wy += Math.sin(phase) * BREATH_AMP * (0.5 + t);

        [r, g, b] = this._colQi(t);
        sz = 0.15 + t * 1.0;
        al = 0.20 + t * 0.70;

        if (speed > 0.05) {
          gx += ux * dt * 0.15;
          gy += uy * dt * 0.15;
        } else {
          this.driftA[i] += (Math.random() - 0.5) * 0.3;
          gx += Math.cos(this.driftA[i]) * DRIFT_SPEED * dt;
          gy += Math.sin(this.driftA[i]) * DRIFT_SPEED * dt;
        }

      } else if (isSpeed) {
        // 风场：粒子高速随风漂移，颜色=风速，高度微起伏
        gx += ux * dt * WIND_FLOW;
        gy += uy * dt * WIND_FLOW;
        [wx, wz] = this._toWorld(gx, gy);
        wy = 0.22 + Math.sin(this.seed[i] + time * 3.0) * 0.10;

        const t = Math.min(1, speed / 12.0);   // 风速归一化上限提高(6→12)：高速粒子不全黄白
        [r, g, b] = this._colWind(t);
        sz = 0.14 + t * 0.55;
        al = 0.20 + t * 0.75;

      } else {
        // 采光：粒子锁网格，高度=光照强度（EMA 归一化），缓慢呼吸
        const t = Math.min(1, lt / lightNorm);
        [wx, wz] = this._toWorld(gx, gy);
        wy = 0.03 + t * 2.0;
        const phase = this.seed[i] + time * 1.2;
        wy += Math.sin(phase) * BREATH_AMP * 0.5;

        [r, g, b] = this._colLight(t);
        sz = 0.12 + t * 1.2;
        al = 0.08 + t * 0.85;
      }

      this.gx[i] = gx;
      this.gy[i] = gy;

      const k = i * 3;
      pos[k] = wx;
      pos[k + 1] = wy;
      pos[k + 2] = wz;
      col[k] = r;
      col[k + 1] = g;
      col[k + 2] = b;
      alp[i] = al;
      siz[i] = sz;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    alpAttr.needsUpdate = true;
    sizAttr.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
