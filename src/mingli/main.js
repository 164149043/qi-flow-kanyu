/**
 * main.js —— 命理页交互层（无框架，直接 DOM）
 * ============================================================
 * 形态（自研原创，与参考站形态无关）：
 *   投帖输入卡 → 四柱立轴（右→左）→ 五行环+强弱 → 大运长河 → 释义抽屉
 * 计算全部走 core/chart.js（本地，无任何网络请求）。
 */
import { buildChart } from './core/chart.js';
import {
  GAN_WUXING, ZHI_WUXING, GAN_YINYANG, SHI_SHEN_DESC,
} from './core/data.js';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');

/* ---------- 释义文案（自写，M2 扩充为典籍档） ---------- */
const XINGYUN_DESC = {
  '长生': '初生萌发之位，主生机、开端与新途。',
  '沐浴': '初长未定之位，主变动、反复，古称桃花之地。',
  '冠带': '渐成仪容之位，主进取、渐入佳境。',
  '临官': '临官近贵之位，主自立成家、禄到身边。',
  '帝旺': '盛极之位，主巅峰刚健，物极则惕。',
  '衰': '由盛转敛之位，主收束、守成。',
  '病': '失养之位，主辛劳、须调息。',
  '死': '气归沉静之位，主静守，非凶言之死。',
  '墓': '收藏入库之位，主积蓄、厚积薄发。',
  '绝': '气尽待生之位，主转折、绝处逢生。',
  '胎': '受气成胎之位，主孕育与希望。',
  '养': '待出之位，主培养、涵养待时。',
};
const STRENGTH_DESC = {
  'weak': '帮扶日主的五行不足四成，日主偏弱难以担财官，行印、比劫之运得扶。',
  'slightly_weak': '帮扶日主的五行略少于克泄者，宜印、比劫帮扶，忌再克泄。',
  'balanced': '帮扶与克泄两方相当，五行中和，取流通、调候为要。',
  'slightly_strong': '帮扶日主的五行略占上风，能担财官，宜食伤、财官泄其秀气。',
  'strong': '帮扶日主的五行超过六成，身强过旺，喜克、泄、耗平衡其势。',
};
const STRENGTH_FULL = {
  'title': '身强身弱怎么判',
  'body': `
    <p>「日主」＝出生日的天干，代表命主本人；其余干支都与它论生克关系。</p>
    <p>「同党」指<b>帮扶日主的两组十神</b>：</p>
    <p>· <b>比肩/劫财</b>——与日主同五行的干支，好比手上多几个自己；<br>
    · <b>正印/偏印</b>——生日主的五行，如母亲护身。</p>
    <p>其余十神（食伤、财、官杀）都在消耗或约束日主，属「异党」。</p>
    <p>同党分数 ÷ 五行总分（90）＝ 同党占比：<b>≥62% 身强</b>、46~54% 中和、<b>≤38% 身弱</b>，中间为偏强/偏弱。</p>
    <p>身强者能担财官、喜克泄耗；身弱者需印比帮扶。此为「扶抑」一路的看法，另有调候、病药等参法（后续版本展开）。</p>`,
};

/* ---------- 状态 ---------- */
const state = {
  chart: null,
  calendar: 'solar',
  advOpen: false,
  composeOpen: true,
};

/* ---------- 工具 ---------- */
const WX_CLASS = { '木': 'wx-mu', '火': 'wx-huo', '土': 'wx-tu', '金': 'wx-jin', '水': 'wx-shui' };
const wxCls = (gz) => WX_CLASS[GAN_WUXING[gz[0]]] || '';
const zhiCls = (z) => WX_CLASS[ZHI_WUXING[z]] || '';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/* ---------- 输入卡 ---------- */
function renderCompose() {
  const folded = state.chart && !state.composeOpen;
  return `
  <section class="compose" id="compose">
    ${folded ? `
    <div class="compose-folded" id="composeFold">
      <b>${esc(state.chart.input.year)}·${state.chart.input.month}·${state.chart.input.day}</b>
      <span>${state.chart.info.solarText.slice(0, 10)}</span>
      <span style="margin-left:auto">重新排盘 ▾</span>
    </div>` : composeForm()}
  </section>`;
}

