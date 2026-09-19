/**
 * yongshen.js —— 用神三路合参（扶抑 / 病药 / 调候）+ 通根评分
 * ============================================================
 * 扶抑：身弱用印比，身强用食伤财官杀，中和取流通（自研口径）。
 * 病药：《神峰通考》法简版——忌神最重处为「病」，克泄病者 为「药」。
 * 调候：《穷通宝鉴》精简表——按日干×月支给首选用神（通行整理本节录）。
 * 通根：得令(50) + 得地(30) + 得势(20) 百分制（通行教学口径）。
 *
 * 用法：yongshenAll(chart) → { fuyi, bingyao, tiaohou, tonggen }
 */
import { CANG_GAN, GAN_WUXING, WUXING_SHENG, ZHI_WUXING } from './data.js';
import { zhangSheng } from './chart.js';

/* ─── 调候精简表：日干 × 月支 → 首选调候用神（可两字） ───
 * 节录《穷通宝鉴》通行整理本：每月各干取主要调候之神。
 */
export const TIAOHOU = {
  '甲': { '寅': ['丙'], '卯': ['庚', '丙'], '辰': ['庚', '丁'], '巳': ['癸', '丁'], '午': ['癸', '丁'], '未': ['癸'], '申': ['庚', '丁'], '酉': ['庚', '丙'], '戌': ['庚', '甲'], '亥': ['庚', '丁'], '子': ['丁', '庚'], '丑': ['丁', '庚'] },
  '乙': { '寅': ['丙'], '卯': ['丙', '癸'], '辰': ['癸', '丙'], '巳': ['癸'], '午': ['癸', '丙'], '未': ['癸', '丙'], '申': ['丙', '癸'], '酉': ['癸', '丙'], '戌': ['癸', '辛'], '亥': ['丙'], '子': ['丙'], '丑': ['丙'] },
  '丙': { '寅': ['壬', '庚'], '卯': ['壬', '己'], '辰': ['壬', '甲'], '巳': ['壬', '庚'], '午': ['壬', '庚'], '未': ['壬', '庚'], '申': ['壬', '戊'], '酉': ['壬', '癸'], '戌': ['甲', '壬'], '亥': ['甲', '戊'], '子': ['壬', '戊'], '丑': ['壬', '甲'] },
  '丁': { '寅': ['甲', '庚'], '卯': ['庚', '甲'], '辰': ['甲', '庚'], '巳': ['甲', '庚'], '午': ['壬', '庚'], '未': ['甲', '壬'], '申': ['甲', '庚'], '酉': ['甲', '庚'], '戌': ['甲', '庚'], '亥': ['甲', '庚'], '子': ['甲', '庚'], '丑': ['甲', '庚'] },
  '戊': { '寅': ['丙', '甲'], '卯': ['丙', '甲'], '辰': ['甲', '丙'], '巳': ['甲', '丙'], '午': ['壬', '甲'], '未': ['癸', '丙'], '申': ['丙', '癸'], '酉': ['丙', '癸'], '戌': ['甲', '丙'], '亥': ['甲', '丙'], '子': ['丙', '甲'], '丑': ['丙', '甲'] },
  '己': { '寅': ['丙', '庚'], '卯': ['甲', '癸'], '辰': ['丙', '癸'], '巳': ['癸', '丙'], '午': ['癸', '丙'], '未': ['癸', '丙'], '申': ['丙', '癸'], '酉': ['丙', '癸'], '戌': ['甲', '丙'], '亥': ['丙', '甲'], '子': ['丙', '甲'], '丑': ['丙', '甲'] },
  '庚': { '寅': ['戊', '甲'], '卯': ['丁', '甲'], '辰': ['甲', '丁'], '巳': ['壬', '戊'], '午': ['壬', '癸'], '未': ['丁', '壬'], '申': ['丁', '甲'], '酉': ['丁', '甲'], '戌': ['甲', '壬'], '亥': ['丁', '丙'], '子': ['丁', '甲'], '丑': ['丙', '甲'] },
  '辛': { '寅': ['己', '壬'], '卯': ['壬', '甲'], '辰': ['壬', '甲'], '巳': ['壬', '甲'], '午': ['壬', '己'], '未': ['壬', '庚'], '申': ['壬', '甲'], '酉': ['壬', '甲'], '戌': ['壬', '甲'], '亥': ['壬', '丙'], '子': ['丙', '壬'], '丑': ['丙', '壬'] },
  '壬': { '寅': ['庚', '丙'], '卯': ['戊', '辛'], '辰': ['甲', '庚'], '巳': ['壬', '辛'], '午': ['癸', '庚'], '未': ['辛', '甲'], '申': ['戊', '丁'], '酉': ['甲', '庚'], '戌': ['甲', '丙'], '亥': ['戊', '丙'], '子': ['戊', '丙'], '丑': ['丙', '丁'] },
  '癸': { '寅': ['辛', '丙'], '卯': ['庚', '辛'], '辰': ['丙', '辛'], '巳': ['辛', '庚'], '午': ['庚', '辛'], '未': ['庚', '壬'], '申': ['丁', '庚'], '酉': ['辛', '丙'], '戌': ['辛', '甲'], '亥': ['戊', '庚'], '子': ['丙', '辛'], '丑': ['丙', '丁'] },
};

