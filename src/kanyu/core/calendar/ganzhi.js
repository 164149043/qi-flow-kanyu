/**
 * ganzhi.js —— 四柱干支 + 时辰标签（包 lunar-javascript）
 * ============================================================
 * 阶段C「当下时辰面板」用。lunar-javascript 按节气切月、五鼠遁起时干，标准且准。
 * 原站 kanyu 页 getGanZhi 是自算 diff 法（curl 逆向 1465~1482 行），这里用 lunar 库等价替代、更准。
 *
 * 用法：getGanZhi(date) → {y,m,d,h,str}；shichenLabel(idx) → "未时 13:00-15:00"
 */
import lunar from 'lunar-javascript';
const { Solar } = lunar;

export const TIANGAN = '甲乙丙丁戊己庚辛壬癸';
export const DIZHI = '子丑寅卯辰巳午未申酉戌亥';

/** 取四柱干支：年/月/日/时（按节气、五鼠遁）。返回 str = "丙午年 乙未月 甲辰日 辛未时"。 */
export function getGanZhi(date = new Date()) {
  const lu = Solar.fromDate(date).getLunar();
  const y = lu.getYearInGanZhi();
  const m = lu.getMonthInGanZhi();
  const d = lu.getDayInGanZhi();
  const h = lu.getTimeInGanZhi();
  return { y, m, d, h, str: `${y}年 ${m}月 ${d}日 ${h}时` };
}

/** 时辰序号(0~11，子=0)→显示标签，如 7→"未时 13:00-15:00"。原站 shichenName 拼法同款。 */
export function shichenLabel(idx) {
  const z = DIZHI[idx];
  const start = String((idx * 2 - 1 + 24) % 24).padStart(2, '0');
  const end = String((idx * 2 + 1) % 24).padStart(2, '0');
  return `${z}时 ${start}:00-${end}:00`;
}
