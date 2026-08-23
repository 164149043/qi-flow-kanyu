// main.js —— M3 3D 场景：热力图贴地板 + 默认户型 3D 墙 + 射线拾取注入
// 左键=放置/选中源/旋转(默认，视图组「拖拽」可切平移)，右键=旋转，滚轮=缩放；触屏：单指=旋转，双指=缩放/平移

import { inject } from '@vercel/analytics';
import * as THREE from 'three';
import { HeatmapRenderer } from './core/HeatmapRenderer.js';
import { SceneManager } from './scene/SceneManager.js';
import { buildWalls } from './scene/WallBuilder.js';
import { buildDefaultPlan } from './scene/DefaultPlan.js';
import LAYOUT_JSON from './scene/default-layout.json';   // 自定义默认布置（null=内置四合院；布置 JSON 直接覆盖此文件即换默认）
import { PlanEditor } from './ui/PlanEditor.js';
import { VolumetricFlow } from './core/VolumetricFlow.js';
import { ELEMENT_PROPS } from './fengshui/Wuxing.js';
import { drawBazhai, ZHAI_NAME, BAZHAI_STARS, bazhaiCompute } from './fengshui/Bazhai.js';
import { CompassInstrument } from './ui/CompassInstrument.js';
import { DataPanel } from './ui/DataPanel.js';
import { drawJiuxing, buildPalaceDrain, JIUXING_STARS, yearCenterStar, flyStars, palaceDir, palaceInfluenceText } from './fengshui/Jiuxing.js';
import { sunAltitude } from './fengshui/Solar.js';
import FluidWorker from './core/fluid.worker.js?worker&inline';   // inline worker，打包成真单文件
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const W = 150, H = 100, HSCALE = 4;
const SW = W + 2;
const CELL = 0.20;

// ===== 悬浮层高度（米）——2026-08-18 悬浮式九宫盘/八宅标签，按需直接改这三个值 =====
const PALACE_DISC_H = 0.032;                          // ① 九宫贴地能量盘离地高（原站同款）
const PALACE_LABEL_H = { center: 0.95, side: 0.72 };  // ② 九宫悬浮标签高（中宫/八宫，原站同款）
const BAZHAI_LABEL_H = 1.35;                          // ③ 八宅悬浮标签高（八宅扇区上空）
let palaceScale = 1, bazhaiScale = 1;                 // 盘式缩放（左栏滑块驱动）：palaceScale=九宫分野范围 0.4~1（收向域中心套住户型）；bazhaiScale=八宅扇区半径 0.5~2。高度恒不受影响


// ===== Vercel Analytics =====
inject();
// ===== 样式 + DOM =====
const app = document.getElementById('app');
const style = document.createElement('style');
style.textContent = `
  *{box-sizing:border-box;margin:0}
  body{background:#eceef2;color:#333;font-family:system-ui,"Microsoft YaHei",sans-serif;overflow:hidden}
  #three-container{position:fixed;inset:0}
  .bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;background:rgba(255,255,255,.80);padding:8px 12px;border-radius:8px;backdrop-filter:blur(8px);z-index:10;box-shadow:0 2px 10px rgba(60,70,90,.12)}
  button{background:#fff;color:#333;border:1px solid #c8ccd4;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px}
  button:hover{border-color:#4a80d9}
  button.active{background:#e8f0fe;border-color:#4a80d9;color:#1a56c4;font-weight:600}
  .hint{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);font-size:12px;color:#555;background:rgba(255,255,255,.80);padding:6px 14px;border-radius:6px;z-index:10;box-shadow:0 2px 8px rgba(60,70,90,.10)}
  .bar-group{display:flex;gap:4px;align-items:center}
  .bar-sep{width:1px;align-self:stretch;background:#c8ccd4;margin:0 6px}
  .seg{display:flex;background:rgba(200,204,212,.35);border-radius:6px;padding:2px;gap:2px}
  .seg button{border:none;background:transparent;color:#555;padding:5px 12px;border-radius:4px;font-size:13px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:1px;transition:background .15s,color .15s;line-height:1.1}
  .seg button:hover{color:#1a56c4}
  .seg button.active{background:#fff;color:#1a56c4;font-weight:600;box-shadow:0 1px 3px rgba(60,70,90,.12)}
  .mode-sub{font-size:11px;color:#555555;font-weight:400;letter-spacing:0}
  .seg button.active .mode-sub{color:#1a56c4}
  .icon{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;display:inline-block}
  .tool-btn{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;flex-wrap:nowrap}
  .fps-head{font-size:12px;font-weight:400;color:#2a8a3a;letter-spacing:0}
  .dp-panel{position:fixed;right:0;top:0;bottom:0;width:256px;overflow-y:auto;background:rgba(255,255,255,.88);backdrop-filter:blur(8px);border-left:1px solid #c8ccd4;box-shadow:-2px 0 12px rgba(60,70,90,.12);z-index:15;padding:12px;font-size:12px;color:#333}
  .dp-inst-row{display:flex;justify-content:space-around;gap:6px}
  .dp-inst{display:flex;flex-direction:column;align-items:center;gap:2px}
  .dp-inst-cap{font-size:11px;color:#555;line-height:1.4;white-space:nowrap}
  .dp-head{font-size:13px;font-weight:600;color:#1a56c4;letter-spacing:1px;padding-bottom:6px;margin-bottom:2px;border-bottom:1px solid #c8ccd4}
  .dp-sec{padding:6px 0;border-bottom:1px solid #c8ccd4}
  .dp-sec:last-child{border-bottom:none}
  .dp-sec summary{cursor:pointer;font-size:12px;font-weight:600;color:#555;list-style:none;margin-bottom:4px}
  .dp-sec summary::-webkit-details-marker{display:none}
  .dp-sec summary::before{content:"▾ ";color:#c77800}
  .dp-sec:not([open]) summary::before{content:"▸ "}
  .dp-sec summary:hover{color:#1a56c4}
  .dp-cv{display:block;margin:0 auto;background:transparent}
  .dp-sub{font-size:11px;color:#555;text-align:center;margin-top:2px;line-height:1.4}
  .dp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
  .dp-cell{padding:3px 1px;border-radius:4px;border-left:3px solid #c8ccd4;background:rgba(255,255,255,.5);text-align:center;line-height:1.3;cursor:pointer;transition:filter .12s}
  .dp-cell:hover{filter:brightness(1.06)}
  .dp-cell-sel{outline:2px solid #c77800;outline-offset:-2px}
  .dp-detail{margin-top:6px;padding:6px 2px;border-top:1px dashed #c8ccd4}
  .dp-dt-head{font-size:12px;color:#333;margin-bottom:4px}
  .dp-dt-row{display:flex;gap:6px;font-size:11px;line-height:1.5;margin:2px 0}
  .dp-dt-k{flex:0 0 16px;color:#c77800;font-weight:600}
  .dp-dt-v{flex:1;color:#555}
  .dp-dt-src{font-size:11px;color:#999;margin-top:4px}
  .dp-cell .dp-cn{font-size:11px;color:#999}
  .dp-cell .dp-sn{font-size:12px;font-weight:600;color:#c77800}
  .dp-cell .dp-jx{font-size:11px;color:#555}
  .ctrl-panel{position:fixed;left:0;top:0;bottom:0;width:236px;overflow-y:auto;background:rgba(255,255,255,.88);backdrop-filter:blur(8px);border-right:1px solid #c8ccd4;box-shadow:2px 0 12px rgba(60,70,90,.12);z-index:15;padding:12px;font-size:12px;color:#333}
  .ctrl-head{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;color:#1a56c4;letter-spacing:1px;padding-bottom:6px;margin-bottom:2px;border-bottom:1px solid #c8ccd4}
  .ctrl-sec{padding:6px 0;border-bottom:1px solid #c8ccd4}
  .ctrl-sec:last-child{border-bottom:none}
  .ctrl-sec summary{cursor:pointer;font-size:12px;font-weight:600;color:#555;list-style:none;margin-bottom:4px}
  .ctrl-sec summary::-webkit-details-marker{display:none}
  .ctrl-sec summary::before{content:"▾ ";color:#c77800}
  .ctrl-sec:not([open]) summary::before{content:"▸ "}
  .ctrl-sec summary:hover{color:#1a56c4}
  .ctrl-grp{display:flex;flex-wrap:wrap;gap:4px}
  .ctrl-grp label{font-size:11px;color:#555;display:flex;align-items:center;gap:4px}
  .ctrl-grp button{flex:1 1 auto;min-width:0;display:flex;justify-content:center;align-items:center;white-space:nowrap;padding:6px 8px}
  .ctrl-grp button.zb{flex:1 1 46px;padding:6px 0}
  .ctrl-grp.view button{font-size:12px;padding:6px 4px}
  button.armed{color:#c0392b;border-color:#e0b4b0;background:#fff}
  .ctrl-head-r{margin-left:auto;display:flex;gap:8px;align-items:center}
  .ob-help{width:18px;height:18px;border:1px solid #c8ccd4;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#555;cursor:pointer;user-select:none}
  .ob-help:hover{border-color:#4a80d9;color:#1a56c4}
  .ob-card{position:fixed;bottom:56px;left:50%;transform:translateX(-50%);width:340px;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border:1px solid #c8ccd4;border-radius:8px;box-shadow:0 2px 12px rgba(60,70,90,.15);padding:14px 16px;z-index:40;font-size:12px;color:#333;line-height:1.6}
  .ob-card h4{font-size:13px;font-weight:600;color:#1a56c4;margin-bottom:6px}
  .ob-card .ob-step{display:flex;align-items:center;gap:5px;margin-bottom:8px}
  .ob-card .ob-dot{width:6px;height:6px;border-radius:50%;background:#c8ccd4}
  .ob-card .ob-dot.on{background:#2b6cb0}
  .ob-card .ob-btns{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
  .ob-card .ob-skip{background:none;border:none;color:#999;font-size:11px;padding:4px 6px;cursor:pointer}
  .ob-card .ob-skip:hover{color:#555}
  .ob-card .ob-btn{background:#1a56c4;color:#fff;border:none;border-radius:4px;font-size:12px;padding:5px 14px;cursor:pointer}
  .ob-card .ob-btn:hover{background:#2b6cb0}
  .ctrl-legend{margin-top:6px;border-top:1px dashed #c8ccd4;padding-top:4px;text-align:center}
  .ctrl-legend summary{cursor:pointer;font-size:11px;color:#999;list-style:none;display:block;text-align:center}
  .ctrl-legend summary::-webkit-details-marker{display:none}
  .ctrl-legend summary::before{content:"▸ "}
  .ctrl-legend[open] summary::before{content:"▾ "}
  .lg-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#555;margin:1px 5px 1px 0}
  .lg-dot{width:7px;height:7px;border-radius:50%;flex:none}
  .undo-link{color:#1a56c4;cursor:pointer;text-decoration:underline;font-weight:600}
  button:focus-visible,summary:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #1a56c4;outline-offset:1px;border-radius:4px}
  @media (prefers-reduced-motion: reduce){*,*::before,*::after{transition:none!important;animation:none!important}}
  /* 页面分段切换器（炁流⇄堪舆 双页同款，2026-08-18 统一入口；规则与 kanyu.css .pager 一致） */
  .pager{display:inline-flex;align-items:center;border:1px solid #c8ccd4;border-radius:999px;background:rgba(255,255,255,0.72);backdrop-filter:blur(6px);padding:2px}
  .pager a{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#555;text-decoration:none;padding:3px 14px;border-radius:999px;transition:background .15s,color .15s}
  .pager a:hover{color:#1a56c4}
  .pager a.active{background:#2b6cb0;color:#fff}
  /* ===== 移动端抽屉（≤820px）：两栏 bottom sheet 半屏滑出，无遮罩不锁场景，2026-08-19 手机适配 ===== */
  .m-toolbar{display:none}
  .sheet-grip{display:none}   /* 把手栏仅移动端 sheet 需要，桌面隐藏 */
  @media (max-width:820px){
    .m-toolbar{display:flex;align-items:center;gap:8px;position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:20;background:rgba(255,255,255,.82);backdrop-filter:blur(8px);padding:6px 10px;border-radius:999px;box-shadow:0 2px 10px rgba(60,70,90,.14);max-width:calc(100vw - 16px)}
    .m-toolbar .pager{padding:0;border:none;background:transparent;backdrop-filter:none;box-shadow:none}
    .m-toolbar .pager a{padding:4px 10px;font-size:12px}
    .m-btn{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #c8ccd4;cursor:pointer;flex:none}
    .m-btn.active{background:#e8f0fe;border-color:#4a80d9}
    /* bottom sheet：1/3 屏高（多留场景）、半透明（透出建筑与源元素）、内部滚动；场景无遮罩照常操作 */
    .ctrl-panel,.dp-panel{
      left:0;right:0;top:auto;bottom:0;width:auto;height:32dvh;min-height:220px;
      border:none;border-top:1px solid #c8ccd4;border-radius:16px 16px 0 0;
      background:rgba(255,255,255,.80);backdrop-filter:blur(4px);
      transform:translateY(102%);transition:transform .28s ease;
      z-index:30;box-shadow:0 -6px 24px rgba(60,70,90,.25);
      padding:0 12px 12px;
    }
    .ctrl-panel.open,.dp-panel.open{transform:none}
    .sheet-grip{position:sticky;top:0;z-index:2;background:rgba(255,255,255,.6);padding:8px 0 6px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;user-select:none}
    .sheet-grip::before{content:'';width:44px;height:5px;border-radius:3px;background:#c8ccd4}
    .sheet-grip span{font-size:12px;color:#555}
    .sheet-grip b{color:#1a56c4;font-size:13px;letter-spacing:1px}
    .ctrl-head{margin-top:2px}
    .ob-card{width:min(340px,calc(100vw - 24px));bottom:60px}
    .hint{max-width:calc(100vw - 20px);font-size:11px;padding:5px 10px}
    .ctrl-head-r .pager{display:none}   /* pager 移动端移至 m-toolbar（重复一套纯链接，零搬移逻辑） */
    .seg button{padding:5px 8px}
    .seg .mode-sub{display:none}        /* 模式副标手机省空间 */
  }
  /* ===== 报告离屏视图（导出 PDF）：对齐堪舆页——html2canvas 分块截图 + jsPDF 直接下载，不走打印对话框 ===== */
  #pdf-report{position:fixed;left:-99999px;top:0;width:720px;background:#fff;font-family:'Microsoft YaHei','PingFang SC',sans-serif;color:#222;padding:8px}
  #pdf-report .sec{padding:4px 0 10px;border-bottom:1px solid #eef0f4;margin-bottom:8px}
  #pdf-report h1{font-size:20px;letter-spacing:2px;color:#1a56c4;border-bottom:2px solid #1a56c4;padding-bottom:6px;margin:0 0 6px}
  #pdf-report .rp-meta{font-size:12px;color:#555;margin-bottom:10px}
  #pdf-report .rp-shot{width:100%;border:1px solid #c8ccd4;border-radius:4px;margin-bottom:12px}
  #pdf-report .rp-cap{font-size:11px;color:#777;margin:-8px 0 4px;text-align:center}
  #pdf-report .rp-verdict{font-size:12px;line-height:1.9}
  #pdf-report .rp-ji{color:#2a8a3a}
  #pdf-report .rp-xiong{color:#c0392b}
  #pdf-report h2{font-size:14px;color:#1a56c4;margin:14px 0 6px}
  #pdf-report .sec:first-child h2{margin-top:4px}
  #pdf-report table{width:100%;border-collapse:collapse;font-size:11px}
  #pdf-report th,#pdf-report td{border:1px solid #c8ccd4;padding:4px 6px;text-align:left}
  #pdf-report th{background:#eef2f7;font-weight:600}
  #pdf-report .rp-empty{font-size:12px;color:#999;padding:8px 0}
  #pdf-report .rp-foot{font-size:10px;color:#999;margin-top:16px;border-top:1px solid #c8ccd4;padding-top:6px}
`;
document.head.appendChild(style);

