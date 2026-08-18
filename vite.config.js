import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 老子的配置：dev 阶段不挂 singlefile（它是 build 内联用的，dev 挂上纯添乱）
// build 阶段才启用 singlefile 把一切内联成单文件（复刻原站 418KB 交付）
//
// 双入口（index=炁流3D / kanyu=堪舆）——singlefile 官方不支持多入口（wontfix, issue #51），
// 所以跑两次独立构建（npm run build 串联），每次单入口各产一个单文件：
//   vite build                → dist/index.html（第一次，清空 dist）
//   vite build --mode kanyu   → dist/kanyu.html（第二次，emptyOutDir:false 别删第一次产物）
// dev 无 singlefile，/ 与 /kanyu.html 直接按路径访问，input 配置无所谓但留着没坏处。
export default defineConfig(({ command, mode }) => ({
  plugins: command === 'build' ? [viteSingleFile()] : [],
  worker: {
    format: 'es'
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    emptyOutDir: mode !== 'kanyu',   // 第二次构建绝不能清空 dist（vite 默认会清）
    rollupOptions: {
      input: mode === 'kanyu' ? { kanyu: 'kanyu.html' } : { main: 'index.html' },
    },
  },
  // lunar-javascript 是大 CJS 包：运行时首次 import 会触发“新依赖→重新预构建”卡死 server，
  // 启动时显式预构建可避免（kanyu 页黄历/干支模块用）
  optimizeDeps: { include: ['lunar-javascript'] },
  server: {
    open: true,
    port: 5173
  },
  // vitest（P4）：堪舆 core 术数算法单测（bazhai/feixing-year/scoring）
  // setup.js 把 globalThis.window mock 成 globalThis——legacy IIFE 垫片（bagua/feixing/xuankong）要挂 window.XQ
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
  },
}));
