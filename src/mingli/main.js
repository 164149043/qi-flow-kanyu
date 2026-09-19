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
import { CITY_LON, trueSolarOffset } from './core/truesolar.js';
import { hePan } from './core/hepan.js';
import { sourceBlock } from './core/classics.js';

/* 神煞 id → 典籍条目（classics.js 键）；未收录者不显出处块 */
const SS_CLASSICS = {
  tianyi: 'tianyi', taohua: 'taohua', yima: 'yima', huagai: 'huagai', jiangxing: 'jiangxing',
  jiesha: 'jiesha', yangren: 'yangren', lushen: 'lushen',
};

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
  heResult: null,        // 合盘结果 { A, B, he }
  mode: 'pan',           // 'pan' 排盘 | 'he' 合盘
  viewPerson: 'A',       // 合盘模式下当前细看的单盘（A 甲 / B 乙）
  calendar: 'solar',
  advOpen: false,
  composeOpen: true,
  cityA: '',             // 真太阳时城市（空＝不校正；合盘时甲/乙各一）
  cityB: '',
};

/* ---------- 提示映射（喜用五行 → 方位/颜色/旺季） ---------- */
const WX_HINT = {
  '木': { fang: '东', se: '青绿', ji: '春', ye: '文教、出版、木业、园艺、纺织' },
  '火': { fang: '南', se: '赤红', ji: '夏', ye: '能源、传媒、演艺、餐饮、光电' },
  '土': { fang: '中部/西南', se: '黄棕', ji: '四季之末', ye: '地产、农业、建筑、仓储、中介' },
  '金': { fang: '西', se: '白金银', ji: '秋', ye: '金融、五金、机械、司法、精密制造' },
  '水': { fang: '北', se: '黑蓝', ji: '冬', ye: '航运、外贸、信息、流动、咨询' },
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
      ${state.heResult ? '<span>⇄ 乙方盘</span>' : ''}
      <span style="margin-left:auto">${state.heResult ? '重新合盘 ▾' : '重新排盘 ▾'}</span>
    </div>` : composeForm()}
  </section>`;
}