// authored SVG 图标集（统一描边 1.8，替代 emoji——craft-floor 铁律）
const ICO = {
  energy: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12c3-4 6-4 9 0s6 4 9 0"/><path d="M3 17c3-4 6-4 9 0"/></svg>',
  speed: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h9"/></svg>',
  light: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>',
  wind: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h9"/></svg>',
  envWind: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/></svg>',
  qi: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2 2M15.7 15.7l2 2M17.7 6.3l-2 2M8.3 15.7l-2 2"/></svg>',
  lamp: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z"/></svg>',
  upload: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M12 3v12M7 8l5-5 5 5"/></svg>',
  reset: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 4v4h4"/></svg>',
  pause: '<svg class="icon" viewBox="0 0 24 24"><rect x="7" y="5" width="3" height="14" rx="0.5"/><rect x="14" y="5" width="3" height="14" rx="0.5"/></svg>',
  play: '<svg class="icon" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  bazhai: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-width="2"/></svg>',
  star: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 17.8 6.2 21.3l1.6-6.6L2.6 9.8l6.8-.5z"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  report: '<svg class="icon" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h7M9 8h3"/></svg>',
  screen: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 6l5-2v13l-5 2z"/><path d="M9 4l5-2v13l-5 2z"/><path d="M3 21h18"/></svg>',
  door: '<svg class="icon" viewBox="0 0 24 24"><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M9 21V7h6v14"/><circle cx="13.4" cy="13" r="0.9"/></svg>',
  window: '<svg class="icon" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="14" rx="1"/><path d="M12 4v14M5 11h14"/></svg>',
  flame: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3c0 4-5 5-5 10a5 5 0 0 0 10 0c0-2-1-3-2-4 0 1.5-1 2-2 2 1-3-1-6-1-8z"/></svg>',
};
const ico = (svg, lab) => `<span class="tool-btn">${svg}<span>${lab}</span></span>`;

const container = document.createElement('div');
container.id = 'three-container';
app.appendChild(container);

// 左侧控制栏（操作台）—— 顶部 bar 已拆除，模式/放置工具/视图/风水开关/srcPanel 收编于此
const ctrlPanel = document.createElement('div');
ctrlPanel.className = 'ctrl-panel';
ctrlPanel.innerHTML = `
  <div class="ctrl-head"><span>操作台</span><span class="ctrl-head-r"></span></div>
  <details class="ctrl-sec" open><summary>模式</summary><div class="ctrl-grp" data-k="mode"></div></details>
  <details class="ctrl-sec" open><summary>放置</summary>
    <div class="ctrl-grp" data-k="struct"></div>
    <div class="ctrl-grp" data-k="wind"></div>
    <div class="ctrl-grp" data-k="sun"></div>
    <div class="ctrl-grp" data-k="fixture"></div>
  </details>
  <details class="ctrl-sec" open><summary>视图</summary><div class="ctrl-grp" data-k="view"></div></details>
  <details class="ctrl-sec" open><summary>报告</summary><div class="ctrl-grp" data-k="reportGrp"></div></details>
  <details class="ctrl-sec" open><summary>八宅</summary><div class="ctrl-grp" data-k="zhai"></div></details>
  <details class="ctrl-sec" open><summary>九星</summary><div class="ctrl-grp" data-k="star"></div></details>
  <details class="ctrl-sec" data-k="src"><summary>源属性</summary><div class="ctrl-grp" data-k="srcBody"></div></details>`;
app.appendChild(ctrlPanel);
const modeWrap = ctrlPanel.querySelector('[data-k="mode"]');
const structGrp = ctrlPanel.querySelector('[data-k="struct"]');
const windGrp = ctrlPanel.querySelector('[data-k="wind"]');
const sunGrp = ctrlPanel.querySelector('[data-k="sun"]');
const fixtureRow = ctrlPanel.querySelector('[data-k="fixture"]');
const viewWrap = ctrlPanel.querySelector('[data-k="view"]');
const zhaiWrap = ctrlPanel.querySelector('[data-k="zhai"]');
const starWrap = ctrlPanel.querySelector('[data-k="star"]');
const srcSec = ctrlPanel.querySelector('[data-k="src"]');
const srcBody = ctrlPanel.querySelector('[data-k="srcBody"]');

// 触屏判定 + 常驻提示词（唯一定义，后续所有 hint 复位复用它——2026-08-19 清理三份硬编码）
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;   // 触屏（手机/平板）：操作提示词与桌面分开（无 Shift/滚轮）
const HINT_DEFAULT = IS_TOUCH
  ? `${ICO.flame} <b>3D 风水引擎</b> · 点按=放置/选中源 · 单指拖=旋转 · 双指=缩放/平移`
  : `${ICO.flame} <b>3D 风水引擎</b> · 左键=放置/选中源 · 左键拖=旋转 · 右键拖=旋转 · 「拖拽」按钮可切平移`;

const hint = document.createElement('div');
hint.className = 'hint';
hint.innerHTML = HINT_DEFAULT;
app.appendChild(hint);

// 风场模式工具行（方位/风速已移入罗盘仪器，此处仅留放置工具）
const windRow = windGrp;   // 放置节·风场子分组（speed 模式才显）
windRow.style.display = 'none';
let envWindOn = true;    // 环境风开关（off→风速 0，停背景风）
let curWindDir = 180;    // 环境风向（度）——罗盘沧浪指针拖拽驱动，供风场热力图伪3D判断
let windSpd = 4;         // 环境风速——罗盘滚轮驱动（风场模式）
const sendWind = () => {
  const s = envWindOn ? windSpd : 0;
  const gridDir = (curWindDir - planOffset + 360) % 360;   // 地理风向 → 网格注入角（户型朝向偏移换算；罗盘/面板仍显示地理值）
  worker.postMessage({ type: 'setWind', windDirection: gridDir, windSpeed: s });
  if (typeof compass !== 'undefined') compass.updateWind(curWindDir);
  if (typeof dataPanel !== 'undefined') dataPanel.updateWind({ dir: curWindDir, spd: envWindOn ? windSpd : 0 });
};
const windSrcBtn = document.createElement('button');
windSrcBtn.innerHTML = ico(ICO.wind, '风口');
windSrcBtn.style.borderLeft = '4px solid #66ccff';
windSrcBtn.title = '放置风口：沿自身朝向锥形吹风（独立于环境风，选中后可调方向/风速）';
windSrcBtn.onclick = () => { placingWind = !placingWind; windSrcBtn.classList.toggle('active', placingWind); hint.innerHTML = placingWind ? '点击地板放置【风口】· 初始方向=环境风向，放置后可独立调向（再点取消）' : HINT_DEFAULT; };
windRow.appendChild(windSrcBtn);
// 环境风开关
const envWindBtn = document.createElement('button');
envWindBtn.innerHTML = ico(ICO.envWind, '环境风');
envWindBtn.classList.add('active');
envWindBtn.title = '环境风开关：关掉则无背景环境风，只剩风口';
envWindBtn.onclick = () => { envWindOn = !envWindOn; envWindBtn.classList.toggle('active', envWindOn); sendWind(); };
windRow.appendChild(envWindBtn);
const clearWindBtn = document.createElement('button');
clearWindBtn.textContent = '清风口';
clearWindBtn.onclick = () => clearSources(windGroup, windSrcs, 'setWindSrcs', 'srcs', 'wind');
windRow.appendChild(clearWindBtn);

// 五行结构工具栏（炁流模式显示）：金木水火土 + 清除
const structRow = structGrp;   // 放置节·炁流子分组（energy 模式才显；初始 mode=energy 即显示，切换由模式按钮接管）
let currentElement = null;
const ELEM_LIST = [['metal', '金'], ['wood', '木'], ['water', '水'], ['fire', '火'], ['earth', '土']];
ELEM_LIST.forEach(([k, lab]) => {
  const b = document.createElement('button');
  b.textContent = lab;
  b.style.borderLeft = `4px solid #${ELEMENT_PROPS[k].color.toString(16).padStart(6, '0')}`;
  b.title = ELEMENT_PROPS[k].label + '：' + ELEMENT_PROPS[k].desc;
  b.onclick = () => {
    currentElement = currentElement === k ? null : k;
    structRow.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    if (currentElement === k) b.classList.add('active');
    hint.innerHTML = currentElement
      ? `点击地板放置【${ELEMENT_PROPS[k].label}】· ${ELEMENT_PROPS[k].desc}（再点${lab}取消）`
      : HINT_DEFAULT;
  };
  structRow.appendChild(b);
});
const clearStructBtn = document.createElement('button');
clearStructBtn.textContent = '清炁流';
clearStructBtn.title = '清除五行结构 + 炁口 + 炁场';
clearStructBtn.onclick = () => {
  for (let k = structGroup.children.length - 1; k >= 0; k--) { const c = structGroup.children[k]; structGroup.remove(c); c.traverse?.(x => { x.geometry?.dispose(); x.material?.dispose(); }); }
  for (let k = qiGroup.children.length - 1; k >= 0; k--) { const c = qiGroup.children[k]; qiGroup.remove(c); c.traverse?.(x => { x.geometry?.dispose(); x.material?.dispose(); }); }
  structs.length = 0; qiPorts.length = 0;
  if (selectedSource && (selectedSource.arr === qiPorts || selectedSource.arr === structs)) deselectSource();   // 关面板+藏选中环+复位 hint/缩放
  worker.postMessage({ type: 'setStructs', structs: [] });
  worker.postMessage({ type: 'setQiPorts', ports: [] });
  worker.postMessage({ type: 'clearField', field: 'dye' });   // 清炁场
};
structRow.appendChild(clearStructBtn);
const qiBtn = document.createElement('button');
qiBtn.innerHTML = ico(ICO.qi, '炁口');
qiBtn.style.borderLeft = '4px solid #ffaa44';
qiBtn.title = '放置炁口：持续注入炁形成浓度力场，沿自身朝向缓慢发散';
qiBtn.onclick = () => { placingQi = !placingQi; qiBtn.classList.toggle('active', placingQi); hint.innerHTML = placingQi ? '点击地板放置【炁口】· 持续注炁成力场，放置后可调炁向/炁量（再点取消）' : HINT_DEFAULT; };
structRow.appendChild(qiBtn);
// 炁向不再设全局滑块（避免与属性面板方向冲突）：
// 方向是每个炁口的独立属性，统一由选中后的属性面板/滚轮调节；
// 新炁口初始方向继承上次调整值（lastQiBearing，连续放同向炁口更方便）
let lastQiBearing = 180;

