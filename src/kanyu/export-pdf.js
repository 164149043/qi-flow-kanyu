/**
 * export-pdf.js —— 堪舆页「导出 PDF」（v4 · 截图式深度优化 + 三层解读）
 * ============================================================
 * v3 痛点：超长详解按像素切片→腰斩九宫/文字；纯数据罗列无解读。
 * v4 改进：
 *   ① 详解按 .detail-db 块单独截图 + placeBlock 流式拼页（块间不切，彻底告别腰斩）；
 *   ② 加三层解读——宅局总评(summary)+板块解读(interp)+调理建议汇总(advice)，模板化话术不调 AI；
 *   ③ 布局精修（字号/留白/层级/语义色）。
 * 仍白底直接下载（jsPDF）。盘式截图临时浅底 toDataURL。
 */
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { getBazhaiDetail } from './core/fengshui/bazhai-detail.js';
import { getJiuxingDetail } from './core/fengshui/feixing-detail.js';
import { getYunFeature } from './core/fengshui/yun-feature.js';
import { classifyMountain } from './core/fengshui/twentyfour.js';
import { ROOM_TYPES, judgeRoom } from './core/fengshui/geju.js';
import { BAGUA_BY_NAME } from './core/index.js';

const C = {
  text: '#1a1a1a', muted: '#5a5a5a', muted2: '#888',
  gold: '#8a6a1a', goldLight: '#b8860b',
  ji: '#2e7d32', xiong: '#c62828', ping: '#666',
  panel: '#f6f3ec', line: '#d9cfb8', lineSoft: '#e8e2d4',
  shotBg: '#f3eedf',
};
const luckColor = (ji) => (ji === '吉' || ji === '大吉' ? C.ji : ji === '凶' || ji === '大凶' ? C.xiong : C.ping);
const GRID9 = ['乾', '坎', '艮', '兑', null, '震', '坤', '离', '巽'];
const ORDER8 = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'];
const LUO_ORDER = ['中', '乾', '兑', '艮', '离', '坎', '坤', '震', '巽'];
const dir = (g) => (BAGUA_BY_NAME[g] ? BAGUA_BY_NAME[g].dir : '');

// ── ① 宅局总评（封面下，2-3 句结论）──
function summaryHTML(x, score, bazhai, yearFx) {
  const p = [];
  p.push(`坐${x.zuoshan}朝${x.chaoxiang}，${x.yunLabel}。`);
  if (x.pattern.level === '大吉') p.push(`玄空得<b style="color:${C.ji};">${x.pattern.name}</b>，丁财两旺之上吉之局；`);
  else if (x.pattern.level === '凶') p.push(`玄空犯<b style="color:${C.xiong};">${x.pattern.name}</b>，丁财俱退，须赖实地峦头（后山前水）补救；`);
  else p.push(`玄空为${x.pattern.name}，气运平和，吉凶随流年与布置而定；`);
  const dp = yearFx.palaces.find((q) => q.gong === bazhai.xiangGua);
  if (dp) {
    const s = dp.info;
    if (s.ji === '大凶' || s.ji === '凶') p.push(`然门方流年临<b style="color:${C.xiong};">${s.star}</b>（${s.meaning}），本年内宜按下方调理建议化解；`);
    else p.push(`门方流年临<b style="color:${C.ji};">${s.star}</b>，主${s.meaning}；`);
  }
  p.push(`综合参考指数 <b style="color:${C.gold};">${score.score}</b>（${score.level}），仅供参考，须结合宅主命局与流年细断。`);
  return `<section class="sec"><h2>★ 宅局总评</h2><div class="summary">${p.join('')}</div></section>`;
}

