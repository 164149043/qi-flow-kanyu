/**
 * kanyu/main.js —— 堪舆页（左侧侧边栏 + 中央画布占大）
 * 原站交互实锤：左侧栏控件，中央 panzoom 画布，5 标签盘式叠加在户型图上。
 * ★ 盘式与户型图共用 layerSize → 自动同尺寸；画布响应式跟随容器。
 */
import { renderNav } from './nav.js';
import { inject } from '@vercel/analytics';
import { bazhaiPan, degToGua } from './core/fengshui/bazhai.js';
import { yearFeixingPan } from './core/fengshui/feixing-year.js';
import { xuankongPan, oppositeMountain, BAGUA_BY_NAME } from './core/index.js';
import { getJiuxingDetail } from './core/fengshui/feixing-detail.js';
import { degToMountain, classifyMountain } from './core/fengshui/twentyfour.js';
import { getBazhaiDetail, DAYOUNIAN_SONG } from './core/fengshui/bazhai-detail.js';
import { comprehensiveScore } from './core/fengshui/scoring.js';
import { KanyuStage } from './render/canvas2d/KanyuStage.js';
import { drawBazhaiRoundLayer, drawXuankongLayer, drawM24Layer, drawFeixingYearLayer, drawTaijiBaguaLayer, drawEdgeCompass } from './render/canvas2d/layers.js';
import { drawCompass, drawMoonPhase } from './render/canvas2d/compass.js';
import { shichenNow } from './core/fengshui/compass-plates.js';
import { getGanZhi, shichenLabel } from './core/calendar/ganzhi.js';
import { moonAgeDays, moonPhaseName } from './core/calendar/moonphase.js';
import { getHuangLi } from './core/calendar/huangli.js';
import { ROOM_TYPES, ELEM_COLORS, judgeRoom } from './core/fengshui/geju.js';
import { getYunFeature } from './core/fengshui/yun-feature.js';
import { exportKanyuPDF } from './export-pdf.js';
import { PAL, DISK, luckColorDisk, starColor } from './palette.js';