function addStruct(i, j, element) {
  const s = { i, j, element, r: 4, strength: 1 };
  const prop = ELEMENT_PROPS[element];
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(s.r * CELL * 0.55, 18, 14),
    new THREE.MeshStandardMaterial({ color: prop.color, emissive: prop.color, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 })
  );
  mesh.position.y = s.r * CELL * 0.5;
  g.add(mesh);
  // 选中环（与炁口/风口/光源统一 _vis 机制 → 可选中/拖动/删除）
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(s.r * CELL * 0.9, s.r * CELL, 32),
    new THREE.MeshBasicMaterial({ color: prop.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.014;
  ring.visible = false;
  g.add(ring);
  g.userData.ring = ring;
  const [x, z] = scene3d.gridToWorld(i, j);
  g.position.set(x, 0, z);
  structGroup.add(g);
  s._vis = g;
  structs.push(s);
  sendStructs();
  return s;
}
function sendStructs() {
  worker.postMessage({ type: 'setStructs', structs: structs.map(s => ({ i: s.i, j: s.j, element: s.element, r: s.r, strength: s.strength })) });
}
// ===== 源可视化：球体 + 方向箭头 + 力场范围圈 + 选中环（可拖拽/可调向）=====
function makeSourceVisual(color, hasDir, rangeR = 0) {
  const g = new THREE.Group();
  // 力场范围圈（发光圆盘，显示影响半径，炁口/风口有）
  if (rangeR > 0) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(rangeR, 36),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.012;
    g.add(disc);
    g.userData.disc = disc;
    // 外圈描边环
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(rangeR * 0.92, rangeR, 36),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.013;
    g.add(edge);
  }
  // 球体
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 })
  );
  sphere.position.y = 0.32;
  sphere.userData.isSourceBody = true;
  g.add(sphere);
  // 方向箭头（杆 + 锥，深色在浅背景上清晰）
  if (hasDir) {
    const arrow = new THREE.Group();
    const amat = new THREE.MeshBasicMaterial({ color: 0x2a3242, transparent: true, opacity: 0.95 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8), amat);
    shaft.position.y = 0.28;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.26, 10), amat);
    head.position.y = 0.68;
    arrow.add(shaft); arrow.add(head);
    arrow.position.y = 0.12;
    g.add(arrow);
    g.userData.arrow = arrow;
  }
  // 选中环（默认隐藏，深金色浅背景可见）
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 28),
    new THREE.MeshBasicMaterial({ color: 0xd89000, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  ring.visible = false;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}
// bearing(度) → 世界方向（0=北=-z），旋转箭头
function updateArrowDir(vis, bearing) {
  if (!vis.userData.arrow) return;
  const rad = bearing * Math.PI / 180;
  const dir = new THREE.Vector3(Math.sin(rad), 0, -Math.cos(rad));
  vis.userData.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}
// ===== 放置模式统一退出（按钮态 + 标志位）=====
function exitPlacing() {
  placingQi = false; placingWind = false; placingLight = false; currentElement = null; placingFixture = null;
  qiBtn.classList.remove('active');
  windSrcBtn.classList.remove('active');
  lightBtn.classList.remove('active');
  structRow.querySelectorAll('button').forEach(x => x.classList.remove('active'));
  fixtureRow?.querySelectorAll('button').forEach(x => x.classList.remove('active'));
}
// 放置源：炁口(持续dye)/风口(锥形velocity)/光源(持续light) → 可视化组 + 发 worker
// 炁口 r=4格=0.8m 力场圈，风口 r=5.5格=1.1m 力场圈
function addQiPort(g) {
  const p = { i: g[0], j: g[1], r: 4, amount: 2, bearing: lastQiBearing };   // 继承上次调整的炁向
  p._vis = makeSourceVisual(0xffaa44, true, 5 * CELL);   // 力场范围圈与注入半径(5格)一致
  updateArrowDir(p._vis, p.bearing);
  const [x, z] = scene3d.gridToWorld(g[0], g[1]);
  p._vis.position.set(x, 0, z); qiGroup.add(p._vis); qiPorts.push(p);
  syncQiPorts();
  return p;
}
function addWindSrc(g) {
  const s = { i: g[0], j: g[1], r: 4, strength: 5, bearing: (curWindDir - planOffset + 360) % 360 };   // 初始向=环境风（地理→网格换算）
  s._vis = makeSourceVisual(0x66ccff, true, 18 * CELL);   // 力场范围圈与发射半径(18格)一致
  updateArrowDir(s._vis, s.bearing);
  const [x, z] = scene3d.gridToWorld(g[0], g[1]);
  s._vis.position.set(x, 0, z); windGroup.add(s._vis); windSrcs.push(s);
  syncWindSrcs();
  return s;
}
function addLightPt(g) {
  const p = { i: g[0], j: g[1], r: 3, strength: 1.5 };
  p._vis = makeSourceVisual(0xffee66, false);
  const [x, z] = scene3d.gridToWorld(g[0], g[1]);
  p._vis.position.set(x, 0, z); lightGroup.add(p._vis); lightPts.push(p);
  syncLightPts();
  return p;
}
// ===== worker 同步（含 bearing）=====
function syncQiPorts() {
  worker.postMessage({ type: 'setQiPorts', ports: qiPorts.map(({ i, j, r, amount, bearing }) => ({ i, j, r, amount, bearing })) });
}
function syncWindSrcs() {
  worker.postMessage({ type: 'setWindSrcs', srcs: windSrcs.map(({ i, j, r, strength, bearing }) => ({ i, j, r, strength, bearing })) });
}
function syncLightPts() {
  worker.postMessage({ type: 'setLightPts', pts: lightPts.map(({ i, j, r, strength }) => ({ i, j, r, strength })) });
  if (typeof dataPanel !== 'undefined') sendSun();   // 光源增删/调亮度 → 采光系数即时重算
}
// ===== 源选中 / 拖拽 / 调向 / 删除 =====
let selectedSource = null;    // { obj, arr, type, syncFn }
let draggingSource = false;
let dragMoved = false;
// ===== 源属性面板（选中源后显示：方向 + 强度滑块）=====
const srcPanel = srcBody;   // 源属性节内容容器（选中源才展开，替代右上浮层）
function showSrcPanel(obj, type) {
  // 结构件三分支：方向+长度滑块；门/窗带开关（早返回，不走下方源面板）
  if (FIX[type]) {
    const f = FIX[type], o = obj;
    const hasOpen = type !== 'screen';
    srcPanel.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#${f.color.toString(16).padStart(6, '0')};margin-bottom:8px;letter-spacing:1px">◉ ${f.label}</div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:6px">方向
        <input type="range" id="spDir" min="0" max="359" value="${o.bearing}" style="flex:1">
        <b id="spDirVal" style="min-width:34px;text-align:right;color:#c77800">${dirName(o.bearing)}</b></label>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:6px">长度
        <input type="range" id="spLen" min="2" max="20" step="1" value="${o.len}" style="flex:1">
        <b id="spLenVal" style="min-width:40px;text-align:right;color:#c77800">${o.len} 格 ${(o.len * CELL).toFixed(1)}m</b></label>
      ${hasOpen ? `<button id="spOpen" style="width:100%;margin-bottom:6px;background:#fff;color:#1a56c4;border:1px solid #9fc8e8;padding:6px;border-radius:4px;cursor:pointer;font-size:12px">${o.open ? '关' : '开'}此${f.label}${o.open ? '' : '（解除阻挡）'}</button>` : ''}
      <button id="spDel" style="margin-top:4px;width:100%;background:#fff;color:#c0392b;border:1px solid #e0b4b0;padding:6px;border-radius:4px;cursor:pointer;font-size:12px">${ICO.trash} 删除此${f.label}</button>
      <div style="font-size:11px;color:#999;margin-top:8px">拖动移动 · 滚轮微调方向${type === 'screen' ? ' · 屏风恒阻挡' : ' · 开=炁风皆过'}</div>`;
    srcSec.open = true;
    srcPanel.querySelector('#spDir').oninput = (e) => {
      o.bearing = +e.target.value;
      srcPanel.querySelector('#spDirVal').textContent = dirName(o.bearing);
      setFixtureBearing(o);
      selectedSource?.syncFn();
    };
    srcPanel.querySelector('#spLen').oninput = (e) => {
      o.len = +e.target.value;
      srcPanel.querySelector('#spLenVal').textContent = `${o.len} 格 ${(o.len * CELL).toFixed(1)}m`;
      rebuildFixtureVis(o);
      selectedSource?.syncFn();
    };
    const ob = srcPanel.querySelector('#spOpen');
    if (ob) ob.onclick = () => {
      o.open = !o.open;
      ob.textContent = `${o.open ? '关' : '开'}此${f.label}${o.open ? '' : '（解除阻挡）'}`;
      selectedSource?.syncFn();   // restamp：开关只改 mask，墙洞不动
      hint.innerHTML = `已${o.open ? '开' : '关'}【${f.label}】${o.open ? '：阻挡解除，炁风皆过' : '：恢复阻挡'}`;
    };
    srcPanel.querySelector('#spDel').onclick = deleteSelected;
    return;
  }
  const isLight = type === 'light';
  const isStruct = type === 'struct';
  const eProp = isStruct ? ELEMENT_PROPS[obj.element] : null;
  const label = isStruct ? (eProp?.label || '五行') : (type === 'qi' ? '炁口' : type === 'wind' ? '风口' : '光源');
  const color = isStruct ? '#' + (eProp.color.toString(16).padStart(6, '0')) : (type === 'qi' ? '#ffaa44' : type === 'wind' ? '#66ccff' : '#ffee66');
  const dirVal = obj.bearing ?? 180;
  const powVal = isStruct ? obj.strength : (type === 'qi' ? obj.amount : obj.strength);
  const powCfg = isStruct ? { min: 0.5, max: 3, step: 0.1, name: '强度' }
               : type === 'qi' ? { min: 0.5, max: 4, step: 0.1, name: '炁量' }
               : type === 'wind' ? { min: 1, max: 15, step: 0.5, name: '风速' }
               : { min: 0.5, max: 3, step: 0.1, name: '亮度' };
  const showDir = !isLight && !isStruct;
  srcPanel.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:${color};margin-bottom:8px;letter-spacing:1px">◉ ${label}</div>
    ${showDir ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:6px">方向
      <input type="range" id="spDir" min="0" max="359" value="${dirVal}" style="flex:1">
      <b id="spDirVal" style="min-width:34px;text-align:right;color:#c77800">${dirName(dirVal)}</b></label>` : ''}
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555">${powCfg.name}
      <input type="range" id="spPow" min="${powCfg.min}" max="${powCfg.max}" step="${powCfg.step}" value="${powVal}" style="flex:1">
      <b id="spPowVal" style="min-width:30px;text-align:right;color:#c77800">${powVal}</b></label>
    <button id="spDel" style="margin-top:10px;width:100%;background:#fff;color:#c0392b;border:1px solid #e0b4b0;padding:6px;border-radius:4px;cursor:pointer;font-size:12px">${ICO.trash} 删除此${isStruct ? '元素' : label}</button>
    <div style="font-size:11px;color:#999;margin-top:8px">拖动移动${showDir ? ' · 滚轮微调方向' : ''} · 点上方删除或按 Shift+Delete</div>`;
  srcSec.open = true;
  if (showDir) {
    srcPanel.querySelector('#spDir').oninput = (e) => {
      obj.bearing = +e.target.value;
      srcPanel.querySelector('#spDirVal').textContent = dirName(obj.bearing);
      updateArrowDir(obj._vis, obj.bearing);
      if (type === 'qi') lastQiBearing = obj.bearing;   // 记住炁向，新炁口继承
      selectedSource && selectedSource.syncFn();
    };
  }
  srcPanel.querySelector('#spPow').oninput = (e) => {
    const val = +e.target.value;
    if (type === 'qi') obj.amount = val; else obj.strength = val;
    srcPanel.querySelector('#spPowVal').textContent = val;
    selectedSource && selectedSource.syncFn();
  };
  srcPanel.querySelector('#spDel').onclick = deleteSelected;
}
function hideSrcPanel() { srcSec.open = false; }

function deselectSource() {
  if (selectedSource) selectedSource.obj._vis.userData.ring.visible = false;
  selectedSource = null;
  hideSrcPanel();
  scene3d.controls.enableZoom = true;   // 恢复相机缩放
  hint.innerHTML = HINT_DEFAULT;
}
function selectSource(obj, arr, type, syncFn) {
  deselectSource();
  selectedSource = { obj, arr, type, syncFn };
  obj._vis.userData.ring.visible = true;
  if (type !== 'light' && type !== 'struct') scene3d.controls.enableZoom = false;   // 滚轮让位给调向（光源/五行无方向，保留缩放；三件套有向 ✓）
  showSrcPanel(obj, type);
  const label = srcTypeLabel(selectedSource);
  const dirTip = (type === 'light' || type === 'struct') ? '' : (IS_TOUCH ? ` · 左面板滑块调向` : ` · 滚轮调向(当前${dirName(obj.bearing ?? 180)})`);
  hint.innerHTML = `已选中【${label}】· 拖动移动${dirTip} · 删除按钮${IS_TOUCH ? '' : '/Shift+Delete'}删除 · 点空白取消`;
  if (IS_TOUCH && typeof setDrawer === 'function' && innerWidth <= 820) setDrawer('ctrl');   // 触屏：源属性滑块在左抽屉里，选中即弹出让用户够得着
}
function moveSelectedTo(g) {
  if (!selectedSource) return;
  // 源类不可落墙格（无效注入）；结构件（门窗屏风）允许贴墙
  if (!FIX[selectedSource.type] && solid[g[0] + SW * g[1]] === 1) return;
  const o = selectedSource.obj;
  o.i = g[0]; o.j = g[1];
  const [x, z] = scene3d.gridToWorld(g[0], g[1]);
  o._vis.position.set(x, 0, z);
  selectedSource.syncFn();
}
function rotateSelected(deltaDeg) {
  if (!selectedSource || selectedSource.type === 'light' || selectedSource.type === 'struct') return;
  const o = selectedSource.obj;
  o.bearing = (((o.bearing ?? 180) + deltaDeg) % 360 + 360) % 360;
  if (FIX[selectedSource.type]) setFixtureBearing(o);   // 结构件整体转向（含墙洞重投影，走 syncFn）
  else updateArrowDir(o._vis, o.bearing);
  if (selectedSource.type === 'qi') lastQiBearing = o.bearing;   // 记住炁向，新炁口继承
  selectedSource.syncFn();
  // 同步面板滑块显示
  const dirInput = srcPanel.querySelector('#spDir');
  if (dirInput) { dirInput.value = o.bearing; srcPanel.querySelector('#spDirVal').textContent = dirName(o.bearing); }
  const label = srcTypeLabel(selectedSource);
  hint.innerHTML = `已选中【${label}】· 拖动移动 · 滚轮调向(当前${dirName(o.bearing)}) · Shift+Delete 删除 · 点空白取消`;
}
// 软删除：移出场景与 worker，但保留 5s 撤销窗口，期满才真正 dispose
let pendingDel = null, delTimer = null;
const srcTypeLabel = (s) => s.type === 'qi' ? '炁口' : s.type === 'wind' ? '风口' : s.type === 'light' ? '光源'
  : FIX[s.type] ? FIX[s.type].label : (ELEMENT_PROPS[s.obj.element]?.label || '五行元素');
function deleteSelected() {
  if (!selectedSource) return;
  if (delTimer) clearTimeout(delTimer);
  if (pendingDel) finalizeDel(pendingDel);   // 上一笔未撤销的立即落地
  const { obj, arr, syncFn } = selectedSource;
  const idx = arr.indexOf(obj);
  if (idx >= 0) arr.splice(idx, 1);
  const parent = obj._vis.parent;
  if (parent) parent.remove(obj._vis);
  obj._vis.userData.ring.visible = false;   // 选中环随删隐去，撤销后不再悬空显示
  const label = srcTypeLabel(selectedSource);
  pendingDel = { obj, arr, syncFn, idx: Math.max(idx, 0), parent };
  selectedSource = null;
  hideSrcPanel();
  scene3d.controls.enableZoom = true;   // 恢复相机缩放
  syncFn();
  hint.innerHTML = `已删除【${label}】· <a class="undo-link" id="undoDel">撤销</a>（5 秒内）`;
  hint.querySelector('#undoDel').onclick = undoDelete;
  delTimer = setTimeout(() => { finalizeDel(pendingDel); pendingDel = null; hint.innerHTML = HINT_DEFAULT; }, 5000);
}
function undoDelete() {
  if (!pendingDel) return;
  clearTimeout(delTimer);
  const { obj, arr, syncFn, idx, parent } = pendingDel;
  arr.splice(Math.min(idx, arr.length), 0, obj);   // 尽量回原位
  if (parent) parent.add(obj._vis);
  pendingDel = null;
  syncFn();
  hint.innerHTML = HINT_DEFAULT;
}
function finalizeDel(p) {
  p.obj._vis.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
}
// 射线拾取源（返回最近命中的源对象）
function pickSource(e) {
  const r = container.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, scene3d.camera);
  const candidates = [];
  for (const [grp, arr, type, syncFn] of [
    [qiGroup, qiPorts, 'qi', syncQiPorts],
    [windGroup, windSrcs, 'wind', syncWindSrcs],
    [lightGroup, lightPts, 'light', syncLightPts],
    [structGroup, structs, 'struct', sendStructs],
    [screenGroup, screens, 'screen', () => restampMasks(true)],
    [doorGroup, doors, 'door', () => restampMasks(true)],
    [windowGroup, windows, 'window', () => restampMasks(true)],
  ]) {
    const hits = raycaster.intersectObjects(grp.children, true);
    if (hits.length) {
      // 回溯到源对象（vis group 的直接子级命中 → 找所属源）
      let node = hits[0].object;
      while (node && node.parent !== grp) node = node.parent;
      const obj = arr.find(s => s._vis === node);
      if (obj) candidates.push({ obj, arr, type, syncFn, dist: hits[0].distance });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0];
}
function clearSources(group, arr, postType, field, clearField) {
  while (group.children.length) {
    const c = group.children[0];
    group.remove(c);
    c.traverse?.(x => { x.geometry?.dispose(); x.material?.dispose(); });
  }
  arr.length = 0;
  if (selectedSource && arr === selectedSource.arr) deselectSource();   // 关面板+藏选中环+复位 hint/缩放
  worker.postMessage({ type: postType, [field]: [] });
  if (clearField) worker.postMessage({ type: 'clearField', field: clearField });   // 同步清对应场
}

// 采光参数（采光模式显示）：时辰 + 强度
const sunRow = sunGrp;   // 放置节·采光子分组（light 模式才显）
sunRow.style.display = 'none';
sunRow.innerHTML = `
  <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#555;width:100%">时辰<input type="range" id="sunHour" min="0" max="24" value="12" step="0.5" style="flex:1"><b id="sunHourVal" style="min-width:54px;color:#c77800">12 日</b></label>
  <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#555;width:100%">强度<input type="range" id="sunInten" min="0.2" max="3" value="1.2" step="0.1" style="flex:1"><b id="sunIntenVal" style="min-width:28px;color:#c77800">1.2</b></label>`;
const sendSun = () => {
  const h = +sunRow.querySelector('#sunHour').value;
  const it = +sunRow.querySelector('#sunInten').value;
  sunRow.querySelector('#sunHourVal').textContent = h + (h >= 6 && h <= 18 ? ' 日' : ' 夜');
  sunRow.querySelector('#sunIntenVal').textContent = it;
  worker.postMessage({ type: 'setSun', hour: h, inten: it });
  // 采光系数 = 日光（时辰×强度）+ 人工光（光源亮度和 × 0.35，单个 1.5 亮度 ≈ 0.5 系数；夜间有灯则非零）
  const lights = Math.min(3, lightPts.reduce((s, p) => s + p.strength, 0) * 0.35);
  if (typeof dataPanel !== 'undefined') dataPanel.updateSun({ hour: h, inten: it, lights });
};
sunRow.querySelector('#sunHour').oninput = sendSun;
sunRow.querySelector('#sunInten').oninput = sendSun;
const lightBtn = document.createElement('button');
lightBtn.innerHTML = ico(ICO.lamp, '光源');
lightBtn.style.borderLeft = '4px solid #ffee66';
lightBtn.title = '放置光源：持续发光';
lightBtn.onclick = () => { placingLight = !placingLight; lightBtn.classList.toggle('active', placingLight); hint.innerHTML = placingLight ? '点击地板放置【光源】· 持续发光（再点取消）' : HINT_DEFAULT; };
sunRow.appendChild(lightBtn);
const clearLightBtn = document.createElement('button');
clearLightBtn.textContent = '清光源';
clearLightBtn.onclick = () => clearSources(lightGroup, lightPts, 'setLightPts', 'pts', 'light');
sunRow.appendChild(clearLightBtn);


// 八宅参数已移入罗盘仪器（门向指针拖拽）；doorFacing 由罗盘回调驱动
let doorFacing = 180;
const WIND8NAME = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const dirName = d => WIND8NAME[Math.round(d / 45) % 8];
// 环境风常驻调参（罗盘默认隐藏后的风向/风速入口；罗盘指针/滚轮联动同一组值）
const windSliders = document.createElement('div');
windSliders.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:100%';
windSliders.innerHTML = `
  <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#555;width:100%">风向<input type="range" id="envDir" min="0" max="359" value="${curWindDir}" style="flex:1"><b id="envDirVal" style="min-width:40px;text-align:right;color:#c77800">${dirName(curWindDir)}</b></label>
  <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#555;width:100%">风速<input type="range" id="envSpd" min="1" max="15" step="0.5" value="${windSpd}" style="flex:1"><b id="envSpdVal" style="min-width:36px;text-align:right;color:#c77800">${windSpd}</b></label>`;
windRow.appendChild(windSliders);
windSliders.querySelector('#envDir').oninput = (e) => { curWindDir = +e.target.value; windSliders.querySelector('#envDirVal').textContent = dirName(curWindDir); sendWind(); };
windSliders.querySelector('#envSpd').oninput = (e) => { windSpd = +e.target.value; windSliders.querySelector('#envSpdVal').textContent = windSpd; sendWind(); };
// 罗盘指针/盘面滚轮改风时同步滑块显示
const syncWindSliders = () => {
  const d = windSliders.querySelector('#envDir'), s = windSliders.querySelector('#envSpd');
  if (document.activeElement !== d) { d.value = curWindDir; windSliders.querySelector('#envDirVal').textContent = dirName(curWindDir); }
  if (document.activeElement !== s) { s.value = windSpd; windSliders.querySelector('#envSpdVal').textContent = windSpd; }
};
function redrawBazhai() {
  const bz = drawBazhai(bazhaiCanvas.getContext('2d'), W, H, HSCALE, doorFacing);
  bazhaiTex.needsUpdate = true;
  if (typeof compass !== 'undefined') compass.updateBazhai(doorFacing, bz);
  if (bazhaiOn) { buildBazhaiLabels(); hint.innerHTML = `${ICO.bazhai} 门向 <b style="color:#c77800">${dirName(doorFacing)}</b> · ${bz.zhaiName}`; }
}

// 九星参数已移入罗盘仪器（滚轮调流年）；jiuxingYear 由罗盘回调驱动
let jiuxingYear = 2026;
function redrawJiuxing() {
  const r = drawJiuxing(jiuxingCanvas.getContext('2d'), W, H, HSCALE, jiuxingYear);
  jiuxingTex.needsUpdate = true;
  if (typeof compass !== 'undefined') compass.updateJiuxing(jiuxingYear, r);
  const drain = buildPalaceDrain(W, H, SW, jiuxingYear, palaceScale);
  worker.postMessage({ type: 'setPalaceDrain', drain }, [drain.buffer]);   // 炁流泄耗（分野随 palaceScale）
  if (jiuxingOn) { buildPalaceFloats(); hint.innerHTML = `${ICO.star} 流年 <b style="color:#c77800">${jiuxingYear}</b> · ${r.centerStar.name}入中`; }
}

// ===== 模式分段控件（视角轴）+ 主 bar 三簇重构（P0：分组）=====
let mode = 'energy';
let heatMode = mode;          // 热图色带实际渲染用的模式（过渡期间滞后于 mode，低谷时才换带）
let pendingHeatMode = null;   // 模式切换时热图色带延迟换：淡出到低谷再 setMode，淡回目标透明度
const HEAT_OPACITY = { energy: 1.0, speed: 1.0, light: 1.0 };
const MODE_DRAG_HINT = { energy: '左键=放置炁口/五行', speed: '左键=放置风口', light: '左键=放置光源' };
const MODE_SUB = { energy: '气流浓度', speed: '风速涡量热力图', light: '日照体积光' };
const MODE_ICO = { energy: ICO.energy, speed: ICO.speed, light: ICO.light };
// 簇 1：模式分段
const modeSeg = document.createElement('div'); modeSeg.className = 'seg'; modeWrap.appendChild(modeSeg);
const mkBtn = (label, m) => {
  const b = document.createElement('button');
  b.innerHTML = `${MODE_ICO[m]}<span>${label}</span><span class="mode-sub">${MODE_SUB[m]}</span>`;
  if (m === mode) b.classList.add('active');
  b.onclick = () => {
    mode = m;
    modeSeg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    worker.postMessage({ type: 'setMode', mode: m });
    if (typeof compass !== 'undefined') compass.setMode(m);   // 罗盘风向指针/中心徽标随模式
    if (typeof dataPanel !== 'undefined') dataPanel.setMode(m);   // 数据面板环形指标随模式（其余节与模式无关）
    if (REDUCED) { heatMode = m; scene3d.heatPlane.material.opacity = HEAT_OPACITY[m]; }   // 动效敏感：直接换
    else pendingHeatMode = m;           // 过渡版：先淡出，低谷时主循环换带再淡回
    volFlow.setMode(m);                 // 体积粒子云模式切换（energy↔light 自动 dip 遮色跳）
    volFlow.setVisible(m !== 'speed');  // 风场用热力图，粒子云渐隐
    deselectSource();
    if (windRow) windRow.style.display = (m === 'speed') ? '' : 'none';
    if (structRow) structRow.style.display = (m === 'energy') ? '' : 'none';
    if (sunRow) sunRow.style.display = (m === 'light') ? '' : 'none';
    hint.innerHTML = `${ICO.flame} <b>3D 风水引擎</b> · ${MODE_DRAG_HINT[m]} · ${IS_TOUCH ? '点源球=选中 · 单指拖=旋转 · 双指=缩放/平移' : '点源球=选中 · 左键拖=旋转（「拖拽」按钮可切平移）'}`;
  };
  modeSeg.appendChild(b);
};
mkBtn('炁流', 'energy');
mkBtn('风场', 'speed');
mkBtn('采光', 'light');
// sep1 省略（顶部 bar 已拆，ctrl-panel details 自带分节）
// 簇 2：视图工具
const viewGrp = document.createElement('div'); viewGrp.className = 'ctrl-grp view'; viewWrap.appendChild(viewGrp);
const uploadBtn = document.createElement('button');
uploadBtn.innerHTML = ico(ICO.upload, '上传户型图');
viewGrp.appendChild(uploadBtn);
// ── 户型朝向对齐（2026-08-19）：上传图"上方 = 实际方位"八选一 ──
// 原理：建筑网格不动（保流体/采光 mask 完整），转"方位参考系"——地板八宅/九星扇区旋转对齐罗盘，
// 环境风注入角与太阳方位按 地理−偏移 换算进网格（窗朝南=真朝南晒，北风=真从地理北吹来）。
let planOffset = +(localStorage.getItem('plan:offset') || 0);   // 度：图上↑ 对应实际方位
const planDirRow = document.createElement('div');
planDirRow.className = 'ctrl-grp';
planDirRow.style.cssText = 'width:100%;margin-top:6px';
planDirRow.innerHTML = `<div style="font-size:11px;color:#555;margin-bottom:3px">户型朝向（图上↑=实际）<b id="planDirVal" style="color:#c77800;float:right">${dirName(planOffset)}</b></div>`;
WIND8NAME.forEach((dn, di) => {
  const b = document.createElement('button');
  b.className = 'zb';
  b.textContent = dn;
  b.title = `户型图上方 = 实际${dn}（${di * 45}°）· 八宅/风场/采光联动`;
  b.onclick = () => setPlanOffset(di * 45);
  planDirRow.appendChild(b);
});
viewWrap.appendChild(planDirRow);
function setPlanOffset(deg) {
  planOffset = ((Math.round(deg) % 360) + 360) % 360;
  localStorage.setItem('plan:offset', planOffset);
  planDirRow.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i * 45 === planOffset));
  planDirRow.querySelector('#planDirVal').textContent = dirName(planOffset);
  // ① 地板八宅/九星扇区 + 悬浮九宫：旋转对齐地理（罗盘是纯地理仪器不转）
  const rad = planOffset * Math.PI / 180;
  if (typeof bazhaiPlane !== 'undefined') bazhaiPlane.rotation.z = rad;
  if (typeof jiuxingPlane !== 'undefined') jiuxingPlane.rotation.z = rad;
  if (typeof palaceFloatGroup !== 'undefined') palaceFloatGroup.rotation.y = rad;
  // ② 环境风重发（sendWind 内做 地理→网格 换算）+ ③ 采光太阳方位换算
  sendWind();
  worker.postMessage({ type: 'setPlanOffset', deg: planOffset });
  hint.innerHTML = `${ICO.bazhai} 户型朝向：图上↑ = <b style="color:#c77800">${dirName(planOffset)}（${planOffset}°）</b> · 八宅扇区/风场/采光已联动`;
}
let paused = false;
const resetBtn = document.createElement('button');
resetBtn.innerHTML = ico(ICO.reset, '重置');
resetBtn.title = '清空炁场、气流、五行结构（二次确认）';
const RESET_ARM_MS = 3000;
let resetArmed = null;
const disarmReset = () => { resetArmed = null; resetBtn.classList.remove('armed'); resetBtn.innerHTML = ico(ICO.reset, '重置'); };
resetBtn.onclick = () => {
  if (resetArmed) {   // 二次点击 → 真重置
    clearTimeout(resetArmed); disarmReset();
    worker.postMessage({ type: 'resetField' });
    for (let k = structGroup.children.length - 1; k >= 0; k--) {
      const c = structGroup.children[k];
      structGroup.remove(c); c.traverse?.(x => { x.geometry?.dispose(); x.material?.dispose(); });
    }
    structs.length = 0;
    sendStructs();
    hint.innerHTML = '已重置：炁场/气流/五行结构清空';
    return;
  }
  resetBtn.classList.add('armed');   // 原地确认态（3s 未确认自动复原），不打断沉浸
  resetBtn.innerHTML = ico(ICO.trash, '确认重置?');
  resetArmed = setTimeout(disarmReset, RESET_ARM_MS);
};
viewGrp.appendChild(resetBtn);
const pauseBtn = document.createElement('button');
pauseBtn.innerHTML = ico(ICO.pause, '暂停');
pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.innerHTML = paused ? ico(ICO.play, '继续') : ico(ICO.pause, '暂停');
};
viewGrp.appendChild(pauseBtn);
// 罗盘显隐开关（默认隐藏——不挡视线；门向/风向指针与盘面滚轮调参需要时再开）
const compassBtn = document.createElement('button');
compassBtn.innerHTML = ico(ICO.bazhai, '罗盘');
compassBtn.title = '悬浮堪舆罗盘：拖门向/风向指针、盘面滚轮调流年/风速（默认隐藏防挡视线）';
compassBtn.onclick = () => {
  const show = !compass.group.visible;
  compass.group.visible = show;
  compassBtn.classList.toggle('active', show);
  hint.innerHTML = show ? '罗盘已显示：拖赤金指针=门向 · 沧浪指针=环境风向 · 盘面滚轮=流年/风速' : '罗盘已隐藏';
};
viewGrp.appendChild(compassBtn);
// 俯视/复位视角（旋转飞了一键回家）：视图组（桌面）+ m-toolbar（移动）双按钮同步
let topViewOn = false;
const toggleTopView = () => {
  topViewOn = !topViewOn;
  topViewOn ? scene3d.viewTop() : scene3d.viewDefault();
  topBtn.classList.toggle('active', topViewOn);
  document.getElementById('mTopBtn')?.classList.toggle('active', topViewOn);
  hint.innerHTML = topViewOn ? '已俯视：盘面全貌（八宅扇区 / 九宫分野）· 再点恢复默认视角' : '视角已复位';
};
const topBtn = document.createElement('button');
topBtn.innerHTML = ico(ICO.screen, '俯视');
topBtn.title = '俯视盘面全貌 / 恢复默认视角（旋转转晕了一键回家）';
topBtn.onclick = toggleTopView;
viewGrp.appendChild(topBtn);
// 拖拽模式切换：左键拖 = 旋转（默认，3D 观察为主）⇄ 平移（拖画布/建筑整体挪位置）；右键恒=旋转
let dragMode = 'rotate';   // 'rotate' | 'pan'
const applyDragMode = () => {
  scene3d.controls.mouseButtons.LEFT = dragMode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  dragBtn.innerHTML = ico(ICO.reset, `拖拽:${dragMode === 'pan' ? '平移' : '旋转'}`);
  dragBtn.classList.toggle('active', dragMode === 'pan');
};
const dragBtn = document.createElement('button');
dragBtn.title = '左键拖动行为切换：旋转视角 ⇄ 平移画布（右键拖恒为旋转）';
dragBtn.onclick = () => {
  dragMode = dragMode === 'rotate' ? 'pan' : 'rotate';
  applyDragMode();
  hint.innerHTML = dragMode === 'pan'
    ? '左键拖=平移画布/建筑 · 右键拖=旋转 · 再点「拖拽」切回旋转'
    : '左键拖=旋转视角 · 右键拖=旋转 · 再点「拖拽」可切平移挪画布';
};
viewGrp.appendChild(dragBtn);
// applyDragMode() 首调在 scene3d 创建后（此处调用会撞 const TDZ）