// ── 截图板块（户型图/盘式/罗盘）──
function coverHTML(x, genDate) {
  const d = `${genDate.getFullYear()}-${String(genDate.getMonth() + 1).padStart(2, '0')}-${String(genDate.getDate()).padStart(2, '0')}`;
  return `<section class="sec cover">
    <h1>堪舆宅局诊断报告</h1>
    <div class="sub">寻 炁 · 堪 舆 排 盘</div>
    <table class="kv">
      <tr><td>坐 山</td><td><b>${x.zuoshan}</b></td><td>朝 向</td><td><b>${x.chaoxiang}</b></td></tr>
      <tr><td>建造年份</td><td><b>${x.buildYear}</b></td><td>当 运</td><td><b>${x.yunLabel}</b></td></tr>
      <tr><td>报告日期</td><td><b>${d}</b></td><td></td><td></td></tr>
    </table>
    <p class="note">本报告依《八宅明镜》《沈氏玄空学》等公开理气生成。宅局参考指数非绝对定论，须结合宅主命局与流年细断。</p>
  </section>`;
}
function shotHTML(title, imgId, url) {
  return `<section class="sec"><h2>${title}</h2><div class="shot"><img id="${imgId}" src="${url || ''}"/></div></section>`;
}

// ── 八宅九宫图 + 板块解读 ──
function bazhaiGridHTML(bazhai) {
  const cell = (gong) => {
    if (!gong) return `<div class="cell center"><div class="big">${bazhai.zuoGua}宅</div><div class="sm">坐${dir(bazhai.zuoGua)}朝${dir(bazhai.xiangGua)}</div></div>`;
    const p = bazhai.palaces.find((x) => x.gong === gong);
    const col = luckColor(p.info.ji);
    return `<div class="cell" style="border-color:${col};"><div class="sm">${gong}·${dir(gong)}</div><div class="big" style="color:${col};">${p.info.name}</div></div>`;
  };
  const xiang = bazhai.palaces.find((x) => x.gong === bazhai.xiangGua);
  const xd = getBazhaiDetail(xiang.info.name);
  const interp = `<div class="interp">门开<b style="color:${luckColor(xiang.info.ji)};">${xiang.info.name}</b>方（${xiang.info.ji}位）——${xd.nature}，主${xd.desc.slice(0, 30)}…。宅以门为冠，门临吉方则纳吉、临凶方则受煞。</div>`;
  return `<section class="sec"><h2>四、八宅吉凶（大游年）</h2>
    <div class="cap">${bazhai.zuoGua}宅 · 坐${dir(bazhai.zuoGua)}朝${dir(bazhai.xiangGua)} · 四吉方宜居·四凶方宜厨卫储</div>
    <div class="grid9">${GRID9.map(cell).join('')}</div>${interp}</section>`;
}

// ── 八宅详解：8 个 .detail-db 块（拼页不腰斩）──
function bazhaiDetailSection(bazhai) {
  const head = `<section class="sec"><h2>八宅八方详解</h2><div class="cap">逐一列八宫九星之主旨、宜、忌、化解与古诀</div></section>`;
  const blocks = ORDER8.map((gong) => {
    const p = bazhai.palaces.find((x) => x.gong === gong);
    if (!p) return '';
    const d = getBazhaiDetail(p.info.name);
    const col = luckColor(d.luck);
    return `<div class="detail-db" style="border-left-color:${col};">
      <div class="db-h"><b style="color:${col};">${p.info.name}</b><span class="db-m">${gong}宫·${dir(gong)} · ${d.elem}·${d.beidou}星·${d.nature} · ${d.luck}</span></div>
      <div class="db-d">${d.desc}</div>
      <div><span class="lbl" style="color:${C.ji};">宜</span>${d.suit}</div>
      <div><span class="lbl" style="color:${C.xiong};">忌</span>${d.avoid}</div>
      <div><span class="lbl" style="color:${C.gold};">解</span>${d.resolve}</div>
      <div class="classic">「${d.classic}」<span class="src">——《八宅明镜》</span></div>
    </div>`;
  }).join('');
  return head + blocks;
}