/* ─── 扶抑用神 ─── */
const WUXING_KE_LOOP = { '木': '土', '火': '金', '土': '水', '金': '木', '水': '火' };
function keOf(w) { return WUXING_KE_LOOP[w]; }   // w 克者
function keBy(w) { for (const k in WUXING_KE_LOOP) if (WUXING_KE_LOOP[k] === w) return k; } // 克 w 者

export function fuyiYongshen(dayGan, strength) {
  const dw = GAN_WUXING[dayGan];
  let yin = null;
  for (const k in WUXING_SHENG) if (WUXING_SHENG[k] === dw) yin = k;
  const bi = dw;
  const shi = WUXING_SHENG[dw];          // 我生＝食伤
  const cai = keOf(dw);                  // 我克＝财
  const guan = keBy(dw);                 // 克我＝官杀
  const code = strength.code;
  if (code === 'weak' || code === 'slightly_weak') {
    return { yong: [yin, bi], ji: [cai, guan, shi].filter(Boolean), text: `身弱以${yin}（印）、${bi}（比劫）为用，忌${cai}（财）${guan ? '、' + guan + '（官杀）' : ''}耗克，${shi}（食伤）泄气亦不宜过旺。` };
  }
  if (code === 'strong' || code === 'slightly_strong') {
    return { yong: [shi, cai, guan].filter(Boolean), ji: [yin, bi], text: `身强能任，以${shi}（食伤）泄秀、${cai}（财）耗之、${guan}（官杀）制之为用，忌${yin}（印）、${bi}（比劫）再扶。` };
  }
  return { yong: [shi, cai, guan].filter(Boolean), ji: [], text: `中和之局，无大偏颇，取五行流通为要：${shi}（食伤）、${cai}（财）、${guan}（官杀）顺泄顺用皆可，岁运补其不足。` };
}

/* ─── 病药（简版：《神峰通考》） ───
 * 身弱用印者：克印之神为病（财坏印），克病之神为药（比劫夺财护印）。
 * 身强克泄耗者：生身为病（印比），克泄病者为药。
 */
export function bingYaoAnalysis(dayGan, strength, fuyi) {
  const dw = GAN_WUXING[dayGan];
  let yin = null;
  for (const k in WUXING_SHENG) if (WUXING_SHENG[k] === dw) yin = k;
  const cai = keOf(dw);
  if ((strength.code === 'weak' || strength.code === 'slightly_weak') && fuyi.yong[0] === yin) {
    return {
      bing: cai, yao: dw,
      text: `病药参看（《神峰通考》）：用${yin}（印）而${cai}（财）坏印为「病」，取${dw}（比劫）夺财护印为「药」。岁运见${dw}有力，则印绶得护、格局始清。`,
    };
  }
  if (strength.code === 'strong' || strength.code === 'slightly_strong') {
    return {
      bing: yin, yao: cai,
      text: `病药参看：身强则${yin}（印）生身为「病」，以${cai}（财）耗印制比为「药」，财星得地则气势中和。`,
    };
  }
  return null;
}