// ===== 报告导出：模式快照组 + 气流统计 + 炁场简评 + 布置清单 → jsPDF 直接下载（术数详盘走堪舆页）=====
const MODE_LABEL = { energy: '炁流（气流浓度）', speed: '风场（风速涡量）', light: '采光（日照体积光）' };
const clickModeBtn = (m) => { modeSeg.querySelectorAll('button')[{ energy: 0, speed: 1, light: 2 }[m]]?.click(); };

// 三快照采集：封面(当前模式原样) → 风场 → 炁流 →（八宅层开着加叠加快照）→ 还原模式；每模式等热图过渡+场更新
async function captureShots() {
  const snap = () => { scene3d.render(); return scene3d.renderer.domElement.toDataURL('image/png'); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const orig = mode;
  const caps = { origMode: orig, curModeShot: snap() };
  hint.innerHTML = '正在采集「风场」快照…';
  clickModeBtn('speed'); await wait(2600);
  caps.speedShot = snap();
  hint.innerHTML = '正在采集「炁流」快照…';
  clickModeBtn('energy'); await wait(2600);
  caps.energyShot = snap();
  if (bazhaiOn) caps.bzShot = snap();   // 八宅扇区层开着：叠加快照（炁流底，方位语义由图自带）
  clickModeBtn(orig);                   // 还原用户模式（场继续算，无需等待）
  return caps;
}

// 气流统计：worker 场数据全域非阻挡格口径（与数据面板环形读数同源）；滞风=炁覆盖区内低速格
function computeStats() {
  const st = { hasField: !!(lastU && lastV && lastDye) };
  if (!st.hasField) return st;
  let sum = 0, maxS = 0, n = 0, dyeSum = 0, dyeCover = 0, stag = 0, maxCurl = 0;
  const stagDirCnt = {};
  for (let j = 1; j <= H; j++) for (let i = 1; i <= W; i++) {
    const c = i + SW * j;
    if (solid[c]) continue;
    const s = Math.hypot(lastU[c], lastV[c]);
    sum += s; if (s > maxS) maxS = s; n++;
    const d = lastDye[c];
    dyeSum += d;
    if (d > 0.01) {
      dyeCover++;
      if (s < 0.1) { stag++; const dd = palaceDir(i, j, W, H); stagDirCnt[dd] = (stagDirCnt[dd] || 0) + 1; }
    }
  }
  if (lastCurl) for (let k = 0; k < lastCurl.length; k++) { const a = Math.abs(lastCurl[k]); if (a > maxCurl) maxCurl = a; }
  st.avgSpeed = n ? sum / n : 0;
  st.maxSpeed = maxS;
  st.maxCurl = maxCurl;
  st.dyeAvg = n ? dyeSum / n : 0;
  st.dyeCoverRatio = n ? dyeCover / n : 0;
  st.stagRatio = dyeCover ? stag / dyeCover : 0;    // 炁到了但气流停滞的占比（宅外空地不计入）
  const top = Object.entries(stagDirCnt).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 10) st.stagDir = top[0];     // 滞风格 ≥10 才谈方位
  const ls = (typeof dataPanel !== 'undefined') && dataPanel.lastSun;
  if (ls) st.lightMetric = sunAltitude(ls.hour) * ls.inten + ls.lights;
  return st;
}