function composeForm() {
  const c = state.chart?.input || { year: 1990, month: 1, day: 1, hour: 12, minute: 0, gender: 1 };
  const yearNow = new Date().getFullYear();
  return `
    <div class="compose-row">
      <div class="fld"><label>历法</label>
        <div class="seg" id="segCal">
          <button data-cal="solar" class="${state.calendar === 'solar' ? 'on' : ''}">公历</button>
          <button data-cal="lunar" class="${state.calendar === 'lunar' ? 'on' : ''}">农历</button>
        </div>
      </div>
      <div class="fld"><label>年</label><input type="number" id="inYear" value="${c.year}" min="1900" max="${yearNow + 1}"></div>
      <div class="fld"><label>月</label><input type="number" id="inMonth" value="${c.month}" min="1" max="12" step="1"></div>
      <div class="fld"><label>日</label><input type="number" id="inDay" value="${c.day}" min="1" max="30"></div>
      <div class="fld"><label>时辰</label>
        <select id="inHour">${Array.from({ length: 24 }, (_, h) => {
          const z = SHICHEN[Math.floor(((h + 1) % 24) / 2)];
          return `<option value="${h}" ${+c.hour === h ? 'selected' : ''}>${String(h).padStart(2, '0')}时·${z}</option>`;
        }).join('')}</select>
      </div>
      <div class="fld"><label>性别</label>
        <div class="seg" id="segGender">
          <button data-g="1" class="${c.gender === 1 ? 'on' : ''}" title="男命（乾造）">男</button>
          <button data-g="0" class="${c.gender === 0 ? 'on' : ''}" title="女命（坤造）">女</button>
        </div>
      </div>
    </div>
    <div class="adv-toggle" id="advToggle">校正 ▸ 派别 / 真太阳时</div>
    <div class="adv ${state.advOpen ? 'open' : ''}" id="advBox">
      <div class="fld"><label>换日派别</label>
        <div class="seg" id="segSect">
          <button data-s="2" class="${(c.sect ?? 2) === 2 ? 'on' : ''}">晚子换日</button>
          <button data-s="1" class="${+c.sect === 1 ? 'on' : ''}">子初换日</button>
        </div>
      </div>
      <div class="fld"><label>真太阳时偏移(分)</label><input type="number" id="inTst" value="${c.tstOffsetMin || 0}" step="1" style="min-width:90px" placeholder="如 -24"></div>
    </div>
    <div class="go-row">
      <button class="btn-go" id="btnGo">排 盘</button>
      <span class="privacy">历法与排盘全部在本机完成</span>
    </div>`;
}

/* ---------- 四柱立轴 ---------- */
function renderPillars(chart) {
  return `<div class="pillars">${chart.pillars.map((p) => `
    <div class="pillar" data-pillar="${p.name}">
      ${p.kongDay ? '<span class="p-kong day" data-kong="day">空</span>' : p.kongYear ? '<span class="p-kong" data-kong="year">空</span>' : ''}
      <div class="p-name">${p.name}</div>
      <div class="p-shishen ${p.shiShen === '日主' ? 'dayg' : ''}" data-ss="${p.shiShen}">${p.shiShen}</div>
      <div class="p-gan ${wxCls(p.gz)}" data-gz="${p.gz}">${p.gan}</div>
      <div class="p-zhi ${zhiCls(p.zhi)}" data-gz="${p.gz}">${p.zhi}</div>
      <div class="p-hide"><small class="p-hide-cap">藏干</small>${p.hideGans.map((h) => `<div><b data-hide="${h.gan}">${h.gan}<small>${h.shiShen}</small></b></div>`).join('')}</div>
      <div class="p-xing">星运 <em data-xy="${p.xingYun}">${p.xingYun}</em></div>
      <div class="p-nayin ${p.naYin.length <= 3 ? 'short' : ''}" data-ny="${p.naYin}">${p.naYin}</div>
    </div>`).join('')}</div>`;
}