function composeForm() {
  const c = state.chart?.input || { year: 1990, month: 1, day: 1, hour: 12, minute: 0, gender: 1 };
  const b = state.heResult?.B.input || { year: 1992, month: 6, day: 15, hour: 10, minute: 0, gender: 0 };
  const yearNow = new Date().getFullYear();
  const person = (p, cc) => `
      <div class="fld"><label>${p} · 年</label><input type="number" id="in${p}Year" value="${cc.year}" min="1900" max="${yearNow + 1}"></div>
      <div class="fld"><label>月</label><input type="number" id="in${p}Month" value="${cc.month}" min="1" max="12" step="1"></div>
      <div class="fld"><label>日</label><input type="number" id="in${p}Day" value="${cc.day}" min="1" max="30"></div>
      <div class="fld"><label>时辰</label>
        <select id="in${p}Hour">${Array.from({ length: 12 }, (_, i) => {
          const h = (i * 2) % 24; // 时辰中点钟数：子0 丑2 寅4 … 亥22
          const s = String((i * 2 + 23) % 24).padStart(2, '0');
          const e = String((i * 2 + 1) % 24).padStart(2, '0');
          return `<option value="${h}" ${+cc.hour === h || (h === 0 && +cc.hour === 23) ? 'selected' : ''}>${SHICHEN[i]}时 ${s}~${e}点</option>`;
        }).join('')}</select>
      </div>
      <div class="fld"><label>性别</label>
        <div class="seg" id="seg${p}Gender">
          <button data-g="1" class="${cc.gender === 1 ? 'on' : ''}" title="男命（乾造）">男</button>
          <button data-g="0" class="${cc.gender === 0 ? 'on' : ''}" title="女命（坤造）">女</button>
        </div>
      </div>`;
  return `
    <div class="compose-row" style="margin-top:2px">
      <div class="fld"><label>方式</label>
        <div class="seg" id="segMode">
          <button data-m="pan" class="${state.mode === 'pan' ? 'on' : ''}">单人排盘</button>
          <button data-m="he" class="${state.mode === 'he' ? 'on' : ''}">双人合盘</button>
        </div>
      </div>
      <div class="fld"><label>历法（甲乙共用）</label>
        <div class="seg" id="segCal">
          <button data-cal="solar" class="${state.calendar === 'solar' ? 'on' : ''}">公历</button>
          <button data-cal="lunar" class="${state.calendar === 'lunar' ? 'on' : ''}">农历</button>
        </div>
      </div>
    </div>
    ${state.mode === 'pan' ? `
    <div class="compose-row">${person('甲', c)}</div>` : `
    <div class="he-rows">
      <div class="compose-row">${person('甲', c)}</div>
      <div class="compose-row">${person('乙', b)}</div>
    </div>`}
    <div class="adv-toggle" id="advToggle">校正 ▸ 派别 / 真太阳时</div>
    <div class="adv ${state.advOpen ? 'open' : ''}" id="advBox">
      <div class="fld"><label>换日派别</label>
        <div class="seg" id="segSect">
          <button data-s="2" class="${(c.sect ?? 2) === 2 ? 'on' : ''}">晚子换日</button>
          <button data-s="1" class="${+c.sect === 1 ? 'on' : ''}">子初换日</button>
        </div>
      </div>
      ${state.mode === 'pan' ? `
      <div class="fld"><label>出生城市（真太阳时）</label>
        <select id="inCityA">
          <option value="">（不校正）</option>
          ${Object.keys(CITY_LON).map((k) => `<option value="${k}" ${state.cityA === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
      </div>` : `
      <div class="fld"><label>甲方城市</label>
        <select id="inCityA">
          <option value="">（不校正）</option>
          ${Object.keys(CITY_LON).map((k) => `<option value="${k}" ${state.cityA === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
      </div>
      <div class="fld"><label>乙方城市</label>
        <select id="inCityB">
          <option value="">（不校正）</option>
          ${Object.keys(CITY_LON).map((k) => `<option value="${k}" ${state.cityB === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
      </div>`}
      <div class="fld"><label>或手动偏移(分)</label><input type="number" id="inTst" value="${c.tstOffsetMin || 0}" step="1" style="min-width:90px" placeholder="如 -24"></div>
    </div>
    ${state.tstNote && state.mode === 'pan' ? `<p class="tst-note">${esc(state.tstNote)}</p>` : ''}
    <div class="go-row">
      <button class="btn-go" id="btnGo">${state.mode === 'pan' ? '排 盘' : '合 盘'}</button>
      <span class="privacy">历法与排盘全部在本机完成</span>
    </div>`;
}

/* ---------- 四柱立轴 ---------- */
function renderPillars(chart) {
  return `<div class="pillars">${chart.pillars.map((p, pi) => `
    <div class="pillar" data-pillar="${p.name}">
      ${p.kongDay ? '<span class="p-kong day" data-kong="day">空</span>' : p.kongYear ? '<span class="p-kong" data-kong="year">空</span>' : ''}
      <div class="p-name">${p.name}</div>
      <div class="p-shishen ${p.shiShen === '日主' ? 'dayg' : ''}" data-ss="${p.shiShen}">${p.shiShen}</div>
      <div class="p-gan ${wxCls(p.gz)}" data-gan="${p.gan}" data-pi="${pi}">${p.gan}</div>
      <div class="p-zhi ${zhiCls(p.zhi)}" data-zhi="${p.zhi}" data-pi="${pi}">${p.zhi}</div>
      <div class="p-hide"><small class="p-hide-cap">藏干</small>${p.hideGans.map((h) => `<div><b data-hide="${h.gan}">${h.gan}<small>${h.shiShen}</small></b></div>`).join('')}</div>
      <div class="p-xing">星运 <em data-xy="${p.xingYun}">${p.xingYun}</em></div>
      ${(p.shensha || []).length ? `<div class="p-shensha">${p.shensha.map((s, si) => `<span class="ss-badge ss-${s.luck}" data-pi="${pi}" data-si="${si}">${s.name}</span>`).join('')}</div>` : ''}
      <div class="p-nayin ${p.naYin.length <= 3 ? 'short' : ''}" data-ny="${p.naYin}">${p.naYin}</div>
    </div>`).join('')}</div>`;
}

/* ---------- 细盘（格局 / 用神 / 通根） ---------- */
function renderDetail(chart) {
  const ys = chart.yongshen, gj = chart.geju;
  return `
  <section class="detail-sec">
    <div class="detail-head"><h2>细盘</h2><span class="detail-sub">格局 · 用神 · 通根（点条目看讲法）</span></div>
    <div class="detail-grid">
      <div class="d-card" data-detail="geju">
        <div class="d-cap">格局</div>
        <div class="d-main">${esc(gj.main)}</div>
        <div class="d-note">${esc(gj.via)}</div>
        ${gj.special.length ? `<div class="d-note zhu">${gj.special.map(esc).join('<br>')}</div>` : ''}
      </div>
      <div class="d-card" data-detail="fuyi">
        <div class="d-cap">用神 · 扶抑</div>
        <div class="d-main">${esc(ys.fuyi.yong.join('、'))}</div>
        <div class="d-note">${esc(ys.fuyi.text)}</div>
      </div>
      ${ys.bingyao ? `
      <div class="d-card" data-detail="bingyao">
        <div class="d-cap">用神 · 病药</div>
        <div class="d-main">病 ${esc(ys.bingyao.bing)} · 药 ${esc(ys.bingyao.yao)}</div>
        <div class="d-note">${esc(ys.bingyao.text)}</div>
      </div>` : ''}
      ${ys.tiaohou ? `
      <div class="d-card" data-detail="tiaohou">
        <div class="d-cap">用神 · 调候</div>
        <div class="d-main">${esc(ys.tiaohou.yong.join('、'))}</div>
        <div class="d-note">${esc(ys.tiaohou.text)}</div>
      </div>` : ''}
      <div class="d-card" data-detail="tonggen">
        <div class="d-cap">通根</div>
        <div class="d-main">${esc(ys.tonggen.label)} <small>${ys.tonggen.total}分</small></div>
        <div class="d-note">${esc(ys.tonggen.text)}</div>
      </div>
    </div>
  </section>`;
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

/* ---------- 合盘结果 ---------- */
function renderHePan(hr) {
  const row = (label, chart) => `
    <div class="he-person">
      <div class="he-tag">${label} · ${chart.input.gender === 1 ? '男' : '女'}</div>
      <div class="he-gzs">${chart.pillars.map((p) => `<span class="he-gz ${wxCls(p.gz)}" data-gz="${p.gz}">${p.gz}</span>`).join('')}</div>
      <div class="he-sub">${chart.info.solarText.slice(0, 10)} · 日主${chart.dayGan}${chart.dayWuxing} · ${chart.strength.label}</div>
    </div>`;
  return `
  <section class="hepan-sec">
    <div class="detail-head">
      <h2>合盘</h2><span class="detail-sub">双人对照 · 参考分 ${hr.he.score}</span>
      <div class="seg he-view-seg" id="segHeView" style="margin-left:auto">
        <button data-v="A" class="${state.viewPerson === 'A' ? 'on' : ''}">细看甲盘</button>
        <button data-v="B" class="${state.viewPerson === 'B' ? 'on' : ''}">细看乙盘</button>
      </div>
    </div>
    <div class="he-pair">
      ${row('甲方', hr.A)}
      <div class="he-vs">⇄</div>
      ${row('乙方', hr.B)}
    </div>
    <div class="he-summary">${esc(hr.he.summary)}</div>
    <div class="he-items">${hr.he.items.map((it, i) => `
      <div class="he-item he-${it.luck}" data-he="${i}">
        <span class="he-cap">${esc(it.cap)}</span>
        <span class="he-main">${esc(it.main)}</span>
        <span class="he-note">${esc(it.note)}</span>
      </div>`).join('')}</div>
  </section>`;
}

/* ---------- 十神盘点（知识库式提示：命盘中有哪些十神、几处、在哪、缺哪些） ---------- */
const SS_KNOWLEDGE = {
  '比肩': { kin: '兄弟、朋友、同辈', img: '主自立、合伙、劳而有获；过旺则固执争财' },
  '劫财': { kin: '竞争者、手足', img: '主豪爽行动力；亦主破耗竞争，守财为要' },
  '食神': { kin: '口福、才华、晚辈（女命为子女）', img: '主温和厚道、艺术饮食之才，福气之源' },
  '伤官': { kin: '技艺、才华之外显', img: '主聪明锋芒、创意出众；傲气伤官，须配印驾驭' },
  '偏财': { kin: '父亲、意外之财', img: '主慷慨机变、善抓机遇；众人之财，忌比劫争夺' },
  '正财': { kin: '妻（男命）、正当收入', img: '主勤俭务实、财自有方；身弱则财多身累' },
  '七杀': { kin: '小人、强权、压力', img: '主魄力果决、乱世成名；有制为权，无制为祸' },
  '正官': { kin: '丈夫（女命）、上司、名誉', img: '主自律名分、贵气官途；官多反为束缚' },
  '偏印': { kin: '继母、偏门师承', img: '主悟性玄学、专技在身；孤僻多疑，喜财制之' },
  '正印': { kin: '母亲、学业、庇荫', img: '主仁慈书香、得长辈提携；过旺则安逸依赖' },
};

function renderSsTally(chart) {
  const on = chart.ssTally.filter((t) => t.count > 0);
  const off = chart.ssTally.filter((t) => t.count === 0);
  return `
  <section class="detail-sec sstally-sec">
    <div class="detail-head"><h2>十神</h2><span class="detail-sub">本盘实有（点看含义与落点）· 干＝天干明见，支＝地支暗藏</span></div>
    <div class="ss-tally">
      ${on.map((t) => `
      <button class="sst-badge" data-ssname="${t.name}">
        ${t.name}<i>${t.count}</i>
        <small>干${t.tou.length} 支${t.cang.length}</small>
      </button>`).join('')}
    </div>
    ${off.length ? `<div class="sst-off">未现：${off.map((t) => t.name).join('、')}——古法谓其所主六亲缘分偏淡，参看即可</div>` : ''}
  </section>`;
}

/* ---------- 提示（喜用五行 → 方位颜色行业） ---------- */
function renderTishi(chart) {
  const yong = chart.yongshen.fuyi.yong.slice(0, 2);
  return `
  <section class="detail-sec tishi-sec">
    <div class="detail-head"><h2>提示</h2><span class="detail-sub">喜用五行的生活参照（点卡看讲法）</span></div>
    <div class="detail-grid">
      ${yong.map((w, i) => {
    const h = WX_HINT[w];
    return `
      <div class="d-card" data-tishi="${w}">
        <div class="d-cap">${i === 0 ? '首选喜用' : '次选'} · ${w}</div>
        <div class="d-main">${h.fang}方 · ${h.se}</div>
        <div class="d-note">利${h.ji}；行业缘：${h.ye}。</div>
      </div>`;
  }).join('')}
    </div>
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
  const chart = curChart();
  const gz = target.dataset.gz, ss = target.dataset.ss, xy = target.dataset.xy, ny = target.dataset.ny, wx = target.dataset.wx, hide = target.dataset.hide;
  const st = target.dataset.st, kong = target.dataset.kong;
  const dyIdx = target.dataset.dy;
  // 神煞徽标
  const pi = target.dataset.pi, si = target.dataset.si;
  if (si !== undefined && pi !== undefined) {
    const s = chart.pillars[pi]?.shensha?.[si];
    if (s) return [s.name, `${['年', '月', '日', '时'][pi]}柱 · ${s.luck === '吉' ? '吉星' : s.luck === '凶' ? '凶煞' : '中性'} · ${s.src}`,
      `<b>${s.name}</b>（${s.luck}）：${s.desc}<br><br>本盘落点：${esc(s.note)}。${sourceBlock(SS_CLASSICS[s.id])}`];
  }
  // 天干粒度
  const ganC = target.dataset.gan;
  if (ganC && GAN_WUXING[ganC]) {
    const p = chart.pillars[+target.dataset.pi || 0];
    const ss = p.shiShen === '日主' ? '日主本人' : `对日主为<b>${p.shiShen}</b>`;
    return [`${ganC} · 天干`, `${GAN_WUXING[ganC]} · ${chart.pillars[+target.dataset.pi || 0].name}`,
      `<b>${ganC}</b>属${GAN_WUXING[ganC]}，居${p.name}天干，${ss}。${p.shiShen !== '日主' && SHI_SHEN_DESC[p.shiShen] ? SHI_SHEN_DESC[p.shiShen] + '。' : '「日主」即命主自身，其余干支都与它论生克。'}`];
  }
  // 地支粒度
  const zhiC = target.dataset.zhi;
  if (zhiC && ZHI_WUXING[zhiC]) {
    const p = chart.pillars[+target.dataset.pi || 0];
    return [`${zhiC} · 地支`, `${ZHI_WUXING[zhiC]} · ${p.name}`,
      `<b>${zhiC}</b>属${ZHI_WUXING[zhiC]}，居${p.name}地支。所藏天干：${p.hideGans.map((h) => `<b>${h.gan}</b>(${h.shiShen})`).join('、')}——地支是「屋子」，藏干是屋里住的人，透出到天干者才直接管事。日主在此支为<b>${p.xingYun}</b>。`];
  }
  // 细盘条目
  const dt = target.dataset.detail;
  // 合盘条目：展开完整讲法
  const heI = target.dataset.he;
  if (heI !== undefined && state.heResult) {
    const it = state.heResult.he.items[heI];
    if (it) return [it.cap + ' · 讲法', it.main,
      `${esc(it.note)}<br><br>合盘看「宫」重于看「星」：日支为婚姻宫、年支为根基宫，两宫相合相冲最切；日主生克只论相处姿态。<b>参考分只是条目计数</b>，不作吉凶定论。${sourceBlock('hepan')}`];
  }
  // 提示卡：喜用五行讲法
  const ts = target.dataset.tishi;
  if (ts && WX_HINT[ts]) {
    const h = WX_HINT[ts];
    return [`${ts} · 喜用讲法`, '生活参照',
      `本盘喜用五行取「${ts}」，古法以方位、颜色、时令作参照：利<b>${h.fang}方</b>（居所、发展方位可参照）、喜<b>${h.se}</b>系、<b>${h.ji}</b>当令；行业缘起${h.ye}。<br><br>此为「取象比类」的传统参照法，当作文化参考即可，现实决策不必拘泥。`];
  }
  if (dt === 'geju') return ['格局 · 讲法', chart.geju.main,
    `定格以<b>月令</b>为准：月支藏干透出到年/月/时干者，按其十神定名（如正官格、七杀格）；本气优先。比劫当月则另论：比肩临官为<b>建禄格</b>，阳日主劫财为<b>阳刃格</b>（五阴干无阳刃），其余为月劫格。<br><br>本盘：${esc(chart.geju.via)}。${chart.geju.special.length ? chart.geju.special.map(esc).join('<br>') : ''}${sourceBlock('geju')}`];
  if (dt === 'fuyi') return ['用神 · 扶抑法', '看强弱',
    `扶抑是「缺什么补什么、多什么泄什么」：身弱（帮扶日主的五行不足）用印、比劫帮扶；身强用食伤泄秀、财耗、官杀制约；中和取流通。<br><br>本盘：${esc(chart.yongshen.fuyi.text)}${sourceBlock('fuyi')}`];
  if (dt === 'bingyao') return ['用神 · 病药法', '《神峰通考》',
    `张神峰之法：命局最碍用神者即「病」，能去病者即「药」。药到之年，应吉最速。<br><br>本盘：${esc(chart.yongshen.bingyao?.text || '')}${sourceBlock('bingyao')}`];
  if (dt === 'tiaohou') return ['用神 · 调候法', '《穷通宝鉴》',
    `调候看「寒暖燥湿」：冬生宜火暖、夏生宜水润，如种庄稼先看天时。命局五行再平衡，过寒过热也难发力，故调候优先于扶抑参看。<br><br>本盘：${esc(chart.yongshen.tiaohou?.text || '')}${sourceBlock('tiaohou')}`];
  if (dt === 'tonggen') return ['通根 · 讲法', '得地评分',
    `天干如树梢、地支如树根：日主在四支中有同五行藏干（尤其临官、帝旺之支）即「有根」，有根才经得起克泄。<br><br>评分＝得令(50) + 得地(30) + 得势(20)。<br><br>本盘：${esc(chart.yongshen.tonggen.text)}（得令得地得势为通行教学口径）`];
  if (kong) {
    const p = target.closest('.pillar');
    const pn = p ? p.dataset.pillar : '';
    return ['空亡', pn + (kong === 'day' ? ' · 逢日空' : ' · 逢年空'),
      `「空亡」＝旬空：以${kong === 'day' ? '日' : '年'}柱干支所在旬推算，一旬十天、地支十二，必有两支轮空。此柱地支正逢轮空之支，古法谓其气「虚而不实」——吉凶入此减半，待逢「填实」「冲空」之岁而动。<b>非凶煞</b>，多主牵延、心性疏淡之感。${sourceBlock('kongwang')}`];
  }
  if (st && STRENGTH_DESC[st]) {
    const sameSide = chart.wuxing.scores[chart.strength.dayWuxing] + chart.wuxing.scores[chart.strength.yinWuxing];
    return [chart.strength.label + ' · 判法', '扶抑',
      `${STRENGTH_FULL.body}<p>本盘：比劫（${chart.strength.dayWuxing}）${chart.wuxing.scores[chart.strength.dayWuxing]}分 + 印（${chart.strength.yinWuxing}）${chart.wuxing.scores[chart.strength.yinWuxing]}分 = ${sameSide}分，占 90 分的 <b>${chart.strength.pct}%</b> → <b>${chart.strength.label}</b>。</p>${sourceBlock('fuyi')}`];
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
    const rows = (d.liuNian || []).map((l) => `
      <tr${l.chongRi ? ' style="color:var(--zhu);font-weight:600"' : ''}>
        <td>${l.year}</td><td class="ln-gz">${l.ganZhi}</td><td>${l.age}岁</td><td>${l.shiShen}</td>
        <td class="ln-flag">${l.chongRi ? '⚡冲日柱' : l.chongYue ? '⚡冲月柱' : l.heRi ? '⊙合日柱' : ''}</td>
      </tr>`).join('');
    return [`${d.ganZhi} · 大运`, d.startAge + '～' + d.endAge + '岁',
      `${d.startYear}–${d.endYear} 年行 <b>${d.ganZhi}</b>（天干${d.shiShen}·地支藏${d.zhiShiShen}·纳音${d.naYin}·星运${d.xingYun}）。<br><br>这十年的流年（点此后逐年可察）：<table class="ln-table"><tr><th>年</th><th>干支</th><th>岁</th><th>十神</th><th>标记</th></tr>${rows}</table><br>⚡冲日柱/月柱之年多动象，⊙合日柱之年多缘至——标记只是提示应期，吉凶还看喜忌。`];
  }
  // 命宫 / 胎元
  const mg = target.dataset.mg, ty = target.dataset.ty;
  if (mg) return ['命宫 · ' + mg, '神栖之宫',
    `命宫 <b>${mg}</b>（纳音${chart.mGong.naYin}，宫干对日主为${chart.mGong.shiShen}）。古法以「神栖之宫」论：性向、心之所安与此宫气息相关，命宫得贵人禄马者心定神闲。算法：月数按节气（过中气进一月），十四减月减时落宫，五虎遁起宫干。${sourceBlock('minggong')}`];
  if (ty) return ['胎元 · ' + ty, '受胎之月',
    `胎元 <b>${ty}</b>（纳音${chart.tYuan.naYin}，对日主为${chart.tYuan.shiShen}）。受胎之月的干支——月干进一、月支进三。古以胎元补四柱之不足，与命宫、四柱合参。${sourceBlock('taiyuan')}`];
  if (ss && SHI_SHEN_DESC[ss]) return [ss, '十神', `<b>${ss}</b>：${SHI_SHEN_DESC[ss]}。`];
  // 十神盘点徽章：知识 + 命盘中分布
  const ssn = target.dataset.ssname;
  if (ssn && SS_KNOWLEDGE[ssn]) {
    const t = chart.ssTally.find((x) => x.name === ssn);
    const k = SS_KNOWLEDGE[ssn];
    return [ssn + ' · 十神知识', `本盘共 ${t.count} 处`,
      `<b>${ssn}</b>：${SHI_SHEN_DESC[ssn] || ''}<br>六亲物象：${k.kin}；${k.img}。<br><br><b>命盘中共 ${t.count} 处</b>（天干明见 ${t.tou.length} 处、地支暗藏 ${t.cang.length} 处）——<br>${t.count ? [...t.tou.map((p) => `${p}（在天干上，明处管事，力量显）`), ...t.cang.map((p) => `${p}（藏在地支里，伏而待用，力量隐）`)].map((l) => '· ' + l).join('<br>') : '本盘未现。'}<br><br>天干如明处当值，直接管事；地支藏干如屋里住的人，要等大运流年引出（行话叫「透出」）才发力。`];
  }
  if (xy && XINGYUN_DESC[xy]) return [xy, '星运', `<b>${xy}</b>：${XINGYUN_DESC[xy]}（十二宫以此察日主在支之气势消长）。${sourceBlock('xingyun')}`];
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
/* 合盘时单盘细节跟随 viewPerson 切换（甲/乙任选其一细看），合盘对照区不受影响 */
const curChart = () => (state.heResult ? (state.viewPerson === 'B' ? state.heResult.B : state.heResult.A) : state.chart);
function render() {
  const chart = curChart();
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
        <span data-mg="${chart.mGong.gz}" style="cursor:pointer">命宫 <b>${chart.mGong.gz}</b></span>
        <span data-ty="${chart.tYuan.gz}" style="cursor:pointer">胎元 <b>${chart.tYuan.gz}</b></span>
        ${state.tstNote ? `<span>☀ ${esc(state.tstNote)}</span>` : ''}
      </div>
      ${renderPillars(chart)}
      ${state.heResult ? renderHePan(state.heResult) : ''}
      ${renderWxRing(chart)}
      ${renderSsTally(chart)}
      ${renderDetail(chart)}
      ${renderTishi(chart)}
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
  const segMode = $('#segMode');
  if (segMode) segMode.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.mode = b.dataset.m; render();
  });
  const segCal = $('#segCal');
  if (segCal) segCal.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.calendar = b.dataset.cal; render();
  });
  // 性别 seg（甲/乙通用：按 id 前缀绑定，只切样式不改 state，提交时读取）
  for (const p of ['甲', '乙']) {
    const seg = $(`#seg${p}Gender`);
    if (seg) seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
  }
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
    try { go(); } catch (err) { alert('此历法组合不存在（如闰月/大小月越界），请核对后重试。'); }
  });
  const fold = $('#composeFold');
  if (fold) fold.addEventListener('click', () => { state.composeOpen = true; render(); });

  // 抽屉：点击关闭
  const drawer = $('#drawer');
  if (drawer) drawer.addEventListener('click', (e) => {
    if (e.target.closest('.d-close') || !e.target.closest('.drawer-in')) drawer.classList.remove('open');
  });
  // 合盘：甲/乙单盘切换（上方立轴、五行环、细盘、大运随切）
  const segHeView = $('#segHeView');
  if (segHeView) segHeView.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.viewPerson = b.dataset.v;
    render();
  });
  // 大运长河：滚到底撤渐隐
  const river = $('.dayun-river');
  if (river) {
    const maskCheck = () => river.classList.toggle('no-mask', river.scrollLeft + river.clientWidth >= river.scrollWidth - 4);
    maskCheck();
    river.addEventListener('scroll', maskCheck, { passive: true });
  }
}