// 简评：物理层模板化结论（术数详评走堪舆页报告——物理与术数分层，各司其职）
function verdictHTML(st) {
  if (!st.hasField) return '<div class="rp-empty">模拟尚未运行（无场数据）——放置炁口/风口后再导出</div>';
  const vLv = st.avgSpeed >= 0.8 ? '<b class="rp-ji">通风顺畅</b>' : st.avgSpeed >= 0.3 ? '<b>通风尚可</b>' : '<b class="rp-xiong">通风欠佳</b>';
  const sLv = st.stagRatio <= 0.10 ? '<b class="rp-ji">气流活跃</b>' : st.stagRatio <= 0.30 ? '<b>存在滞风</b>' : '<b class="rp-xiong">滞风偏重</b>';
  const p = [`模拟域平均风速 <b>${st.avgSpeed.toFixed(2)} m/s</b>（${vLv}），最大 ${st.maxSpeed.toFixed(1)} m/s，涡量峰值 ${st.maxCurl.toFixed(1)}。`];
  if (st.dyeCoverRatio > 0.001) {
    p.push(`炁覆盖区占 ${(st.dyeCoverRatio * 100).toFixed(0)}%，其中滞风格占 ${(st.stagRatio * 100).toFixed(0)}%（${sLv}）${st.stagDir ? `，集中于<b>${st.stagDir}</b>方位——宜于该方开窗引风或移除近处遮挡` : ''}。`);
  } else {
    p.push('未布置炁口（或炁尚未扩散）——滞风与炁场统计不具参考性。');
  }
  p.push(`炁浓度均值 ${st.dyeAvg.toFixed(4)}${st.dyeAvg > 0.05 ? '（充沛）' : st.dyeAvg > 0.005 ? '（平和）' : '（微弱，宜增设炁口）'}。`);
  if (st.lightMetric != null) p.push(`当前时辰相对采光系数 <b>${st.lightMetric.toFixed(2)}</b>（${st.lightMetric >= 1 ? '明亮' : st.lightMetric >= 0.6 ? '充足' : st.lightMetric >= 0.3 ? '偏暗' : '不足'}）。`);
  return p.join('');
}

const buildReport = (caps, st) => {
  const bz = bazhaiCompute(doorFacing);
  const center = yearCenterStar(jiuxingYear);
  const srcRow = (arr, label, fmt) => arr.length
    ? `<tr><td>${label}</td><td>${arr.length}</td><td>${arr.map(fmt).join('；')}</td></tr>` : '';
  const rows = [
    srcRow(qiPorts, '炁口', (o) => `(${o.i},${o.j}) 向${dirName(o.bearing)} 炁量${o.amount}`),
    srcRow(windSrcs, '风口', (o) => `(${o.i},${o.j}) 向${dirName(o.bearing)} 风速${o.strength}`),
    srcRow(lightPts, '光源', (o) => `(${o.i},${o.j}) 亮度${o.strength}`),
    srcRow(structs, '五行', (o) => `(${o.i},${o.j}) ${ELEMENT_PROPS[o.element].label} 强度${o.strength}`),
    srcRow(screens, '屏风', (o) => `(${o.i},${o.j}) 向${dirName(o.bearing)} 长${o.len}格`),
    srcRow(doors, '门', (o) => `(${o.i},${o.j}) 向${dirName(o.bearing)} 长${o.len}格 ${o.open ? '开' : '关'}`),
    srcRow(windows, '窗', (o) => `(${o.i},${o.j}) 向${dirName(o.bearing)} 长${o.len}格 ${o.open ? '开' : '关'}`),
  ].filter(Boolean).join('');
  const t = new Date(), pad = (x) => String(x).padStart(2, '0');
  const rep = document.createElement('div');
  rep.id = 'pdf-report';
  const statRow = (k, v) => `<tr><td style="width:38%">${k}</td><td>${v}</td></tr>`;
  const statRows = st.hasField ? [
    statRow('平均风速', `${st.avgSpeed.toFixed(2)} m/s`),
    statRow('最大风速', `${st.maxSpeed.toFixed(1)} m/s`),
    statRow('涡量峰值', st.maxCurl.toFixed(1)),
    statRow('炁覆盖区占比', `${(st.dyeCoverRatio * 100).toFixed(0)}%`),
    statRow('滞风区占比', `${(st.stagRatio * 100).toFixed(0)}%（炁覆盖区内）`),
    statRow('炁浓度均值', st.dyeAvg.toFixed(4)),
    statRow('相对采光系数', st.lightMetric != null ? st.lightMetric.toFixed(2) : '—'),
  ].join('') : '';
  rep.innerHTML = `
    <section class="sec">
      <h1>炁流 · 场模拟分析报告</h1>
      <div class="rp-meta">${t.getFullYear()} 年 ${t.getMonth() + 1} 月 ${t.getDate()} 日 ${pad(t.getHours())}:${pad(t.getMinutes())}
        · ${bz.zhaiName} · 门朝${dirName(doorFacing)} · 流年 ${jiuxingYear} ${JIUXING_STARS[center].name}入中
        · 环境风${dirName(curWindDir)} ${windSpd}m/s</div>
      <img class="rp-shot" src="${caps.curModeShot}" alt="当前模式快照">
      <div class="rp-cap">当前模式：${MODE_LABEL[caps.origMode]}</div>
    </section>
    <section class="sec">
      <h2>风场快照 · 风速涡量</h2>
      <img class="rp-shot" src="${caps.speedShot}" alt="风场快照">
    </section>
    <section class="sec">
      <h2>炁流快照 · 气流浓度</h2>
      <img class="rp-shot" src="${caps.energyShot}" alt="炁流快照">
    </section>
    ${caps.bzShot ? `<section class="sec"><h2>八宅方位叠加</h2><img class="rp-shot" src="${caps.bzShot}" alt="八宅方位叠加"></section>` : ''}
    <section class="sec">
      <h2>气流统计</h2>
      ${statRows ? `<table class="rp-src"><tr><th>指标</th><th>数值</th></tr>${statRows}</table>` : '<div class="rp-empty">模拟尚未运行——放置炁口/风口后再导出</div>'}
    </section>
    <section class="sec">
      <h2>炁场简评</h2>
      <div class="rp-verdict">${verdictHTML(st)}</div>
    </section>
    <section class="sec">
      <h2>布置清单</h2>
      ${rows ? `<table class="rp-src"><tr><th>类型</th><th>数</th><th>明细（格位 · 参数）</th></tr>${rows}</table>` : '<div class="rp-empty">未布置源</div>'}
    </section>
    <div class="rp-foot">炁流 3D 风水引擎生成 · 八宅/飞星详盘请用「堪舆」页导出 · 仅供研究参考</div>`;
  return rep;
};
const reportGrp = ctrlPanel.querySelector('[data-k="reportGrp"]');

// 流式拼页（对齐堪舆页 export-pdf）：整块放不下就换页，单块超 A4 高才切片——块间永不腰斩
function makePlacer(pdf) {
  const padMM = 8, gapMM = 3, pageW = 210, pageH = 297, usableH = pageH - 2 * padMM;
  const imgW = pageW - 2 * padMM;
  let y = padMM, page = 0;
  return (canvas) => {
    const scale = imgW / canvas.width;
    const h = canvas.height * scale;
    if (h <= usableH) {
      if (y + h > pageH - padMM) { pdf.addPage(); y = padMM; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', padMM, y, imgW, h);
      y += h + gapMM;
    } else {
      if (y > padMM) { pdf.addPage(); y = padMM; }
      const slicePx = Math.floor(usableH / scale);
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      const tctx = tmp.getContext('2d');
      let sy = 0;
      while (sy < canvas.height) {
        const sh = Math.min(slicePx, canvas.height - sy);
        tmp.height = sh;
        tctx.fillStyle = '#ffffff'; tctx.fillRect(0, 0, tmp.width, sh);
        tctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, tmp.width, sh);
        if (sy > 0) pdf.addPage();
        pdf.addImage(tmp.toDataURL('image/jpeg', 0.92), 'JPEG', padMM, padMM, imgW, sh * scale);
        sy += sh;
      }
      pdf.addPage(); y = padMM;
    }
    page++;
  };
}

const pdfBtn = document.createElement('button');
pdfBtn.innerHTML = ico(ICO.report, '导出 PDF');
pdfBtn.title = '把当前局生成场模拟分析报告 PDF（自动采集三模式快照+气流统计+简评，约 8 秒）';
pdfBtn.onclick = async () => {
  document.getElementById('pdf-report')?.remove();   // 防重复 append
  hint.innerHTML = '正在采集模式快照…（约 6 秒，期间勿切模式）';
  const caps = await captureShots();
  const st = computeStats();
  const rep = buildReport(caps, st);
  document.body.appendChild(rep);                    // 离屏挂载（CSS 定位 -99999px），html2canvas 可见可截
  hint.innerHTML = '正在生成报告 PDF…';
  let ok = false;
  try {
    await document.fonts.ready;
    const imgs = Array.from(rep.querySelectorAll('img'));
    await Promise.all(imgs.map((im) => im.complete ? null : new Promise((r) => { im.onload = r; im.onerror = r; })));
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const place = makePlacer(pdf);
    for (const block of rep.querySelectorAll('section.sec, .rp-foot')) {
      const canvas = await html2canvas(block, { scale: matchMedia('(pointer: coarse)').matches ? 1.5 : 2, backgroundColor: '#ffffff', logging: false });   // 触屏降采样防 iOS 大 canvas 内存崩
      place(canvas);
    }
    const t = new Date(), pad = (x) => String(x).padStart(2, '0');
    pdf.save(`炁流报告_${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}.pdf`);
    ok = true;
  } finally {
    rep.remove();
    hint.innerHTML = ok ? '报告 PDF 已导出下载' : '报告导出失败，请重试';
  }
};
reportGrp.appendChild(pdfBtn);

// sep2 省略
// 簇 3：风水层开关
// fsGrp 省略（八宅开关+宅卦按钮进 zhaiWrap、九星开关进 starWrap）
let bazhaiOn = false;
const bazhaiBtn = document.createElement('button');
bazhaiBtn.innerHTML = ico(ICO.bazhai, '八宅');
bazhaiBtn.title = '八宅方位叠加：地板扇区 + 八方悬浮吉凶标签';
bazhaiBtn.onclick = () => {
  bazhaiOn = !bazhaiOn;
  bazhaiBtn.classList.toggle('active', bazhaiOn);
  bazhaiPlane.visible = bazhaiOn;
  bazhaiFloatGroup.visible = bazhaiOn;
  compass.setBazhaiVisible(bazhaiOn);
  if (bazhaiOn) redrawBazhai();
  else hint.innerHTML = HINT_DEFAULT;
};
// 八宅宅卦按钮（一键选坐向）：sitIdx 0..7，坐山=sitIdx*45，门朝=(坐山+180)%360
['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'].forEach((zan, idx) => {
  const zb = document.createElement('button');
  zb.className = 'zb';
  zb.textContent = zan;
  zb.title = ZHAI_NAME[idx] + ' · 门朝' + dirName((idx * 45 + 180) % 360);
  zb.onclick = () => setDoorFacing((idx * 45 + 180) % 360);
  zhaiWrap.appendChild(zb);
});
zhaiWrap.appendChild(bazhaiBtn);
// 八宅/九星可折叠图例：色点=地板扇区同色，悬停看星义
const lgChip = (s) => `<span class="lg-chip" title="${s.yi ? `${s.desc}\n宜：${s.yi}\n忌：${s.avoid}\n化解：${s.solve}\n据 ${s.source}` : `${s.desc}\n据 ${s.source}`}"><i class="lg-dot" style="background:rgb(${s.col.join(',')})"></i>${s.name}${s.wuxing ? '·' + s.wuxing : ''}</span>`;
const zhaiLegend = document.createElement('details');
zhaiLegend.className = 'ctrl-legend';
zhaiLegend.innerHTML = `<summary>方位吉凶图例</summary><div>${BAZHAI_STARS.map(lgChip).join('')}</div>`;
zhaiWrap.appendChild(zhaiLegend);
// 扇区缩放滑块（地板扇面 + 悬浮标签同步缩放；高度不受影响）
const bzScaleRow = document.createElement('label');
bzScaleRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#555;width:100%;margin-top:4px';
bzScaleRow.innerHTML = `盘式大小<input type="range" min="0.5" max="2" step="0.1" value="1" style="flex:1"><b id="bzScaleVal" style="min-width:38px;color:#c77800">×1.0</b>`;
bzScaleRow.querySelector('input').oninput = (e) => {
  bazhaiScale = +e.target.value;
  bzScaleRow.querySelector('#bzScaleVal').textContent = '×' + bazhaiScale.toFixed(1);
  applyBazhaiScale();
};
zhaiWrap.appendChild(bzScaleRow);
let jiuxingOn = false;
const jiuxingBtn = document.createElement('button');
jiuxingBtn.innerHTML = ico(ICO.star, '九星');
jiuxingBtn.title = '九宫飞星悬浮盘：贴地星盘 + 聚炁/散炁/流转悬浮标签 + 泄耗炁场';
jiuxingBtn.onclick = () => {
  jiuxingOn = !jiuxingOn;
  jiuxingBtn.classList.toggle('active', jiuxingOn);
  palaceFloatGroup.visible = jiuxingOn;   // 地板涂色层(jiuxingPlane)已退役，悬浮宫盘替代
  compass.setJiuxingVisible(jiuxingOn);
  if (jiuxingOn) redrawJiuxing();
  else { worker.postMessage({ type: 'setPalaceDrain' }); hint.innerHTML = HINT_DEFAULT; }   // 关闭：清泄耗
};
starWrap.appendChild(jiuxingBtn);
const starLegend = document.createElement('details');
starLegend.className = 'ctrl-legend';
starLegend.innerHTML = `<summary>九星释义图例</summary><div>${JIUXING_STARS.filter(Boolean).map(lgChip).join('')}</div>`;
starWrap.appendChild(starLegend);
// 九宫分野滑块：宫心向域中心收缩（户型有大有小，收缩让九宫套住户型）；1.0=全域。盘片尺寸/高度不变
const jxScaleRow = document.createElement('label');
jxScaleRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#555;width:100%;margin-top:4px';
jxScaleRow.innerHTML = `九宫分野<input type="range" min="0.4" max="1" step="0.05" value="1" style="flex:1"><b id="jxScaleVal" style="min-width:38px;color:#c77800">×1.0</b>`;
jxScaleRow.querySelector('input').oninput = (e) => {
  palaceScale = +e.target.value;
  jxScaleRow.querySelector('#jxScaleVal').textContent = '×' + palaceScale.toFixed(2);
  if (palaceFloatGroup.visible) applyPalaceScale();   // 开着才即时挪盘；worker 泄耗同步
};
starWrap.appendChild(jxScaleRow);
// 流年滑块：罗盘盘面滚轮的面板等价物（手机无滚轮；桌面亦可直调）——2026-08-19 触摸适配
const jxYearRow = document.createElement('label');
jxYearRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#555;width:100%;margin-top:4px';
jxYearRow.innerHTML = `流年<input type="range" id="jxYear" min="1900" max="2100" step="1" value="${jiuxingYear}"><b id="jxYearVal" style="min-width:38px;color:#c77800">${jiuxingYear}</b>`;
jxYearRow.querySelector('#jxYear').oninput = (e) => setYear(+e.target.value);
starWrap.appendChild(jxYearRow);
// （bazhaiRow/yearRow 已并入罗盘仪器，参数行撞车修复 layoutFsRows 不再需要）
// FPS 计数进左栏标题行（右栏贴边全高后原右上角落被占）
const fpsEl = document.createElement('span');
fpsEl.className = 'fps-head';
const headR = ctrlPanel.querySelector('.ctrl-head-r');
// 页面分段切换器（MPA 双页互跳，与堪舆页顶部导航同款）：炁流 3D | 堪舆
const pager = document.createElement('div');
pager.className = 'pager';
pager.innerHTML =
  `<a href="index.html" class="active" title="3D 炁流场模拟（当前页）">炁流 3D</a>` +
  `<a href="kanyu.html" title="堪舆盘：八宅 / 玄空 / 廿四山 / 年飞星 / 动态九宫 · 户型定盘">堪舆</a>`;
headR.appendChild(pager);
headR.appendChild(fpsEl);

// ===== 移动端 bottom sheet（≤820px）：m-toolbar 呼出半屏面板，无遮罩不锁场景；把手栏点击收起（桌面 display:none 零影响）=====
const mToolbar = document.createElement('div');
mToolbar.className = 'm-toolbar';
mToolbar.innerHTML =
  `<button class="m-btn" id="mCtrlBtn" title="操作台"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>` +
  `<div class="pager"><a href="index.html" class="active">炁流 3D</a><a href="kanyu.html">堪舆</a></div>` +
  `<button class="m-btn" id="mTopBtn" title="俯视/复位视角"><svg class="icon" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle cx="12" cy="12" r="1.6"/></svg></button>` +
  `<button class="m-btn" id="mDpBtn" title="数据面板"><svg class="icon" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg></button>`;
