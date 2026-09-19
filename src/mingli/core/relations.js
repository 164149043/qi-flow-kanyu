/**
 * relations.js —— 单盘干支关系汇总（天干五合 / 地支六合化 / 三合整局 / 半合 / 六冲 / 相刑分型 / 相害 / 自刑）
 * ============================================================
 * 口径（通行子平法）：
 *   · 天干五合：四干两两（日主参与），标合化五行；
 *   · 地支六合：两两，标合化五行；
 *   · 三合：一组三支俱全成整局；含旺支（子午卯酉）的任意两支为半合（申辰无旺支不算）；
 *   · 相刑分型：寅巳申＝无恩之刑、丑戌未＝恃势之刑、子卯＝无礼之刑、辰午酉亥自见＝自刑；
 *   · 六冲、相害两两直查。
 * 「合而化」需月令条件辅成，此处按通行呈现直标化神，释义抽屉中注明。
 *
 * 用法：ganZhiRelations(gans, zhis) → [{ type, text, luck, pillars:[i,j] }]
 */
import { GAN_HE_WUXING, ZHI_CHONG, ZHI_LIUHE_WUXING, ZHI_HAI, SANHE } from './data.js';

const XING_GROUPS = [
  { zhis: ['寅', '巳', '申'], name: '无恩之刑' },
  { zhis: ['丑', '戌', '未'], name: '恃势之刑' },
  { zhis: ['子', '卯'], name: '无礼之刑' },
];
const ZI_XING = ['辰', '午', '酉', '亥']; // 自刑支
const SANHE_WANG = { 0: '子', 1: '午', 2: '酉', 3: '卯' };   // 各三合组旺支
const SANHE_WX = { 0: '水', 1: '火', 2: '金', 3: '木' };      // 各三合组化神

const PN = ['年', '月', '日', '时'];

export function ganZhiRelations(gans, zhis) {
  const items = [];
  const push = (type, text, luck, pillars) => items.push({ type, text, luck, pillars: pillars.map((p) => PN[p]) });

  // 天干五合（两两，含日主）
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const pair = [gans[i], gans[j]].sort().join('');
    if (GAN_HE_WUXING[pair]) push('干合', `${gans[i]}${gans[j]}合化${GAN_HE_WUXING[pair]}`, '吉', [i, j]);
  }

  // 地支两两：六合 / 六冲 / 相害 / 相刑（分型）
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const za = zhis[i], zb = zhis[j];
    const liu = ZHI_LIUHE_WUXING[[za, zb].sort().join('')];
    if (liu) push('六合', `${za}${zb}六合化${liu}`, '吉', [i, j]);
    if (ZHI_CHONG[za] === zb) push('六冲', `${za}${zb}相冲`, '凶', [i, j]);
    for (const g of XING_GROUPS) {
      if (g.zhis.includes(za) && g.zhis.includes(zb) && za !== zb) push('相刑', `${za}${zb}刑（${g.name}）`, '凶', [i, j]);
    }
    if (ZHI_HAI[za] === zb) push('相害', `${za}${zb}相害`, '凶', [i, j]);
  }

  // 三合整局 / 半合（按组收集 distinct 支；半合须含旺支）
  SANHE.forEach((group, gi) => {
    const hitPillars = {};
    zhis.forEach((z, i) => { if (group.includes(z) && hitPillars[z] === undefined) hitPillars[z] = i; });
    const hits = Object.keys(hitPillars);
    const wx = SANHE_WX[gi], wang = SANHE_WANG[gi];
    if (hits.length === 3) {
      push('三合', `${hits.join('')}三合${wx}局`, '吉', Object.values(hitPillars));
    } else if (hits.length === 2 && hits.includes(wang)) {
      push('半合', `${hits.join('')}半合${wx}局`, '吉', Object.values(hitPillars));
    }
  });

  // 自刑：同支两见
  const seen = {};
  zhis.forEach((z, i) => {
    if (seen[z] !== undefined && ZI_XING.includes(z)) push('自刑', `${z}${z}自刑`, '凶', [seen[z], i]);
    if (seen[z] === undefined) seen[z] = i;
  });

  return items;
}