function jiuxingGridHTML(yearFx) {
  const cell = (gong) => {
    if (!gong) { const c = yearFx.centerInfo; return `<div class="cell center"><div class="big" style="color:${C.gold};">${c.star}</div><div class="sm">入中·${c.wuxing}</div></div>`; }
    const p = yearFx.palaces.find((x) => x.gong === gong);
    const col = luckColor(p.info.ji);
    return `<div class="cell" style="border-color:${col};"><div class="sm">${gong}·${dir(gong)}</div><div class="big" style="color:${col};">${p.info.star}</div></div>`;
  };
  return `<section class="sec"><h2>五、九星飞布（年紫白·${yearFx.year}）</h2>
    <div class="cap">${yearFx.desc} · 坎北离南固定方位</div>
    <div class="grid9">${GRID9.map(cell).join('')}</div></section>`;
}
function jiuxingDetailSection(yearFx, bazhai) {
  const head = `<section class="sec"><h2>九星九宫详解</h2><div class="cap">门方所临流年星已影响当年宅运，重点参看</div></section>`;
  const xiangGua = bazhai.xiangGua;
  const all = [{ gong: '中', info: yearFx.centerInfo }].concat(yearFx.palaces.map((p) => ({ gong: p.gong, info: p.info })));
  const blocks = all.map(({ gong, info }) => {
    const dd = getJiuxingDetail(info.star);
    if (!dd) return '';
    const col = luckColor(info.ji);
    const dt = gong === '中' ? '中宫·入中' : `${gong}·${dir(gong)}`;
    const flag = gong === xiangGua ? '<span class="flag">门方</span>' : '';
    return `<div class="detail-db" style="border-left-color:${col};">
      <div class="db-h"><b style="color:${col};">${info.star}</b><span class="db-m">${dt} · ${info.beidou}星·五行${info.wuxing}·${info.ji}</span>${flag}</div>
      <div class="db-m" style="margin:2px 0;">${info.meaning}</div>
      <div class="db-d">${dd.desc}</div>
      <div><span class="lbl" style="color:${C.ji};">宜</span>${dd.suit}</div>
      <div><span class="lbl" style="color:${C.xiong};">忌</span>${dd.avoid}</div>
      <div><span class="lbl" style="color:${C.gold};">解</span>${dd.resolve}</div>
    </div>`;
  }).join('');
  return head + blocks;
}

function xuankongHTML(x) {
  const yf = getYunFeature(x.yun);
  const pCol = luckColor(x.pattern.level);
  const panLine = (label, pan) =>
    `<div class="panrow"><b>${label}</b>` +
    LUO_ORDER.map((g) => `<span class="pancell"><span class="panG">${g}</span><b>${pan[g] || 0}</b></span>`).join('') + `</div>`;
  const interp = `<div class="interp">${x.pattern.detail}。山管人丁水管财——山星到山旺丁、向星到向旺财，反之则退。</div>`;
  return `<section class="sec"><h2>六、玄空宅命盘</h2>
    <div class="cap">${x.yunLabel} · 坐<b>${x.zuoshan}</b>朝<b>${x.chaoxiang}</b></div>
    ${yf ? `<div class="yfcard"><b style="color:${C.gold};">${yf.title}</b><span class="yr">${yf.years}</span><br>${yf.desc}</div>` : ''}
    <div class="cap" style="margin-top:8px;">格局：<b style="color:${pCol};font-size:15px;">${x.pattern.name}</b>（${x.pattern.level}）</div>
    <div class="pancap">运 / 山 / 向 三盘（洛书九宫）</div>
    ${panLine('运', x.yunPan)}${panLine('山', x.shanPan)}${panLine('向', x.xiangPan)}${interp}
  </section>`;
}

function scoreHTML(score) {
  const lvCol = ['大吉', '吉'].includes(score.level) ? C.ji : ['凶', '大凶'].includes(score.level) ? C.xiong : C.ping;
  const row = (l) => `<div class="scrow"><span class="scn">${l.name} <em>${l.note}</em></span><b>${l.score}</b></div>`;
  return `<section class="sec"><h2>七、宅局参考指数</h2>
    <div class="sctop"><span>综合参考</span><b style="color:${lvCol};">${score.score}</b><b style="color:${lvCol};font-weight:normal;">${score.level}</b></div>
    <div class="cap" style="margin:2px 0 8px;">综合参考，须结合宅主命局与流年细断，非绝对定论</div>
    <div class="grp">▎宅本盘（固有·随建造定死）</div>${score.groups.basePans.map(row).join('')}
    <div class="grp">▎流年提示（随流年变）</div>${score.groups.flowYear.map(row).join('')}
    <div class="ref">立向参考（不计分）：${score.reference.text}</div>
  </section>`;
}