app.appendChild(mToolbar);
const setDrawer = (which) => {   // 'ctrl' | 'dp' | null：单开互斥；无遮罩——场景照常旋转/放置/选中
  ctrlPanel.classList.toggle('open', which === 'ctrl');
  document.querySelector('.dp-panel')?.classList.toggle('open', which === 'dp');
  mCtrlBtn.classList.toggle('active', which === 'ctrl');
  mDpBtn.classList.toggle('active', which === 'dp');
};
const mCtrlBtn = document.getElementById('mCtrlBtn');
const mDpBtn = document.getElementById('mDpBtn');
mCtrlBtn.onclick = () => setDrawer(ctrlPanel.classList.contains('open') ? null : 'ctrl');
mDpBtn.onclick = () => setDrawer(document.querySelector('.dp-panel')?.classList.contains('open') ? null : 'dp');
document.getElementById('mTopBtn').onclick = toggleTopView;   // 俯视/复位（与视图组按钮同步）
// sheet 顶部把手栏：注入点见 dataPanel 创建后（dp-panel 那时才存在，两面板统一处理）
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.style.display = 'none';
app.appendChild(fileInput);

// 应用新户型：存 base → 低墙重建（识别墙 0.85m 不挡视线）→ 结构件 mask 重放（跨上传存活）
function applyPlan(solidNew, glassNew) {
  baseSolid = solidNew;
  if (glassNew) baseGlass = glassNew;
  wallH = 1.95;   // 与门/窗齐平（原 0.85 低墙不挡视线；看室内用俯视/拖拽视角）
  rebuildWalls();
  restampMasks();
  for (const d of doors) rebuildFixtureVis(d);   // 门叶高度体系不随墙缩（1.95 固定），仅位置/朝向重挂
}

uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => new PlanEditor(W, H).open(img, (r) => applyPlan(r.solid, r.glass));
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  fileInput.value = '';   // 允许重复选同一文件
};

// ===== 默认户型（开箱即见）：default-layout.json 有自定义布置则用之，否则内置四合院 =====
const b64dec = (str) => { const s = atob(str); const u8 = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u8[k] = s.charCodeAt(k); return u8; };
const plan = LAYOUT_JSON
  ? { solid: b64dec(LAYOUT_JSON.solid), glass: b64dec(LAYOUT_JSON.glass) }
  : buildDefaultPlan(W, H);
let baseSolid = plan.solid;      // 户型基础 mask 快照（restamp 源，永不被结构件凿改）
let baseGlass = plan.glass;
let solid = plan.solid;          // 当前生效 mask（base + 结构件投影，restampMasks 产出）
let glass = plan.glass;
let wallH = 1.95;                // 当前墙体视觉高（2026-08-23 与门/窗 1.95 齐平；默认与上传户型同高）

// ===== 热力图（offscreen canvas → 3D 地板纹理）=====
const heatCanvas = document.createElement('canvas');
const heat = new HeatmapRenderer(heatCanvas, W, H, HSCALE);

// ===== 3D 场景 + 墙体 =====
const scene3d = new SceneManager(container, W, H, CELL, heatCanvas);
scene3d.heatPlane.material.opacity = HEAT_OPACITY[mode];   // 初始模式匹配
// 镜头操作：左键=旋转/平移（视图组「拖拽」开关切换）、右键=旋转、中键/滚轮=缩放。左键对罗盘/源/放置优先（capture 让位）
scene3d.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
if (LAYOUT_JSON?.camera) {   // 固化布置自带视角：进场即位（不补间，避免开场飞）
  scene3d.camera.position.set(LAYOUT_JSON.camera.x, LAYOUT_JSON.camera.y, LAYOUT_JSON.camera.z);
  scene3d.controls.target.set(LAYOUT_JSON.camera.tx, LAYOUT_JSON.camera.ty, LAYOUT_JSON.camera.tz);
  scene3d.controls.update();
}
applyDragMode();   // 按 dragMode 应用左键行为（此处 scene3d 已创建，无 TDZ）
// 3D 体积能量粒子云（三模式共用：炁流/风场/采光）
const volFlow = new VolumetricFlow(scene3d.scene, W, H, SW, CELL);
// 五行结构容器 + 数据
const structGroup = new THREE.Group();
scene3d.scene.add(structGroup);
const structs = [];

// ===== 结构件三件套：屏风(纯挡) / 门(开关) / 窗(开关+透光) =====
// mask 语义：屏风=solid；门 关=solid 开=无；窗 凿墙(洪泛打穿,厚≤3格)后 glass 恒 1(阳光入口)，关再盖 solid
const screens = [], doors = [], windows = [];   // {i, j, bearing, len, open, _vis}
const screenGroup = new THREE.Group(); scene3d.scene.add(screenGroup);
const doorGroup = new THREE.Group(); scene3d.scene.add(doorGroup);
const windowGroup = new THREE.Group(); scene3d.scene.add(windowGroup);
const FIX = {
  screen: { arr: screens, grp: screenGroup, label: '屏风', len: 8, color: 0xc8a060 },
  door:   { arr: doors,   grp: doorGroup,   label: '门',   len: 4,  color: 0x2b6cb0 },
  window: { arr: windows, grp: windowGroup, label: '窗',   len: 6,  color: 0x7fb8dc },
};
let placingFixture = null;
let maskDirty = false, wallDirty = false;

// 沿 bearing 从 (i,j) 延伸 len 格，返回途经格索引（半格步进+对角补格，4-连通防斜缝漏风）
function lineCells(i, j, bearing, len) {
  const rad = bearing * Math.PI / 180;
  const dx = Math.sin(rad), dz = -Math.cos(rad);
  const out = [];
  const push = (ci, cj) => {
    if (ci < 1 || cj < 1 || ci > W || cj > H) return;
    const c = ci + SW * cj;
    if (out[out.length - 1] !== c) out.push(c);
  };
  let pi = Math.round(i), pj = Math.round(j);
  push(pi, pj);
  let x = i, z = j;
  for (let t = 0; t < len; t += 0.5) {
    x += dx * 0.5; z += dz * 0.5;
    const ci = Math.round(x), cj = Math.round(z);
    if (ci !== pi && cj !== pj) push(pi, cj);      // 对角补格
    if (ci !== pi || cj !== pj) { push(ci, cj); pi = ci; pj = cj; }
  }
  return out;
}

// 门/窗凿墙洪泛：基线 1 格 + 沿法向两侧逐层吞墙（层内有墙格才扩），总厚 ≤3 格
// 识别户型墙普遍 3 格厚——窗线只压 1 层时洞凿不穿，气/风/光被剩下 2 层墙堵死；洪泛按实际墙厚打穿
function computeCarve(f) {
  const base = lineCells(f.i, f.j, f.bearing, f.len);
  const rad = f.bearing * Math.PI / 180;
  const nx = Math.round(Math.cos(rad)), nz = Math.round(Math.sin(rad));   // 法向=bearing+90°（取整跟格对齐，斜向墙偏对角格）
  const cnt = { 1: 0, [-1]: 0 };
  const cells = [...base];
  for (const side of [1, -1])
    for (let layer = 1; layer <= 2; layer++) {
      const got = [];
      let hasWall = false;
      for (const c of base) {
        const ci = c % SW + nx * side * layer, cj = (c / SW | 0) + nz * side * layer;
        if (ci < 1 || cj < 1 || ci > W || cj > H) continue;
        const cc = ci + SW * cj;
        got.push(cc);
        if (baseSolid[cc]) hasWall = true;
      }
      if (!hasWall) break;   // 这层没墙：到此为止（1 格薄墙两侧扩 0 层，行为同旧版）
      cells.push(...got); cnt[side]++;
    }
  return {
    cells,
    ox: (cnt[1] - cnt[-1]) / 2 * CELL * nx, oz: (cnt[1] - cnt[-1]) / 2 * CELL * nz,   // 墙厚中心相对放置线的偏移
    depth: 1 + cnt[1] + cnt[-1],       // 实际凿穿厚度（1~3 格）
  };
}

// base 快照 + 三件套投影 → 重算 solid/glass（置 maskDirty，loop 限频发 setMask）
function restampMasks(withWalls) {
  solid = new Uint8Array(baseSolid);
  glass = new Uint8Array(baseGlass);
  for (const s of screens)
    for (const c of lineCells(s.i, s.j, s.bearing, s.len)) solid[c] = 1;
  for (const d of doors) {
    d._carve = computeCarve(d);
    for (const c of d._carve.cells) { solid[c] = 0; glass[c] = 0; if (!d.open) solid[c] = 1; }
  }
  for (const w of windows) {
    w._carve = computeCarve(w);
    for (const c of w._carve.cells) { solid[c] = 0; glass[c] = 1; if (!w.open) solid[c] = 1; }
  }
  // 门窗视觉随凿穿层自适应：墙厚变(挪位/换墙)重建几何进深，位置补法向偏移(框嵌墙厚中心)
  for (const f of [...doors, ...windows]) {
    if (f._carve.depth !== f._depth) { f._depth = f._carve.depth; rebuildFixtureVis(f); }
    else { const [x, z] = scene3d.gridToWorld(f.i, f.j); f._vis.position.set(x + f._carve.ox, 0, z + f._carve.oz); }
  }
  maskDirty = true;
  if (withWalls) wallDirty = true;
}

// 墙视觉：从 baseSolid 减去门/窗凿穿格建墙（门/窗位置恒有洞，门板/窗玻璃盖住；开关不重建墙）
function rebuildWalls() {
  scene3d.clearWalls();
  const wallSolid = new Uint8Array(baseSolid);
  for (const f of [...doors, ...windows])
    for (const c of computeCarve(f).cells) wallSolid[c] = 0;
  buildWalls(wallSolid, W, H, SW, scene3d.wallsGroup, { cell: CELL, wallH });
}

// ===== 结构件 3D 视觉工厂 =====
const fixMat = (color, opt = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.06, ...opt });
function fixSelectRing(g, len) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(len * CELL * 0.55, len * CELL * 0.62, 40, 1, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({ color: 0xd89000, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  g.add(ring);
  g.userData.ring = ring;
}
function makeScreenVis(s) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, s.len * CELL), fixMat(0xc8a060));
  board.position.y = 0.75 + 0.12;
  g.add(board);
  for (const zz of [0.08, s.len * CELL - 0.08]) {   // 两端支脚
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.24, 0.06), fixMat(0x8a6d4f));
    foot.position.set(0, 0.12, zz);
    g.add(foot);
  }
  fixSelectRing(g, s.len);
  return g;
}
function makeDoorVis(d) {
  const g = new THREE.Group();
  const pivot = new THREE.Group();                  // 门轴 = 放置点
  g.add(pivot);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.95, d.len * CELL), fixMat(0x8b6f47));
  leaf.position.set(0, 1.95 / 2, d.len * CELL / 2); // 门叶从门轴沿 bearing 延展
  pivot.add(leaf);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), fixMat(0xd89000, { metalness: 0.6, roughness: 0.35 }));
  knob.position.set(0.05, 1.0, d.len * CELL - 0.12);
  pivot.add(knob);
  g.userData.pivot = pivot;
  pivot.rotation.y = d.open ? Math.PI / 2 : 0;
  fixSelectRing(g, d.len);
  return g;
}
function makeWindowVis(w) {
  const g = new THREE.Group();
  const L = w.len * CELL;
  const D = (w._depth ?? 1) * CELL;               // 进深=凿穿墙厚(1~3格)：3格识别墙→0.6m 框件填满墙洞
  for (const zz of [0.02, L - 0.02]) {              // 落地框柱
    const post = new THREE.Mesh(new THREE.BoxGeometry(D, 1.95, 0.09), fixMat(0xe8ecf2));
    post.position.set(0, 0.975, zz);
    g.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(D, 0.07, L), fixMat(0xe8ecf2));
  rail.position.set(0, 1.85, L / 2);
  g.add(rail);
  const rail2 = rail.clone(); rail2.position.y = 0.85; g.add(rail2);
  const paneMat = () => new THREE.MeshStandardMaterial({ color: 0x9fc8e8, transparent: true, opacity: 0.42, roughness: 0.15, metalness: 0.1, depthWrite: false });
  const paneA = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.0, L / 2 - 0.03), paneMat());
  const paneB = paneA.clone(); paneB.material = paneMat();
  paneA.position.set(-0.02, 1.35, L / 4);           // 关：两扇各占半长
  paneB.position.set(0.02, 1.35, L * 3 / 4);
  g.add(paneA); g.add(paneB);
  g.userData.paneA = paneA; g.userData.paneB = paneB;
  if (w.open) { paneA.position.z = L / 4; paneB.position.z = L / 4 + 0.03; }   // 开：双扇滑向近端
  fixSelectRing(g, w.len);
  return g;
}
function setFixtureBearing(f) {
  f._vis.rotation.y = Math.PI - f.bearing * Math.PI / 180;   // 局部 +z → bearing 方向（b=0 北 ✓）
}
function rebuildFixtureVis(f) {
  const type = f._type, old = f._vis, keep = old.userData.ring.visible;
  const parent = old.parent;
  old.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
  parent.remove(old);
  f._vis = type === 'screen' ? makeScreenVis(f) : type === 'door' ? makeDoorVis(f) : makeWindowVis(f);
  const [x, z] = scene3d.gridToWorld(f.i, f.j);
  const c = type === 'screen' ? { ox: 0, oz: 0 } : computeCarve(f);
  f._vis.position.set(x + c.ox, 0, z + c.oz);   // 门窗：法向偏到凿穿墙厚的中心
  setFixtureBearing(f);
  f._vis.userData.ring.visible = keep;
  FIX[type].grp.add(f._vis);
}
function updateFixtureAnims(dt) {
  const k = Math.min(1, dt * 6);
  for (const d of doors) {
    const pv = d._vis.userData.pivot;
    const tgt = d.open ? Math.PI / 2 : 0;
    if (REDUCED) pv.rotation.y = tgt;
    else pv.rotation.y += (tgt - pv.rotation.y) * k;
  }
  for (const w of windows) {
    const { paneA, paneB } = w._vis.userData;
    const L = w.len * CELL;
    const tA = L / 4, tB = w.open ? L / 4 + 0.03 : L * 3 / 4;
    if (REDUCED) { paneA.position.z = tA; paneB.position.z = tB; }
    else { paneA.position.z += (tA - paneA.position.z) * k; paneB.position.z += (tB - paneB.position.z) * k; }
  }
}
function addFixture(type, g) {
  const f = { i: g[0], j: g[1], bearing: 0, len: FIX[type].len, open: false, _type: type };
  if (type !== 'screen') f._carve = computeCarve(f);   // 门窗：落点墙厚先算好（进深+法向偏移）
  if (f._carve) f._depth = f._carve.depth;
  f._vis = type === 'screen' ? makeScreenVis(f) : type === 'door' ? makeDoorVis(f) : makeWindowVis(f);
  const [x, z] = scene3d.gridToWorld(g[0], g[1]);
  const c = f._carve ?? { ox: 0, oz: 0 };
  f._vis.position.set(x + c.ox, 0, z + c.oz);
  setFixtureBearing(f);
  FIX[type].grp.add(f._vis);
  FIX[type].arr.push(f);
  restampMasks(true);
  return f;
}
// 布置重放（默认布局 JSON 加载用）：清三件套 → 按数据重建（位置/朝向/长度/开关，凿洞随 rebuild 重算）
function replayFixtures(list) {
  clearFixtures();
  for (const fx of list || []) {
    if (!FIX[fx.type]) continue;
    const f = addFixture(fx.type, [fx.i, fx.j]);
    f.bearing = fx.bearing || 0;
    f.len = fx.len || FIX[fx.type].len;
    f.open = !!fx.open;
    rebuildFixtureVis(f);
  }
}
// 源重放（默认布局 JSON 加载用）：炁口/风口/光源清空重建（位置/朝向/强度）
function replaySources(d) {
  for (const arr of [qiPorts, windSrcs, lightPts]) {
    for (const s of arr) s._vis?.removeFromParent();
    arr.length = 0;
  }
  for (const q of d.qi || []) { const p = addQiPort([q.i, q.j]); p.bearing = q.bearing ?? 180; p.amount = q.amount ?? 2; updateArrowDir(p._vis, p.bearing); syncQiPorts(); }
  for (const s of d.wind || []) { const p = addWindSrc([s.i, s.j]); p.bearing = s.bearing ?? 180; p.strength = s.strength ?? 5; updateArrowDir(p._vis, p.bearing); syncWindSrcs(); }
  for (const l of d.light || []) { const p = addLightPt([l.i, l.j]); p.strength = l.strength ?? 1.5; syncLightPts(); }
}
// 风水层状态重放（默认布局 JSON 加载用）：九星流年/开关/分野缩放 + 八宅开关/扇区缩放
function replayFengshui(d) {
  if (d.jiuxing) {
    if (d.jiuxing.year) setYear(d.jiuxing.year);
    if (d.jiuxing.scale != null) {
      palaceScale = d.jiuxing.scale;
      const s = jxScaleRow.querySelector('input');
      if (s) { s.value = palaceScale; jxScaleRow.querySelector('#jxScaleVal').textContent = '×' + palaceScale.toFixed(2); }
      if (palaceFloatGroup.visible) applyPalaceScale();
    }
    if (d.jiuxing.on !== jiuxingOn) jiuxingBtn.click();
  }
  if (d.bazhai) {
    if (d.bazhai.scale != null) {
      bazhaiScale = d.bazhai.scale;
      const s = bzScaleRow.querySelector('input');
      if (s) { s.value = bazhaiScale; bzScaleRow.querySelector('#bzScaleVal').textContent = '×' + bazhaiScale.toFixed(1); }
      if (bazhaiPlane.visible) applyBazhaiScale();
    }
    if (d.bazhai.on !== bazhaiOn) bazhaiBtn.click();
  }
}
function clearFixtures() {
  for (const key of ['screen', 'door', 'window']) {
    const { grp, arr } = FIX[key];
    for (let k = grp.children.length - 1; k >= 0; k--) {
      const c = grp.children[k];
      grp.remove(c);
      c.traverse?.(x => { x.geometry?.dispose(); x.material?.dispose(); });
    }
    arr.length = 0;
  }
  if (selectedSource && ['screen', 'door', 'window'].includes(selectedSource.type)) deselectSource();
  restampMasks(true);
}
// 结构件组（三模式常显）：屏风/门/窗 + 清结构件——都影响阻挡 mask
for (const key of ['screen', 'door', 'window']) {
  const f = FIX[key];
  const b = document.createElement('button');
  b.innerHTML = ico(ICO[key], f.label);
  b.style.borderLeft = `4px solid #${f.color.toString(16).padStart(6, '0')}`;
  b.title = key === 'screen' ? '放置屏风：纯阻挡，可调方向/长度'
    : key === 'door' ? '放置门：关=阻挡，开=无阻挡（炁风皆过）'
    : '放置窗：关=挡风透光，开=通风（炁随风过）';
  b.onclick = () => {
    const was = placingFixture === key;
    exitPlacing();
    if (!was) {
      placingFixture = key;
      b.classList.add('active');
      hint.innerHTML = `点击地板放置【${f.label}】· 从落点沿北向延伸，放置后可拖动/滚轮调向${key === 'screen' ? ' · 面板调长度' : ' · 面板开关'}（再点取消）`;
    } else hint.innerHTML = HINT_DEFAULT;
  };
  fixtureRow.appendChild(b);
}
const clearFixtureBtn = document.createElement('button');
clearFixtureBtn.textContent = '清结构件';
clearFixtureBtn.title = '清除屏风/门/窗（墙体洞自动复原）';
clearFixtureBtn.onclick = () => { clearFixtures(); hint.innerHTML = '已清除全部结构件：屏风/门/窗移除，墙体复原'; };
fixtureRow.appendChild(clearFixtureBtn);

