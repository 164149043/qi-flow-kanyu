/**
 * huangli.js —— 黄历（宜忌/彭祖/值神/星宿/时辰吉凶），包 lunar-javascript
 * ============================================================
 * 阶段D「黄历弹窗」用。日级黄历用 lunar-javascript 直接取（比原站自建查表更全更准），
 * 12 时辰黄黑道吉凶用原站 hourLuckByZhi 算法（HUANGDAO 神名+吉凶序，curl 逆向 2106~2113 实锤）。
 *
 * 用法：getHuangLi(date) → 黄历全字段对象；main.js 填充弹窗。
 */
import lunar from 'lunar-javascript';
import { getGanZhi, TIANGAN, DIZHI } from './ganzhi.js';
const { Solar } = lunar;

/** 十二黄黑道神名（起青龙，按日支定起点轮转）+ 吉凶序（1吉/0凶）。原站 HUANGDAO_SEQ/GODS 实锤。 */
const HUANGDAO_GODS = ['青龙', '明堂', '天刑', '朱雀', '金匮', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陈'];
const HUANGDAO_LUCK = [1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0];
/** 青龙起神位置（按日支）：子午起申(8)，丑未起戌(10)，寅申起子(0)，卯酉起寅(2)，辰戌起辰(4)，巳亥起午(6) */
const HUANGDAO_START = { 0: 8, 6: 8, 1: 10, 7: 10, 2: 0, 8: 0, 3: 2, 9: 2, 4: 4, 10: 4, 5: 6, 11: 6 };

/** 时辰黄黑道：日支序 + 时支序 → {god 神名, luck 吉/凶} */
function hourLuck(dayZhi, hourZhi) {
  const idx = ((hourZhi - HUANGDAO_START[dayZhi]) % 12 + 12) % 12;
  return { god: HUANGDAO_GODS[idx], luck: HUANGDAO_LUCK[idx] ? '吉' : '凶' };
}

/** 取黄历全字段。date 缺省=当前。 */
export function getHuangLi(date = new Date()) {
  const lu = Solar.fromDate(date).getLunar();
  const gz = getGanZhi(date);
  const dayG = TIANGAN.indexOf(gz.d[0]); // 日干序号
  const dayZ = DIZHI.indexOf(gz.d[1]);   // 日支序号

  // 12 时辰：五鼠遁时干 + 黄黑道神名/吉凶
  const hours = [];
  for (let h = 0; h < 12; h++) {
    const hGIdx = ((dayG % 5) * 2 + h) % 10;            // 五鼠遁：日干起时干
    const hl = hourLuck(dayZ, h);
    hours.push({ zhi: DIZHI[h], gz: TIANGAN[hGIdx] + DIZHI[h], god: hl.god, luck: hl.luck });
  }

  return {
    lunar: lu.getMonthInChinese() + '月' + lu.getDayInChinese(),     // 六月十六
    jieQi: lu.getJieQi() || '',                                      // 当日节气（非节气日空）
    ganzhi: gz.str,                                                  // 丙午年 乙未月 甲辰日 辛未时
    nayin: lu.getDayNaYin(),                                         // 覆灯火（日纳音）
    yi: lu.getDayYi(),                                               // 宜
    ji: lu.getDayJi(),                                               // 忌
    zhiShen: lu.getDayTianShen(),                                    // 值神（白虎）
    zhiShenType: lu.getDayTianShenType(),                            // 黄道/黑道
    zhiShenLuck: lu.getDayTianShenLuck(),                            // 吉/凶
    jianChu: lu.getZhiXing(),                                        // 建除十二神（收）
    chong: lu.getDayChong() + ' 煞 ' + lu.getDaySha(),               // 戌 煞 南
    xiu: lu.getXiu() + lu.getAnimal(),                               // 箕豹（二十八宿+动物）
    xiuLuck: lu.getXiuLuck(),                                        // 吉/凶
    jiShen: lu.getDayJiShen(),                                       // 吉神宜趋
    xiongSha: lu.getDayXiongSha(),                                   // 凶神宜忌
    taiShen: lu.getDayPositionTai(),                                 // 胎神
    pengZu: lu.getPengZuGan() + ' · ' + lu.getPengZuZhi(),           // 彭祖百忌
    hours,                                                           // 12 时辰 {zhi,gz,god,luck}
  };
}
