// fluid.worker.js —— 老子把流体求解挪进 Worker，主线程只管渲染/UI，复杂户型不卡
// 通信：主线程 postMessage 指令 → Worker 算 step → 回传 dye/u/v（Transferable 零拷贝）
// 这就是补原站"流体跑主线程"那个工程硬伤

import { FluidField } from './FluidField.js';
import { FluidSolver } from './FluidSolver.js';

let field = null;
let solver = null;

self.onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'init': {
      field = new FluidField(m.W, m.H);
      solver = new FluidSolver(field);
      solver.mode = m.mode || 'energy';
      if (m.solid) field.solid.set(new Uint8Array(m.solid));   // 户型墙体
      if (m.glass) field.glass.set(new Uint8Array(m.glass));
      if (m.structMask) field.structMask.set(new Uint8Array(m.structMask));
      self.postMessage({ type: 'ready', W: m.W, H: m.H, N: field.N });
      break;
    }
    case 'setMode':
      if (solver) solver.mode = m.mode;
      break;
    case 'setDyeDecay':
      if (solver) solver.dyeDecayT = m.T;
      break;
    case 'setWind':
      if (solver) { solver.windDirection = m.windDirection; solver.windSpeed = m.windSpeed; solver.spread = m.spread ?? solver.spread; }
      break;
    case 'setStructs':
      if (solver) solver.setStructs(m.structs);
      break;
    case 'resetField':
      if (field) field.reset();   // 清 dye/u/v/p（保留户型 solid/glass）
      break;
    case 'setSun':
      if (solver) { solver.sunHour = m.hour; solver.sunInten = m.inten; }
      break;
    case 'setPlanOffset':   // 户型朝向偏移（度）：采光太阳方位 地理→网格 换算用
      if (solver) solver.lightOffset = m.deg || 0;
      break;
    case 'setPalaceDrain':
      if (solver) solver.palaceDrain = m.drain ? new Float32Array(m.drain) : null;
      break;
    case 'setQiPorts':
      if (solver) solver.qiPorts = m.ports || [];
      break;
    case 'setWindSrcs':
      if (solver) solver.windSrcs = m.srcs || [];
      break;
    case 'setLightPts':
      if (solver) solver.lightPts = m.pts || [];
      break;
    case 'setQiBearing':
      if (solver) solver.qiBearing = m.bearing;
      break;
    case 'setWindBearing':
      if (solver) solver.windBearing = m.bearing;
      break;
    case 'clearField':   // 清指定场：dye(炁)/wind(风)/light(光)/all
      if (field) {
        const t = m.field;
        if (t === 'dye' || t === 'all') { field.dye.fill(0); field.dye0.fill(0); }
        if (t === 'wind' || t === 'all') { field.u.fill(0); field.v.fill(0); field.u0.fill(0); field.v0.fill(0); }
        if (t === 'light' || t === 'all') { field.light.fill(0); field.light0.fill(0); }
      }
      break;
    case 'setMask': {
      if (!field) break;
      if (m.solid) field.solid.set(new Uint8Array(m.solid));
      if (m.glass) field.glass.set(new Uint8Array(m.glass));
      break;
    }
    case 'injectDye':
      if (solver) solver.injectDye(m.i, m.j, m.r, m.amount);
      break;
    case 'injectVelocity':
      if (solver) solver.injectVelocity(m.i, m.j, m.r, m.vx, m.vy);
      break;
    case 'step': {
      if (!solver) break;
      solver.step(m.dt);
      // 拷贝 + Transferable 回传（采光模式回传 light 作 dye，其余回传 dye）
      // 风场热力图要涡量场（速度40%+涡量60%），curl 一起回传
      const src = (solver.mode === 'light') ? field.light : field.dye;
      const dye = new Float32Array(src);
      const u = new Float32Array(field.u);
      const v = new Float32Array(field.v);
      const curl = new Float32Array(field.curl);
      const msg = { type: 'frame', dye, u, v, curl, W: field.W, H: field.H, SW: field.SW, t: solver.simTime };
      const transfer = [dye.buffer, u.buffer, v.buffer, curl.buffer];
      self.postMessage(msg, transfer);
      break;
    }
  }
};