function roomsHTML(rooms, bazhai, yearFx, innerR) {
  if (!rooms.length) return `<section class="sec"><h2>八、格局标注评判</h2><div class="cap">未标注房间。</div></section>`;
  const blocks = rooms.map((r) => {
    const rt = ROOM_TYPES[r.type];
    const j = judgeRoom(r, bazhai, yearFx, innerR);
    const col = j.pts >= 0 ? C.ji : C.xiong;
    return `<div class="detail-db" style="border-left-color:${rt.col};">
      <div class="db-h"><b style="color:${rt.col};">${rt.name}</b><span class="db-m">五行${rt.elem} · ${j.gong}宫·${dir(j.gong)}</span><b style="float:right;color:${col};">${j.pts > 0 ? '+' : ''}${j.pts}</b></div>
      <div class="db-m">${j.reasons.map((s) => `· ${s}`).join('；')}</div>
    </div>`;
  }).join('');
  return `<section class="sec"><h2>八、格局标注评判</h2><div class="cap">五行生克 + 八宅星 + 流年星 三层评判</div></section>${blocks}`;
}

// ── ③ 调理建议汇总（凶位/凶星 resolve 清单）──
function adviceHTML(bazhai, yearFx, x) {
  const items = [];
  const dp = yearFx.palaces.find((q) => q.gong === bazhai.xiangGua);
  if (dp && (dp.info.ji === '大凶' || dp.info.ji === '凶')) {
    const dd = getJiuxingDetail(dp.info.star);
    items.push({ k: `门方流年临${dp.info.star}（${dp.info.ji}）`, v: dd ? dd.resolve : '宜静不宜动，镇压制化' });
  }
  bazhai.palaces.forEach((p) => {
    if (p.info.ji === '凶') {
      const d = getBazhaiDetail(p.info.name);
      if (d && d.resolve) items.push({ k: `${p.gong}方·${p.info.name}（八宅凶位）`, v: d.resolve });
    }
  });
  const m = classifyMountain(x.zuoshan);
  if (m.luck === '凶') items.push({ k: `坐${x.zuoshan}·${m.tag}`, v: m.desc });
  if (x.pattern.level === '凶') items.push({ k: `玄空${x.pattern.name}`, v: '以后山前水之峦头补救，或择吉元重修' });
  if (!items.length) return `<section class="sec"><h2>九、调理建议</h2><div class="cap">本局无明显凶煞须化解，保持吉位纳气即可。</div></section>`;
  return `<section class="sec"><h2>九、调理建议汇总</h2><div class="cap">依凶位·凶星·凶局之化解法，按需取用</div>${items.map((i) => `<div class="detail-db advice" style="border-left-color:${C.gold};"><div class="db-h"><b style="color:${C.xiong};">▸ ${i.k}</b></div><div class="db-d">${i.v}</div></div>`).join('')}</section>`;
}

function m24HTML(x) {
  const m = classifyMountain(x.zuoshan);
  const col = luckColor(m.luck === '吉' ? '吉' : m.luck === '凶' ? '凶' : '平');
  return `<section class="sec"><h2>十、二十四山·立向参考</h2>
    <div class="cap">坐 <b style="font-size:18px;color:${C.gold};">${x.zuoshan}</b> · <b style="color:${col};">${m.tag}</b>（${m.luck}）</div>
    <div class="db-d">${m.desc}</div></section>`;
}

