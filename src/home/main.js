/**
 * main.js —— 星空门户入口（星流 Starflow 引擎版）
 * 引擎：vendor/starflow.js（MIT，https://github.com/Win-Hao/starflow），
 * 自带 three 0.180 + postprocessing 的独立打包产物，与本项目 three 0.144（炁流页）完全隔离。
 * 门户无滚动编排：星系自转（autoRotate）+ 拖拽旋转 + 指针推斥，内容层不挡画布交互。
 * 降级链：WebGL 不可用 → 引擎 renderStaticFallback 静态星图；reduced-motion → 引擎自带停帧保构图。
 */
import { inject } from '@vercel/analytics';
import { createAstraScene, detectWebGL, renderStaticFallback } from './vendor/starflow.js';

inject();

const canvas = document.getElementById('astra');
const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;

if (detectWebGL()) {
  const astra = createAstraScene(canvas, {
    // 门户没有滚动编排（converge-tilt 那套），动感全给自转：原站默认 false 是留给滚动翻转的
    autoRotate: true,
    introDuration: 5.5,
    // 氛围色在 Astra 默认 #23435f 基础上压深一档，贴合霁青夜幕
    ambientColor: '#1b3350',
    flowSpeed: 1,
    // 氛围强度拉满（默认 0.55）
    ambientOpacity: 1,
    // 星系给 UI 让位（center 单位是半个视口，NDC 语义 y 正=上，调大 y = 星系上移）：
    // 桌面中央无文字遮挡，星系回正中放大成唯一主角，核心亮斑与底部卡区拉开；
    // 手机屏矮且卡区占比大，星系收小放进上部空区
    center: isSmall ? [0, 0.45] : [0, 0.40],
    fillY: isSmall ? 0.52 : 0.8,
  });
  astra.setSource(
    { type: 'galaxy' },
    {
      starCount: 2400,
      backgroundRatio: 1,   // 背景星拉满（默认 0.14）
      palette: 'astra',     // astra = 霁青 + 赭金 夜空版，与项目血统同族
    },
  );
  window.__astra = astra;   // 调试句柄：__astra.setSource() 可换形状（文字/图标/路径）
} else {
  renderStaticFallback(canvas, { type: 'galaxy' });
}
