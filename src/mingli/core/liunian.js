/**
 * liunian.js —— 流年详查（任意年份 vs 命局 / 大运的叠盘作用）
 * ============================================================
 * 口径：
 *   · 年干支按立春换年（getYearInGanZhiByLiChun），与排盘年柱一致；
 *   · 作用面：流年支对四柱支（冲/合/刑/害）、流年干对年月时干（五合）、
 *     流年干支对所行大运（冲/合）；
 *   · 断语三条经典象：岁运并临、天克地冲日柱、冲提纲（《三命通会》口径，
 *     只标象与提示，吉凶仍看喜忌——大运十神已知，由 UI 层合参呈现）。
 *
 * 用法：liuNianDetail(chart, 2035) → { year, gz, ss, zhiSS, age, dy, acts, dyActs, notes }
 */
import lunar from 'lunar-javascript';
import {
  GAN_WUXING, CANG_GAN, WUXING_KE,
  ZHI_CHONG, ZHI_LIUHE, ZHI_HAI, ZHI_XING, GAN_HE,
} from './data.js';
import { shiShen } from './chart.js';

const { Solar } = lunar;

/** 任意年份干支（立春口径） */
export function yearGanZhi(year) {
  return Solar.fromYmd(year, 6, 15).getLunar().getYearInGanZhiByLiChun();
}

const keOf = (a, b) => WUXING_KE[GAN_WUXING[a]] === GAN_WUXING[b];   // a 干克 b 干

export function liuNianDetail(chart, year) {
  const gz = yearGanZhi(year);
  const g = gz[0], z = gz[1];
  const dayGan = chart.dayGan;
  const ss = shiShen(dayGan, g);                 // 流年干对日主
  const zhiSS = shiShen(dayGan, CANG_GAN[z][0]); // 流年支藏干本气对日主

  // 该年行哪步大运
  const dy = chart.dayun.list.filter((d) => d.ganZhi).find((d) => year >= d.startYear && year <= d.endYear) || null;

  // 流年 vs 四柱
  const acts = [];
  chart.pillars.forEach((p) => {
    if (ZHI_CHONG[z] === p.zhi) acts.push({ text: `${z}冲${p.zhi}`, luck: '凶', pillar: p.name, note: `流年冲${p.name}，主该宫所主之事动荡` });
    if (ZHI_LIUHE[z] === p.zhi) acts.push({ text: `${z}合${p.zhi}`, luck: '吉', pillar: p.name, note: `流年合${p.name}，该宫之事有牵系引动` });
    if (ZHI_HAI[z] === p.zhi) acts.push({ text: `${z}害${p.zhi}`, luck: '凶', pillar: p.name, note: `流年害${p.name}，暗中损耗宜防` });
    if (z === p.zhi) acts.push({ text: `${z}伏吟${p.zhi}`, luck: '中', pillar: p.name, note: `流年与${p.name}同支为伏吟，「反吟伏吟，泪吟吟」，主牵延重复之情` });
  });
  // 相刑（组内互刑，命局有同组支即成）
  for (const grp of ZHI_XING) {
    if (!grp.includes(z)) continue;
    chart.pillars.forEach((p) => {
      if (p.zhi !== z && grp.includes(p.zhi)) {
        acts.push({ text: `${z}刑${p.zhi}`, luck: '凶', pillar: p.name, note: `流年刑${p.name}，易生人事纠葛` });
      }
    });
  }
  // 流年干 vs 年/月/时干五合
  [0, 1, 3].forEach((i) => {
    const pg = chart.pillars[i].gan;
    if (GAN_HE[g] === pg) acts.push({ text: `${g}合${pg}`, luck: '吉', pillar: chart.pillars[i].name, note: `流年干合${chart.pillars[i].name}干，情缘牵绊` });
  });

  // 流年 vs 大运
  const dyActs = [];
  if (dy) {
    const dz = dy.ganZhi[1], dg = dy.ganZhi[0];
    if (ZHI_CHONG[z] === dz) dyActs.push({ text: `支冲大运${dy.ganZhi}`, luck: '凶' });
    if (ZHI_LIUHE[z] === dz) dyActs.push({ text: `支合大运${dy.ganZhi}`, luck: '吉' });
    if (GAN_HE[g] === dg) dyActs.push({ text: `干合大运${dy.ganZhi}`, luck: '吉' });
  }

  // 经典断语（只标象，吉凶看喜忌）
  const notes = [];
  if (dy && gz === dy.ganZhi) notes.push('岁运并临：流年与所行大运干支全同，其象倍增，吉凶皆宜加倍看（《三命通会》）。');
  const dayP = chart.pillars[2];
  if (ZHI_CHONG[z] === dayP.zhi && (keOf(g, dayGan) || keOf(dayGan, g))) {
    notes.push('天克地冲（冲日柱）：流年与日柱干克支冲，主门户身心起伏，宜静守不宜大动。');
  }
  if (ZHI_CHONG[z] === chart.pillars[1].zhi) notes.push('冲提纲：流年支冲月令，提纲为全局之纲，主环境根基动摇，谋事宜稳。');

  return { year, gz, ss, zhiSS, age: year - chart.input.year + 1, dy, acts, dyActs, notes };
}
