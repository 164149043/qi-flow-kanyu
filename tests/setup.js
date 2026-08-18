/**
 * tests/setup.js —— Vitest 全局 setup
 * legacy 算法文件是 IIFE 形式 `(function(global){...})(window)`，直接引用 window。
 * node 测试环境没有 window，这里 mock 成 globalThis，让 IIFE 正常给 globalThis.XQ 赋值。
 */
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
