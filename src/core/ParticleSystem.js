// ParticleSystem.js —— 风粒子 + 拖尾（LineSegments 渐变尾迹）
// 300 粒子从上风边界涌入，按流体 u/v 场漂移，拖尾显示风的路径
// 风口处定向加速发射 + 拖尾 → 风口喷涌路径一目了然
import * as THREE from 'three';

const TRAIL_LEN = 12;  // 拖尾长度（帧）

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(180,230,255,0.7)');
  g.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class ParticleSystem {
  constructor(scene, count, W, H, cell) {
    this.count = count;
    this.W = W; this.H = H; this.cell = cell;
    this.FW = W * cell; this.FD = H * cell;
    this.gi = new Float32Array(count);
    this.gj = new Float32Array(count);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.active = new Uint8Array(count);
    this.windDirection = 0;

    // ---- 粒子点 ----
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.posAttr = this.geo.attributes.position;
    this.colAttr = this.geo.attributes.color;

    this.mat = new THREE.PointsMaterial({
      size: cell * 2.8, map: makeGlowTexture(),
      vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);

    // ---- 拖尾 LineSegments ----
    // 每个粒子 (TRAIL_LEN-1) 段，每段 2 个顶点
    const segsPerParticle = TRAIL_LEN - 1;
    this.trailVerts = count * segsPerParticle * 2;
    this.trailGi = new Float32Array(count * TRAIL_LEN);
    this.trailGj = new Float32Array(count * TRAIL_LEN);

    const tPos = new Float32Array(this.trailVerts * 3);
    const tCol = new Float32Array(this.trailVerts * 3);

    // 预填拖尾颜色（不随帧变）：深蓝 → 亮青渐变
    for (let p = 0; p < count; p++) {
      for (let k = 0; k < segsPerParticle; k++) {
        const t0 = k / segsPerParticle;        // 旧端
        const t1 = (k + 1) / segsPerParticle;   // 新端
        const vi0 = (p * segsPerParticle + k) * 2;
        const vi1 = vi0 + 1;
        tCol[vi0 * 3] = 0.04 + t0 * 0.55; tCol[vi0 * 3 + 1] = 0.08 + t0 * 0.82; tCol[vi0 * 3 + 2] = 0.15 + t0 * 0.80;
        tCol[vi1 * 3] = 0.04 + t1 * 0.55; tCol[vi1 * 3 + 1] = 0.08 + t1 * 0.82; tCol[vi1 * 3 + 2] = 0.15 + t1 * 0.80;
      }
    }

    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
    this.trailPosAttr = this.trailGeo.attributes.position;

    this.trailLine = new THREE.LineSegments(this.trailGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.40,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.trailLine.visible = false;
    this.trailLine.frustumCulled = false;
    scene.add(this.trailLine);
  }

  setVisible(v) {
    this.points.visible = v;
    this.trailLine.visible = v;
  }
  setWind(dir) { this.windDirection = ((dir % 360) + 360) % 360; }

  /** 初始化拖尾：全部点设为同一位置 */
  _initTrail(i, gi, gj) {
    const base = i * TRAIL_LEN;
    for (let k = 0; k < TRAIL_LEN; k++) {
      this.trailGi[base + k] = gi;
      this.trailGj[base + k] = gj;
    }
  }

  /** 从上风侧/风口生成粒子 */
  spawn(i, solid) {
    const { W, H, SW } = this;
    const rad = this.windDirection * Math.PI / 180;
    const vx = -Math.sin(rad), vy = Math.cos(rad);
    let gi, gj;

    // 尝试在上风边界找非墙格
    for (let t = 0; t < 15; t++) {
      if (Math.abs(vy) >= Math.abs(vx)) {
        gj = vy > 0 ? 1 + Math.random() * Math.min(12, H / 3) : H - Math.random() * Math.min(12, H / 3);
        gi = 2 + Math.random() * (W - 4);
      } else {
        gi = vx > 0 ? 1 + Math.random() * Math.min(12, W / 3) : W - Math.random() * Math.min(12, W / 3);
        gj = 2 + Math.random() * (H - 4);
      }
      const ii = gi | 0, jj = gj | 0;
      if (ii >= 1 && jj >= 1 && ii <= W && jj <= H && !solid[ii + SW * jj]) {
        this.gi[i] = gi; this.gj[i] = gj;
        this.life[i] = 0; this.maxLife[i] = 4 + Math.random() * 3; this.active[i] = 1;
        this._initTrail(i, gi, gj);
        return;
      }
    }
    // 兜底
    gi = W * 0.3 + Math.random() * W * 0.4;
    gj = H * 0.3 + Math.random() * H * 0.4;
    this.gi[i] = gi; this.gj[i] = gj;
    this.life[i] = 0; this.maxLife[i] = 4 + Math.random() * 3; this.active[i] = 1;
    this._initTrail(i, gi, gj);
  }

  /** 每帧：漂移 + 拖尾记录 + 渲染 */
  update(dt, u, v, SW, solid, windSrcs) {
    const { count, W, H, cell, FW, FD } = this;

    // 风口定向发射
    if (windSrcs && windSrcs.length) {
      for (const s of windSrcs) {
        for (let p = 0; p < count; p++) {
          if (!this.active[p]) {
            this.gi[p] = s.i + (Math.random() - 0.5) * 3;
            this.gj[p] = s.j + (Math.random() - 0.5) * 3;
            this.life[p] = 0; this.maxLife[p] = 2.5 + Math.random() * 2; this.active[p] = 1;
            this._initTrail(p, this.gi[p], this.gj[p]);
            break;
          }
        }
      }
    }

    const pos = this.posAttr.array, col = this.colAttr.array;
    const tPos = this.trailPosAttr.array;

    for (let i = 0; i < count; i++) {
      // 过期/死亡 → 重生
      if (!this.active[i] || this.life[i] > this.maxLife[i]) {
        this.spawn(i, solid);
      }

      let gi = this.gi[i], gj = this.gj[i];
      let ii = gi | 0, jj = gj | 0;

      // 出界/碰墙 → 重生
      if (ii < 1 || jj < 1 || ii > W || jj > H || solid[ii + SW * jj]) {
        this.spawn(i, solid);
        gi = this.gi[i]; gj = this.gj[i]; ii = gi | 0; jj = gj | 0;
      }

      // 按速度场漂移
      const c = ii + SW * jj;
      gi += u[c] * dt;
      gj += v[c] * dt;
      this.life[i] += dt;
      this.gi[i] = gi; this.gj[i] = gj;

      // ---- 粒子点 ----
      const k3 = i * 3;
      pos[k3]     = (gi - 0.5) * cell - FW / 2;
      pos[k3 + 1] = 0.25;
      pos[k3 + 2] = (gj - 0.5) * cell - FD / 2;
      const t = this.life[i] / this.maxLife[i];
      const f = Math.sin(t * Math.PI);
      col[k3] = 0.6 * f; col[k3 + 1] = 0.85 * f; col[k3 + 2] = f;

      // ---- 拖尾：移位 + 追加新位置 ----
      const tb = i * TRAIL_LEN;
      for (let k = 1; k < TRAIL_LEN; k++) {
        this.trailGi[tb + k - 1] = this.trailGi[tb + k];
        this.trailGj[tb + k - 1] = this.trailGj[tb + k];
      }
      this.trailGi[tb + TRAIL_LEN - 1] = gi;
      this.trailGj[tb + TRAIL_LEN - 1] = gj;

      // ---- 构建拖尾 LineSegments 顶点 ----
      const segs = TRAIL_LEN - 1;
      const segBase = (i * segs) * 2;
      for (let k = 0; k < segs; k++) {
        const g0 = this.trailGi[tb + k];
        const g1 = this.trailGi[tb + k + 1];
        const h0 = this.trailGj[tb + k];
        const h1 = this.trailGj[tb + k + 1];
        const v0 = segBase + k * 2;
        const v1 = v0 + 1;
        tPos[v0 * 3]     = (g0 - 0.5) * cell - FW / 2;
        tPos[v0 * 3 + 1] = 0.030;
        tPos[v0 * 3 + 2] = (h0 - 0.5) * cell - FD / 2;
        tPos[v1 * 3]     = (g1 - 0.5) * cell - FW / 2;
        tPos[v1 * 3 + 1] = 0.030;
        tPos[v1 * 3 + 2] = (h1 - 0.5) * cell - FD / 2;
      }
    }

    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.trailPosAttr.needsUpdate = true;
  }
}
