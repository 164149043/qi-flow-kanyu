/**
 * aiprompt.js —— 「问 AI」提问文本生成（纯函数，无 DOM）
 * ============================================================
 * 定位：排盘归 core，解读归 AI。本模块把 buildChart/hePan 的确定性结论
 * 序列化成一段可直接粘贴给任意 AI 对话的中文提问文本：
 *   角色与禁令（防 AI 自行重排盘）→ 裁剪后的盘面卡 → 解读口径 → 输出要求。
 * 口径与 classics.js 一致：格局《子平真诠》、扶抑《滴天髓》、病药《神峰通考》、
 * 调候《穷通宝鉴》、神煞宫位《渊海子平》《三命通会》、合婚《渊海子平》。
 *
 * 裁剪原则：大运全带（干支+十神一行串完）；流年只带当前大运的今年±2；
 * 神煞/关系只发命中项；十神只发实有 + 未现名单（缺失本身是信息）。
 *
 * 用法：buildAiPrompt(chart, { topics, question }) → string
 *       buildHePanPrompt(hr, { topics, question })  → string
 */

const PN = ['年', '月', '日', '时'];
export const AI_TOPICS = ['性格', '事业财运', '感情婚姻', '健康', '近年运势'];
export const HE_TOPICS = ['缘分总览', '相处建议', '性格互补', '婚恋时机'];

/* ---- 开场白：粘贴场景没有 system 消息，身份+禁令必须写进正文第一段 ----
 * 师承句把六书坐标直接钉进角色（子平法＝四柱八字体系总称，六书皆在其中），
 * 与页面 core 的算法出处一一对应。 */
const SHIXI = '师承子平体系：格局宗《子平真诠》、衰旺宗《滴天髓》、病药宗《神峰通考》、调候宗《穷通宝鉴》、神煞宫位宗《渊海子平》《三命通会》';
const OPEN_PAN = `你是一位八字命理分析师，${SHIXI}。下面是我用排盘程序排好并校验过的八字盘面，请只依据这份盘面做解读，不要自行重新排盘、更改干支或另立强弱结论。`;
const OPEN_HE = `你是一位八字合婚分析师，${SHIXI}，合婚参法以《渊海子平·论合婚》为本。下面是我用排盘程序排好并校验过的两人八字合盘对照，请只依据这份材料解读两人关系，不要自行重新排盘或更改干支。`;

/* ---- 解读口径：书名已在师承句，此处只留规则 ---- */
const KOUJING_PAN = `【解读口径】
· 格局以月令定格为准，用神三路合参（扶抑、病药、调候）；
· 神煞仅作辅参，以正书所载为限；
· 盘面已标注的五行强弱、格局、用神是既定结论，解读须与之自洽；
· 不要使用「缺啥补啥」改名补五行之类的民间话术。`;
const KOUJING_HE = `【解读口径】
· 合盘看「宫」重于看「星」：日支为婚姻宫、年支为根基宫，两宫相合相冲最切；日主生克只论相处姿态；
· 双方盘面已标注的日主、强弱、喜用是既定结论，解读须与之自洽；
· 参考分只是条目计数，不作吉凶定论。`;

