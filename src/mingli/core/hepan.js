/**
 * hepan.js —— 合盘（双人四柱对照）
 * ============================================================
 * 口径（通行合婚参法，自研实现；杂煞条目标注「存参」）：
 *   1. 日主关系：两盘日干五行互看（生/克/比和），日干代表本人；
 *   2. 年支关系：六合/三合（半合）/六冲/相刑/相害——年支为根基宫；
 *   3. 日柱关系：天干五合、地支六合、天克地冲；
 *   4. 五行互补：一方旺五行恰为另一方喜用神 → 互补加分；
 *   5. 汇总参考分：各项加权，吉+中0/凶−，满 100 纯参考。
 *
 * 用法：hePan(chartA, chartB) → { items, score, summary }
 */
import {
  GAN_WUXING, WUXING_SHENG, ZHI_CHONG, ZHI_LIUHE, ZHI_HAI, SANHE, ZHI_XING, GAN_HE, GAN_HE_WUXING,
} from './data.js';
import { shiShen } from './chart.js';

const relOf = (a, b) => {
  if (a === b) return '比和';
  if (WUXING_SHENG[a] === b) return '我生';
  if (WUXING_SHENG[b] === a) return '生我';
  return keBetween(a, b);
};
function keBetween(a, b) {
  const KE = { '木': '土', '火': '金', '土': '水', '金': '木', '水': '火' };
  return KE[a] === b ? '我克' : KE[b] === a ? '克我' : '';
}

function zhiRelate(za, zb) {
  if (za === zb) return { rel: '同支', luck: '中', note: '同气相求' };
  if (ZHI_CHONG[za] === zb) return { rel: '六冲', luck: '凶', note: '根基对冲，聚少离多、易生起伏' };
  if (ZHI_LIUHE[za] === zb) return { rel: '六合', luck: '吉', note: '根基相合，相处融洽、彼此迁就' };
  for (const g of SANHE) {
    if (g.includes(za) && g.includes(zb)) return { rel: '三合', luck: '吉', note: '三合之局，互为助力、情义有源' };
  }
  for (const g of ZHI_XING) {
    if (g.length === 3 && g.includes(za) && g.includes(zb)) return { rel: '相刑', luck: '凶', note: '相刑之地，易生口角纠葛，宜各自让步' };
    if (g.length === 2 && g.includes(za) && g.includes(zb)) return { rel: '相刑', luck: '凶', note: '子卯之类相刑，言辞易伤，注意口德' };
    if (g.length === 1 && za === zb) return { rel: '自刑', luck: '凶', note: '同支自刑，各自内耗，宜留空间' };
  }
  if (ZHI_HAI[za] === zb) return { rel: '相害', luck: '凶', note: '六害之地，暗中损耗，坦诚可解' };
  return { rel: '平常', luck: '中', note: '无合无冲，平平相处' };
}

