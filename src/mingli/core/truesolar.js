/**
 * truesolar.js —— 真太阳时换算（经度差 + 均时差）
 * ============================================================
 * 钟表时（北京时间，东经120°基准）→ 真太阳时：
 *   偏移(分) ＝ 经度差(分) + 均时差(分)
 *   经度差 ＝ (城市东经 - 120°) × 4 分/度
 *   均时差 ＝ 9.87·sin(2B) − 7.53·cos(B) − 1.5·sin(B)，B = 2π(年内日序-81)/364
 *     （Spencer 四谐波截断公式的通行三谐波近似，公共天文公式，误差 < ±0.5 分）
 * 城市表为公开地理坐标节录（国内主要城市，按东经）。
 *
 * 用法：trueSolarOffset({ year, month, day }, '北京') →
 *   { ok, lon, lonDelta, eot, offsetMin, note }
 */

export const CITY_LON = {
  '北京': 116.41, '天津': 117.20, '石家庄': 114.51, '太原': 112.55, '呼和浩特': 111.75,
  '沈阳': 123.43, '长春': 125.32, '哈尔滨': 126.63, '上海': 121.47, '南京': 118.80,
  '杭州': 120.16, '合肥': 117.28, '福州': 119.30, '南昌': 115.89, '济南': 117.00,
  '郑州': 113.63, '武汉': 114.31, '长沙': 112.94, '广州': 113.26, '深圳': 114.06,
  '南宁': 108.37, '海口': 110.32, '重庆': 106.55, '成都': 104.07, '贵阳': 106.63,
  '昆明': 102.83, '拉萨': 91.11, '西安': 108.94, '兰州': 103.83, '西宁': 101.78,
  '银川': 106.23, '乌鲁木齐': 87.62, '香港': 114.17, '澳门': 113.55, '台北': 121.56,
  '大连': 121.62, '青岛': 120.38, '厦门': 118.09, '宁波': 121.55, '苏州': 120.58,
  '无锡': 120.31, '佛山': 113.12, '东莞': 113.75, '珠海': 113.58, '温州': 120.70,
  '洛阳': 112.45, '徐州': 117.28, '唐山': 118.18, '大庆': 125.10,
};

/** 均时差（分钟）。d 为 Date（取本地日期算年内日序即可，误差可忽略）。 */
export function equationOfTime(d) {
  const start = Date.UTC(d.getFullYear(), 0, 0);
  const n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000);
  const B = (2 * Math.PI * (n - 81)) / 364;
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

/** 真太阳时偏移：返回总偏移分钟（含正负）。 */
export function trueSolarOffset(dateParts, cityName) {
  const lon = CITY_LON[cityName];
  if (lon === undefined) return { ok: false, offsetMin: 0, note: `城市「${cityName}」未识别，未作校正` };
  const d = new Date(dateParts.year, dateParts.month - 1, dateParts.day);
  const lonDelta = (lon - 120) * 4;
  const eot = equationOfTime(d);
  const offsetMin = +(lonDelta + eot).toFixed(1);
  return {
    ok: true, lon, lonDelta: +lonDelta.toFixed(1), eot: +eot.toFixed(1), offsetMin,
    note: `${cityName}（东经 ${lon}°）：经度差 ${lonDelta >= 0 ? '+' : ''}${lonDelta.toFixed(0)} 分 · 均时差 ${eot >= 0 ? '+' : ''}${eot.toFixed(1)} 分 ⇒ 真太阳时 ${offsetMin >= 0 ? '加' : '减'} ${Math.abs(offsetMin).toFixed(1)} 分钟`,
  };
}