const STYLE = `
* { box-sizing: border-box; }
#pdfReport { font-family: 'LXGW WenKai Lite','KaiTi','STKaiti','FangSong',serif; color: ${C.text}; background: #fff; font-size: 13px; line-height: 1.75; }
.sec { padding: 6px 0 12px; margin-bottom: 8px; border-bottom: 1px solid ${C.lineSoft}; }
.cover { text-align: center; border-bottom: 2px solid ${C.goldLight}; padding-bottom: 18px; }
h1 { color: ${C.gold}; font-size: 26px; letter-spacing: 6px; margin: 24px 0 4px; }
h2 { color: ${C.gold}; font-size: 16px; border-left: 4px solid ${C.goldLight}; padding-left: 8px; margin: 0 0 10px; }
.sub { color: ${C.muted}; letter-spacing: 4px; font-size: 12px; margin-bottom: 20px; }
.cap { color: ${C.muted}; font-size: 11.5px; margin-bottom: 8px; }
.note { color: ${C.muted2}; font-size: 11px; line-height: 1.8; margin-top: 16px; }
.summary { font-size: 13.5px; line-height: 2; padding: 11px 15px; background: ${C.panel}; border-left: 4px solid ${C.gold}; border-radius: 0 6px 6px 0; color: ${C.text}; }
.interp { color: ${C.muted}; font-size: 11.5px; margin-top: 8px; padding: 6px 10px; background: #fff; border-left: 2px solid ${C.goldLight}; line-height: 1.8; }
.kv { width: 100%; max-width: 420px; margin: 12px auto; border-collapse: collapse; font-size: 13px; }
.kv td { padding: 6px 10px; border: 1px solid ${C.lineSoft}; }
.kv td:nth-child(odd) { color: ${C.muted}; width: 22%; text-align: right; background: ${C.panel}; }
.kv td:nth-child(even) { color: ${C.text}; }
.kv b { color: ${C.gold}; }
.grid9 { display: grid; grid-template-columns: repeat(3,1fr); gap: 5px; max-width: 380px; margin: 0 auto; }
.cell { min-height: 54px; border: 1.5px solid ${C.line}; border-radius: 5px; padding: 4px; text-align: center; background: #fff; display: flex; flex-direction: column; justify-content: center; }
.cell.center { background: ${C.panel}; border-color: ${C.goldLight}; }
.cell .sm { font-size: 10px; color: ${C.muted}; }
.cell .big { font-size: 14px; font-weight: bold; margin-top: 1px; }
.shot { text-align: center; }
.shot img { max-width: 100%; border: 1px solid ${C.lineSoft}; border-radius: 6px; background: ${C.shotBg}; }
.detail-db { margin: 7px 0; padding: 9px 12px; background: ${C.panel}; border-radius: 5px; border-left: 3px solid ${C.line}; }
.db-h { font-size: 13px; }
.db-m { color: ${C.muted}; font-size: 11px; margin-left: 6px; }
.db-d { color: ${C.text}; margin: 4px 0; font-size: 12px; }
.flag { display: inline-block; background: ${C.xiong}; color: #fff; font-size: 9px; padding: 0 4px; border-radius: 3px; margin-left: 4px; vertical-align: middle; }
.lbl { display: inline-block; width: 22px; font-weight: bold; }
.classic { margin-top: 5px; padding: 4px 9px; border-left: 3px solid ${C.goldLight}; background: #fff; color: ${C.gold}; font-size: 11.5px; }
.src { color: ${C.muted2}; font-size: 10px; }
.yfcard { margin-top: 8px; padding: 8px 11px; border-left: 3px solid ${C.goldLight}; background: ${C.panel}; border-radius: 0 5px 5px 0; font-size: 12px; }
.yr { color: ${C.muted2}; font-size: 10px; margin-left: 6px; }
.pancap { color: ${C.gold}; font-size: 12px; margin: 10px 0 4px; }
.panrow { display: flex; align-items: center; gap: 3px; margin: 3px 0; font-size: 11.5px; }
.panrow b { color: ${C.gold}; width: 24px; }
.pancell { display: inline-block; width: 34px; text-align: center; padding: 2px 0; background: #fff; border: 1px solid ${C.lineSoft}; border-radius: 3px; }
.panG { color: ${C.muted2}; font-size: 9px; display: block; }
.sctop { display: flex; align-items: baseline; gap: 8px; }
.sctop b { font-size: 26px; }
.scrow { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid ${C.lineSoft}; font-size: 12px; }
.scn { color: ${C.muted}; } .scn em { color: ${C.muted2}; font-style: normal; font-size: 10.5px; margin-left: 4px; }
.grp { color: ${C.gold}; font-size: 11.5px; margin-top: 6px; }
.ref { margin-top: 6px; padding-top: 5px; border-top: 1px dashed ${C.lineSoft}; font-size: 11.5px; color: ${C.muted}; }
.advice .db-d { color: ${C.text}; }
`;

