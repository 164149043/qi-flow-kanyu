/**
 * fluid.js —— 炁流风场（粒子系统）核心  ★★★★★ 项目最硬的骨头之二
 * ============================================================
 * 「炁流」本质是一个【粒子系统】，不是 Navier-Stokes 流体方程。
 * 判断依据（来自原站参数）：「消散周期（半衰期）6.5s」——这是粒子
 * 能量随时间指数衰减的特征，连续流体场不会有这种参数。
 *
 * 模型一句话：炁口不断发射带「能量」的粒子，粒子被风推动、被扩散
 * 角度扰动、被「九星干扰/潮汐」叠加扰动场、撞墙后能量衰减并反弹，
 * 最终能量耗尽而消亡。把所有活粒子的发光点叠加渲染 = 流动的「炁」。
 *
 * 与渲染解耦：本文件只算「粒子下一帧的状态」，不碰 Canvas。
 * index.html 负责画。这样引擎可单测、可换 3D 渲染。
 *
 * 坐标系：x 向右、y 向下（Canvas 像素坐标），角度 0=右，顺时针为正。
 *         注意：原站「风向0°=北」，渲染层会在传参时把地理角转成数学角。
 */

(function (global) {
  'use strict';

  const DEG = Math.PI / 180;

  /**
   * 炁流世界
   * @param {object} cfg 初始参数（见 defaults）
   */
  function FluidWorld(cfg = {}) {
    // ── 参数（全部对齐原站控制台）──
    this.p = Object.assign({
      spread: 30,        // 扩散角度（°）——发射方向 ±spread/2 随机
      speed: 26,         // 炁速——粒子初速度大小（px/s 的量级，调参用）
      windDir: -90,      // 风向（数学角，°）——渲染层把「北=0°」转成「上=-90°」传入
      windSpeed: 18,     // 风力——风对粒子的推动强度
      intensity: 1.0,    // 能量强度——粒子初始能量
      halfLife: 6.5,     // 消散半衰期（s）——能量每过这么久减半
      jiuxing: true,     // 九星干扰开关——叠加位置相关扰动场
      tide: true,        // 潮汐开关——全局能量随时间正弦波动
      emitRate: 60,      // 每个炁口每秒发射粒子数
      bounce: 0.5,       // 撞墙能量衰减系数
    }, cfg);

    this.particles = []; // 活粒子
    this.sources = [];   // 炁口/出风口 [{x,y,dir}]
    this.walls = [];     // 墙体 [{x,y,w,h}]（AABB 矩形）
    this.time = 0;       // 模拟时间（s）
  }

  // ── 添加炁口 ── dir 为发射方向（数学角，°）
  FluidWorld.prototype.addSource = function (x, y, dir) {
    this.sources.push({ x, y, dir });
  };

  // ── 添加矩形墙 ──
  FluidWorld.prototype.addWall = function (x, y, w, h) {
    this.walls.push({ x, y, w, h });
  };

  // ── 九星干扰力场 ──
  // 用多重正弦叠加模拟一个「九宫」式的空间扰动场。
  // 每个位置 受到一个小旋涡力，随时间缓慢漂移。
  // 这就是原站「九星干扰：开」背后的扰动来源。
  FluidWorld.prototype.jiuxingForce = function (x, y, t) {
    const k = 0.012; // 空间频率（越大旋涡越密）
    const a = 14;    // 扰动强度
    // 两个相位错开的正弦，构成旋转感的向量场
    const fx = Math.sin(y * k + t * 0.6) * a + Math.cos((x + y) * k * 0.7) * a * 0.5;
    const fy = Math.cos(x * k - t * 0.5) * a + Math.sin((x - y) * k * 0.7) * a * 0.5;
    return { fx, fy };
  };

  // ── 潮汐倍率（0~1 缓慢起伏）──
  // 原站「潮汐：开」会让能量随月相般起伏。这里用低频正弦近似。
  FluidWorld.prototype.tideGain = function (t) {
    return 0.7 + 0.3 * Math.sin(t * 0.25);
  };

  // ── 点是否在任一墙内 ──
  FluidWorld.prototype.pointInWall = function (x, y) {
    for (const w of this.walls) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
    }
    return false;
  };

  /**
   * 推进一帧
   * @param {number} dt 时间步长（秒）
   */
  FluidWorld.prototype.step = function (dt) {
    this.time += dt;
    const p = this.p;
    const tideG = p.tide ? this.tideGain(this.time) : 1.0;
    const wRad = p.windDir * DEG;
    const wx = Math.cos(wRad), wy = Math.sin(wRad); // 风向单位向量

    // —— 1. 更新现有粒子 ——
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];

      // 能量按半衰期指数衰减：E = E0 * 0.5^(age/halfLife)
      pt.age += dt;
      pt.energy *= Math.pow(0.5, dt / p.halfLife);
      pt.energy *= tideG > 1 ? 1 : 1; // 潮汐主要影响发射强度（见下），这里微调

      // 风力推动：把粒子速度缓慢拉向风向
      pt.vx += (wx * p.windSpeed - pt.vx) * dt * 1.2;
      pt.vy += (wy * p.windSpeed - pt.vy) * dt * 1.2;

      // 九星干扰：叠加位置相关扰动
      if (p.jiuxing) {
        const f = this.jiuxingForce(pt.x, pt.y, this.time);
        pt.vx += f.fx * dt;
        pt.vy += f.fy * dt;
      }

      // 扩散角度：给速度方向加随机角扰动（让流场有「散」的感觉）
      const jitter = (Math.random() - 0.5) * p.spread * DEG * 0.15;
      const sp = Math.hypot(pt.vx, pt.vy) || 1;
      const ang = Math.atan2(pt.vy, pt.vx) + jitter;
      pt.vx = Math.cos(ang) * sp;
      pt.vy = Math.sin(ang) * sp;

      // 位移 + 墙体碰撞
      let nx = pt.x + pt.vx * dt;
      let ny = pt.y + pt.vy * dt;
      if (this.pointInWall(nx, ny)) {
        // 撞墙：反弹（反转速度方向）+ 能量衰减
        // 粗略判断撞的是水平边还是垂直边：看穿入方向
        if (this.pointInWall(pt.x, ny)) { pt.vy = -pt.vy; ny = pt.y; }
        if (this.pointInWall(nx, pt.y)) { pt.vx = -pt.vx; nx = pt.x; }
        pt.energy *= p.bounce;
      }
      pt.x = nx; pt.y = ny;

      // 死亡判定：能量耗尽 或 飞出画布外远处
      if (pt.energy < 0.02) {
        this.particles.splice(i, 1);
      }
    }

    // —— 2. 从炁口发射新粒子 ——
    const emitCount = p.emitRate * dt * tideG; // 潮汐影响发射量
    for (const src of this.sources) {
      let n = Math.floor(emitCount);
      if (Math.random() < emitCount - n) n += 1; // 概率补齐小数部分
      for (let k = 0; k < n; k++) {
        const ang = (src.dir + (Math.random() - 0.5) * p.spread) * DEG;
        this.particles.push({
          x: src.x, y: src.y,
          vx: Math.cos(ang) * p.speed,
          vy: Math.sin(ang) * p.speed,
          energy: p.intensity,
          age: 0,
        });
      }
    }
  };

  global.XQ = global.XQ || {};
  global.XQ.FluidWorld = FluidWorld;
})(window);