/* ---------- 五行环（SVG 五段弧） ---------- */
function renderWxRing(chart) {
  const R = 52, C = 2 * Math.PI * R, cx = 66, cy = 66;
  const total = chart.wuxing.total || 90;
  const order = ['木', '火', '土', '金', '水'];
  let acc = 0;
  const segs = order.map((w) => {
    const frac = Math.max(chart.wuxing.scores[w] / total, 0.004);
    const dash = (frac * C - 3).toFixed(1);
    const off = (-acc * C + C / 4).toFixed(1); // 起点转正上方
    acc += frac;
    const wk = { '木': 'mu', '火': 'huo', '土': 'tu', '金': 'jin', '水': 'shui' }[w];
    return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--wx-${wk})" stroke-width="13"
      stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${off}" data-wx="${w}"/>`;
  }).join('');
  return `
  <div class="strength-sec">
    <div class="wxring"><svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="五行分数环">
      ${segs}
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="13" fill="var(--ink-faint)">日主</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="22" font-weight="700" fill="var(--ink)" font-family="KaiTi,STKaiti,serif">${chart.dayGan}</text>
    </svg></div>
    <div class="strength-txt">
      <div class="st-label">日主<b>${chart.dayGan}${chart.dayWuxing}</b> · <b data-st="${chart.strength.code}" style="cursor:pointer;text-decoration:underline dotted 2px;text-underline-offset:4px">${chart.strength.label}</b></div>
      <div class="st-desc">${STRENGTH_DESC[chart.strength.code] || ''}（帮扶日主的五行合计占 ${chart.strength.pct}% · <span data-st="${chart.strength.code}" style="cursor:pointer;color:var(--zhu)">怎么判？</span>）</div>
      <div class="wx-legend">${order.map((w) => `<span data-wx="${w}"><i style="background:var(--wx-${{ '木': 'mu', '火': 'huo', '土': 'tu', '金': 'jin', '水': 'shui' }[w]})"></i>${w} ${chart.wuxing.scores[w]}分</span>`).join('')}</div>
    </div>
  </div>`;
}

/* ---------- 大运长河 ---------- */
function renderDayun(chart) {
  const nowYear = new Date().getFullYear();
  // 顺逆由「年干阴阳 × 性别」定：阳年男/阴年女顺行，阴年男/阳年女逆行
  const yearYang = GAN_YINYANG[chart.pillars[0].gan] === '阳';
  const male = chart.input.gender === 1;
  const direction = (yearYang && male) || (!yearYang && !male) ? '顺行' : '逆行';
  const steps = chart.dayun.list.map((d, i) => {
    const cur = d.ganZhi && nowYear >= d.startYear && nowYear <= d.endYear;
    return `
    <div class="dy-step ${cur ? 'cur' : ''}" data-dy="${i}">
      ${cur ? '<span class="dy-flag">现在</span>' : ''}
      <div class="dy-age">${i === 0 ? '起运前' : d.startAge + '岁'}${i === 0 ? '' : '～' + d.endAge}</div>
      <div class="dy-gz ${d.ganZhi ? wxCls(d.ganZhi) : ''}">${d.ganZhi ? d.ganZhi.split('').join('<br>') : '—'}</div>
      <div class="dy-ss">${d.shiShen || ''}</div>
      <div class="dy-year">${d.ganZhi ? d.startYear + '起' : ''}</div>
    </div>`;
  }).join('');
  return `
  <section class="dayun-sec">
    <div class="dayun-head">
      <h2>大运</h2>
      <span class="dy-start">${chart.dayun.startYear} 年 ${chart.dayun.startMonth} 月起运 · ${male ? '男命' : '女命'}${direction}（${yearYang ? '阳' : '阴'}年生）</span>
    </div>
    <div class="dayun-river">${steps}</div>
  </section>`;
}