/* ---- 单盘盘面卡 ---- */
function panCard(chart) {
  const L = [];
  const inp = chart.input, info = chart.info;
  L.push(`【基本信息】公历 ${info.solarText}｜农历 ${info.lunarText}｜${inp.gender === 1 ? '乾造（男）' : '坤造（女）'}｜属${info.shengXiao}${info.jieQi ? '｜节气 ' + info.jieQi : ''}`);
  L.push(`【排盘口径】${inp.sect === 1 ? '子初换日' : '晚子换日'}${inp.tstOffsetMin ? `｜真太阳时已修正 ${inp.tstOffsetMin > 0 ? '+' : ''}${inp.tstOffsetMin} 分钟` : '｜未启用真太阳时'}`);

  // 五行 + 强弱
  const wx = chart.wuxing.scores;
  const lack = ['木', '火', '土', '金', '水'].filter((w) => wx[w] === 0);
  L.push(`【日主与五行】日主${chart.dayGan}${chart.dayWuxing}，${chart.strength.label}（同党占 ${chart.strength.pct}%）｜五行：金${wx['金']} 木${wx['木']} 水${wx['水']} 火${wx['火']} 土${wx['土']}${lack.length ? '（缺' + lack.join('、') + '）' : ''}`);

  // 四柱逐柱
  const pl = chart.pillars.map((p) => {
    const kong = p.kongDay ? '｜逢日空' : p.kongYear ? '｜逢年空' : '';
    const xing = p.name === '日柱' ? `自坐${p.ziZuo}` : `星运${p.xingYun}`;
    return `${p.name} ${p.gz}·${p.shiShen}｜藏干 ${p.hideGans.map((h) => `${h.gan}(${h.shiShen})`).join('')}｜${xing}｜纳音${p.naYin}${kong}`;
  });
  L.push(`【四柱】\n${pl.map((s) => '  ' + s).join('\n')}`);

  // 格局 / 用神
  const ys = chart.yongshen;
  L.push(`【格局】${chart.geju.main}（${chart.geju.via}）`);
  if (ys.congGe) {
    L.push(`【用神】从势之局，顺旺势为喜（${ys.tishiYong ? ys.tishiYong.join('、') : ''}），不以扶抑论`);
  } else {
    const parts = [`扶抑：喜${ys.fuyi.yong.join('、')}、忌${ys.fuyi.ji.join('、')}`];
    if (ys.bingyao) parts.push(`病药：病${ys.bingyao.bing}·药${ys.bingyao.yao}`);
    if (ys.tiaohou) parts.push(`调候：${ys.tiaohou.yong.join('、')}`);
    parts.push(`通根：${ys.tonggen.label}${ys.tonggen.total}分`);
    L.push(`【用神】${parts.join('｜')}`);
  }

  // 干支关系
  if (chart.relations?.length) {
    L.push(`【干支关系】${chart.relations.map((r) => `${r.text}（落${r.pillars.join('')}柱）`).join('｜')}`);
  } else {
    L.push(`【干支关系】四柱无合无冲`);
  }

  // 神煞（只发命中，带落宫）
  const ss = chart.pillars.flatMap((p, i) => (p.shensha || []).map((s) => `${s.name}（${PN[i]}柱·${s.luck}）`));
  if (ss.length) L.push(`【神煞】${ss.join('｜')}`);

  // 十神盘点：实有 + 未现
  const on = chart.ssTally.filter((t) => t.count > 0).map((t) => `${t.name}×${t.count}`);
  const off = chart.ssTally.filter((t) => t.count === 0).map((t) => t.name);
  L.push(`【十神】实有：${on.join('、')}${off.length ? '｜未现：' + off.join('、') + '（所主六亲缘分偏淡）' : ''}`);

  L.push(`【宫位】命宫${chart.mGong.gz}｜胎元${chart.tYuan.gz}`);

  // 大运：全带一行；流年：当前大运的今年±2
  const nowYear = new Date().getFullYear();
  const valid = chart.dayun.list.filter((d) => d.ganZhi);
  const cur = valid.find((d) => nowYear >= d.startYear && nowYear <= d.endYear);
  L.push(`【大运】${chart.dayun.startYear}年${chart.dayun.startMonth}月起运：${valid.map((d) => `${d.ganZhi}(${d.startAge}岁·${d.shiShen})`).join('→')}${cur ? `（当前行${cur.ganZhi}，${cur.startYear}–${cur.endYear}）` : ''}`);
  // 近年流年跨大运收集（±2 年可能落在上一步大运里，只扫当前步会漏跨界之年）
  const lns = valid
    .flatMap((d) => d.liuNian || [])
    .filter((l) => Math.abs(l.year - nowYear) <= 2)
    .sort((a, b) => a.year - b.year)
    .map((l) => {
      const flag = l.chongRi ? '·冲日柱' : l.chongYue ? '·冲月柱' : l.heRi ? '·合日柱' : '';
      return `${l.year}${l.ganZhi}年（${l.shiShen}${flag}）`;
    });
  if (lns.length) L.push(`【近年流年】${lns.join('｜')}`);
  return L.join('\n');
}

/* ---- 合盘材料卡 ---- */
function heCard(hr) {
  const L = [];
  const oneLine = (tag, c) =>
    `【${tag}】公历 ${c.info.solarText.slice(0, 16)}｜${c.input.gender === 1 ? '乾造（男）' : '坤造（女）'}｜属${c.info.shengXiao}｜日主${c.dayGan}${c.dayWuxing}·${c.strength.label}｜喜${c.yongshen.congGe ? c.yongshen.tishiYong.join('、') + '（从势）' : c.yongshen.fuyi.yong.join('、')}｜四柱：${c.pillars.map((p) => p.gz).join(' ')}`;
  L.push(oneLine('甲方', hr.A));
  L.push(oneLine('乙方', hr.B));
  L.push(`【对照结论】参考分 ${hr.he.score}。${hr.he.summary}`);
  L.push(`【对照明细】\n${hr.he.items.map((it) => `  · ${it.cap}：${it.main}——${it.note}`).join('\n')}`);
  return L.join('\n');
}

/* ---- 输出要求（按勾选聚焦，全不选＝全面分析） ---- */
function outputReq(topics, all) {
  const FULL = { '性格': '性格与心性', '事业财运': '事业与财运', '感情婚姻': '感情与婚姻', '健康': '健康提示', '近年运势': '近年流年提点' };
  const HE_FULL = { '缘分总览': '缘分总览', '相处建议': '相处建议', '性格互补': '性格互补与摩擦点', '婚恋时机': '婚恋时机提点' };
  const map = all === AI_TOPICS ? FULL : HE_FULL;
  const picked = (topics || []).filter((t) => map[t]);
  const list = picked.length ? picked : all;          // 勾选时保持面板顺序
  return `【输出要求】
1. 术语按子平正统，结论与盘面既定的强弱、格局、用神保持自洽；
2. 按顺序输出：${list.map((t) => map[t]).join(' → ')}；
3. 每部分落到具体象与时机，不确定的明说，不编造盘面上没有的神煞或关系；
4. 末尾加一句：以上为传统文化视角的参考解读。`;
}

/* ---- 对外：单盘 / 合盘 ---- */
export function buildAiPrompt(chart, opts = {}) {
  const parts = [OPEN_PAN, '', panCard(chart), '', KOUJING_PAN, '', outputReq(opts.topics, AI_TOPICS)];
  if (opts.question && opts.question.trim()) parts.push(`\n【我的问题】${opts.question.trim()}`);
  parts.push('', '现在请开始分析。');
  return parts.filter((s) => s !== undefined).join('\n');
}

export function buildHePanPrompt(hr, opts = {}) {
  const parts = [OPEN_HE, '', heCard(hr), '', KOUJING_HE, '', outputReq(opts.topics, HE_TOPICS)];
  if (opts.question && opts.question.trim()) parts.push(`\n【我的问题】${opts.question.trim()}`);
  parts.push('', '现在请开始解读。');
  return parts.filter((s) => s !== undefined).join('\n');
}