export function hePan(A, B) {
  const items = [];
  const push = (cap, main, note, luck) => items.push({ cap, main, note, luck });

  // 1. 日主互看（双向，文案按实际关系分支）
  const aG = A.dayGan, bG = B.dayGan;
  const aW = GAN_WUXING[aG], bW = GAN_WUXING[bG];
  const aToB = relOf(aW, bW);
  const ssAB = shiShen(aG, bG), ssBA = shiShen(bG, aG);
  const dayLuck = aToB === '比和' ? '吉' : (aToB === '我生' || aToB === '生我') ? '吉' : '中';
  const DAY_NOTE = {
    '比和': `两日主同为${aW}行，性情底色相近、相处不费劲，也容易一起固执——彼此留三分空间即可。`,
    '我生': `甲方${aG}${aW}生乙方${bG}${bW}：甲方付出滋养、乙方受惠，甲多让乙、乙敬甲，施受有序则长久。`,
    '生我': `乙方${bG}${bW}生甲方${aG}${aW}：乙方体贴扶持、甲方受照拂，相处中乙方更主动付出。`,
    '我克': `甲方${aG}${aW}克乙方${bG}${bW}：相处中甲方掌舵、乙方迁就——克者为管束之缘，甲方克制勿过则相安。`,
    '克我': `乙方${bG}${bW}克甲方${aG}${aW}：相处中乙方掌舵、甲方迁就，管束之缘在乙方，把「克」用成约束与担当则吉。`,
  };
  push('日主互看', `${aG}(${aW}) ⇄ ${bG}(${bW})`,
    `甲方日主${aG}${aW}对乙方日主${bG}${bW}为「${aToB}」（互看十神：${ssAB}⇄${ssBA}）。${DAY_NOTE[aToB]}`, dayLuck);

  // 2. 年支根基
  const za = A.pillars[0].zhi, zb = B.pillars[0].zhi;
  const zr = zhiRelate(za, zb);
  push('年支根基', `${za} ⇄ ${zb} · ${zr.rel}`, `双方年支${zr.rel}：${zr.note}。`, zr.luck);

  // 3. 日柱干支
  const da = A.pillars[2], db = B.pillars[2];
  if (GAN_HE[da.gan] === db.gan) {
    const heHua = GAN_HE_WUXING[[da.gan, db.gan].sort().join('')] || GAN_HE_WUXING[da.gan + db.gan] || '';
    push('日干五合', `${da.gan}合${db.gan}${heHua ? '化' + heHua : ''}`, `日干天干五合（${heHua ? '合化' + heHua + '，' : ''}两日干彼此相合），天生投缘、一见如故，古法谓之「天作之合」。`, '吉');
  }
  const dzr = zhiRelate(da.zhi, db.zhi);
  if (dzr.rel !== '平常' && dzr.rel !== '同支') {
    push('日支互看', `${da.zhi} ⇄ ${db.zhi} · ${dzr.rel}`, `双方日支${dzr.rel}：${dzr.note}。日支为婚姻宫，此条分量最重。`, dzr.luck);
  }
  const tianKe = relOf(aW, bW);
  const diChong = ZHI_CHONG[da.zhi] === db.zhi;
  if ((tianKe === '我克' || tianKe === '克我') && diChong) {
    push('天克地冲', `${da.gz} ⇄ ${db.gz}`, '日柱天干相克、地支相冲，古谓「天克地冲」：相处张力大、聚散起伏，宜晚婚或聚少离多化解。', '凶');
  }

  // 4. 五行互补
  const aYong = A.yongshen.fuyi.yong, bYong = B.yongshen.fuyi.yong;
  const aWang = Object.entries(A.wuxing.scores).sort((x, y) => y[1] - x[1])[0][0];
  const bWang = Object.entries(B.wuxing.scores).sort((x, y) => y[1] - x[1])[0][0];
  const aHelpB = bYong.includes(aWang), bHelpA = aYong.includes(bWang);
  push('五行互补', `甲喜${aYong.join('')} · 乙喜${bYong.join('')}`,
    aHelpB && bHelpA ? `两盘互为喜用（甲方旺${aWang}补乙方之喜、乙方旺${bWang}补甲方之喜），相处彼此滋养，上等互补。`
    : aHelpB ? `甲方旺${aWang}恰为乙方所喜，单向补益（乙方旺${bWang}非甲方所喜，乙方在关系中多受惠）。`
    : bHelpA ? `乙方旺${bWang}恰为甲方所喜，单向补益（甲方旺${aWang}非乙方所喜，甲方在关系中多受惠）。`
    : '双方旺衰五行不构成互补，也无大碍，感情在人不在盘。', aHelpB && bHelpA ? '吉' : '中');

  // 5. 存参杂煞（盲派合婚口诀，正书不载）
  const widowCheck = (chart, side) => {
    const yz = chart.pillars[0].zhi, mz = chart.pillars[1].zhi;
    if (ZHI_CHONG[yz] === mz) push('望门寡（存参）', `${side}方年支冲月支`, `盲派口诀「望门寡」：${side}方年支冲月支，古谓婚缘多磨。此为盲派杂煞，正书不载，仅作参考，不必当真。`, '凶');
  };
  if (B.input.gender === 0) widowCheck(B, '乙');
  if (A.input.gender === 0) widowCheck(A, '甲');

  // 汇总参考分：吉+8 中0 凶-8，基线 76
  let score = 76;
  items.forEach((it) => { score += it.luck === '吉' ? 8 : it.luck === '凶' ? -8 : 0; });
  score = Math.max(20, Math.min(98, score));
  const jcount = items.filter((i) => i.luck === '吉').length, xcount = items.filter((i) => i.luck === '凶').length;
  const summary = jcount && !xcount ? `对照 ${items.length} 项：${jcount} 项相得、无相冲，属合拍之配（参考分 ${score}）。`
    : xcount && !jcount ? `对照 ${items.length} 项：${xcount} 项相冲，需双方多用心经营（参考分 ${score}）。`
    : `对照 ${items.length} 项：合 ${jcount} 项、冲 ${xcount} 项，中平之配，成败在经营（参考分 ${score}）。`;

  return { items, score, summary };
}