/* ---------- 释义抽屉 ---------- */
let drawerCtx = null;
function openDrawer(title, tag, bodyHtml) {
  drawerCtx = { title, tag, bodyHtml };
  renderDrawer();
  $('#drawer').classList.add('open');
}
function renderDrawer() {
  const d = $('#drawer');
  if (!d || !drawerCtx) return;
  $('.drawer-in', d).innerHTML = `
    <button class="d-close" aria-label="关闭">✕</button>
    <h3>${esc(drawerCtx.title)}<span class="tag">${esc(drawerCtx.tag || '')}</span></h3>
    <div class="d-body">${drawerCtx.bodyHtml}</div>`;
}
function drawerHtmlFor(target) {
  const chart = state.chart;
  const gz = target.dataset.gz, ss = target.dataset.ss, xy = target.dataset.xy, ny = target.dataset.ny, wx = target.dataset.wx, hide = target.dataset.hide;
  const st = target.dataset.st, kong = target.dataset.kong;
  const dyIdx = target.dataset.dy;
  if (kong) {
    const p = target.closest('.pillar');
    const pn = p ? p.dataset.pillar : '';
    return ['空亡', pn + (kong === 'day' ? ' · 逢日空' : ' · 逢年空'),
      `「空亡」＝旬空：以${kong === 'day' ? '日' : '年'}柱干支所在旬推算，一旬十天、地支十二，必有两支轮空。此柱地支正逢轮空之支，古法谓其气「虚而不实」——吉凶入此减半，待逢「填实」「冲空」之岁而动。<b>非凶煞</b>，多主牵延、心性疏淡之感。`];
  }
  if (st && STRENGTH_DESC[st]) {
    const sameSide = chart.wuxing.scores[chart.strength.dayWuxing] + chart.wuxing.scores[chart.strength.yinWuxing];
    return [chart.strength.label + ' · 判法', '扶抑',
      `${STRENGTH_FULL.body}<p>本盘：比劫（${chart.strength.dayWuxing}）${chart.wuxing.scores[chart.strength.dayWuxing]}分 + 印（${chart.strength.yinWuxing}）${chart.wuxing.scores[chart.strength.yinWuxing]}分 = ${sameSide}分，占 90 分的 <b>${chart.strength.pct}%</b> → <b>${chart.strength.label}</b>。</p>`];
  }
  if (gz) {
    const p = chart.pillars.find((x) => x.gz === gz) || chart.dayun.list.find((x) => x.ganZhi === gz && x.shiShen);
    if (p && p.name) {
      return [`${gz} · ${p.name}`, GAN_WUXING[gz[0]] + '·' + ZHI_WUXING[gz[1]],
        `<b>${gz}</b>，纳音「${p.naYin}」。天干属${GAN_WUXING[gz[0]]}，地支属${ZHI_WUXING[gz[1]]}，藏干：${p.hideGans.map((h) => h.gan + '(' + h.shiShen + ')').join('、')||'—'}。星运 <b>${p.xingYun}</b>（日主在此支之势），自坐 ${p.ziZuo}。${p.kongDay ? '此支逢日空，主虚待实。' : ''}`];
    }
  }
  if (dyIdx !== undefined && chart.dayun.list[dyIdx]?.ganZhi) {
    const d = chart.dayun.list[dyIdx];
    return [`${d.ganZhi} · 大运`, d.startAge + '～' + d.endAge + '岁',
      `${d.startYear}–${d.endYear} 年行 <b>${d.ganZhi}</b>，天干透${d.shiShen}，地支藏${d.zhiShiShen}，纳音${d.naYin}，星运${d.xingYun}。`];
  }
  if (ss && SHI_SHEN_DESC[ss]) return [ss, '十神', `<b>${ss}</b>：${SHI_SHEN_DESC[ss]}。`];
  if (xy && XINGYUN_DESC[xy]) return [xy, '星运', `<b>${xy}</b>：${XINGYUN_DESC[xy]}（十二宫以此察日主在支之气势消长）。`];
  if (ny) return [ny, '纳音', `此柱纳音 <b>${ny}</b>。六十甲子配三十音，古以年命纳音论命，后世多参看。`];
  if (wx && chart.wuxing.scores[wx] !== undefined) {
    const items = chart.wuxing.detail.filter((d0) => d0.wuxing === wx).map((d0) => `${d0.label}${d0.from} ${d0.score}分`).join('、');
    return [wx, '五行', `<b>${wx}</b> 共 ${chart.wuxing.scores[wx]} 分（满分 ${chart.wuxing.total}）：${items}。`];
  }
  if (hide && GAN_WUXING[hide]) {
    const col = chart.pillars.flatMap((p) => p.hideGans).find((h) => h.gan === hide);
    if (col) return [hide, '藏干', `藏干 <b>${hide}</b>，属${GAN_WUXING[hide]}，对日主为<b>${col.shiShen}</b>。`];
  }
  return null;
}

