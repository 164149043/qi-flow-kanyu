// verify-m4.mjs —— M4 识别升级验收：Sauvola 自适应阈值 + 膨胀 抓细线/浅线
// 合成：浅底 + 粗黑外框 + 细浅灰内墙（升级前 Otsu 会漏的细线）

import { recognizePlan, preprocessImage, binarize, binToGridSolid } from '../src/vision/LineDetector.js';

function makeImg(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
function setPx(img, x, y, v) {
  const i = (y * img.width + x) * 4;
  img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
}

const w = 120, h = 120;
const img = makeImg(w, h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(img, x, y, 235);   // 浅底
const T = 3;
for (let y = 0; y < h; y++) for (let k = 0; k < T; k++) { setPx(img, k, y, 20); setPx(img, w - 1 - k, y, 20); }
for (let x = 0; x < w; x++) for (let k = 0; k < T; k++) { setPx(img, x, k, 20); setPx(img, x, h - 1 - k, 20); }
// 细浅灰内墙（1px，灰度160——升级前 Otsu 在浅底上容易漏）
for (let x = 15; x < w - 15; x++) setPx(img, x, 60, 160);    // 横墙
for (let y = 15; y < h - 15; y++) setPx(img, 80, y, 160);    // 竖墙
// 椒盐噪点
for (let n = 0; n < 25; n++) setPx(img, (Math.random() * w) | 0, (Math.random() * h) | 0, 0);

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}  ${extra}`); }
};

const gridW = 24, gridH = 24;
// Sauvola + 膨胀 + 低灵敏度
const sau = recognizePlan(img, gridW, gridH, { method: 'sauvola', wallRatio: 0.08, dilate: 1, minSize: 2 });
const at = (solid, SW) => (gi, gj) => solid[(gi + 1) + SW * (gj + 1)];
const A = at(sau.solid, sau.SW);

check('[Sauvola] 粗黑左外框', A(0, 12) === 1, `at(0,12)=${A(0, 12)}`);
check('[Sauvola] 粗黑右外框', A(23, 12) === 1, `at(23,12)=${A(23, 12)}`);
// 细浅墙（y=60→gj≈12；x=80→gi≈16）—— 核心改进验证
check('[Sauvola] 细浅横墙识别(gj≈12)', A(8, 12) === 1 || A(10, 12) === 1, `at(8,12)=${A(8, 12)},at(10,12)=${A(10, 12)}`);
check('[Sauvola] 细浅竖墙识别(gi≈16)', A(16, 8) === 1 || A(16, 18) === 1, `at(16,8)=${A(16, 8)},at(16,18)=${A(16, 18)}`);
check('[Sauvola] 内部空区非墙', A(4, 4) === 0, `at(4,4)=${A(4, 4)}`);

// 分步缓存验证（PlanEditor 会用：preprocess 一次，binarize 一次，滑块只触发 binToGridSolid）
const pp = preprocessImage(img);
const { bin } = binarize(pp.gray, pp.w, pp.h, { method: 'sauvola' });
const r1 = binToGridSolid(bin, pp.w, pp.h, gridW, gridH, { wallRatio: 0.08, dilate: 1, minSize: 2 });
const r2 = binToGridSolid(bin, pp.w, pp.h, gridW, gridH, { wallRatio: 0.30, dilate: 0, minSize: 8 });
check('[分步] 缓存bin复用，高wallRatio墙体更少',
  countSolid(r2.solid, gridW, gridH, r2.SW) <= countSolid(r1.solid, gridW, gridH, r1.SW),
  `低灵敏=${countSolid(r1.solid,gridW,gridH,r1.SW)} 高灵敏=${countSolid(r2.solid,gridW,gridH,r2.SW)}`);

function countSolid(solid, W, H, SW) {
  let c = 0; for (let j = 1; j <= H; j++) for (let i = 1; i <= W; i++) if (solid[i + SW * j]) c++;
  return c;
}

console.log(`\n${fail === 0 ? '\x1b[32m🎉 M4 升级识别验收通过（Sauvola 抓细线）\x1b[0m' : '\x1b[31m💥 有失败\x1b[0m'}：${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
