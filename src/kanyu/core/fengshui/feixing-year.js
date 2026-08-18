/**
 * feixing-year.js —— 年紫白九宫飞星成盘
 * ============================================================
 * 值年星入中宫顺飞。★ 宫位是地理绝对方位（坎北离南），不随门朝向转
 * （这点与八宅不同——八宅随门朝向转，年飞星固定）。
 *
 * 包装 legacy feixing.js 的 yearStar + flyForward。
 */
import { yearStar, flyForward, STARS, PALACE_ORDER } from '../index.js';

/**
 * @param {number} year 公历年（如 2026）
 * @returns {{year, centerStar, centerInfo, palaces:[{gong,star,info}], desc}}
 */
export function yearFeixingPan(year) {
  const center = yearStar(year);          // 入中星 1~9
  const pan = flyForward(center);         // {中:star, 乾:star, ...}（顺飞）
  return {
    year,
    centerStar: center,
    centerInfo: STARS[center],
    palaces: PALACE_ORDER.map((gong) => ({ gong, star: pan[gong], info: STARS[pan[gong]] })),
    desc: `${year}年 ${STARS[center].star}入中`,
  };
}