/* ---------- 主渲染 ---------- */
function render() {
  const chart = state.chart;
  app.innerHTML = `
  <header class="topbar">
    <h1>命 理</h1><span class="sub">四柱排盘</span>
    <a class="back" href="index.html">← 门户</a>
  </header>
  <main class="wrap">
    ${renderCompose()}
    ${chart ? `
      <div class="meta-line">
        <span>公历 <b>${esc(chart.info.solarText)}</b></span>
        <span>农历 <b>${esc(chart.info.lunarText)}</b></span>
        <span>属<b>${esc(chart.info.shengXiao)}</b></span>
        ${chart.info.jieQi ? `<span>节气 <b>${esc(chart.info.jieQi)}</b></span>` : ''}
        <span>${chart.input.gender === 1 ? '乾造（男）' : '坤造（女）'}</span>
      </div>
      ${renderPillars(chart)}
      ${renderWxRing(chart)}
      ${renderDayun(chart)}
      <div class="foot">传统命理文化 · 仅供研究参考</div>
    ` : `
      <div class="empty">
        <div class="e-glyphs">年 月 日 时</div>
        <p>填好出生时间，点「排盘」即出四柱</p>
      </div>
      <div class="foot">传统命理文化 · 仅供研究参考</div>
    `}
  </main>
  <div class="drawer" id="drawer"><div class="drawer-in"></div></div>`;
  bind();
}

/* ---------- 事件 ---------- */
function bind() {
  const segCal = $('#segCal');
  if (segCal) segCal.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.calendar = b.dataset.cal; render();
  });
  const segGender = $('#segGender');
  if (segGender) segGender.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state._gender = +b.dataset.g;
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
  const segSect = $('#segSect');
  if (segSect) segSect.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state._sect = +b.dataset.s;
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
  const advToggle = $('#advToggle');
  if (advToggle) advToggle.addEventListener('click', () => {
    state.advOpen = !state.advOpen; $('#advBox').classList.toggle('open', state.advOpen);
  });
  const btnGo = $('#btnGo');
  if (btnGo) btnGo.addEventListener('click', () => {
    try {
      state.chart = buildChart({
        year: +$('#inYear').value, month: +$('#inMonth').value, day: +$('#inDay').value,
        hour: +$('#inHour').value, minute: 0,
        gender: state._gender ?? state.chart?.input.gender ?? 1,
        calendar: state.calendar,
        sect: state._sect ?? state.chart?.input.sect ?? 2,
        tstOffsetMin: +(($('#inTst')?.value) || 0) || 0,
      });
      state.composeOpen = false;
      render();
    } catch (err) {
      alert('此历法组合不存在（如闰月/大小月越界），请核对后重试。');
    }
  });
  const fold = $('#composeFold');
  if (fold) fold.addEventListener('click', () => { state.composeOpen = true; render(); });

  // 抽屉：点击关闭
  const drawer = $('#drawer');
  if (drawer) drawer.addEventListener('click', (e) => {
    if (e.target.closest('.d-close') || !e.target.closest('.drawer-in')) drawer.classList.remove('open');
  });
}

/* ---------- 启动 ---------- */
// 默认起一盘演示（今天此刻，男命）——空态太干，直接给用户看形态
{
  const n = new Date();
  state.chart = buildChart({ year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate(), hour: n.getHours(), minute: 0, gender: 1 });
  state.composeOpen = false;
}
render();
// 抽屉点选委托只挂一次（render 会重写 app 内部，委托在 app 上不受影响）
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-gz],[data-ss],[data-xy],[data-ny],[data-wx],[data-hide],[data-dy],[data-st],[data-kong]');
  if (!t) return;
  const hit = drawerHtmlFor(t);
  if (hit) openDrawer(hit[0], hit[1], hit[2]);
});
const boot = document.getElementById('boot');
if (boot) { boot.classList.add('hide'); setTimeout(() => boot.remove(), 600); }
