// FluidSolver.js —— 老子的 stable-fluids 求解器
// 核心：半拉格朗日 + MacCormack 二阶修正 + 压力投影(Jacobi) + 涡量confinement + Brinkman 渗透墙
// 逐函数对照原站（行号见注释），偏离处标 // ★

import {
  VEL_PERM, WALL_DYE_DAMP, VORTICITY_EPS_DEFAULT, PROJECT_ITERS,
  VEL_HALF_LIFE, DYE_HALF_LIFE_DEFAULT
} from './FluidField.js';
import { injectAll as injectWuxing } from '../fengshui/Wuxing.js';
import { lightFrame } from '../fengshui/Solar.js';

export class FluidSolver {
  constructor(field) {
    this.f = field;
    this.mode = 'energy';        // energy(炁流) | speed(风场) | light(采光)
    this.simTime = 0;
    this.dyeDecayT = DYE_HALF_LIFE_DEFAULT;  // dye 半衰期（UI 可调）
    this.vorticityEps = VORTICITY_EPS_DEFAULT;
    this.windDirection = 0;      // 风向度（气象：0=北风=风从北吹来，顺时针 90=东 180=南 270=西）
    this.windSpeed = 0;          // 风速
    this.spread = 8;             // 发射带向内深度（格）
    this.structs = [];           // 五行结构 [{i,j,element,r,strength}]
    this.sunHour = 12;           // 采光：时辰 0-24（12=正午）
    this.sunInten = 1.2;         // 采光：阳光强度
    this.palaceDrain = null;     // 九星泄耗炁场（Float32Array，九星开启时 setPalaceDrain 设）
    this.qiPorts = [];          // 炁流：炁口（持续 dye 源）[{i,j,r,amount}]
    this.windSrcs = [];         // 风场：风口（径向发散 velocity 源）[{i,j,r,strength}]
    this.lightPts = [];         // 采光：光源（持续 light 源）[{i,j,r,strength}]
    this.qiBearing = 180;      // 炁口发射方向（度，默认南）
    this.windBearing = 180;    // 风口发射方向（度）
  }

  // ===== 双线性插值采样：连续坐标 (x,y) 在场 f0 上的值（Stam 标准）=====
  sample(f0, x, y, W, H, SW) {
    if (x < 0.5) x = 0.5; else if (x > W + 0.5) x = W + 0.5;
    if (y < 0.5) y = 0.5; else if (y > H + 0.5) y = H + 0.5;
    const i0 = x | 0, i1 = i0 + 1;
    const j0 = y | 0, j1 = j0 + 1;
    const s1 = x - i0, s0 = 1 - s1;
    const t1 = y - j0, t0 = 1 - t1;
    return s0 * (t0 * f0[i0 + SW * j0] + t1 * f0[i0 + SW * j1]) +
           s1 * (t0 * f0[i1 + SW * j0] + t1 * f0[i1 + SW * j1]);
  }

  // ===== 标准半拉格朗日平流（Stam）。f=输出, f0=源, uu/vv=速度场 =====
  // dye 用这个（原站 2420 注释：dye 不用 MacCormack，防振铃闪烁）
  advect(f, f0, uu, vv, dt) {
    const { W, H, SW } = this.f;
    for (let j = 1; j <= H; j++) {
      const jSW = j * SW;
      for (let i = 1; i <= W; i++) {
        const c = i + jSW;
        const x = i - dt * uu[c];
        const y = j - dt * vv[c];
        f[c] = this.sample(f0, x, y, W, H, SW);
      }
    }
  }

  // ===== MacCormack 二阶平流（原站 advectMacCormack @2234）——速度场专用 =====
  // 正半拉格朗日 → 反半拉格朗日 → 误差补偿 → limiter 防过冲
  advectMacCormack(f, f0, uu, vv, dt) {
    const fld = this.f;
    const { N, W, H, SW, tmpA, tmpB, nu, nv, solid } = fld;
    // 第一步：正向半拉格朗日
    this.advect(tmpA, f0, uu, vv, dt);
    // 第二步：反向（负速度）
    for (let k = 0; k < N; k++) { nu[k] = -uu[k]; nv[k] = -vv[k]; }
    this.advect(tmpB, tmpA, nu, nv, dt);
    // 误差补偿 f = tmpA + 0.5*(f0 - tmpB)，再 clamp 到邻居 min/max（limiter）
    for (let j = 1; j <= H; j++) {
      const jSW = j * SW;
      for (let i = 1; i <= W; i++) {
        const c = i + jSW;
        if (solid[c]) { f[c] = 0; continue; }
        const val = tmpA[c] + 0.5 * (f0[c] - tmpB[c]);
        const a = f0[c - 1], b = f0[c + 1], cc = f0[c - SW], d = f0[c + SW];
        let mn = a; if (b < mn) mn = b; if (cc < mn) mn = cc; if (d < mn) mn = d; if (f0[c] < mn) mn = f0[c];
        let mx = a; if (b > mx) mx = b; if (cc > mx) mx = cc; if (d > mx) mx = d; if (f0[c] > mx) mx = f0[c];
        f[c] = val < mn ? mn : (val > mx ? mx : val);
      }
    }
  }

