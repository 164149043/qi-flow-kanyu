/**
 * moonphase.js —— 月相计算（纯函数，零依赖）
 * ============================================================
 * 朔望月周期法：以 2000-01-06 18:14 UTC 朔月为参考点，按 29.530588853 天周期算月龄。
 * 原站 moonAgeDays / moonPhaseName 实锤（curl 逆向 867~873 行），照搬。
 * 从 compass.js 抽出，供 罗盘天池 / 时辰面板 共用。
 */

/** 朔月参考点（2000-01-06 18:14 UTC）+ 朔望月平均周期（天） */
export const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14);
export const SYNODIC = 29.530588853;

/** 当前月龄（天，0~29.53）。传入毫秒时间戳。 */
export function moonAgeDays(nowMs) {
  const dd = (nowMs - NEW_MOON_REF) / 86400000;
  return ((dd % SYNODIC) + SYNODIC) % SYNODIC;
}

/** 月龄→月相名（朔/娥眉/上弦/盈凸/望/亏凸/下弦/残月）。原站 moonPhaseName 同款分段。 */
export function moonPhaseName(age) {
  const n = Math.round(age);
  if (n <= 1) return '朔（新月）';
  if (n <= 3) return '娥眉月';
  if (n <= 7) return '上弦';
  if (n <= 10) return '盈凸';
  if (n <= 16) return '望（满月）';
  if (n <= 21) return '亏凸';
  if (n <= 23) return '下弦';
  if (n <= 28) return '残月';
  return '朔（新月）';
}