rebuildWalls();      // 初始墙（无结构件 = base 原样）
restampMasks();      // 初始 mask（同 base）
// 三模式放置源（炁口/风口/光源）数据 + 3D 显示组 + 放置状态
const qiPorts = [], windSrcs = [], lightPts = [];
const qiGroup = new THREE.Group(); scene3d.scene.add(qiGroup);
const windGroup = new THREE.Group(); scene3d.scene.add(windGroup);
const lightGroup = new THREE.Group(); scene3d.scene.add(lightGroup);
let placingQi = false, placingWind = false, placingLight = false;
// 八宅九星叠加层（canvas → 地板纹理，吉凶扇区）
const bazhaiCanvas = document.createElement('canvas');
bazhaiCanvas.width = W * HSCALE; bazhaiCanvas.height = H * HSCALE;
const bazhaiTex = new THREE.CanvasTexture(bazhaiCanvas);
const bazhaiPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(scene3d.FW, scene3d.FD),
  new THREE.MeshBasicMaterial({ map: bazhaiTex, transparent: true, opacity: 1.0, depthWrite: false })
);
bazhaiPlane.rotation.x = -Math.PI / 2;
bazhaiPlane.position.y = 0.006;
bazhaiPlane.visible = false;
scene3d.scene.add(bazhaiPlane);
// 可交互 3D 堪舆罗盘仪器（签名组件）——吃掉 bazhaiRow/yearRow/windRow 的方位/时间参数
// 门向指针拖→doorFacing；风向指针拖→curWindDir；盘面滚轮→流年(九星开)/风速(风场)
const setDoorFacing = (deg) => { doorFacing = ((Math.round(deg) % 360) + 360) % 360; if (bazhaiOn) redrawBazhai(); if (typeof dataPanel !== 'undefined') dataPanel.updateFengshui({ doorFacing, year: jiuxingYear }); };
const setWindDir = (deg) => {
  curWindDir = ((Math.round(deg) % 360) + 360) % 360; sendWind();
  hint.innerHTML = `${ICO.wind} 风向 <b style="color:#c77800">${dirName(curWindDir)}</b> · 风速 <b style="color:#c77800">${envWindOn ? windSpd : '关'}</b>`;
  syncWindSliders();
};
const setYear = (y) => {
  jiuxingYear = Math.max(1900, Math.min(2100, y));
  if (jiuxingOn) redrawJiuxing();
  if (typeof dataPanel !== 'undefined') dataPanel.updateFengshui({ doorFacing, year: jiuxingYear });
  const yr = jxYearRow.querySelector('#jxYear');   // 面板滑块跟随（罗盘滚轮/滑块双向同步）
  if (yr && document.activeElement !== yr) { yr.value = jiuxingYear; jxYearRow.querySelector('#jxYearVal').textContent = jiuxingYear; }
};
const setWindSpd = (s) => {
  windSpd = s; sendWind(); syncWindSliders();
  hint.innerHTML = `${ICO.wind} 风向 <b style="color:#c77800">${dirName(curWindDir)}</b> · 风速 <b style="color:#c77800">${envWindOn ? windSpd : '关'}</b>`;
};
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;   // 动效敏感用户：跳过装饰动效
const compass = new CompassInstrument(scene3d.scene, scene3d.camera, {
  FW: scene3d.FW, FD: scene3d.FD,
  getMode: () => mode,
  onDoorFacing: setDoorFacing,
  onWindDir: setWindDir,
  onYear: setYear,
  onWindSpd: setWindSpd,
});
compass.group.visible = false;   // 罗盘默认隐藏（不挡视线）——开关在视图组「罗盘」

// 右侧堪舆数据面板（常驻读数层，与罗盘视觉层解耦，五节全展开可折叠）
const dataPanel = new DataPanel();
// sheet 顶部把手栏（两面板各一条，点标题收起）：dp-panel 此时已入 DOM，统一注入
for (const [panel, title] of [[ctrlPanel, '操作台'], [document.querySelector('.dp-panel'), '堪舆数据']]) {
  if (!panel || panel.querySelector('.sheet-grip')) continue;
  const grip = document.createElement('div');
  grip.className = 'sheet-grip';
  grip.innerHTML = `<b>${title}</b><span>（点击收起）</span>`;
  grip.onclick = () => setDrawer(null);
  panel.prepend(grip);
}
dataPanel.updateFengshui({ doorFacing, year: jiuxingYear });
dataPanel.updateSun({ hour: +sunRow.querySelector('#sunHour').value, inten: +sunRow.querySelector('#sunInten').value });

// ── 堪舆盘定盘同步（P3）：读 kanyu:state 门朝向 → 门向八宅 + 环境风来向（气从门入）──
// kanyu 页每次定盘防抖落盘，本页启动一次读入；风场 worker ready 后会重发 setWind，此处早调安全。
function showToast(msg, ico = '🧭') {
  const t = document.createElement('div');
  t.textContent = `${ico} ${msg}`;
  t.style.cssText = 'position:fixed;bottom:58px;left:50%;transform:translateX(-50%);z-index:99;'   // 底部弹（hint 上方）——顶部让给 m-toolbar/操作台
    + 'background:rgba(255,255,255,0.85);backdrop-filter:blur(8px);border:1px solid #c8ccd4;border-radius:8px;'
    + 'padding:8px 16px;font-size:13px;color:#333;box-shadow:0 2px 8px rgba(60,70,90,0.18);'
    + 'opacity:0;transition:opacity .35s;pointer-events:none;white-space:normal;text-align:center;max-width:calc(100vw - 24px);';
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; });
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 5000);
}
try {
  const ks = JSON.parse(localStorage.getItem('kanyu:state') || 'null');
  if (ks && Number.isFinite(+ks.doorDir)) {
    const deg = ((Math.round(+ks.doorDir) % 360) + 360) % 360;
    if (deg !== 180) { // 与默认同向不弹提示（静默无操作），定过非默认盘才同步+告知
      setDoorFacing(deg);       // 门向八宅 + 数据面板
      curWindDir = deg;         // 环境风来向：只设值不调 sendWind（worker 尚在 TDZ）——worker ready 后自动按新值重发
      if (typeof compass !== 'undefined') compass.updateWind(deg);
      syncWindSliders();
      showToast(`已同步堪舆盘定盘 · 门朝${dirName(deg)}（${deg}°）· 环境风与八宅随盘`);
    }
  }
} catch (e) { console.warn('[kanyu同步] 读取/应用失败:', e); /* 损坏数据当没有 */ }

// 九星九宫叠加层（canvas → 地板纹理）
const jiuxingCanvas = document.createElement('canvas');
jiuxingCanvas.width = W * HSCALE; jiuxingCanvas.height = H * HSCALE;
const jiuxingTex = new THREE.CanvasTexture(jiuxingCanvas);
const jiuxingPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(scene3d.FW, scene3d.FD),
  new THREE.MeshBasicMaterial({ map: jiuxingTex, transparent: true, opacity: 1.0, depthWrite: false })
);
jiuxingPlane.rotation.x = -Math.PI / 2;
jiuxingPlane.position.y = 0.007;
jiuxingPlane.visible = false;   // 地板涂色层退役：九星改悬浮宫盘（palaceFloatGroup）
scene3d.scene.add(jiuxingPlane);

// ===== 悬浮式九宫盘 + 八宅标签（2026-08-18，对齐原站 xunqi 悬浮宫盘形态）=====
// 每宫 = 贴地能量盘（平躺 PlaneGeometry，PALACE_DISC_H）+ 悬浮 Sprite 标签（PALACE_LABEL_H，
// depthTest=false + renderOrder=99 → 常浮于墙体/模型之上不被遮挡）。高度常量在文件顶部。
const palaceFloatGroup = new THREE.Group();
palaceFloatGroup.visible = false;
scene3d.scene.add(palaceFloatGroup);
const bazhaiFloatGroup = new THREE.Group();
bazhaiFloatGroup.visible = false;
scene3d.scene.add(bazhaiFloatGroup);

function disposeGroup(grp) {
  while (grp.children.length) {
    const ch = grp.children[0];
    ch.traverse?.(o => { o.geometry?.dispose(); o.material?.map?.dispose?.(); o.material?.dispose(); });
    grp.remove(ch);
  }
}