  // ===== 涡量场（原站 computeCurl @2210）：curl = ∂v/∂x - ∂u/∂y =====
  computeCurl() {
    const { W, H, SW, u, v, curl } = this.f;
    for (let j = 1; j <= H; j++) {
      const jSW = j * SW;
      for (let i = 1; i <= W; i++) {
        const c = i + jSW;
        curl[c] = 0.5 * (v[c + 1] - v[c - 1]) - 0.5 * (u[c + SW] - u[c - SW]);
      }
    }
  }

  // ===== 涡量 confinement（Fedkiw，原站 vorticityConfinement @2217）=====
  // 把涡量梯度作为力注入速度场，保持涡旋不散
  vorticityConfinement(dt, eps) {
    const { W, H, SW, curl, u, v, solid } = this.f;
    for (let j = 2; j < H; j++) {
      const jSW = j * SW;
      for (let i = 2; i < W; i++) {
        const c = i + jSW;
        if (solid[c]) continue;
        // 涡量梯度方向（指向 |curl| 增大方向）
        const dCdx = 0.5 * (Math.abs(curl[c + 1]) - Math.abs(curl[c - 1]));
        const dCdy = 0.5 * (Math.abs(curl[c + SW]) - Math.abs(curl[c - SW]));
        const len = Math.sqrt(dCdx * dCdx + dCdy * dCdy) + 1e-5;
        const nx = dCdx / len, ny = dCdy / len;
        // 力 = eps * (N × ω)，垂直梯度方向，大小正比涡量
        const force = eps * curl[c];
        u[c] += force * ny * dt;
        v[c] -= force * nx * dt;
      }
    }
  }

  // ===== 压力投影（原站 project @2252）——Jacobi iters 次，保证不可压缩 =====
  // 墙体分模式：风场硬清零，其他模式 Brinkman 阻尼
  project(iters) {
    const { W, H, SW, u, v, p, div, solid, glass } = this.f;
    // 散度全场（原站 2256：墙内速度有 Brinkman 残值，压力场连续）
    for (let j = 1; j <= H; j++) {
      const jSW = j * SW;
      for (let i = 1; i <= W; i++) {
        const c = i + jSW;
        div[c] = -0.5 * (u[c + 1] - u[c - 1] + v[c + SW] - v[c - SW]);
        p[c] = 0;
      }
    }
    // Jacobi 迭代：p = (div + Σ邻居p) / 4
    for (let k = 0; k < iters; k++) {
      for (let j = 1; j <= H; j++) {
        const jSW = j * SW;
        for (let i = 1; i <= W; i++) {
          const c = i + jSW;
          p[c] = (div[c] + p[c - 1] + p[c + 1] + p[c - SW] + p[c + SW]) / 4;
        }
      }
    }
    // 减压力梯度 + 墙体处理（玻璃=关着的窗：speed 也挡风；开窗走 solid=0 由结构件 restamp 控制）
    const isSpeed = (this.mode === 'speed');
    const isBlock = (cc) => solid[cc] !== 0;
    for (let j = 1; j <= H; j++) {
      const jSW = j * SW;
      for (let i = 1; i <= W; i++) {
        const c = i + jSW;
        if (isBlock(c)) {
          if (isSpeed) {
            if (i > 1 && i < W && j > 1 && j < H) { u[c] = 0; v[c] = 0; }    // 实墙清零
            else { u[c] *= VEL_PERM; v[c] *= VEL_PERM; }                    // 外边界渗透
          } else {
            u[c] *= VEL_PERM; v[c] *= VEL_PERM;   // Brinkman 阻尼（不清零）
          }
          continue;
        }
        // 压力采样跳过实墙（玻璃参与压力场，保证透风连续）
        let pl = p[c], pr = p[c], pt = p[c], pb = p[c];
        if (!isBlock(c - 1))  pl = p[c - 1];
        if (!isBlock(c + 1))  pr = p[c + 1];
        if (!isBlock(c - SW)) pt = p[c - SW];
        if (!isBlock(c + SW)) pb = p[c + SW];
        u[c] -= 0.5 * (pr - pl);
        v[c] -= 0.5 * (pb - pt);
      }
    }
  }

