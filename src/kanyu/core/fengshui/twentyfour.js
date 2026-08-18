/**
 * twentyfour.js —— 二十四山分类（方位吉凶）
 * ============================================================
 * 原站实锤分类（寻炁-架构蓝图 §4.5 / kanyu 页文案）：
 *   三吉：甲 巳 庚       六秀：辰 亥 丑 丙 丁 酉
 *   三恶：卯 申 戌       六害：寅 乙 未 辛 壬 癸
 * 四维（乾艮巽坤）+ 四正（子午卯酉）中性。
 *
 * 依赖：core/index.js 的 M24（来自 legacy/bagua）。
 */
import { M24 } from '../index.js';

const CLASSIFY = {
  三吉: ['甲', '巳', '庚'],
  六秀: ['辰', '亥', '丑', '丙', '丁', '酉'],
  三恶: ['卯', '申', '戌'],
  六害: ['寅', '乙', '未', '辛', '壬', '癸'],
};
const LUCK_OF = { 三吉: '吉', 六秀: '吉', 三恶: '凶', 六害: '凶' };

// 分类含义（公开阳宅方位理气）：三吉六秀主吉、三恶六害主凶；中性=子午中轴+乾艮巽坤四维
const CLASSIFY_DESC = {
  三吉: '大吉方位，主贵人扶持、人丁兴旺、事业有成，宜门、灶、主卧纳吉。',
  六秀: '次吉方位，主科甲文昌、出人聪明秀发，宜书房、文昌位、求学升迁。',
  三恶: '凶方位，主灾祸损伤、损丁破财，宜避，忌门、灶、卧室。',
  六害: '小凶方位，主暗耗破财、口舌是非、小病缠绵，宜居厕、储物镇压。',
  中性: '子午（南北中轴）与乾艮巽坤（四维）为中性方位，本身无大吉凶，吉凶随流年飞星与坐向组合而定。',
};

/** 给定山名返回 { tag, luck, desc }；四维 + 子午为中性 */
export function classifyMountain(name) {
  for (const [tag, arr] of Object.entries(CLASSIFY)) {
    if (arr.includes(name)) return { tag, luck: LUCK_OF[tag], desc: CLASSIFY_DESC[tag] };
  }
  return { tag: '中性', luck: '平', desc: CLASSIFY_DESC['中性'] };
}

/** 二十四山完整表（M24 + 分类） */
export const MOUNTAINS24_FULL = M24.map((m) => ({ ...m, ...classifyMountain(m.name) }));

/** 度数 → 最近的山名（地理角，0=北顺时针） */
export function degToMountain(deg) {
  let best = M24[0], bd = Infinity;
  for (const m of M24) {
    let d = Math.abs(m.deg - deg);
    if (d > 180) d = 360 - d;
    if (d < bd) { bd = d; best = m; }
  }
  return best.name;
}
