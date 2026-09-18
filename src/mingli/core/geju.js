/**
 * geju.js —— 格局判定（月令本气透干定格 + 比劫月令特判 + 从势简判）
 * ============================================================
 * 口径（通行子平法，自研实现）：
 *   1. 月支藏干透出年/月/时干者，按其十神定格（正官格…伤官格），主气优先；
 *   2. 比劫月令：比肩临官＝建禄格；阳日主劫财＝阳刃格；其余＝月劫格
 *      （五阴干无阳刃，通行通例）；
 *   3. 无透干：以月支本气十神加「藏」字（如「正官格（藏）」；
 *   4. 极端五行（一行独大、日主无根尽克）标注从势倾向，供参。
 *
 * 用法：detectGeJu(dayGan, gans, zhis, strength) →
 *   { main, via, tougan: [...], special: [...], summary }
 */
import { CANG_GAN, GAN_WUXING } from './data.js';
import { shiShen, zhangSheng } from './chart.js';
import { GAN_YINYANG } from './data.js';

const GE_MAP = { '正官': '正官格', '七杀': '七杀格', '正财': '正财格', '偏财': '偏财格', '正印': '正印格', '偏印': '偏印格', '食神': '食神格', '伤官': '伤官格' };

export function detectGeJu(dayGan, gans, zhis, strength) {
  const monthZhi = zhis[1];
  const cang = CANG_GAN[monthZhi]; // [主气, 中气, 余气]
  const res = { main: '', via: '', tougan: [], special: [], summary: '' };

  // 透干：月支藏干出现在年/月/时干（主气优先，藏干顺序天然保证）
  cang.forEach((h) => {
    for (let i = 0; i < 4; i++) {
      if (i !== 2 && gans[i] === h) { res.tougan.push(h); break; }
    }
  });

  const mainSS = shiShen(dayGan, cang[0]);
  if (mainSS === '比肩' || mainSS === '劫财') {
    // 比劫月令特判
    const isYang = GAN_YINYANG[dayGan] === '阳';
    if (mainSS === '比肩') {
      res.main = zhangSheng(dayGan, monthZhi) === '临官' ? '建禄格' : '月劫格';
    } else {
      res.main = isYang ? '阳刃格' : '月劫格';
    }
    res.via = `月令${monthZhi}为日主${mainSS}之地`;
  } else if (res.tougan.length) {
    // 透干定格：第一透干（主气优先）
    const firstSS = shiShen(dayGan, res.tougan[0]);
    const secondSS = res.tougan[1] ? shiShen(dayGan, res.tougan[1]) : '';
    res.main = GE_MAP[firstSS] || (firstSS + '格');
    res.via = `月令${monthZhi}藏${res.tougan.join('、')}透干${secondSS ? '，' + res.tougan[0] + '为主' : ''}`;
  } else {
    const ss = GE_MAP[mainSS] || (mainSS + '格');
    res.main = ss + '（藏）';
    res.via = `月令${monthZhi}本气${cang[0]}不透，以藏气论`;
  }

  // 从势/专旺简判（供参考，不作定格）
  const dw = GAN_WUXING[dayGan];
  if (strength) {
    if (strength.code === 'strong' && strength.pct >= 78) res.special.push(`日主同党 ${strength.pct}%，有专旺（一行得气）之象，喜顺其势`);
    if (strength.code === 'weak' && strength.pct <= 22) res.special.push(`日主同党仅 ${strength.pct}%，有从势之象（从财/从杀/从儿视所从之神），不劳印比强扶`);
  }

  res.summary = `${res.main}：${res.via}。${res.special.join('；')}`;
  return res;
}