// 悬浮标签牌（256×104 canvas → Sprite，scale 1.46×0.59m，原站同款）：两行字，白描边压底
function makeLabelSprite(line1, line1Color, line2, line2Color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 104;
  const x2 = c.getContext('2d');
  x2.textAlign = 'center'; x2.textBaseline = 'middle';
  x2.font = 'bold 34px "Microsoft YaHei"';
  x2.strokeStyle = 'rgba(255,255,255,.95)'; x2.lineWidth = 7;
  x2.strokeText(line1, 128, 26); x2.fillStyle = line1Color; x2.fillText(line1, 128, 26);
  x2.font = 'bold 22px "Microsoft YaHei"'; x2.lineWidth = 5;
  x2.strokeText(line2, 128, 70); x2.fillStyle = line2Color; x2.fillText(line2, 128, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  spr.scale.set(1.46, 0.59, 1);
  spr.renderOrder = 99;   // 始终画在墙体/模型之上
  return spr;
}

// 贴地能量盘纹理：星色双圈 + 中心星名·五行吉凶
function makePalaceDiscTexture(star, isCenter) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x2 = c.getContext('2d');
  const col = `rgb(${star.col.join(',')})`;
  x2.translate(128, 128);
  x2.beginPath(); x2.arc(0, 0, 122, 0, Math.PI * 2);
  x2.strokeStyle = col; x2.lineWidth = isCenter ? 10 : 6; x2.stroke();
  const g = x2.createRadialGradient(0, 0, 10, 0, 0, 116);
  g.addColorStop(0, `rgba(${star.col.join(',')},${star.ji >= 0 ? 0.30 : 0.42})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x2.fillStyle = g; x2.beginPath(); x2.arc(0, 0, 118, 0, Math.PI * 2); x2.fill();
  x2.textAlign = 'center'; x2.textBaseline = 'middle';
  x2.font = 'bold 44px "Microsoft YaHei"';
  x2.strokeStyle = 'rgba(255,255,255,.9)'; x2.lineWidth = 7;
  x2.strokeText(star.name, 0, -14); x2.fillStyle = col; x2.fillText(star.name, 0, -14);
  x2.font = '20px "Microsoft YaHei"'; x2.lineWidth = 4;
  const sub = `${star.wuxing}·${star.ji >= 0 ? '吉' : '凶'}`;
  x2.strokeText(sub, 0, 34); x2.fillStyle = '#eef3fb'; x2.fillText(sub, 0, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  return tex;
}

// 九宫（上北下南 3×3 分宫）：贴地盘 + 悬浮标签（星名·聚炁/散炁/流转——与 worker 泄耗同源判定）
// cell=[col,row]∈{-1,0,1}：宫心=域中心+col/row×(W或H/3)×palaceScale——滑块收的是「分野范围」，
// 上传户型有大有小，收缩让九宫套住户型而非铺满全域；盘片尺寸恒为原站基准（只挪窝不变形）
const PALACE_CELLS = [
  ['西北', -1, -1], ['北', 0, -1], ['东北', 1, -1],
  ['西', -1, 0], ['中', 0, 0], ['东', 1, 0],
  ['西南', -1, 1], ['南', 0, 1], ['东南', 1, 1],
];
function palaceCellWorld(col, row) {
  return scene3d.gridToWorld(W / 2 + col * (W / 3) * palaceScale, H / 2 + row * (H / 3) * palaceScale);
}
function buildPalaceFloats() {
  disposeGroup(palaceFloatGroup);
  const center = yearCenterStar(jiuxingYear);
  const stars = flyStars(center);
  for (const [dir, col, row] of PALACE_CELLS) {
    const isCenter = dir === '中';
    const starN = isCenter ? center : stars[dir];
    const star = JIUXING_STARS[starN];
    const size = isCenter ? 1.72 : 1.38;   // 原站基准恒定：中宫 1.72m / 八宫 1.38m
    const [x, z] = palaceCellWorld(col, row);
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: makePalaceDiscTexture(star, isCenter), transparent: true, depthWrite: false, opacity: 0.92, side: THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, PALACE_DISC_H, z);
    disc.renderOrder = 4;
    disc.userData.cell = [col, row];
    palaceFloatGroup.add(disc);
    const label = makeLabelSprite(isCenter ? '中宫' : dir, '#101828', `${star.name} · ${palaceInfluenceText(starN)}`, `rgb(${star.col.join(',')})`);
    label.position.set(x, isCenter ? PALACE_LABEL_H.center : PALACE_LABEL_H.side, z);
    label.userData.cell = [col, row];
    palaceFloatGroup.add(label);
  }
}

// 八宅悬浮标签（八方扇区中段上空）：方位 + 星名·吉凶
function buildBazhaiLabels() {
  disposeGroup(bazhaiFloatGroup);
  const bz = bazhaiCompute(doorFacing);
  const R = Math.min(scene3d.FW, scene3d.FD) * 0.30 * bazhaiScale;   // 扇区中段半径 × 缩放
  for (const s of bz.sectors) {
    const ang = (s.bearing + 22.5) * Math.PI / 180;
    const spr = makeLabelSprite(dirName(s.bearing), '#101828', `${s.name} · ${s.ji > 0 ? '吉' : '凶'}`, s.ji > 0 ? '#2a8a3a' : '#c0392b');
    spr.scale.set(1.46 * bazhaiScale, 0.59 * bazhaiScale, 1);
    spr.position.set(Math.sin(ang) * R, BAZHAI_LABEL_H, -Math.cos(ang) * R);
    spr.userData.bearing = s.bearing;   // 缩放时按方位重算半径
    bazhaiFloatGroup.add(spr);
  }
}

// 分野缩放即时生效（拖滑块只挪宫心位置，不重建纹理——盘片尺寸与高度恒不受影响）
function applyPalaceScale() {
  palaceFloatGroup.traverse((o) => {
    const cell = o.userData.cell;
    if (!cell) return;
    const [x, z] = palaceCellWorld(cell[0], cell[1]);
    o.position.x = x; o.position.z = z;
  });
  sendPalaceDrain();   // 物理泄耗分野同步收缩（视觉=物理）
}
// 泄耗重发（滑块拖动/开关九星共用）
function sendPalaceDrain() {
  const drain = buildPalaceDrain(W, H, SW, jiuxingYear, palaceScale);
  worker.postMessage({ type: 'setPalaceDrain', drain }, [drain.buffer]);
}
function applyBazhaiScale() {
  bazhaiPlane.scale.set(bazhaiScale, bazhaiScale, 1);   // 地板扇区平面整体缩（贴图内容随缩）
  const R = Math.min(scene3d.FW, scene3d.FD) * 0.30 * bazhaiScale;
  bazhaiFloatGroup.traverse((o) => {
    if (!o.isSprite) return;
    o.scale.set(1.46 * bazhaiScale, 0.59 * bazhaiScale, 1);
    const ang = (o.userData.bearing + 22.5) * Math.PI / 180;
    o.position.set(Math.sin(ang) * R, BAZHAI_LABEL_H, -Math.cos(ang) * R);
  });
}

// ===== Worker（流体仍在后台跑）=====
const worker = new FluidWorker();
const solidForWorker = new Uint8Array(solid);
const glassForWorker = new Uint8Array(glass);
worker.postMessage(
  { type: 'init', W, H, mode, solid: solidForWorker, glass: glassForWorker },
  [solidForWorker.buffer, glassForWorker.buffer]
);
if (planOffset) setPlanOffset(planOffset);   // 恢复上次户型朝向：扇区旋转 + 风光注入换算（此时全场景/worker 已就绪）
if (LAYOUT_JSON) {   // 自定义默认布置：朝向随 JSON（覆盖 localStorage 记忆）+ 门窗屏风/源/风水层重放
  setPlanOffset(LAYOUT_JSON.planOffset || 0);
  if (LAYOUT_JSON.fixtures?.length) replayFixtures(LAYOUT_JSON.fixtures);
  replaySources(LAYOUT_JSON);
  replayFengshui(LAYOUT_JSON);
  restampMasks(true);
}

let lastDye = null, lastU = null, lastV = null, lastCurl = null, lastT = 0;
let firstFrameT = 0;   // warm-up：流体首帧时间戳，+1.5s 后罗盘 hero→anchor
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'ready') { sendWind(); sendSun(); }
  else if (m.type === 'frame') {
    if (!firstFrameT) firstFrameT = performance.now();
    lastDye = m.dye; lastU = m.u; lastV = m.v; lastCurl = m.curl; lastT = m.t;
    heat.render(heatMode, m.dye, m.u, m.v, m.curl, solid, glass, SW, curWindDir);   // 浅色热成像浓度图（风场=速度+涡量+伪3D气动；heatMode 过渡期间滞后）
    scene3d.updateHeatTexture();
  }
};

// ===== 射线拾取：屏幕坐标 → heatPlane 交点 → 网格坐标 =====
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let compassDrag = null;   // 'door'|'wind'|null（罗盘指针拖拽中，优先于放置）
const setRay = (e) => {
  const r = container.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, scene3d.camera);
};

const pickGrid = (e) => {
  const r = container.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, scene3d.camera);
  const hits = raycaster.intersectObject(scene3d.heatPlane);
  if (!hits.length) return null;
  return scene3d.worldToGrid(hits[0].point.x, hits[0].point.z);
};

container.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  // capture 阶段抢在 OrbitControls（监听 canvas）之前设置 LEFT：
  // 左键+Shift=平移快捷；左键=旋转（默认）/平移（「拖拽」开关切换）/让位（罗盘指针、源、放置态）
  if (e.shiftKey) { scene3d.controls.mouseButtons.LEFT = THREE.MOUSE.PAN; return; }
  // 罗盘指针优先：命中则交罗盘拖拽，不走放置/选中
  setRay(e);
  const ch = compass.intersect(raycaster).type;
  if (ch === 'door' || ch === 'wind') { scene3d.controls.mouseButtons.LEFT = null; compassDrag = ch; return; }
  const isPlacing = placingQi || placingWind || placingLight || currentElement || placingFixture;
  // 优先拾取已放置的源（命中则左键让位给选中/拖动，相机不转）
  const hit = pickSource(e);
  if (hit) {
    scene3d.controls.mouseButtons.LEFT = null;
    if (isPlacing) exitPlacing();   // 放置模式下点已有源 → 选中它，退出放置（防误放）
    selectSource(hit.obj, hit.arr, hit.type, hit.syncFn);
    draggingSource = true;
    dragMoved = false;
    return;
  }
  if (isPlacing) scene3d.controls.mouseButtons.LEFT = null;   // 放置态：左键让位给放置
  else scene3d.controls.mouseButtons.LEFT = dragMode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;   // 空白：左键拖=旋转/平移（视图组「拖拽」开关切换，右键恒旋转）
  const g = pickGrid(e);
  if (!g) {
    if (isPlacing) hint.innerHTML = '已到模拟域边界（96×80 格）：域外无流体场，请往回收一点';
    return;
  }
  // 源类不能落在墙/结构件格上（worker 注入遇 solid 直接跳过=放着也无效）；门/窗/屏风不受限（门窗本就要贴墙凿洞）
  const onSolid = solid[g[0] + SW * g[1]] === 1;
  if (onSolid && (placingQi || placingWind || placingLight || currentElement)) {
    hint.innerHTML = '墙体/结构件上不能放置源：请落在室内或室外空地（建筑外全域可放）';
    return;
  }
  // 放置新源：放一个后自动退出放置模式并选中（立即调方向/强度）
  if (placingQi)    { const p = addQiPort(g);  exitPlacing(); selectSource(p, qiPorts, 'qi', syncQiPorts); return; }
  if (placingWind)  { const s = addWindSrc(g); exitPlacing(); selectSource(s, windSrcs, 'wind', syncWindSrcs); return; }
  if (placingLight) { const p = addLightPt(g); exitPlacing(); selectSource(p, lightPts, 'light', syncLightPts); return; }
  if (currentElement) { const s = addStruct(g[0], g[1], currentElement); exitPlacing(); selectSource(s, structs, 'struct', sendStructs); return; }
  if (placingFixture) {
    const t = placingFixture;
    const f = addFixture(t, g);
    exitPlacing();
    selectSource(f, FIX[t].arr, t, () => restampMasks(true));
    return;
  }
  deselectSource();   // 点空白取消选中
}, true);   // capture：先于 OrbitControls 设定 LEFT 让位/旋转
window.addEventListener('pointerup', () => {
  if (draggingSource && selectedSource && ['door', 'window'].includes(selectedSource.type)) restampMasks(true);   // 拖完门窗才重建墙洞（拖动中只刷 mask）
  draggingSource = false; compassDrag = null;
});
container.addEventListener('pointermove', (e) => {
  // 罗盘指针拖拽（算盘面 bearing → 回调）
  if (compassDrag) {
    setRay(e);
    const b = compass.bearingAt(raycaster);
    if (b != null) (compassDrag === 'door' ? setDoorFacing : setWindDir)(b);
    return;
  }
  // 拖拽选中的源
  if (draggingSource && selectedSource) {
    const g = pickGrid(e);
    if (g) { moveSelectedTo(g); dragMoved = true; }
    return;
  }
  if (!draggingSource) return;
});
// 滚轮：①选中源(有方向)→调源方向；②罗盘盘面→上下文调参(九星开=流年/风场=风速)；③否则缩放
container.addEventListener('wheel', (e) => {
  if (selectedSource && selectedSource.type !== 'light' && selectedSource.type !== 'struct') {
    e.preventDefault(); e.stopPropagation();
    rotateSelected(e.deltaY > 0 ? 15 : -15);
    return;
  }
  setRay(e);
  if (compass.intersect(raycaster).type === 'disk') {
    const up = e.deltaY < 0;
    if (jiuxingOn) { e.preventDefault(); e.stopPropagation(); setYear(jiuxingYear + (up ? 1 : -1)); }
    else if (mode === 'speed') { e.preventDefault(); e.stopPropagation(); setWindSpd(Math.max(0, Math.min(15, +(windSpd + (up ? 0.5 : -0.5)).toFixed(1)))); }
    // 否则（非九星非风场）不拦截，让 OrbitControls 缩放
  }
}, { passive: false });
// Shift+Delete：删除选中源（裸 Delete/Backspace 不删，防滑块聚焦时误触）；Esc：取消选中
window.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' && e.shiftKey) deleteSelected();
  else if (e.key === 'Escape') deselectSource();
});

// ===== 主循环：worker 算流体 → 热力图 → 3D 渲染 =====
let last = performance.now(), frames = 0, fpsT = last, dpT = last;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) {
    worker.postMessage({ type: 'step', dt });
    // 粒子动画跟随模拟步进（暂停时一并停，不再用旧场继续飘）
    if (lastDye && mode !== 'speed') volFlow.update(dt, lastDye, lastU, lastV, lastDye, solid, windSrcs);
  }
  // 模式切换过渡：粒子云整云淡入淡出（speed 下 update 停跑也得淡出）
  volFlow.tickFade(dt);
  // 结构件 mask 重放（限频：每帧至多发一次 setMask；拖动/调参不刷爆 worker）
  if (maskDirty) {
    const s2 = new Uint8Array(solid), g2 = new Uint8Array(glass);
    worker.postMessage({ type: 'setMask', solid: s2, glass: g2 }, [s2.buffer, g2.buffer]);
    maskDirty = false;
  }
  if (wallDirty) { rebuildWalls(); wallDirty = false; }   // 门/窗增删挪转后的墙洞重建
  updateFixtureAnims(dt);   // 门开合 / 窗推拉 lerp（REDUCED 直接吸附）
  // 热图透明度过渡：先淡出到低谷 → 换色带（heatMode）→ 淡回目标
  const heatMat = scene3d.heatPlane.material;
  const heatTgt = pendingHeatMode ? 0 : HEAT_OPACITY[heatMode];
  if (Math.abs(heatMat.opacity - heatTgt) > 0.002 || pendingHeatMode) {
    heatMat.opacity += (heatTgt - heatMat.opacity) * Math.min(1, dt * 5);
    if (pendingHeatMode && heatMat.opacity < 0.04) { heatMode = pendingHeatMode; pendingHeatMode = null; }
  }
  // 罗盘 warm-up：流体首帧 +1.5s 后，hero 撑场 → anchor 常驻缩淡（reduced-motion 直接跳 hero）
  if (REDUCED && compass.state === 'hero') compass.setState('anchor');
  else if (firstFrameT && compass.state === 'hero' && now - firstFrameT > 1500) compass.setState('anchor');
  compass.update(dt);
  // 放置源球脉动呼吸（炁口/风口/光源/五行结构，可见动态；reduced-motion 静止）
  const pulse = REDUCED ? 1 : 1 + Math.sin(now * 0.005) * 0.2;
  for (const g of [qiGroup, windGroup, lightGroup, structGroup]) {
    for (const c of g.children) c.scale.setScalar(pulse);
  }
  scene3d.render();
  if (!bootDone) { bootDone = true; hideBoot(); }   // 首帧已上屏：点火屏淡出退场
  frames++;
  if (now - fpsT > 500) { fpsEl.textContent = `${Math.round(frames * 1000 / (now - fpsT))} fps`; frames = 0; fpsT = now; }
  if (now - dpT > 200) { if (lastDye && typeof dataPanel !== 'undefined') dataPanel.updateFluid({ dye: lastDye, u: lastU, v: lastV, curl: lastCurl, solid, SW, W, H }); dpT = now; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 点火屏退场：#boot 由 index.html 在大 JS 之前渲染（零 JS 也能显示慢网提示），loop 首帧后淡出移除
let bootDone = false;
function hideBoot() {
  const b = document.getElementById('boot');
  if (!b) return;
  b.classList.add('hide');
  setTimeout(() => b.remove(), 600);
}

// ===== 首次引导（3 步；localStorage 记住看过，URL 带 ?about 可重看）=====
const OB_KEY = 'qiliu-onboarded';
const OB_STEPS = [
  { t: '炁流 · 堪舆操作台', b: '这是一座堪舆风洞：上传户型图识别墙体，或直接在默认空屋里起炁。' },
  { t: '起炁 · 布源', b: '左栏选模式（炁流/风场/采光），点地板放置炁口、风口、光源；拖动移位，滚轮调向，Shift+Delete 删除（5 秒内可撤销）。' },
  { t: '堪舆 · 断吉凶', b: '拖罗盘赤金指针定门向，开八宅看方位吉凶、开九星看流年飞星；右栏仪表实时计量。' },
];
if (!localStorage.getItem(OB_KEY) || location.search.includes('about')) {
  let obStep = 0;
  const obCard = document.createElement('div');
  obCard.className = 'ob-card';
  document.body.appendChild(obCard);
  const obDone = () => { localStorage.setItem(OB_KEY, '1'); obCard.remove(); };
  const obRender = () => {
    const s = OB_STEPS[obStep];
    obCard.innerHTML = `
      <h4>${s.t}</h4>
      <div class="ob-step">${OB_STEPS.map((_, i) => `<span class="ob-dot${i <= obStep ? ' on' : ''}"></span>`).join('')}</div>
      <div>${s.b}</div>
      <div class="ob-btns"><button class="ob-skip">跳过</button><button class="ob-btn">${obStep === OB_STEPS.length - 1 ? '开始' : '下一步'}</button></div>`;
    obCard.querySelector('.ob-skip').onclick = obDone;
    obCard.querySelector('.ob-btn').onclick = () => { obStep < OB_STEPS.length - 1 ? (obStep++, obRender()) : obDone(); };
  };
  obRender();
}

// debug 钩子：?debug 时暴露内部状态供自动化断言
if (location.search.includes('debug')) {
  window.__q = {
    get solid() { return solid; }, get glass() { return glass; },
    get baseSolid() { return baseSolid; }, get baseGlass() { return baseGlass; },
    screens, doors, windows, lineCells, windSrcs, qiPorts, lightPts,
    restamp: () => restampMasks(true), addFix: (t, g) => addFixture(t, g), carve: computeCarve,
    syncWind: () => syncWindSrcs(), setFixB: (f) => setFixtureBearing(f),
    get camera() { return scene3d.camera; }, get controls() { return scene3d.controls; }, get scene() { return scene3d.scene; },
    get lastDye() { return lastDye; }, get lastU() { return lastU; }, get lastV() { return lastV; },
  };
}