// 流式拼页：小块按高度依次摆放（不切），单块超 A4 才切片
function makePlacer(pdf) {
  const padMM = 8, gapMM = 3, pageW = 210, pageH = 297, usableH = pageH - 2 * padMM;
  const imgW = pageW - 2 * padMM;
  let y = padMM, page = 0;
  return (canvas) => {
    const scale = imgW / canvas.width;
    const h = canvas.height * scale;
    if (h <= usableH) {
      if (y + h > pageH - padMM) { pdf.addPage(); y = padMM; }
      else if (page === 0 && y === padMM) { /* 首块首页 */ }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', padMM, y, imgW, h);
      y += h + gapMM;
    } else {
      // 超大块（盘式截图）切片填整页
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

function stageShot(stage) {
  if (!stage) return null;
  const old = stage.bgColor;
  try { stage.setBg(C.shotBg); stage.render(); return stage.canvas.toDataURL('image/jpeg', 0.92); }
  finally { stage.setBg(old); stage.render(); }
}
function compassShot() {
  const c = document.getElementById('compass');
  return c ? c.toDataURL('image/jpeg', 0.92) : null;
}

export async function exportKanyuPDF({ data, rooms, stage, floorplanImg, innerR = 30, genDate = new Date() }) {
  const { bazhai, yearFx, xuankong: x, score } = data;
  const stageURL = stageShot(stage);
  const compassURL = compassShot();
  const planURL = floorplanImg && floorplanImg.src ? floorplanImg.src : null;

  const report = document.createElement('div');
  report.id = 'pdfReport';
  report.style.cssText = `position:fixed;left:-99999px;top:0;width:794px;background:#ffffff;`;
  report.innerHTML = `<style>${STYLE}</style>` +
    coverHTML(x, genDate) +
    summaryHTML(x, score, bazhai, yearFx) +
    (planURL ? shotHTML('一、户型图', 'pdfPlanImg', planURL) : '') +
    (stageURL ? shotHTML('二、盘式布置（八宅·九星·九宫·二十四山·大玄空·标注）', 'pdfStageImg', stageURL) : '') +
    (compassURL ? shotHTML('三、罗盘', 'pdfCompassImg', compassURL) : '') +
    bazhaiGridHTML(bazhai) +
    bazhaiDetailSection(bazhai) +
    jiuxingGridHTML(yearFx) +
    jiuxingDetailSection(yearFx, bazhai) +
    xuankongHTML(x) +
    scoreHTML(score) +
    roomsHTML(rooms, bazhai, yearFx, innerR) +
    adviceHTML(bazhai, yearFx, x) +
    m24HTML(x);
  document.body.appendChild(report);

  try {
    await document.fonts.ready;
    const imgs = Array.from(report.querySelectorAll('img'));
    await Promise.all(imgs.map((im) => im.complete ? null : new Promise((r) => { im.onload = r; im.onerror = r; })));
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const place = makePlacer(pdf);
    const blocks = report.querySelectorAll('section.sec, .detail-db');
    for (let i = 0; i < blocks.length; i++) {
      const canvas = await html2canvas(blocks[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      place(canvas);
    }
    pdf.save(`堪舆报告_坐${x.zuoshan}朝${x.chaoxiang}_${x.buildYear}.pdf`);
  } finally {
    report.remove();
  }
}