  // ===== 炁流模式步进（原站 step energy 分支 @2406-2430）=====
  stepEnergy(dt) {
    const f = this.f;
    if (this.structs.length) injectWuxing(f, this.structs, dt);   // 五行注入（advect 前）
    if (this.qiPorts.length) this.injectQiPorts(dt);              // 炁口持续注入 dye
    const { W, H, SW, u, v, u0, v0, dye, dye0, solid, structMask } = f;
    // 存旧速度（平流源）
    u0.set(u); v0.set(v);
    // 速度 MacCormack 平流（保持涡旋不糊）
    this.advectMacCormack(u, u0, u0, v0, dt);
    this.advectMacCormack(v, v0, u0, v0, dt);
    // 涡量 + confinement（炁流减弱到 0.8，防 dye 被搅乱）
    this.computeCurl();
    this.vorticityConfinement(dt, 1.5);   // 炁流涡量增强(0.8→1.5)：遇阻绕流扩散更强
    // 压力投影
    this.project(PROJECT_ITERS);
    // dye 标准半拉格朗日平流（不用 MacCormack，防振铃）
    dye0.set(dye);
    this.advect(dye, dye0, u, v, dt);
    // 速度自然衰减 + 结构硬阻挡 + 墙 Brinkman + dye 衰减
    // 炁流模式：速度半衰期 2.5s（对齐参考版：高初速推动 dye 远距离扩散，短半衰让流场和缓）
    const velDecay = Math.pow(0.5, dt / VEL_HALF_LIFE);
    const dyeDecay = Math.pow(0.5, dt / this.dyeDecayT);
    for (let j = 1; j <= H; j++) {
      const jSW = j * SW;
      for (let i = 1; i <= W; i++) {
        const c = i + jSW;
        if (structMask[c]) { u[c] = 0; v[c] = 0; dye[c] = 0; continue; }  // 五行结构硬阻挡
        if (solid[c]) { u[c] *= VEL_PERM; v[c] *= VEL_PERM; dye[c] *= WALL_DYE_DAMP; }
        else { u[c] *= velDecay; v[c] *= velDecay; dye[c] *= dyeDecay; if (this.palaceDrain) dye[c] *= this.palaceDrain[c]; }
      }
    }
  }

