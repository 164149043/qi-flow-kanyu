// FluidField.js —— 老子的流体网格场
// Stam 经典布局：SW=W+2（留 1 格边界 padding 处理边界/墙体条件）
// 对照原站 1217-1219: var W,H,SW=W+2,SH=H+2,N=SW*SH, IX(i,j)=i+SW*j

// ===== 原站定值常量（深审查扒出来的硬货，别瞎改）=====
export const VEL_PERM = 0.05;            // 墙内速度渗留率/帧（原站 2289：1格渗后剩5%，厚墙挡死）
export const WALL_DYE_DAMP = 0.92;       // 墙内能量衰减率/帧（原站 2290：每帧留92%，缓渗不清零）
export const VORTICITY_EPS_DEFAULT = 2.5;// 涡量约束强度默认（风场用；炁流模式临时降到 0.8）
export const PROJECT_ITERS = 40;         // 压力投影 Jacobi 迭代次数（原站 step 调用 project(40)）
export const VEL_HALF_LIFE = 2.5;        // 速度自然衰减半衰期秒（原站 pow(0.5,dt/2.5)）
export const DYE_HALF_LIFE_DEFAULT = 12;// dye 全局衰减半衰期秒（炁流长距离扩散：炁传到场边缘仍有余量）

export class FluidField {
  constructor(W = 96, H = 80) {
    this.setSize(W, H);
  }

  setSize(W, H) {
    this.W = W;
    this.H = H;
    this.SW = W + 2;   // 含 1 格边界
    this.SH = H + 2;
    this.N = this.SW * this.SH;
    const N = this.N;
    const mk = () => new Float32Array(N);
    // 速度场（当前 + 旧，平流回溯的源）
    this.u = mk();  this.v = mk();
    this.u0 = mk(); this.v0 = mk();
    // 染料/能量场（"炁"，所谓"信息素"叙事的就是这货）
    this.dye = mk();  this.dye0 = mk();
    // 采光场（南侧落地窗投射的光能分布）
    this.light = mk();  this.light0 = mk();
    // 压力 / 散度 / 涡量
    this.p = mk();  this.div = mk();  this.curl = mk();
    // MacCormack 临时场 + 反向速度（预分配，别每帧 new，GC 会哭）
    this.tmpA = mk();  this.tmpB = mk();
    this.nu = mk();    this.nv = mk();
    // mask 场（0/1）
    this.solid = new Uint8Array(N);      // 墙
    this.glass = new Uint8Array(N);      // 玻璃（落地窗，透光挡风）
    this.structMask = new Uint8Array(N); // 五行结构（硬阻挡，无渗透）
    this.courtyardInner = new Uint8Array(N); // 宅院内部（风场发射范围）
  }

  // 二维索引（i: 0..W+1, j: 0..H+1）
  IX(i, j) { return i + this.SW * j; }

  reset() {
    this.u.fill(0); this.v.fill(0); this.u0.fill(0); this.v0.fill(0);
    this.dye.fill(0); this.dye0.fill(0);
    this.light.fill(0); this.light0.fill(0);
    this.p.fill(0); this.div.fill(0); this.curl.fill(0);
  }

  clearMask() {
    this.solid.fill(0); this.glass.fill(0);
    this.structMask.fill(0); this.courtyardInner.fill(0);
  }

  // 标记碰撞格（对照原站 markSolid @6169/6333）
  markSolid(i, j) {
    if (i < 1 || i > this.W || j < 1 || j > this.H) return;
    this.solid[this.IX(i, j)] = 1;
  }
}