/* 读表单 → 起盘/合盘 */
function readPerson(p, fallback) {
  const gBtn = $(`#seg${p}Gender button.on`);
  return {
    year: +$(`#in${p}Year`).value, month: +$(`#in${p}Month`).value, day: +$(`#in${p}Day`).value,
    hour: +$(`#in${p}Hour`).value, minute: 0,
    gender: gBtn ? +gBtn.dataset.g : fallback,
    calendar: state.calendar,
    sect: state._sect ?? state.chart?.input.sect ?? 2,
  };
}
function tstOffsetFor(dateParts, which) {
  const sel = which === 'B' ? '#inCityB' : '#inCityA';
  const city = $(sel)?.value || '';
  if (which === 'B') state.cityB = city; else state.cityA = city;
  if (city && CITY_LON[city] !== undefined) {
    const r = trueSolarOffset(dateParts, city);
    if (which !== 'B') state.tstNote = r.note;
    return r.offsetMin;
  }
  if (which !== 'B') {
    const manual = +(($('#inTst')?.value) || 0) || 0;
    state.tstNote = manual ? `手动偏移 ${manual > 0 ? '+' : ''}${manual} 分钟` : '';
    return manual;
  }
  return 0;
}
function go() {
  if (state.mode === 'pan') {
    const base = readPerson('甲', state.chart?.input.gender ?? 1);
    base.tstOffsetMin = tstOffsetFor(base, 'A');
    state.chart = buildChart(base);
    state.heResult = null;
  } else {
    const A = readPerson('甲', state.chart?.input.gender ?? 1);
    const B = readPerson('乙', state.heResult?.B.input.gender ?? 0);
    A.tstOffsetMin = tstOffsetFor(A, 'A');
    B.tstOffsetMin = tstOffsetFor(B, 'B');
    const cA = buildChart(A), cB = buildChart(B);
    state.chart = cA;                    // 输入回填/默认展示基准
    state.heResult = { A: cA, B: cB, he: hePan(cA, cB) };
    state.viewPerson = 'A';
  }
  state.composeOpen = false;
  render();
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
  const t = e.target.closest('[data-gz],[data-gan],[data-zhi],[data-ss],[data-ssname],[data-xy],[data-ny],[data-wx],[data-hide],[data-dy],[data-st],[data-kong],[data-si],[data-detail],[data-he],[data-tishi],[data-mg],[data-ty]');
  if (!t) return;
  const hit = drawerHtmlFor(t);
  if (hit) {
    openDrawer(hit[0], hit[1], hit[2]);
    e.stopPropagation(); // 拦住这次点击冒泡到 document，避免刚打开就被「点外关闭」收起
  }
});
// 点外关闭：抽屉开着时，落点不在抽屉内容里的任意点击都收起（一次性挂载，不随 render 重建）
document.addEventListener('click', (e) => {
  const d = document.getElementById('drawer');
  if (!d || !d.classList.contains('open')) return;
  if (!e.target.closest('.drawer-in')) d.classList.remove('open');
});
const boot = document.getElementById('boot');
if (boot) { boot.classList.add('hide'); setTimeout(() => boot.remove(), 600); }