/** 户型图底图：以盘心(0,0)居中，按 size 短边适配（与 5 盘式同 size → 自动同尺寸）*/
function drawFloorplanLayer(ctx, img, size = 480) {
  const s = Math.min(size / img.width, size / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.globalAlpha = 0.82;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = DISK.qingMist;
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
}

const app = document.getElementById('app');

// Initialize Vercel Analytics
inject();
app.appendChild(renderNav('kanyu'));

const data = {}; // { bazhai, yearFx, xuankong, score }
let floorplanImg = null; // 户型图底图（上传后赋值）
let taijiMode = '后天'; // 动态九宫盘式：'后天'(默认) / '先天'
let baguaRot = 0;        // 动态九宫手动旋转（度，原站 baguaRot，独立·不随朝向）
let driftPhase = 0;      // 太极阴阳消长漂浮相位（弧度，rAF 累加）
let taijiRafId = null;   // 动态九宫 rAF 句柄（仅「动态九宫」标签开时跑）
let taijiLastT = 0;      // rAF 上一帧时间戳（算 dt 用）
let shichenIdx = shichenNow(); // 当下时辰序号(0~11，子=0)：自动模式跟随系统时间，手动模式随滑块
let shichenAuto = true; // 时辰自动跟随系统时间
let rooms = []; // 格局标注房间 [{id,type,elem,x,y}]（x,y 为盘式坐标）
let roomSeq = 1; // 房间 id 自增
let gjPlacing = null; // 正在放置的房间类型 key（null=未放置）
let gjMoving = null; // 正在移动的房间 id（null=未移动）
let layerSize = 480; // 盘式 & 户型图基准尺寸（fitCanvas 动态更新，二者共用 → 自动同尺寸）

const wrap = document.createElement('div');
wrap.className = 'wrap';
wrap.style.maxWidth = 'none';   // kanyu 页全宽（画布占大），覆盖 .wrap 的 1180px 限宽
wrap.style.padding = '14px 22px 24px'; // 左右留白 22px，不贴屏幕边
wrap.innerHTML = `
  <div style="display:flex;gap:12px;align-items:stretch;height:calc(100vh - 80px);min-height:580px;">
    <aside style="width:285px;flex-shrink:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:2px;">
      <div class="panel">
        <div class="label" style="margin-bottom:8px;">户型图底图</div>
        <label style="display:block;text-align:center;padding:14px;border:1px dashed var(--line);border-radius:6px;color:var(--gold);cursor:pointer;font-size:13px;">📁 点击上传户型图<input id="floorInput" type="file" accept="image/*" style="display:none;"></label>
        <div id="floorHint" style="font-size:11px;color:var(--muted);margin-top:6px;text-align:center;">未上传 · 5 标签叠空画布演示</div>
      </div>
      <div class="panel">
        <div class="label" style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span>朝向（北=0° 顺时针 0~359）</span><b id="doorInfo" style="color:var(--gold);"></b>
        </div>
        <input id="doorSlider" type="range" min="0" max="359" step="1" value="180">
        <div class="label" style="margin-top:12px;">建造年份</div>
        <input id="yearInput" type="number" min="1864" max="2223" value="2010" style="width:100%;margin-top:4px;">
        <div class="label" style="display:flex;justify-content:space-between;margin-top:12px;"><span>画布旋转</span><b id="rotVal" style="color:var(--gold);">0°</b></div>
        <input id="rotSlider" type="range" min="0" max="359" step="1" value="0" style="width:100%;margin-top:4px;">
        <div class="label" style="display:flex;justify-content:space-between;margin-top:12px;"><span>盘式大小</span><b id="sizeVal" style="color:var(--gold);">100%</b></div>
        <input id="sizeSlider" type="range" min="0.5" max="2.5" step="0.1" value="1" style="width:100%;margin-top:4px;">
        <div style="font-size:11px;color:var(--muted2);margin-top:6px;line-height:1.5;">只缩放八宅·九星·九宫·二十四山·大玄空（户型图不变）·滚轮缩放整个画布</div>
      </div>
      <div class="panel">
        <div class="label" style="margin-bottom:8px;">图层开关（跟随画布缩放）</div>
        <div id="layerToggles" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
      </div>
      <div id="descPanels" style="display:flex;flex-direction:column;gap:12px;"></div>
      <div class="panel" id="taijiPanel" style="display:none;">
        <div class="label" style="margin-bottom:8px;">动态九宫 · 盘式切换</div>
        <div style="display:flex;gap:8px;">
          <button data-mode="后天" class="seg-btn" style="flex:1;padding:8px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid var(--line);">后天八卦</button>
          <button data-mode="先天" class="seg-btn" style="flex:1;padding:8px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid var(--line);">先天八卦</button>
        </div>
        <div id="taijiDesc" style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.6;"></div>
        <div class="label" style="display:flex;justify-content:space-between;margin-top:12px;"><span>盘式旋转</span><b id="baguaRotVal" style="color:var(--gold);">0°</b></div>
        <input id="baguaRotSlider" type="range" min="0" max="359" step="1" value="0" style="width:100%;margin-top:4px;">
        <div style="font-size:11px;color:var(--muted2);margin-top:6px;line-height:1.5;">手动旋转八卦盘 · 中心太极随阴阳消长自动漂浮</div>
      </div>
      <div class="panel" id="gejuPanel">
        <div class="label" style="display:flex;justify-content:space-between;align-items:center;">
          <span>格局标注</span>
          <button id="gjAddBtn" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(124,230,168,0.45);background:var(--ji-bg);color:var(--luck-ji);font-size:11px;cursor:pointer;">+ 添加格局</button>
        </div>
        <div id="gjTypes" style="display:none;flex-wrap:wrap;gap:4px;margin-top:8px;"></div>
        <div id="gjHint" style="display:none;margin-top:6px;font-size:11px;color:var(--gold);background:var(--gold-a07);border-radius:6px;padding:5px 8px;">已选「<span id="gjHintName"></span>」· 点画布放置 · <span id="gjHintTail"></span></div>
        <div id="gjList" style="margin-top:6px;"></div>
      </div>
      <div class="panel" id="luopanPanel">
        <div class="label" style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span>罗盘 · 盘式切换</span><b id="lpModeName" style="color:var(--gold);">罗盘</b>
        </div>
        <canvas id="compass" width="284" height="284" style="display:block;width:100%;max-width:260px;height:auto;margin:0 auto;cursor:pointer;"></canvas>
        <div id="lpSwitch" style="display:flex;gap:4px;margin-top:8px;">
          <button data-m="luopan" class="lp-btn" style="flex:1;padding:7px 0;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid var(--line);">罗盘</button>
          <button data-m="hetu" class="lp-btn" style="flex:1;padding:7px 0;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid var(--line);">河图</button>
          <button data-m="luoshu" class="lp-btn" style="flex:1;padding:7px 0;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid var(--line);">洛书</button>
          <button data-m="xiantian" class="lp-btn" style="flex:1;padding:7px 0;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid var(--line);">先天</button>
          <button data-m="houtian" class="lp-btn" style="flex:1;padding:7px 0;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid var(--line);">后天</button>
        </div>
        <div id="lpDesc" style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.6;"></div>
      </div>
      <div class="panel" id="skyPanel">
        <div class="label" style="margin-bottom:6px;">当下时辰</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:5px 0;font-size:12.5px;">
          <span style="color:var(--muted2);font-size:11px;">时辰</span>
          <b id="shichenName" style="color:var(--text);">--</b>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:5px 0;font-size:12.5px;">
          <span style="color:var(--muted2);font-size:11px;">干支</span>
          <b id="ganzhiAll" style="color:var(--gold);font-size:11.5px;">--</b>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:5px 0;font-size:12.5px;">
          <span style="color:var(--muted2);font-size:11px;">月相</span>
          <span style="display:flex;align-items:center;gap:6px;"><b id="moonPhase" style="color:var(--text);">--</b><canvas id="moonIcon" width="20" height="20"></canvas></span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
          <input id="shichen" type="range" min="0" max="11" step="1" style="flex:1;accent-color:var(--gold);">
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer;"><input type="checkbox" id="shichenAuto" checked style="accent-color:var(--gold);"> 自动</label>
        </div>
        <button id="huangliBtn" style="margin-top:8px;width:100%;padding:8px;border-radius:8px;border:1px solid var(--gold);background:rgba(255,176,32,0.15);color:var(--gold);font-size:13px;font-weight:600;cursor:pointer;">📜 黄历</button>
      </div>
      <div class="panel" id="scorePanel"></div>
      <div class="panel" id="infoPanel"></div>
    </aside>
    <main style="flex:1;min-width:0;position:relative;">
      <div id="stageWrap" class="panel" style="position:absolute;inset:0;padding:10px;overflow:hidden;">
        <canvas id="stage" style="display:block;width:100%;height:100%;"></canvas>
      </div>
    </main>
  </div>
`;
app.appendChild(wrap);

// 三栏布局：把 罗盘/评分/盘局 从左侧栏迁到紧贴浏览器右侧的独立侧栏（DOM 迁移，不改 HTML 模板）
const rightAside = document.createElement('aside');
rightAside.style.cssText = 'width:275px;flex-shrink:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-left:2px;';
const resetBtn = document.createElement('button');
resetBtn.textContent = '↻ 重置（清格局 · 视图归位）';
resetBtn.style.cssText = 'padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--gold);font-size:12px;cursor:pointer;font-weight:600;';
resetBtn.addEventListener('click', resetAll);
rightAside.appendChild(resetBtn);
const exportBtn = document.createElement('button');
exportBtn.textContent = '📄 导出 PDF';
exportBtn.style.cssText = 'padding:8px;border-radius:8px;border:1px solid var(--gold);background:rgba(255,215,106,0.12);color:var(--gold);font-size:12px;cursor:pointer;font-weight:600;';
exportBtn.addEventListener('click', async () => {
  if (!data.score) return; // data 未就绪不导
  const old = exportBtn.textContent;
  exportBtn.textContent = '⏳ 生成中…'; exportBtn.disabled = true;
  try {
    await exportKanyuPDF({ data, rooms, stage, floorplanImg, innerR: Math.max(12, layerSize / 2 * 0.32) });
  } catch (e) {
    console.error('导出 PDF 失败', e); alert('导出失败：' + (e && e.message ? e.message : e));
  } finally {
    exportBtn.textContent = old; exportBtn.disabled = false;
  }
});
rightAside.appendChild(exportBtn);
const bazhaiGridPanel = document.createElement('div');
bazhaiGridPanel.className = 'panel';
bazhaiGridPanel.id = 'bazhaiGridPanel';
rightAside.appendChild(bazhaiGridPanel); // 八宅吉凶九宫全盘卡（置顶，重置按钮下）
const jiuxingGridPanel = document.createElement('div');
jiuxingGridPanel.className = 'panel';
jiuxingGridPanel.id = 'jiuxingGridPanel';
jiuxingGridPanel.style.display = 'none'; // 默认隐藏：勾「九星」图层标签才出现
rightAside.appendChild(jiuxingGridPanel);
rightAside.appendChild(document.getElementById('scorePanel'));
rightAside.appendChild(document.getElementById('infoPanel'));
rightAside.appendChild(document.getElementById('skyPanel'));
rightAside.appendChild(document.getElementById('luopanPanel'));
wrap.querySelector('main').insertAdjacentElement('afterend', rightAside);

// 重置：清空格局标注 + 视图归位 + 朝向/年份/旋转回默认
function resetAll() {
  rooms = []; roomSeq = 1; gjPlacing = null; gjMoving = null;
  stage.resetView();
  const _ss = document.getElementById('sizeSlider'); if (_ss) { _ss.value = 1; const _sv = document.getElementById('sizeVal'); if (_sv) _sv.textContent = '100%'; }
  document.getElementById('doorSlider').value = 180;
  document.getElementById('yearInput').value = 2010;
  document.getElementById('rotSlider').value = 0;
  document.getElementById('rotVal').textContent = '0°';
  baguaRot = 0; driftPhase = 0; taijiLastT = 0; // 动态九宫旋转/漂浮归位（rAF 若在跑则继续，不强行停）
  const brs = document.getElementById('baguaRotSlider'); if (brs) brs.value = 0;
  const brv = document.getElementById('baguaRotVal'); if (brv) brv.textContent = '0°';
  const hint = document.getElementById('gjHint');
  if (hint) hint.style.display = 'none';
  const gjTypes = document.getElementById('gjTypes');
  if (gjTypes) {
    gjTypes.style.display = 'none';
    gjTypes.querySelectorAll('button').forEach((b) => { const br = ROOM_TYPES[b.dataset.k]; b.style.borderColor = br.col + '66'; b.style.background = 'var(--ping-bg)'; });
  }
  rerender();
}

// ── panzoom 画布 + 图层（cell/radius 基于 layerSize，与户型图同尺寸）──
const stage = new KanyuStage(document.getElementById('stage'), 560, 560);
// 盘式大小滑块：调 panzoom scale（八宅/九星/九宫/二十四山/大玄空 + 户型图同步缩放）
const sizeSlider = document.getElementById('sizeSlider');
// 滑块只缩 5 盘式（plateScale），不动户型图；滚轮 panzoom 仍可全局缩放（含户型图）
sizeSlider.addEventListener('input', () => {
  const v = +sizeSlider.value || 1;
  stage.plateScale = v; document.getElementById('sizeVal').textContent = (v * 100).toFixed(0) + '%'; stage.render();
});
stage.addLayer('户型图', (ctx) => floorplanImg && drawFloorplanLayer(ctx, floorplanImg, layerSize), true, true); // 第4参 rotate=true：只户型图随 rotSlider 转，5 盘式钉死方位
stage.addLayer('二十四山', (ctx) => data.xuankong && drawM24Layer(ctx, layerSize / 2), false);
stage.addLayer('大玄空', (ctx) => data.xuankong && drawXuankongLayer(ctx, data.xuankong, layerSize / 3), false);
stage.addLayer('八宅', (ctx) => { if (!data.bazhai) return; const d = +document.getElementById('doorSlider').value; drawBazhaiRoundLayer(ctx, data.bazhai, degToGua(d), d, layerSize / 2); }, true);
stage.addLayer('九星', (ctx) => data.yearFx && drawFeixingYearLayer(ctx, data.yearFx, layerSize / 3), false);
stage.addLayer('动态九宫', (ctx) => drawTaijiBaguaLayer(ctx, layerSize / 2, taijiMode, baguaRot * Math.PI / 180, driftPhase), false);
// 格局标注层（画房间标记，置于最上层）：圆标 + 字标 + 吉凶边框/分数
stage.addLayer('格局标注', (ctx) => {
  if (!rooms.length || !data.bazhai || !data.yearFx) return;
  const innerR = Math.max(12, layerSize / 2 * 0.32);
  for (const r of rooms) {
    const rt = ROOM_TYPES[r.type];
    const j = judgeRoom(r, data.bazhai, data.yearFx, innerR);
    const good = j.pts >= 0;
    const border = good ? luckColorDisk('吉').text : luckColorDisk('凶').text;   // 吉凶边/字走盘面档
    const rad = Math.max(18, layerSize * 0.05);
    // 冷蓝灰阴影 + 白底圆（浅色系靠阴影抬层级，浮于户型图之上不被淹没）
    ctx.save();
    ctx.shadowColor = DISK.shadow; ctx.shadowBlur = 8;
    ctx.fillStyle = PAL.badgeBg;
    ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 房间色内圆 + 吉凶粗边
    ctx.fillStyle = rt.col;
    ctx.beginPath(); ctx.arc(r.x, r.y, rad * 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.stroke();
    // 字标（深墨压在房间色圆上）
    ctx.fillStyle = PAL.ink;
    ctx.font = `bold ${rad * 0.92}px "LXGW WenKai Lite", "KaiTi", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(rt.mark, r.x, r.y);
    // 分数胶囊（下方，深底 + 吉凶色字）
    const ptsTxt = (j.pts > 0 ? '+' : '') + j.pts;
    ctx.font = `bold ${rad * 0.66}px "LXGW WenKai Lite", "KaiTi", serif`;
    const tw = ctx.measureText(ptsTxt).width;
    const py = r.y + rad * 1.3;
    ctx.fillStyle = PAL.badgeBg;
    ctx.fillRect(r.x - tw / 2 - 5, py - rad * 0.4, tw + 10, rad * 0.8);
    ctx.fillStyle = border;
    ctx.fillText(ptsTxt, r.x, py);
  }
}, true, false); // visible=true（始终显示，不进图层开关），rotate=false（钉死方位，不随户型图转）
stage.addOverlay('方位', (ctx, w, h) => drawEdgeCompass(ctx, w, h)); // 外围八方位标（固定，不随缩放/旋转）

// ── 画布响应式：跟随容器尺寸，同步更新 layerSize（盘式 & 户型图一起缩放）──
function fitCanvas() {
  const sw = document.getElementById('stageWrap');
  if (!sw) return;
  const w = sw.clientWidth - 20, h = sw.clientHeight - 20;
  layerSize = Math.round(Math.max(320, Math.min(w, h)) * 0.9); // 盘式基于短边（圆盘直径≈layerSize）
  stage.resize(Math.max(320, w), Math.max(320, h)); // 画布铺满右侧（非正方形，去掉留白）
}
new ResizeObserver(fitCanvas).observe(document.getElementById('stageWrap'));
fitCanvas();

// ── 5 标签开关 + 对应说明面板（原站每个标签开时右侧显示原理+数据）──
const LAYER_DEFS = [
  { key: '八宅', def: true, title: '八宅吉凶',
    logic: '以门朝向定坐山，按大游年布八星：<b style="color:var(--luck-ji)">生气·天医·延年·伏位=四吉</b>，<b style="color:var(--luck-xiong)">绝命·五鬼·六煞·祸害=四凶</b>。' },
  { key: '九星', def: false, title: '九星飞布',
    logic: '年紫白飞星——值年星入中宫顺飞（中→乾→兑→艮→离→坎→坤→震→巽）。宫位为<b>地理绝对方位</b>（坎北离南，不随门朝向）。' },
  { key: '动态九宫', def: false, title: '动态九宫',
    logic: '太极示阴阳消长，八卦定位八方。<b style="color:var(--gold)">后天</b>主方位之用配洛书数，<b style="color:var(--gold)">先天</b>主对待之体配先天序数。' },
  { key: '二十四山', def: false, title: '二十四山',
    logic: '阳宅只论方位：<b style="color:var(--gold)">三吉(甲巳庚)</b>·<b style="color:var(--luck-ji)">六秀(辰亥丑丙丁酉)</b>·<b style="color:var(--luck-xiong)">三恶(卯申戌)</b>·<b style="color:#e88250">六害(寅乙未辛壬癸)</b>。' },
  { key: '大玄空', def: false, title: '大玄空 · 宅命盘',
    logic: '按建造年份定元运，坐山/朝向起星入中，<b>阳顺阴逆</b>布山盘向盘。每宫三数：上=山星(人丁)·下=向星(财)·中=运星。<b style="color:var(--gold)">正神宜高宜实，零神宜水宜空</b>。' },
];
const togWrap = document.getElementById('layerToggles');
const descWrap = document.getElementById('descPanels');
for (const ld of LAYER_DEFS) {
  const lbl = document.createElement('label');
  lbl.style.cssText = 'display:flex;align-items:center;gap:4px;color:var(--muted);font-size:13px;cursor:pointer;background:var(--panel2);padding:4px 10px;border-radius:6px;';
  lbl.innerHTML = `<input type="checkbox" ${ld.def ? 'checked' : ''} style="accent-color:var(--gold);"> ${ld.key}`;
  const dp = document.createElement('div');
  dp.className = 'panel';
  dp.dataset.key = ld.key;
  dp.style.display = ld.def ? 'block' : 'none';
  dp.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
      <b style="color:var(--gold);font-size:14px;">${ld.title}</b>
      <span class="dp-sub" style="color:var(--muted);font-size:11px;"></span>
    </div>
    <div style="font-size:12px;color:var(--muted);line-height:1.7;">${ld.logic}</div>
    <div class="dp-data" style="margin-top:8px;font-size:12px;line-height:1.8;"></div>`;
  descWrap.appendChild(dp);
  lbl.querySelector('input').addEventListener('change', (e) => {
    stage.setLayerVisible(ld.key, e.target.checked);
    dp.style.display = e.target.checked ? 'block' : 'none';
    // 八宅/九星图层开关 → 对应右侧栏九宫卡同步显隐（点标签才出九宫图）
    const gridMap = { '八宅': ['bazhaiGridPanel', renderBazhaiGrid], '九星': ['jiuxingGridPanel', renderJiuxingGrid] };
    const gm = gridMap[ld.key];
    if (gm) {
      const gp = document.getElementById(gm[0]);
      if (gp) {
        gp.style.display = e.target.checked ? '' : 'none';
        if (e.target.checked) gm[1]();
      }
    }
    // 动态九宫开关 → 盘式切换卡显隐 + 太极漂浮 rAF 启停（仅可见时跑，关掉立即停）
    if (ld.key === '动态九宫') {
      const tp = document.getElementById('taijiPanel');
      if (tp) tp.style.display = e.target.checked ? '' : 'none';
      if (e.target.checked) startTaijiAnim(); else stopTaijiAnim();
    }
    stage.render();
  });
  togWrap.appendChild(lbl);
}

// ── 定盘持久化（P3）：localStorage `kanyu:state`，刷新不丢；3D 页启动读取联动（风来向+八宅门向）──
const KANYU_KEY = 'kanyu:state';
let _saveTimer = null;
function saveKanyuState() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      const layers = {};
      document.querySelectorAll('#layerToggles label').forEach((lbl) => { layers[lbl.textContent.trim()] = lbl.querySelector('input').checked; });
      localStorage.setItem(KANYU_KEY, JSON.stringify({
        doorDir: +document.getElementById('doorSlider').value,
        buildYear: +document.getElementById('yearInput').value || 2010,
        rooms, roomSeq, taijiMode, baguaRot, layers, ts: Date.now(),
      }));
    } catch (e) { /* 隐私模式/存储满 静默 */ }
  }, 300); // 防抖：拖滑块连发 rerender 不狂写
}
function loadKanyuState() {
  try {
    const s = JSON.parse(localStorage.getItem(KANYU_KEY) || 'null');
    if (!s) return;
    if (Number.isFinite(+s.doorDir)) document.getElementById('doorSlider').value = ((Math.round(+s.doorDir) % 360) + 360) % 360;
    if (Number.isFinite(+s.buildYear)) document.getElementById('yearInput').value = Math.max(1864, Math.min(2223, Math.round(+s.buildYear)));
    if (Array.isArray(s.rooms)) rooms = s.rooms.filter((r) => r && ROOM_TYPES[r.type] && Number.isFinite(r.x) && Number.isFinite(r.y));
    roomSeq = Number.isFinite(+s.roomSeq) ? +s.roomSeq : rooms.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    if (typeof s.baguaRot === 'number') {
      baguaRot = s.baguaRot;
      const brs = document.getElementById('baguaRotSlider'); if (brs) brs.value = s.baguaRot;
      const brv = document.getElementById('baguaRotVal'); if (brv) brv.textContent = s.baguaRot + '°';
    }
    if (s.taijiMode === '先天' || s.taijiMode === '后天') taijiMode = s.taijiMode;
    if (s.layers) { // 图层开关恢复（change 事件自带面板显隐/九宫卡/rAF 联动）
      document.querySelectorAll('#layerToggles label').forEach((lbl) => {
        const key = lbl.textContent.trim(), cb = lbl.querySelector('input');
        if (typeof s.layers[key] === 'boolean' && cb.checked !== s.layers[key]) {
          cb.checked = s.layers[key];
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
  } catch (e) { /* 损坏数据当没有 */ }
}

function rerender() {
  const doorDeg = +document.getElementById('doorSlider').value;
  const buildYear = +document.getElementById('yearInput').value || 2010;
  const doorGua = degToGua(doorDeg);
  data.bazhai = bazhaiPan(doorGua);
  data.yearFx = yearFeixingPan(new Date().getFullYear());   // 流年随真实年份走（每年自动滚，不卡建造年份）
  const xiangMountain = degToMountain(doorDeg);
  const zuoMountain = oppositeMountain(xiangMountain);
  data.xuankong = xuankongPan(buildYear, zuoMountain);
  data.score = comprehensiveScore({ bazhai: data.bazhai, yearFx: data.yearFx, xuankong: data.xuankong, rooms, innerR: Math.max(12, layerSize / 2 * 0.32) });

  document.getElementById('doorInfo').textContent =
    `${doorDeg}° ${doorGua}向 → 坐${zuoMountain}（${data.xuankong.zuoshanMeta.gua}）`;

  stage.render();
  renderScorePanel();
  renderInfoPanel();
  renderDescPanels();
  renderCompass();
  renderGjList();
  renderBazhaiGrid(); // 刷新八宅九宫卡（保持当前选中宫）
  renderJiuxingGrid(); // 刷新九星九宫卡（仅「九星」标签开时可见）
  saveKanyuState(); // 定盘/格局变了 → 防抖落盘（3D 页等着读）
}

function renderScorePanel() {
  const s = data.score;
  const lvColor = s.level === '大吉' || s.level === '吉' ? 'var(--luck-ji)'
    : s.level === '凶' || s.level === '大凶' ? 'var(--luck-xiong)' : 'var(--muted)';
  const yr = (data.yearFx && data.yearFx.year) || '';
  const row = (l) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--line);font-size:13px;">
      <span style="color:var(--muted);">${l.name} <span style="font-size:11px;">${l.note}</span></span>
      <b>${l.score}</b>
    </div>`;
  document.getElementById('scorePanel').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <b style="color:var(--gold);">宅局参考指数</b>
      <span><b style="font-size:30px;color:${lvColor};">${s.score}</b><span style="color:${lvColor};margin-left:6px;">${s.level}</span></span>
    </div>
    <div style="font-size:11px;color:var(--muted2);margin:4px 0 8px;line-height:1.5;">综合参考，须结合宅主命局与流年细断，非绝对定论</div>
    <div style="font-size:11px;color:var(--gold);margin-top:4px;">▎宅本盘 <span style="color:var(--muted2);font-weight:normal;">（固有·随建造定死）</span></div>
    ${s.groups.basePans.map(row).join('')}
    <div style="font-size:11px;color:var(--gold);margin-top:8px;">▎流年提示 <span style="color:var(--muted2);font-weight:normal;">（随流年变${yr ? '·' + yr : ''}）</span></div>
    ${s.groups.flowYear.map(row).join('')}
    <div style="margin-top:8px;padding:5px 0;border-top:1px dashed var(--line);font-size:12px;color:var(--muted);">
      <span style="color:var(--muted2);font-size:11px;">立向参考（不计分）：</span>${s.reference.text}
    </div>
  `;
}

function renderInfoPanel() {
  const x = data.xuankong;
  const pColor = x.pattern.level === '大吉' ? 'var(--luck-ji)' : x.pattern.level === '凶' ? 'var(--luck-xiong)' : 'var(--muted)';
  document.getElementById('infoPanel').innerHTML = `
    <b style="color:var(--gold);">盘局</b>
    <div style="font-size:13px;margin-top:8px;line-height:2;">
      <div>坐向：${x.zuoshan}（${x.zuoshanMeta.gua}） → ${x.chaoxiang}（${x.chaoxiangMeta.gua}）</div>
      <div>元运：${x.yunLabel}</div>
      <div>山盘：${x.shanEnter}${x.shanFlyDir} ｜ 向盘：${x.xiangEnter}${x.xiangFlyDir}</div>
      <div>格局：<span style="color:${pColor};">${x.pattern.name}（${x.pattern.level}）</span></div>
      <div style="color:var(--muted);font-size:12px;margin-top:4px;">${data.yearFx.desc} · ${x.pattern.detail}</div>
    </div>
  `;
}

function renderDescPanels() {
  if (!data.bazhai || !data.yearFx || !data.xuankong) return; // data 未就绪时不画（防初始化崩溃）
  const doorDeg = +document.getElementById('doorSlider').value;
  const set = (key, sub, dataHtml) => {
    const dp = descWrap.querySelector(`.panel[data-key="${key}"]`);
    if (!dp) return;
    dp.querySelector('.dp-sub').innerHTML = sub || '';
    dp.querySelector('.dp-data').innerHTML = dataHtml || '';
  };
  const doorGua = degToGua(doorDeg);
  const jiF = data.bazhai.palaces.filter((p) => p.info.ji === '吉').map((p) => `${p.gong}·${p.info.name}`);
  const xiongF = data.bazhai.palaces.filter((p) => p.info.ji === '凶').map((p) => `${p.gong}·${p.info.name}`);
  set('八宅', `${doorGua}宅 · 坐${data.xuankong.zuoshan}朝${data.xuankong.chaoxiang}`,
    `四吉方：<span style="color:var(--luck-ji)">${jiF.join('　')}</span><br>四凶方：<span style="color:var(--luck-xiong)">${xiongF.join('　')}</span>`);
  const c = data.yearFx.centerInfo;
  set('九星', data.yearFx.desc, `中宫 <b style="color:var(--gold)">${c.star}</b> · ${c.wuxing} · ${c.ji}<br>主<b style="color:var(--text)">${c.meaning}</b>`);
  set('动态九宫', `${taijiMode}八卦`, taijiMode === '先天'
    ? '乾南·坤北·离东·坎西，配先天序 1~8'
    : '离南·坎北·震东·兑西，配洛书数 1~9');
  const m = classifyMountain(data.xuankong.zuoshan);
  const mColor = m.luck === '吉' ? 'var(--luck-ji)' : m.luck === '凶' ? 'var(--luck-xiong)' : 'var(--gold)';
  set('二十四山', `坐${data.xuankong.zuoshan}·向${data.xuankong.chaoxiang}`, `<b style="color:${mColor}">${m.tag}</b>（${m.luck}）<br><span style="color:var(--text);font-size:11px;line-height:1.6;">${m.desc}</span>`);
  const x = data.xuankong;
  const pColor = x.pattern.level === '大吉' ? 'var(--luck-ji)' : x.pattern.level === '凶' ? 'var(--luck-xiong)' : 'var(--gold)';
  const yf = getYunFeature(x.yun); // 当运特点（随建造年份）
  set('大玄空', `${x.yunLabel} · ${x.zuoshan}山${x.chaoxiang}向`,
    (yf ? `<div style="margin-bottom:8px;padding:7px 9px;border-left:3px solid var(--gold);background:var(--gold-a07);border-radius:0 4px 4px 0;font-size:12px;line-height:1.7;"><b style="color:var(--gold)">${yf.title}</b><span style="color:var(--muted2);font-size:10px;margin-left:6px;">${yf.years}</span><br><span style="color:var(--text)">${yf.desc}</span></div>` : '') +
    `格局：<b style="color:${pColor}">${x.pattern.name}</b>（${x.pattern.level}）<br><span style="color:var(--muted);font-size:11px">${x.pattern.detail}</span>`);
}

document.getElementById('doorSlider').addEventListener('input', rerender);
document.getElementById('yearInput').addEventListener('input', rerender);
document.getElementById('rotSlider').addEventListener('input', (e) => {
  document.getElementById('rotVal').textContent = e.target.value + '°';
  stage.setRotation(+e.target.value);
});

// ── 户型图上传 → 底图层（盘式大小自动随 layerSize 一致）──
document.getElementById('floorInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      floorplanImg = img;
      document.getElementById('floorHint').textContent =
        `已加载 ${img.width}×${img.height} · 盘式自动适配`;
      stage.render();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(f);
});

// ── 动态九宫：先天/后天盘式切换 ──
const TAIJI_DESC = {
  '后天': '后天八卦（文王）：离南·坎北·震东·兑西，配洛书九数，主方位之用——堪舆罗盘所用。',
  '先天': '先天八卦（伏羲）：乾南·坤北·离东·坎西，配先天序 1~8，主对待之体——天地定位·水火不相射·雷风相薄·山泽通气。',
};
function setTaijiMode(m) {
  taijiMode = m;
  document.querySelectorAll('#taijiPanel .seg-btn').forEach((b) => {
    const on = b.dataset.mode === m;
    b.style.background = on ? 'var(--gold)' : 'var(--panel2)';
    b.style.color = on ? '#ffffff' : 'var(--gold)';
    b.style.borderColor = on ? 'var(--gold)' : 'var(--line)';
  });
  document.getElementById('taijiDesc').textContent = TAIJI_DESC[m];
  renderDescPanels();
  stage.render();
  saveKanyuState(); // 盘式切换也落盘
}
document.querySelectorAll('#taijiPanel .seg-btn').forEach((b) => {
  b.addEventListener('click', () => setTaijiMode(b.dataset.mode));
});

// ── 动态九宫：盘式手动旋转（baguaRot 滑轨）+ 太极阴阳消长漂浮（rAF，仅可见时跑）──
// 十二消息卦阴阳消长：子(0)一阳生→巳(5)阳极→午(6)一阴生→亥(11)阴极。返回阳.level 0~1（驱动漂浮节奏）
function yangLevel(idx) { return idx <= 5 ? idx / 5 : (11 - idx) / 5; }
function taijiAnimLoop(ts) {
  if (!taijiLastT) taijiLastT = ts;
  const dt = ts - taijiLastT; taijiLastT = ts;
  const yang = yangLevel(shichenIdx);        // 当前时辰阳 level
  const speed = 0.05 * (0.6 + 0.8 * yang);   // rad/秒：阳时快·阴时慢（阴阳消长驱动漂浮节奏，非匀速装饰）
  driftPhase += speed * dt / 1000;
  stage.render();
  taijiRafId = requestAnimationFrame(taijiAnimLoop);
}
function startTaijiAnim() { if (taijiRafId) return; taijiLastT = 0; taijiRafId = requestAnimationFrame(taijiAnimLoop); }
function stopTaijiAnim() { if (taijiRafId) { cancelAnimationFrame(taijiRafId); taijiRafId = null; } }
document.getElementById('baguaRotSlider').addEventListener('input', (e) => {
  baguaRot = +e.target.value;
  document.getElementById('baguaRotVal').textContent = baguaRot + '°';
  saveKanyuState();
  if (!taijiRafId) stage.render(); // rAF 没跑时手动重画即时响应；跑着则每帧自动反映
});

// ── 罗盘（右侧栏独立小 canvas，5 模式：罗盘/河图/洛书/先天/后天）── 原站 #compass 同款
let compassMode = 'luopan';
const COMPASS_S = 284;
const COMPASS_NAME = { luopan: '罗盘', hetu: '河图', luoshu: '洛书', xiantian: '先天', houtian: '后天' };
const COMPASS_DESC = {
  luopan: '专业罗盘：外圈二十四山（子=0°每山15°顺时针）→ 中圈后天八卦 → 内圈时辰扇区 → 天池月相。红针随朝向指。',
  hetu: '河图：天一生水地六成之（北）·地二生火天七成之（南）·天三生木地八成之（东）·地四生金天九成之（西）。白点=生数，黑点=成数，中五·十。',
  luoshu: '洛书：戴九履一·左三右七·二四为肩·六八为足·中五。2/4/9 三吉数金框，随朝向旋转（朝门方位）。',
  xiantian: '先天八卦（伏羲）：乾南坤北·离东坎西，天地定位·水火不相射·雷风相薄·山泽通气，主对待之体。',
  houtian: '后天八卦（文王）：坎北离南·震东兑西，配洛书九数，主方位之用——堪舆罗盘所用。',
};
const compassCanvas = document.getElementById('compass');
const compassCtx = compassCanvas.getContext('2d');
// DPR 高清：逻辑 284×284，物理像素 ×dpr
const _cdpr = window.devicePixelRatio || 1;
compassCanvas.width = COMPASS_S * _cdpr;
compassCanvas.height = COMPASS_S * _cdpr;
compassCtx.scale(_cdpr, _cdpr);

function renderCompass() {
  const facing = +document.getElementById('doorSlider').value;
  drawCompass(compassCtx, COMPASS_S, facing, shichenIdx, compassMode); // shichenIdx：自动跟随系统 / 手动随滑块
}
function setCompassMode(m) {
  compassMode = m;
  document.querySelectorAll('#lpSwitch .lp-btn').forEach((b) => {
    const on = b.dataset.m === m;
    b.style.background = on ? 'var(--gold)' : 'var(--panel2)';
    b.style.color = on ? '#ffffff' : 'var(--gold)';
    b.style.borderColor = on ? 'var(--gold)' : 'var(--line)';
  });
  document.getElementById('lpModeName').textContent = COMPASS_NAME[m];
  document.getElementById('lpDesc').textContent = COMPASS_DESC[m];
  renderCompass();
}
document.querySelectorAll('#lpSwitch .lp-btn').forEach((b) => {
  b.addEventListener('click', () => setCompassMode(b.dataset.m));
});

// ── 当下时辰面板（时辰/干支/月相）：自动跟随系统时间，滑块手动覆盖 → 联动罗盘 luopan 时辰扇区
function updateSky() {
  const now = new Date();
  if (shichenAuto) {
    shichenIdx = shichenNow(now);
    document.getElementById('shichen').value = shichenIdx;
  } else {
    shichenIdx = +document.getElementById('shichen').value;
  }
  document.getElementById('ganzhiAll').textContent = getGanZhi(now).str;
  document.getElementById('shichenName').textContent = shichenLabel(shichenIdx);
  const age = moonAgeDays(Date.now());
  document.getElementById('moonPhase').textContent = moonPhaseName(age);
  const mi = document.getElementById('moonIcon').getContext('2d');
  mi.clearRect(0, 0, 20, 20);
  drawMoonPhase(mi, 10, 10, 9, age);
  renderCompass(); // luopan 时辰扇区随 shichenIdx 联动重画
}
document.getElementById('shichen').addEventListener('input', () => {
  shichenAuto = false; // 手动拖滑块 → 关自动
  document.getElementById('shichenAuto').checked = false;
  updateSky();
});
document.getElementById('shichenAuto').addEventListener('change', (e) => {
  shichenAuto = e.target.checked;
  updateSky();
});
setInterval(updateSky, 30000); // 每 30s 刷新（时辰/干支随系统时间推进）

// ── 黄历弹窗（宜忌/彭祖/值神/星宿/时辰吉凶）：lunar-javascript 取数 ──
const huangliOverlay = document.createElement('div');
huangliOverlay.id = 'huangliOverlay';
huangliOverlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:50;background:rgba(42,50,66,0.32);backdrop-filter:blur(3px);';
huangliOverlay.innerHTML = `
  <div class="panel" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(460px,93vw);max-height:88vh;overflow-y:auto;padding:18px 20px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <b style="color:var(--gold);font-size:19px;">📜 黄历</b>
      <span id="hlClose" style="cursor:pointer;color:var(--muted);font-size:22px;line-height:1;">×</span>
    </div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
      <input type="date" id="hlDate" style="flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--text);padding:7px 10px;border-radius:6px;font-size:13.5px;">
      <div id="hlLunar" style="color:var(--gold);font-size:15.5px;white-space:nowrap;"></div>
    </div>
    <div id="hlGZ" style="font-size:13.5px;color:var(--gold);text-align:center;margin-bottom:12px;letter-spacing:1px;"></div>
    <div id="hlBody"></div>
  </div>`;
wrap.appendChild(huangliOverlay);
huangliOverlay.addEventListener('click', (e) => { if (e.target === huangliOverlay) closeHuangli(); });

const _hlField = (label, val, color) =>
  `<div style="padding:9px 11px;background:var(--panel2);border-radius:6px;"><div style="font-size:11.5px;color:var(--muted2);margin-bottom:4px;">${label}</div><div style="font-size:13.5px;color:${color};font-weight:bold;line-height:1.5;">${val}</div></div>`;
const _luckColor = (t) => (t === '吉' ? 'var(--luck-ji)' : t === '凶' ? 'var(--luck-xiong)' : 'var(--text)');
const _toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fillHuangli(date) {
  const h = getHuangLi(date);
  document.getElementById('hlDate').value = _toDateStr(date);
  document.getElementById('hlLunar').textContent = h.lunar + (h.jieQi ? ' · ' + h.jieQi : '');
  document.getElementById('hlGZ').textContent = `${h.ganzhi} · ${h.nayin}`;
  document.getElementById('hlBody').innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:10px;padding:10px 12px;background:var(--panel2);border-radius:8px;">
      <span style="background:var(--luck-ji);color:#ffffff;padding:3px 9px;border-radius:4px;font-size:13px;font-weight:bold;flex-shrink:0;height:fit-content;">宜</span>
      <span style="font-size:13.5px;color:var(--luck-ji);line-height:1.7;">${h.yi.join(' ')}</span>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:10px;padding:10px 12px;background:var(--panel2);border-radius:8px;">
      <span style="background:var(--luck-xiong);color:#ffffff;padding:3px 9px;border-radius:4px;font-size:13px;font-weight:bold;flex-shrink:0;height:fit-content;">忌</span>
      <span style="font-size:13.5px;color:var(--luck-xiong);line-height:1.7;">${h.ji.join(' ')}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
      ${_hlField('值神', `${h.zhiShen}·${h.zhiShenType}(${h.zhiShenLuck})`, _luckColor(h.zhiShenLuck))}
      ${_hlField('建除十二神', `${h.jianChu}日`, 'var(--gold)')}
      ${_hlField('冲煞', h.chong, 'var(--text)')}
      ${_hlField('二十八宿', `${h.xiu}(${h.xiuLuck})`, _luckColor(h.xiuLuck))}
    </div>
    <div style="margin-bottom:10px;">
      <div style="font-size:12.5px;color:var(--muted2);margin-bottom:6px;">时辰吉凶 · 黄黑道</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;">
        ${h.hours.map((hr) => `
          <div style="text-align:center;padding:6px 2px;border-radius:4px;background:${hr.luck === '吉' ? 'var(--ji-bg)' : 'var(--xiong-bg)'};border:1px solid ${hr.luck === '吉' ? 'var(--ji-a40)' : 'var(--xiong-a40)'};">
            <div style="font-size:12.5px;color:var(--text);font-weight:bold;">${hr.gz}</div>
            <div style="font-size:10.5px;color:var(--muted);margin-top:1px;">${hr.god}</div>
            <div style="font-size:10.5px;color:${_luckColor(hr.luck)};">${hr.luck}</div>
          </div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
      ${_hlField('吉神宜趋', h.jiShen.join(' '), 'var(--luck-ji)')}
      ${_hlField('凶神宜忌', h.xiongSha.join(' '), 'var(--luck-xiong)')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
      ${_hlField('今日胎神', h.taiShen, 'var(--text)')}
      ${_hlField('日纳音', h.nayin, 'var(--gold)')}
    </div>
    <div style="padding:10px 12px;background:var(--gold-a07);border-left:3px solid var(--gold);border-radius:4px;">
      <div style="font-size:12.5px;color:var(--muted2);margin-bottom:4px;">彭祖百忌</div>
      <div style="font-size:13.5px;color:var(--gold-dim);line-height:1.8;">${h.pengZu}</div>
    </div>`;
}
function showHuangli(date = new Date()) { fillHuangli(date); huangliOverlay.style.display = 'block'; }
function closeHuangli() { huangliOverlay.style.display = 'none'; }
document.getElementById('huangliBtn').addEventListener('click', () => showHuangli());
document.getElementById('hlClose').addEventListener('click', closeHuangli);
document.getElementById('hlDate').addEventListener('change', (e) => {
  const [y, m, d] = e.target.value.split('-').map(Number);
  if (y) fillHuangli(new Date(y, m - 1, d));
});

// ── 格局标注逻辑：添加/列表/详情/移动/删除 ──
const _gjTypesWrap = document.getElementById('gjTypes');
function _renderGjTypeBtns() {
  _gjTypesWrap.innerHTML = '';
  for (const k in ROOM_TYPES) {
    const rt = ROOM_TYPES[k];
    const b = document.createElement('button');
    b.dataset.k = k;
    b.style.cssText = `padding:5px 8px;border-radius:6px;border:1px solid ${rt.col}66;background:var(--ping-bg);color:var(--text);font-size:11px;cursor:pointer;`;
    b.innerHTML = `<b style="color:${rt.col}">${rt.mark}</b> ${rt.name}`;
    b.addEventListener('click', () => {
      if (gjPlacing === k) { gjPlacing = null; b.style.borderColor = rt.col + '66'; b.style.background = 'var(--ping-bg)'; document.getElementById('gjHint').style.display = 'none'; return; }
      gjPlacing = k; gjMoving = null;
      _gjTypesWrap.querySelectorAll('button').forEach((x) => { const xr = ROOM_TYPES[x.dataset.k]; x.style.borderColor = xr.col + '66'; x.style.background = 'var(--ping-bg)'; });
      b.style.borderColor = 'var(--gold)'; b.style.background = 'rgba(255,176,32,0.15)';
      document.getElementById('gjHintName').textContent = rt.name;
      document.getElementById('gjHintTail').textContent = '再点类型取消';
      document.getElementById('gjHint').style.display = '';
    });
    _gjTypesWrap.appendChild(b);
  }
}
document.getElementById('gjAddBtn').addEventListener('click', () => {
  const opening = _gjTypesWrap.style.display === 'none';
  _gjTypesWrap.style.display = opening ? 'flex' : 'none';
  if (opening && !_gjTypesWrap.innerHTML) _renderGjTypeBtns();
  if (!opening) { gjPlacing = null; document.getElementById('gjHint').style.display = 'none'; }
});

function renderGjList() {
  const box = document.getElementById('gjList');
  if (!rooms.length) {
    box.innerHTML = '<div style="font-size:10.5px;color:var(--muted2);margin-top:6px;line-height:1.6;">未标注。点「+ 添加格局」选房间类型，再点画布放置，自动按五行生克 + 八宅 + 流年三层评判吉凶。</div>';
    return;
  }
  if (!data.bazhai || !data.yearFx) return;
  const innerR = Math.max(12, layerSize / 2 * 0.32);
  box.innerHTML = rooms.map((r) => {
    const rt = ROOM_TYPES[r.type];
    const j = judgeRoom(r, data.bazhai, data.yearFx, innerR);
    const good = j.pts >= 0;
    return `<div class="gj-item" data-id="${r.id}" style="display:flex;align-items:center;gap:6px;font-size:11px;padding:5px 6px;border-radius:6px;margin:4px 0;background:var(--panel2);border:1px solid var(--line);cursor:pointer;">
      <span style="background:${rt.col}22;color:${rt.col};border-radius:5px;font-weight:700;padding:2px 5px;">${rt.mark}</span>
      <span style="color:var(--text);font-weight:600;">${rt.name}</span>
      <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${ELEM_COLORS[rt.elem]}22;color:${ELEM_COLORS[rt.elem]};">${rt.elem}</span>
      <span style="flex:1;color:var(--muted);font-size:10px;">${j.gong}宫</span>
      <span style="font-weight:700;color:${good ? 'var(--luck-ji)' : 'var(--luck-xiong)'};">${j.pts > 0 ? '+' : ''}${j.pts}</span>
    </div>`;
  }).join('');
  box.querySelectorAll('.gj-item').forEach((el) => {
    el.addEventListener('click', () => {
      const r = rooms.find((rr) => rr.id === +el.dataset.id);
      if (r) showRoomDetail(r);
    });
  });
}
function showRoomDetail(r) {
  const rt = ROOM_TYPES[r.type];
  const j = judgeRoom(r, data.bazhai, data.yearFx, Math.max(12, layerSize / 2 * 0.32));
  const hc = j.pts >= 0 ? 'var(--luck-ji)' : 'var(--luck-xiong)';
  fillDetail(`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:22px;font-weight:bold;"><span style="color:${rt.col}">${rt.mark} ${rt.name}</span><span style="font-size:15px;color:${hc};margin-left:10px;">${j.pts > 0 ? '+' : ''}${j.pts}分</span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px;">${j.gong}宫 · 五行<span style="color:${ELEM_COLORS[rt.elem]}">${rt.elem}</span></div>
      </div>
      <span id="detailClose" style="cursor:pointer;color:var(--muted);font-size:22px;line-height:1;">×</span>
    </div>
    <div style="font-size:13px;color:var(--text);margin-top:12px;">格局评判（五行生克 + 八宅星 + 流年星 三层）：</div>
    <div style="font-size:12px;line-height:2.1;margin-top:4px;">${j.reasons.map((s) => `<div style="color:var(--muted);">· ${s}</div>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="gjMoveBtn" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--gold);background:var(--gold-a07);color:var(--gold);font-size:12px;cursor:pointer;">↔ 移动位置</button>
      <button id="gjDelBtn" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--luck-xiong);background:var(--xiong-bg);color:var(--luck-xiong);font-size:12px;cursor:pointer;">🗑 删除</button>
    </div>
  `);
  document.getElementById('gjMoveBtn').onclick = () => {
    closeDetail();
    gjMoving = r.id; gjPlacing = null;
    document.getElementById('gjHintName').textContent = rt.name;
    document.getElementById('gjHintTail').textContent = '点击画布新位置';
    document.getElementById('gjHint').style.display = '';
  };
  document.getElementById('gjDelBtn').onclick = () => {
    rooms = rooms.filter((rr) => rr.id !== r.id);
    closeDetail();
    rerender(); // 房间增删移 → 重算宅局指数（门主灶）+ 刷新列表与全 UI
  };
}
renderGjList(); // 初始空提示
// ── A-4b 右侧栏「八宅吉凶」九宫全盘卡：点画布八宅方位/中宫 → 此卡高亮 + 展开详情 ──
let bzSelGong = null;                                                 // 当前选中宫（null=仅全盘概览）
const BZ_GRID = ['乾', '坎', '艮', '兑', null, '震', '坤', '离', '巽']; // 上北下南·左西右东（同画布方位）
function palaceOf(gong) { return data.bazhai && data.bazhai.palaces.find((p) => p.gong === gong); }
// 八星五行描述（图示"火次凶星/木第一吉"样式）：五行 + nature，生气"第一吉星"省"星"作"第一吉"
function elemDesc(info) {
  const nat = getBazhaiDetail(info.name).nature;
  return info.wuxing + (nat === '第一吉星' ? '第一吉' : nat);
}
function renderBazhaiGrid(selGong) {
  const panel = document.getElementById('bazhaiGridPanel');
  if (!panel || !data.bazhai) return;
  if (selGong !== undefined) bzSelGong = selGong;
  const b = data.bazhai;
  const zuoDir = palaceOf(b.zuoGua).dir, xiangDir = palaceOf(b.xiangGua).dir;

  const cells = BZ_GRID.map((gong) => {
    if (!gong) { // 中宫：宅名 + 坐向 + 歌诀入口
      const sel = bzSelGong === '中';
      return `<div class="bzc bzc-c" data-gong="中" style="background:var(--gold-a12);border-color:${sel ? 'var(--gold)' : 'var(--gold-a45)'};${sel ? 'box-shadow:0 0 0 2px var(--gold) inset;' : ''}">
        <div style="font-size:16px;color:var(--gold);font-weight:bold;">${b.zuoGua}宅</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:2px;">坐${zuoDir}朝${xiangDir}</div>
        <div style="font-size:9.5px;color:var(--gold-dim);margin-top:3px;opacity:.8;">扇形数诀</div>
      </div>`;
    }
    const p = palaceOf(gong);
    const ji = p.info.ji;
    const hc = ji === '吉' ? 'var(--luck-ji)' : 'var(--luck-xiong)';
    const bg = ji === '吉' ? 'var(--ji-bg)' : 'var(--xiong-bg)';
    const bd = ji === '吉' ? 'var(--ji-a40)' : 'var(--xiong-a40)';
    const sel = gong === bzSelGong;
    return `<div class="bzc" data-gong="${gong}" style="background:${bg};border-color:${sel ? 'var(--gold)' : bd};${sel ? 'box-shadow:0 0 0 2px var(--gold) inset;' : ''}">
      <div style="font-size:11px;color:var(--muted);">${gong}${p.dir}</div>
      <div style="font-size:15px;font-weight:bold;color:${hc};margin-top:1px;">${p.info.name}</div>
      <div style="font-size:9.5px;color:${hc};opacity:.85;margin-top:1px;">${ji} · ${elemDesc(p.info)}</div>
    </div>`;
  }).join('');

  let detail = '';
  if (bzSelGong === '中') {
    detail = `<div class="bzc-d">
      <b style="color:var(--gold);font-size:14px;">大游年歌诀<span style="font-size:11px;color:var(--muted);font-weight:normal;margin-left:6px;">${b.zuoGua}宅</span></b>
      <div style="font-size:11px;color:var(--muted);margin-top:3px;">以坐山为伏位顺时针布八星 · 《八宅明镜》</div>
      <div style="margin-top:8px;padding:9px 11px;border-left:3px solid var(--gold);background:var(--gold-a07);color:var(--gold);line-height:2;letter-spacing:.5px;font-size:12.5px;">${DAYOUNIAN_SONG}</div>
    </div>`;
  } else if (bzSelGong) {
    const p = palaceOf(bzSelGong);
    const d = getBazhaiDetail(p.info.name);
    const hc = d.luck === '吉' ? 'var(--luck-ji)' : 'var(--luck-xiong)';
    detail = `<div class="bzc-d">
      <b style="font-size:15px;color:${hc};">${p.info.name}<span style="font-size:11px;color:var(--muted);font-weight:normal;margin-left:6px;">${bzSelGong}宫·${p.dir}</span></b>
      <div style="font-size:11px;color:var(--muted);margin-top:3px;">五行${d.elem} · ${d.beidou}星 · ${d.nature} · <b style="color:${hc}">${d.luck}</b></div>
      <div style="margin-top:6px;">${d.desc}</div>
      <div style="margin-top:6px;"><b style="color:var(--luck-ji);">宜　</b>${d.suit}</div>
      <div style="margin-top:3px;"><b style="color:var(--luck-xiong);">忌　</b>${d.avoid}</div>
      <div style="margin-top:3px;"><b style="color:var(--gold);">解　</b>${d.resolve}</div>
      <div style="margin-top:8px;padding:8px 10px;border-left:3px solid var(--gold);background:var(--gold-a07);color:var(--gold);line-height:1.8;">「${d.classic}」<div style="font-size:10px;color:var(--muted2);margin-top:3px;">——《八宅明镜》（通行传本）</div></div>
    </div>`;
  } else {
    detail = `<div style="font-size:10.5px;color:var(--muted2);text-align:center;padding:9px 0 2px;line-height:1.6;">点任一方位看星曜宜忌 · 点中宫看大游年歌诀</div>`;
  }

  panel.innerHTML = `<style>
.bzc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;}
.bzc{min-height:64px;padding:6px 3px;border:1px solid;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;text-align:center;line-height:1.25;transition:filter .15s;}
.bzc:hover{filter:brightness(1.18);}
.bzc-d{margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:12px;line-height:1.8;color:var(--text);}
</style>
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <b style="color:var(--gold);">八宅吉凶</b>
      <span style="font-size:11px;color:var(--muted);">${b.zuoGua}宅 · 坐${zuoDir}朝${xiangDir}</span>
    </div>
    <div style="font-size:10.5px;color:var(--muted2);margin:5px 0 9px;line-height:1.6;">以门朝向定坐山，按大游年布八星：生气/天医/延年/伏位=四吉（绿），绝命/五鬼/六煞/祸害=四凶（红）。</div>
    <div class="bzc-grid">${cells}</div>
    ${detail}`;
  panel.querySelectorAll('.bzc[data-gong]').forEach((el) => {
    el.addEventListener('click', () => renderBazhaiGrid(el.dataset.gong));
  });
}

// ── A-4c 右侧栏「九星飞布」九宫全盘卡：勾「九星」图层标签出现，点宫格出飞星详情 ──
let jxSelGong = null;                                                   // 当前选中宫（null=仅全盘概览）
const JX_GRID = ['乾', '坎', '艮', '兑', null, '震', '坤', '离', '巽'];  // 上北下南·左西右东（同八宅卡·参考图地理方位）
function jxPalaceOf(gong) { return data.yearFx && data.yearFx.palaces.find((p) => p.gong === gong); }
function jxDir(gong) { const b = BAGUA_BY_NAME[gong]; return b ? b.dir : '中'; }
// 九星本色（按星数 1~9，移植 layers.js starColor）：一/六/八白近白，二黑灰，三碧青，四绿绿，五黄金，七赤红，九紫紫
function jxStarColor(n) {
  return starColor(n); // 素绢霁青版九星色，palette.js 统一
}
function jxLuckColor(ji) {
  return ji === '大吉' || ji === '吉' ? 'var(--luck-ji)' : ji === '大凶' || ji === '凶' ? 'var(--luck-xiong)' : 'var(--muted)';
}
function jxCellBg(ji) {
  if (ji === '大吉') return 'var(--ji-bg-da)';
  if (ji === '吉') return 'var(--ji-bg)';
  if (ji === '大凶') return 'var(--xiong-bg-da)';
  if (ji === '凶') return 'var(--xiong-bg)';
  return 'var(--ping-bg)'; // 平
}
function renderJiuxingGrid(selGong) {
  const panel = document.getElementById('jiuxingGridPanel');
  if (!panel || !data.yearFx) return;
  if (selGong !== undefined) jxSelGong = selGong;
  const fx = data.yearFx;

  const cells = JX_GRID.map((gong) => {
    const isCenter = !gong;
    const p = isCenter ? null : jxPalaceOf(gong);
    const info = isCenter ? fx.centerInfo : p.info;
    const star = isCenter ? fx.centerStar : p.star;
    const sel = isCenter ? (jxSelGong === '中') : (gong === jxSelGong);
    const dirTxt = isCenter ? '中宫' : (gong + jxDir(gong));
    const bg = isCenter ? 'var(--gold-a12)' : jxCellBg(info.ji);
    const bd = isCenter ? 'var(--gold-a45)' : 'var(--line)';
    return `<div class="jxc" data-gong="${isCenter ? '中' : gong}" style="background:${bg};border-color:${sel ? 'var(--gold)' : bd};${sel ? 'box-shadow:0 0 0 2px var(--gold) inset;' : ''}">
      <div style="font-size:11px;color:var(--muted);">${dirTxt}</div>
      <div style="font-size:15px;font-weight:bold;color:${jxStarColor(star)};margin-top:1px;">${info.star}</div>
      <div style="font-size:9.5px;color:${jxLuckColor(info.ji)};opacity:.9;margin-top:1px;">${info.wuxing}${info.ji} ${info.meaning.replace(/·/g, '')}</div>
    </div>`;
  }).join('');

  let detail = '';
  if (jxSelGong) {
    const isCenter = jxSelGong === '中';
    const p = isCenter ? null : jxPalaceOf(jxSelGong);
    const info = isCenter ? fx.centerInfo : p.info;
    const star = isCenter ? fx.centerStar : p.star;
    const dd = getJiuxingDetail(info.star);
    const hc = jxLuckColor(info.ji);
    const dirTxt = isCenter ? '中宫' : (jxSelGong + jxDir(jxSelGong));
    detail = `<div class="jxc-d">
      <b style="font-size:15px;color:${jxStarColor(star)};">${info.star}<span style="font-size:11px;color:var(--muted);font-weight:normal;margin-left:6px;">${dirTxt}${isCenter ? ' · 入中' : ''}</span></b>
      <div style="font-size:11px;color:var(--muted);margin-top:3px;">${info.beidou}星 · 五行${info.wuxing} · <b style="color:${hc}">${info.ji}</b> · ${info.meaning}</div>
      ${dd ? `<div style="margin-top:6px;">${dd.desc}</div>
      <div style="margin-top:6px;"><b style="color:var(--luck-ji);">宜　</b>${dd.suit}</div>
      <div style="margin-top:3px;"><b style="color:var(--luck-xiong);">忌　</b>${dd.avoid}</div>
      <div style="margin-top:3px;"><b style="color:var(--gold);">解　</b>${dd.resolve}</div>` : ''}
    </div>`;
  } else {
    detail = `<div style="font-size:10.5px;color:var(--muted2);text-align:center;padding:9px 0 2px;line-height:1.6;">${fx.desc} · 点任一宫看飞星星曜详情</div>`;
  }

  panel.innerHTML = `<style>
.jxc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;}
.jxc{min-height:64px;padding:6px 3px;border:1px solid;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;text-align:center;line-height:1.25;transition:filter .15s;}
.jxc:hover{filter:brightness(1.18);}
.jxc-d{margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:12px;line-height:1.8;color:var(--text);}
</style>
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <b style="color:var(--gold);">九星飞布</b>
      <span style="font-size:11px;color:var(--muted);">${fx.desc}</span>
    </div>
    <div style="font-size:10.5px;color:var(--muted2);margin:5px 0 9px;line-height:1.6;">年紫白飞星——值年星入中宫顺飞（中→乾→兑→艮→离→坎→坤→震→巽）。宫位为地理绝对方位，不随门朝向。</div>
    <div class="jxc-grid">${cells}</div>
    ${detail}`;
  panel.querySelectorAll('.jxc[data-gong]').forEach((el) => {
    el.addEventListener('click', () => renderJiuxingGrid(el.dataset.gong));
  });
}

// ── A-4 点击八宅扇形/中心 → 弹星曜详情（原站 showDetail 同款字段）──
const detailOverlay = document.createElement('div');
detailOverlay.id = 'detailOverlay';
detailOverlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:50;background:rgba(42,50,66,0.32);backdrop-filter:blur(3px);';
detailOverlay.innerHTML = `<div class="panel" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,92vw);max-height:86vh;overflow-y:auto;padding:18px 20px;"><div id="detailBody"></div></div>`;
wrap.appendChild(detailOverlay);
detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) closeDetail(); });