  // ===== 风场模式步进（完整边界长方形发射器，对照原站 stepSpeed @2435）=====
  // 风向 → 定上风边界 → 发射带深度内注入 velocity（只非墙格，风从开口/外墙缺口灌入）
  stepSpeed(dt) {
    const f = this.f;
    if (this.windSrcs.length) this.injectWindSrcs(dt);   // 风口注入气流 velocity（粒子跟随绕流）
    const { W, H, SW, u, v, u0, v0, dye, dye0, solid, glass } = f;
    const rad = this.windDirection * Math.PI / 180;
    const vx = -Math.sin(rad), vy = Math.cos(rad);    // 风吹去方向（i,j 分量）
    const wvx = vx * this.windSpeed, wvy = vy * this.windSpeed;
    const emitDepth = Math.max(1, Math.round(this.spread));
    const blend = Math.min(1, dt * 8);
    const emit = (fi, fj) => {
      if (fi < 1 || fj < 1 || fi > W || fj > H) return;
      const c = fi + SW * fj;
      if (solid[c]) return;              // 墙/关窗格不发射（开窗 solid=0 自然发射）
      u[c] += (wvx - u[c]) * blend;
      v[c] += (wvy - v[c]) * blend;
      dye[c] += this.windSpeed * 0.12 * dt;          // 环境风注入风迹 dye（流动路径可见）
    };
    if (Math.abs(vy) >= Math.abs(vx)) {                // 南北向风
      if (vy > 0) { for (let d = 0; d < emitDepth; d++) { const fj = 1 + d; if (fj > H) break; for (let fi = 1; fi <= W; fi++) emit(fi, fj); } }
      else { for (let d = 0; d < emitDepth; d++) { const fj = H - d; if (fj < 1) break; for (let fi = 1; fi <= W; fi++) emit(fi, fj); } }
    } else {                                           // 东西向风
      if (vx > 0) { for (let d = 0; d < emitDepth; d++) { const fi = 1 + d; if (fi > W) break; for (let fj = 1; fj <= H; fj++) emit(fi, fj); } }
      else { for (let d = 0; d < emitDepth; d++) { const fi = W - d; if (fi < 1) break; for (let fj = 1; fj <= H; fj++) emit(fi, fj); } }
    }
    // 速度场平流（对齐原站 stepSpeed @2506：风场速度也 advect，否则注入的速度静态堆积、毫无流动感）
    u0.set(u); v0.set(v);
    this.advect(u, u0, u0, v0, dt);
    this.advect(v, v0, u0, v0, dt);
    this.computeCurl();
    this.vorticityConfinement(dt, 1.5);                // 风场涡量：遇阻绕流（3.0 放大速度爆全黄→1.5 适中）
    this.project(PROJECT_ITERS);                       // 墙硬清零（speed 模式）
    dye0.set(dye);
    this.advect(dye, dye0, u, v, dt);
    const velDecay = Math.pow(0.5, dt / VEL_HALF_LIFE);
    const trailDecay = Math.pow(0.5, dt / 3.5);        // 风迹 dye 半衰期 3.5s：流动路径清晰、拖尾适中
    for (let j = 1; j <= H; j++) {
      const jSW = j * SW;
      for (let i = 1; i <= W; i++) {
        const c = i + jSW;
        if (!solid[c]) { u[c] *= velDecay; v[c] *= velDecay; dye[c] *= trailDecay; }
      }
    }
  }

  step(dt) {
    this.simTime += dt;
    if (this.mode === 'speed') this.stepSpeed(dt);
    else if (this.mode === 'light') this.stepLight(dt);
    else this.stepEnergy(dt);
  }

  // 采光模式：南侧落地窗(glass)注入光能 → 扩散 → 衰减（对照原站 light 场，半衰期10s）
  stepLight(dt) {
    lightFrame(this.f, this.lightPts, this.sunHour, this.sunInten, dt);   // 光线投射（castRay 反射/穿玻璃）
  }

  // 设置五行结构：存结构 + 标记 structMask（结构中心格硬阻挡，对照原站 structMask）
  setStructs(structs) {
    this.structs = Array.isArray(structs) ? structs : [];
    const f = this.f;
    f.structMask.fill(0);
    for (const s of this.structs) {
      const c = f.IX(s.i, s.j);
      if (c >= 0 && c < f.N) f.structMask[c] = 1;
    }
  }