/* ─── 调候 ─── */
export function tiaohouOf(dayGan, monthZhi) {
  const arr = (TIAOHOU[dayGan] || {})[monthZhi] || [];
  if (!arr.length) return null;
  return { yong: arr, text: `调候参看（《穷通宝鉴》）：${monthZhi}月${dayGan}${GAN_WUXING[dayGan]}，首取${arr.join('、')}调和寒暖燥湿。` };
}

/* ─── 通根评分（得令 50 + 得地 30 + 得势 20） ─── */
export function tongGenScore(dayGan, gans, zhis, wuxingScores) {
  const dw = GAN_WUXING[dayGan];
  // 得令：月支本气/中气与日主同五行或生日主
  const mc = CANG_GAN[zhis[1]].map((h) => GAN_WUXING[h]);
  const deLing = mc[0] === dw || WUXING_SHENG[mc[0]] === dw ? 50 : (mc.some((w) => w === dw || WUXING_SHENG[w] === dw) ? 35 : 15);
  // 得地：禄旺根（临官/帝旺之支在日/月/时）
  let deDi = 0;
  const roots = [];
  zhis.forEach((z, i) => {
    const st = zhangSheng(dayGan, z);
    if (st === '临官' || st === '帝旺') {
      deDi += i === 2 ? 50 : 40;
      roots.push(`${['年', '月', '日', '时'][i]}支${z}（${st}）`);
    } else if (st === '墓' && ZHI_WUXING[z] === dw) {
      deDi += 8;
      roots.push(`${['年', '月', '日', '时'][i]}支${z}（墓库）`);
    } else {
      // 余气根：支藏干有同五行
      const has = CANG_GAN[z].some((h) => GAN_WUXING[h] === dw);
      if (has) { deDi += 5; roots.push(`${['年', '月', '日', '时'][i]}支${z}（余气）`); }
    }
  });
  deDi = Math.min(deDi, 100) * 0.3;
  // 得势：天干比劫个数（除日主）
  const biCount = gans.filter((g, i) => i !== 2 && GAN_WUXING[g] === dw).length;
  const deShi = Math.min(biCount / 3, 1) * 20;
  const total = Math.round(deLing + deDi + deShi);
  const label = total >= 70 ? '根深' : total >= 45 ? '有根' : total >= 25 ? '根浅' : '无根';
  return {
    deLing, deDi: +deDi.toFixed(1), deShi: +deShi.toFixed(1), total, label, roots,
    text: `通根评分：得令 ${Math.round(deLing)}/50 + 得地 ${Math.round(deDi)}/30 + 得势 ${Math.round(deShi)}/20 ＝ ${total}（${label}）。${roots.join('、') || '四支皆不见根'}。`,
  };
}

/* ─── 合参入口 ─── */
export function yongshenAll(chart) {
  const { dayGan, pillars, wuxing, strength } = chart;
  const gans = pillars.map((p) => p.gan), zhis = pillars.map((p) => p.zhi);
  const fuyi = fuyiYongshen(dayGan, strength);
  const bingyao = bingYaoAnalysis(dayGan, strength, fuyi);
  const tiaohou = tiaohouOf(dayGan, zhis[1]);
  const tonggen = tongGenScore(dayGan, gans, zhis, wuxing);
  // 从势判定与提示专用喜用：从格不劳印比强扶，提示卡改推最旺两行（顺其旺势），
  // 避免与格局层「从势之象」结论互相打架
  const congGe = strength.pct <= 22;
  const wangOrder = Object.entries(wuxing.scores).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  const tishiYong = congGe ? wangOrder.slice(0, 2) : fuyi.yong.slice(0, 2);
  return { fuyi, bingyao, tiaohou, tonggen, congGe, tishiYong };
}
