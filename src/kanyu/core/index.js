/**
 * core/index.js —— 算法层统一出口（legacy 垫片）
 * ============================================================
 * 把 legacy IIFE 算法（bagua/feixing/xuankong/fluid）通过 globalThis.XQ
 * re-export 为 ES Module。legacy 文件保持原样零改动（已 node 验证算法正确）。
 *
 * 规则：
 *   - 本文件只 re-export legacy（来自 globalThis.XQ）
 *   - 新增算法模块（fengshui/twentyfour 等）从本文件 import legacy 数据，各自 export
 *   - 这样避免循环依赖（本文件不 import 新模块）
 *
 * 浏览器：window 存在，IIFE 自动给 window.XQ 赋值。
 * node 测试：tests/setup.js 把 globalThis.window 设为 globalThis。
 */
import './legacy/bagua.js';
import './legacy/feixing.js';
import './legacy/xuankong.js';
import './legacy/fluid.js';

const XQ = globalThis.XQ || {};

export const {
  // bagua.js
  BAGUA,
  BAGUA_BY_NAME,
  PALACE_ORDER,
  M24,
  M24_BY_NAME,
  oppositeMountain,
  // feixing.js
  STARS,
  flyForward,
  flyBackward,
  fly,
  yuanYun,
  yuanYunLabel,
  yearStar,
  starOfHour,
  palaceBoost,
  starGlobalBoost,
  // xuankong.js
  xuankongPan,
  // fluid.js
  FluidWorld,
} = XQ;

export default XQ;
