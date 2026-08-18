// WindTrailRenderer.js —— 风场风口粒子（独立物理，完全不依赖全局 u/v 场）
// 风口发射蓝色拖尾粒子，粒子自带物理：bearing 初速 + 速度衰减(渐慢) + 随机扩散(湍流) + 遇墙反弹 + 寿命重生
// 根除"粒子跟紊乱 u/v 乱飞 / 地板全黄"——粒子自成系统，完全可控
import * as THREE from 'three';

const COUNT = 700;        // 粒子数
const TRAIL_LEN = 12;     // 拖尾历史点数（段数=LEN-1）
const SPEED = 7;          // 风口喷射初速（格/秒）
const DRAG = 0.985;       // 速度衰减系数/帧（粒子飞远渐慢）
const DIFF = 1.6;         // 随机扩散强度（湍流抖动）
const LIFE = 4.0;         // 粒子寿命（秒，到期重生）
const LINE_Y = 0.15;

export class WindTrailRenderer {
  constructor(scene, W, H, SW, CELL) {
    this.W = W; this.H = H; this.SW = SW; this.CELL = CELL;
    this.FW = W * CELL; this.FD = H * CELL;
    this.count = COUNT;
    this.len = TRAIL_LEN;
    this.gx = new Float32Array(this.count);
    this.gy = new Float32Array(this.count);
    this.vx = new Float32Array(this.count);
    this.vy = new Float32Array(this.count);
    this.age = new Float32Array(this.count);
    this.life = new Float32Array(this.count);
    this.hist = new Float32Array(this.count * this.len * 2);
    this.filled = new Uint8Array(this.count);

    this.segPer = this.len - 1;
    const pos = new Float32Array(this.count * this.segPer * 2 * 3);
    const col = new Float32Array(this.count * this.segPer * 2 * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 2;
    this.lines.visible = false;
    scene.add(this.lines);

    for (let i = 0; i < this.count; i++) this._spawn(i, null, []);
  }

  setVisible(v) { this.lines.visible = v; }

  _toWorld(gx, gy) { return [(gx - 0.5) * this.CELL - this.FW / 2, (gy - 0.5) * this.CELL - this.FD / 2]; }

  // 重生：从风口 bearing 锥形发射（初速），无风口则随机漫散
  _spawn(i, solid, windSrcs) {
    let gx, gy, vx, vy;
    if (windSrcs && windSrcs.length && Math.random() < 0.9) {
      const s = windSrcs[(Math.random() * windSrcs.length) | 0];
      const rad = (((s.bearing !== undefined) ? s.bearing : 180) + (Math.random() - 0.5) * 40) * Math.PI / 180;  // bearing ±20° 锥形
      const dx = Math.sin(rad), dz = -Math.cos(rad);
      gx = s.i + dx * 0.5; gy = s.j + dz * 0.5;   // 风口位置出发
      vx = dx * SPEED; vy = dz * SPEED;
    } else {
      gx = 2 + Math.random() * (this.W - 4); gy = 2 + Math.random() * (this.H - 4);
      const a = Math.random() * Math.PI * 2;
      vx = Math.cos(a) * SPEED * 0.3; vy = Math.sin(a) * SPEED * 0.3;
    }
    this.gx[i] = gx; this.gy[i] = gy; this.vx[i] = vx; this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = LIFE * (0.6 + Math.random() * 0.8);
    this.filled[i] = 0;
  }

  reset() {
    for (let i = 0; i < this.count; i++) {
      this.gx[i] = 2 + Math.random() * (this.W - 4);
      this.gy[i] = 2 + Math.random() * (this.H - 4);
      this.filled[i] = 0;
    }
    this.hist.fill(0);
  }

  /** 主更新：dt 秒，solid 墙掩码，windSrcs 风口列表（不依赖 u/v 速度场）*/
  update(dt, solid, windSrcs) {
    if (!this.lines.visible) return;
    const { W, H, SW, len, count } = this;
    const dragF = Math.pow(DRAG, dt * 60);   // 帧率无关衰减
    for (let i = 0; i < count; i++) {
      // 寿命到期 → 重生
      this.age[i] += dt;
      if (this.age[i] > this.life[i]) { this._spawn(i, solid, windSrcs); continue; }

      let gx = this.gx[i], gy = this.gy[i], vx = this.vx[i], vy = this.vy[i];
      // 衰减（渐慢）+ 随机扩散（湍流抖动）
      vx = vx * dragF + (Math.random() - 0.5) * DIFF * dt * 2;
      vy = vy * dragF + (Math.random() - 0.5) * DIFF * dt * 2;

      // 移动 + 遇墙反弹
      let nx = gx + vx * dt, ny = gy + vy * dt;
      const nci = Math.round(nx), ncj = Math.round(ny);
      if (nci < 1 || ncj < 1 || nci > W || ncj > H) {
        this._spawn(i, solid, windSrcs); continue;   // 出界 → 重生
      }
      if (solid[nci + SW * ncj]) {
        // 撞墙：判断 x/y 方向反弹（0.6 衰减反弹，留原位下帧离开）
        const tryXi = Math.round(gx + vx * dt);
        const xHit = (tryXi !== Math.round(gx)) && tryXi >= 1 && tryXi <= W && solid[tryXi + SW * Math.round(gy)];
        if (xHit) vx = -vx * 0.6; else vy = -vy * 0.6;
        nx = gx; ny = gy;
      }
      this.gx[i] = nx; this.gy[i] = ny; this.vx[i] = vx; this.vy[i] = vy;

      // 历史后移 + 头插
      const base = i * len * 2;
      for (let k = len - 1; k > 0; k--) {
        this.hist[base + k * 2]     = this.hist[base + (k - 1) * 2];
        this.hist[base + k * 2 + 1] = this.hist[base + (k - 1) * 2 + 1];
      }
      this.hist[base] = nx; this.hist[base + 1] = ny;
      if (this.filled[i] < len) this.filled[i]++;
    }
    // 更新顶点 + 蓝色深浅渐变
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    const segPer = this.segPer;
    for (let i = 0; i < count; i++) {
      const base = i * len * 2;
      const filled = this.filled[i];
      const segs = filled < 2 ? 0 : filled - 1;
      for (let k = 0; k < segPer; k++) {
        const vi = (i * segPer + k) * 6;
        if (k < segs) {
          const ax = this.hist[base + k * 2], ay = this.hist[base + k * 2 + 1];
          const bx = this.hist[base + (k + 1) * 2], by = this.hist[base + (k + 1) * 2 + 1];
          const [wax, waz] = this._toWorld(ax, ay);
          const [wbx, wbz] = this._toWorld(bx, by);
          pos[vi] = wax; pos[vi + 1] = LINE_Y; pos[vi + 2] = waz;
          pos[vi + 3] = wbx; pos[vi + 4] = LINE_Y; pos[vi + 5] = wbz;
          // 蓝色深浅渐变：bright=1(头,新)深亮蓝 → bright=0(尾,旧)浅淡蓝
          const bA = 1 - k / (len - 1);
          const bB = 1 - (k + 1) / (len - 1);
          col[vi]     = 0.58 - 0.48 * bA;
          col[vi + 1] = 0.80 - 0.38 * bA;
          col[vi + 2] = 0.96 - 0.01 * bA;
          col[vi + 3] = 0.58 - 0.48 * bB;
          col[vi + 4] = 0.80 - 0.38 * bB;
          col[vi + 5] = 0.96 - 0.01 * bB;
        } else {
          const wx = (this.gx[i] - 0.5) * this.CELL - this.FW / 2;
          const wz = (this.gy[i] - 0.5) * this.CELL - this.FD / 2;
          pos[vi] = wx; pos[vi + 1] = LINE_Y; pos[vi + 2] = wz;
          pos[vi + 3] = wx; pos[vi + 4] = LINE_Y; pos[vi + 5] = wz;
          col[vi] = col[vi + 1] = col[vi + 2] = col[vi + 3] = col[vi + 4] = col[vi + 5] = 0.7;
        }
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
