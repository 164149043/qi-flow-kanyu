import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 老子的配置：dev 阶段不挂 singlefile（它是 build 内联用的，dev 挂上纯添乱）
// build 阶段才启用 singlefile 把一切内联成单文件（复刻原站 418KB 交付）
//
// 三入口（index=星空门户 / qiliu=炁流3D / kanyu=堪舆）——singlefile 官方不支持多入口（wontfix, issue #51），
// 所以跑三次独立构建（npm run build 串联），每次单入口各产一个单文件：
//   vite build                → dist/index.html（第一次，清空 dist；不带 --mode 时 mode='production'）
//   vite build --mode kanyu   → dist/kanyu.html（第二三次 emptyOutDir:false 别删前面产物）
//   vite build --mode qiliu   → dist/qiliu.html
// dev 无 singlefile，/ 与 /qiliu.html、/kanyu.html 直接按路径访问，input 配置无所谓但留着没坏处。
//
// 炼炁（lianqi，文字修真游戏，2026-09 接入）：第五入口。
//   - vue() 插件全局挂无副作用（主项目四入口纯原生 JS，无 .vue 文件）
//   - 豁免 singlefile：游戏素材 import.meta.glob 走 hash 资产管线，体量不适合单文件内联
//   - alias '@' → src/lianqi（游戏代码内全是 @/ 引用，全锁在子树内不与主项目 src 冲突）
//   - 路由 createWebHashHistory，与 MPA 子路径 /lianqi.html 天然兼容，零改动
const lianqiDir = fileURLToPath(new URL('./src/lianqi', import.meta.url));
export default defineConfig(({ command, mode }) => ({
  // base 相对路径：四单文件入口全内联无感；lianqi 多文件产物（js/css/png 引用）必须相对，
  // 否则部署到 GitHub Pages 子路径（user.github.io/repo/）会 404。dev 下 './' 等价 '/'。
  base: './',
  plugins: [vue(), ...(command === 'build' && mode !== 'lianqi' ? [viteSingleFile()] : [])],
  resolve: {
    alias: { '@': lianqiDir }
  },
  worker: {
    format: 'es'
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    emptyOutDir: mode === 'production',   // 仅第一次构建清空 dist；kanyu/qiliu 阶段绝不能清
    // 自定义 mode 下 vite 会把 process.env.NODE_ENV 替换成 'development'——钉回 production 封死漂移
    // （three/lunar 无 NODE_ENV 分支，@vercel/analytics 有 dev 警告分支，钉住只赚不亏）
    ...(command === 'build' ? { define: { 'process.env.NODE_ENV': '"production"' } } : {}),
    rollupOptions: {
      input: mode === 'kanyu' ? { kanyu: 'kanyu.html' }
           : mode === 'qiliu' ? { qiliu: 'qiliu.html' }
           : mode === 'mingli' ? { mingli: 'mingli.html' }
           : mode === 'lianqi' ? { lianqi: 'lianqi.html' }
           : { main: 'index.html' },
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
