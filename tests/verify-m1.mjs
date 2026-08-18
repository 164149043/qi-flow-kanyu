// verify-m1.mjs —— M1 流体内核算法验收（Node 直接跑，不依赖浏览器/DOM）
// 验证：project 散度清除 / Brinkman 渗透 / dye 半衰期 / 无 NaN / 平流方向正确

import { FluidField } from '../src/core/FluidField.js';
import { FluidSolver } from '../src/core/FluidSolver.js';

const field = new FluidField(30, 30);
const solver = new FluidSolver(field);

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}  ${extra}`); }
};

// ===== 1. project 单调清除散度（验证算法方向正确）=====
// 注：Jacobi 慢收敛是已知特性，40次为原站性能取舍；Stam 流体靠每帧累积稳定，不追求单帧绝对无散
field.reset(); field.clearMask();
for (let j = 12; j <= 18; j++) for (let i = 12; i <= 18; i++) {
  const c = field.IX(i, j); field.u[c] = 5; field.v[c] = 5;
}
solver.mode = 'energy';
const maxDivAt = () => {
  let m = 0;
  for (let j = 6; j <= 24; j++) for (let i = 6; i <= 24; i++) {
    const c = field.IX(i, j);
    const d = Math.abs(field.u[c + 1] - field.u[c - 1] + field.v[c + field.SW] - field.v[c - field.SW]);
    if (d > m) m = d;
  }
  return m;
};
const divBefore = maxDivAt();
solver.project(40);
const divAfter40 = maxDivAt();
solver.project(160);
const divAfter200 = maxDivAt();
check('project 单调降低散度，迭代越多越收敛',
  divAfter40 < divBefore && divAfter200 < divAfter40,
  `${divBefore.toFixed(2)} →40→ ${divAfter40.toFixed(2)} →200→ ${divAfter200.toFixed(2)}`);

// ===== 2. Brinkman 墙内速度衰减（伪 Brinkman，不清零）=====
field.reset(); field.clearMask();
const wc = field.IX(15, 15);
field.solid[wc] = 1;
field.u[wc] = 10; field.v[wc] = 10;
solver.mode = 'energy';
solver.project(40);
check('Brinkman 墙内速度衰减到 ~5%（非清零）',
  field.u[wc] > 0.01 && field.u[wc] < 1.0 && field.v[wc] > 0.01 && field.v[wc] < 1.0,
  `u=${field.u[wc].toFixed(4)} v=${field.v[wc].toFixed(4)}`);

// ===== 3. dye 半衰期衰减（"信息素挥发"叙事的真身）=====
field.reset(); field.clearMask();
solver.dyeDecayT = 6.5;
solver.injectDye(15, 15, 3, 1.0);
const before = field.dye[field.IX(15, 15)];
solver.mode = 'energy';
solver.step(6.5);  // 一个半衰期
const after = field.dye[field.IX(15, 15)];
check('dye 一个半衰期(6.5s)后衰减到 ~50%',
  after < before * 0.62 && after > before * 0.38,
  `残留 ${(after / before * 100).toFixed(1)}%`);

// ===== 4. 连续 step 不产生 NaN/Infinity =====
field.reset(); field.clearMask();
let hasNaN = false;
for (let i = 0; i < 20; i++) {
  solver.injectDye(15, 10, 3, 1.0);
  solver.injectVelocity(15, 10, 3, 3, 3);
  solver.step(0.016);
  for (let k = 0; k < field.N; k++) {
    if (!isFinite(field.u[k]) || !isFinite(field.v[k]) || !isFinite(field.dye[k])) { hasNaN = true; break; }
  }
  if (hasNaN) break;
}
check('连续 20 帧 step 不产生 NaN/Infinity', !hasNaN);

// ===== 5. dye 受气流平流向下游 =====
field.reset(); field.clearMask();
solver.mode = 'energy';
solver.injectDye(6, 15, 2, 1.0);
for (let i = 0; i < 40; i++) {
  solver.injectVelocity(3, 15, 2, 4, 0);   // 持续从左吹
  solver.step(0.05);
}
let cx = 0, sum = 0;
for (let j = 1; j <= 30; j++) for (let i = 1; i <= 30; i++) {
  const c = field.IX(i, j); const d = field.dye[c];
  cx += i * d; sum += d;
}
cx = sum > 0.001 ? cx / sum : 0;
check('dye 受气流平流向下游移动', cx > 10, `质心 x=${cx.toFixed(2)}（应 >10）`);

// ===== 6. MacCormack + 涡量 confinement 协同不爆炸 =====
field.reset(); field.clearMask();
solver.mode = 'energy';
let stable = true;
for (let i = 0; i < 60; i++) {
  // 强制注入旋涡（切向速度）
  solver.injectVelocity(15, 15, 5, 0, 4);
  solver.injectVelocity(15, 10, 5, 0, -4);
  solver.step(0.016);
  let m = 0;
  for (let k = 0; k < field.N; k++) { const a = Math.abs(field.u[k]); if (a > m) m = a; }
  if (m > 50 || !isFinite(m)) { stable = false; break; }   // 速度不被放大到离谱
}
check('MacCormack + 涡量 confinement 协同稳定（速度不爆炸）', stable);

console.log(`\n${fail === 0 ? '\x1b[32m🎉 M1 流体内核验收通过\x1b[0m' : '\x1b[31m💥 有失败\x1b[0m'}：${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