function closeDetail() { detailOverlay.style.display = 'none'; }
function fillDetail(innerHtml) {
  document.getElementById('detailBody').innerHTML = innerHtml;
  detailOverlay.style.display = 'block';
  const c = document.getElementById('detailClose');
  if (c) c.onclick = closeDetail;
}
function showStarDetail(starName, gong, dir) {
  // 详情移至右侧栏「八宅吉凶」卡内（高亮该宫 + 展开宜忌古诀），不再弹全屏遮罩
  renderBazhaiGrid(gong);
}
function showSongDetail(doorGua) {
  // 歌诀移至右侧栏「八宅吉凶」卡内中宫详情区
  renderBazhaiGrid('中');
}
// canvas 点击：八宅扇形→星详情 / 中心圆→歌诀（盘式不随 rotation 转，故命中检测不含 rotation）
document.getElementById('stage').addEventListener('click', (e) => {
  if (stage._didDrag) return; // 拖拽平移时不触发
  const { x, y } = stage.screenToDisk(e.clientX, e.clientY);
  // 格局标注：放置/移动优先（不受八宅开关影响）
  if (gjPlacing) {
    const rt = ROOM_TYPES[gjPlacing];
    rooms.push({ id: roomSeq++, type: gjPlacing, elem: rt.elem, x, y });
    gjPlacing = null;
    document.getElementById('gjHint').style.display = 'none';
    document.querySelectorAll('#gjTypes button').forEach((b) => { const br = ROOM_TYPES[b.dataset.k]; b.style.borderColor = br.col + '66'; b.style.background = 'var(--ping-bg)'; });
    rerender(); // 房间增删移 → 重算宅局指数（门主灶）+ 刷新列表与全 UI
    return;
  }
  if (gjMoving !== null) {
    const r = rooms.find((rr) => rr.id === gjMoving);
    if (r) { r.x = x; r.y = y; }
    gjMoving = null;
    document.getElementById('gjHint').style.display = 'none';
    rerender(); // 房间增删移 → 重算宅局指数（门主灶）+ 刷新列表与全 UI
    return;
  }
  const bz = stage.layers.find((l) => l.name === '八宅');
  if (!bz || !bz.visible || !data.bazhai) return;
  const radius = layerSize / 2;
  const r = Math.hypot(x, y);
  const rInner = radius * 0.32;
  if (r <= rInner) { // 中心圆 → 大游年歌诀
    showSongDetail(degToGua(+document.getElementById('doorSlider').value));
    return;
  }
  if (r > radius * 0.965) return; // 超出八宅扇形环
  // 命中扇形：上=离(南)起算顺时针，每 45° 一宫
  let rel = Math.atan2(y, x) + Math.PI / 2;
  rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const i = Math.floor(rel / (Math.PI / 4)) % 8;
  const gong = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'][i]; // 上北下南·点击命中顺序同盘式
  const p = data.bazhai.palaces.find((pp) => pp.gong === gong);
  if (p) showStarDetail(p.info.name, gong, p.dir);
});

loadKanyuState(); // 恢复上次定盘（朝向/年份/格局/盘式/图层），再走首渲染
rerender();
setTaijiMode(taijiMode); // load 后的盘式（默认后天）
setCompassMode('luopan');
updateSky();