  // ===== 注入辅助（M1 验证用，对应原站 injectAll 的简化版）=====
  // 注入染料/能量（用户点炁口）
  injectDye(i, j, r, amount) {
    const { W, H, SW, dye, solid } = this.f;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 1 || jj < 1 || ii > W || jj > H) continue;
        const c = ii + SW * jj;
        if (solid[c]) continue;
        const dd = Math.sqrt(di * di + dj * dj);
        if (dd > r) continue;
        dye[c] = Math.min(2, dye[c] + amount * (1 - dd / r));
      }
    }
  }

  // 注入速度（用户设风/出风口）
  injectVelocity(i, j, r, vx, vy) {
    const { W, H, SW, u, v, solid } = this.f;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 1 || jj < 1 || ii > W || jj > H) continue;
        const c = ii + SW * jj;
        if (solid[c]) continue;
        u[c] += vx; v[c] += vy;
      }
    }
  }

  // 炁流·炁口：窄束扇形高速喷射（对齐 xunqi 参考版 injectSource）
  // 关键设计：r=2 小范围集中 + 高速(16~40) + 径向扇形速度 + dye率与速度挂钩
  // 高初速推动 dye 长距离扩散（短半衰期无妨，速度才是载体）
  injectQiPorts(dt) {
    const { W, H, SW, u, v, dye, solid } = this.f;
    const blend = Math.min(1, dt * 8);
    for (const p of this.qiPorts) {
      const bearing = (p.bearing !== undefined) ? p.bearing : this.qiBearing;
      const rad = bearing * Math.PI / 180;
      const baseA = Math.atan2(-Math.cos(rad), Math.sin(rad));   // bearing → 数学方位角（i=x, j=y）
      const speed = 10 + (p.amount || 2) * 10;                 // 炁速 20~50（amount 1~4），默认 30，加猛射远
      const halfFan = 0.18;                                    // 窄束扇形半角 ≈10°（略增覆盖）
      const eBoost = Math.min(3, 0.9 / Math.sqrt(halfFan));    // 窄扇补偿
      const r = 5.0;                                           // 注入半径加大(原2)，集中射远
      const reach = Math.ceil(r);
      for (let oy = -reach; oy <= reach; oy++) {
        for (let ox = -reach; ox <= reach; ox++) {
          const ii = p.i + ox, jj = p.j + oy;
          if (ii < 1 || jj < 1 || ii > W || jj > H) continue;
          const c = ii + SW * jj;
          if (solid[c]) continue;
          const dd = Math.sqrt(ox * ox + oy * oy);
          if (dd > r) continue;
          const cellA = dd < 0.6 ? baseA : Math.atan2(oy, ox);   // 每格径向方位
          let angDiff = cellA - baseA;
          while (angDiff > Math.PI) angDiff -= 2 * Math.PI;
          while (angDiff < -Math.PI) angDiff += 2 * Math.PI;
          if (Math.abs(angDiff) > halfFan) continue;           // 扇形锥外不注
          const angWgt = Math.cos((angDiff / halfFan) * (Math.PI / 2));  // 中心1→边缘0
          const wgt = angWgt * (1 - dd / r);
          if (wgt <= 0) continue;
          const bl = blend * wgt;
          u[c] += (Math.cos(cellA) * speed - u[c]) * bl;       // 径向扇形速度（喷射流）
          v[c] += (Math.sin(cellA) * speed - v[c]) * bl;
          dye[c] += speed * 0.30 * dt * wgt * eBoost;          // dye率与速度挂钩
        }
      }
    }
  }
  // 风场·风口：沿 bearing 前方锥形吹出（align>0.25 ≈ 75°锥），注入风迹 dye 显示风流路径
  injectWindSrcs(dt) {
    const { W, H, SW, u, v, dye, solid } = this.f;
    for (const s of this.windSrcs) {
      const bearing = (s.bearing !== undefined) ? s.bearing : this.windBearing;
      const rad = bearing * Math.PI / 180;
      const dx = Math.sin(rad), dz = -Math.cos(rad);   // 风口吹出方向
      const r = 14;                                         // 气流注入半径(格)：适中，覆盖绕流区不爆屏
      const reach = Math.ceil(r);
      const speed = (s.strength || this.windSpeed) * 3.5;   // 风力量级(strength 5 → 17.5，再降)
      for (let oy = -reach; oy <= reach; oy++) {
        for (let ox = -reach; ox <= reach; ox++) {
          const ii = s.i + ox, jj = s.j + oy;
          if (ii < 1 || jj < 1 || ii > W || jj > H) continue;
          const c = ii + SW * jj;
          if (solid[c]) continue;
          const dd = Math.sqrt(ox * ox + oy * oy);
          if (dd > r || dd < 0.5) continue;
          const align = (ox * dx + oy * dz) / dd;   // 与吹出方向的夹角余弦
          if (align < 0.25) continue;               // 只吹前方锥形（背面/侧面不吹）
          const wgt = (1 - dd / r) * align;         // 正前方最强
          const blend = Math.min(1, dt * 12) * wgt;  // 更快达到目标风速（风更硬）
          u[c] += (dx * speed - u[c]) * blend;
          v[c] += (dz * speed - v[c]) * blend;
          dye[c] += speed * 0.25 * dt * wgt;   // 风口注入风迹 dye：流动路径可见（拖尾粒子已移除，改 dye 平流显流）
        }
      }
    }
  }
  // 采光·光源：持续注入 light（放哪哪发光，径向衰减）
  injectLightPts(dt) {
    const { W, H, SW, light, solid } = this.f;
    for (const p of this.lightPts) {
      const r = p.r || 3, r2 = r * r, strength = p.strength || 1.5;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const dd = di * di + dj * dj;
          if (dd > r2) continue;
          const ii = p.i + di, jj = p.j + dj;
          if (ii < 1 || jj < 1 || ii > W || jj > H) continue;
          const c = ii + SW * jj;
          if (solid[c]) continue;
          light[c] = Math.min(2, light[c] + strength * dt * (1 - Math.sqrt(dd) / r));
        }
      }
    }
  }
}
