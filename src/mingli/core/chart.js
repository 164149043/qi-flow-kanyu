/**
 * chart.js —— 命理核心计算层（无 DOM 依赖，node 可直接测试）
 * ============================================================
 * 输入：出生时间 + 性别 + 选项（历法/派别/真太阳时偏移）
 * 输出：完整排盘数据（四柱/十神/藏干/星运/空亡/纳音/五行强弱/大运）
 *
 * 历法与起运由 lunar-javascript 承担（节气切月、五鼠遁时、旬空推算），
 * 规则口径（五行打分权重、强弱分界、十神标注）自研，对拍 xunq 参考站。
 *
 * 用法：buildChart({ year, month, day, hour, minute, gender, calendar, sect, tstOffsetMin })
 */
import lunar from 'lunar-javascript';
import {
  GAN, ZHI, GAN_WUXING, GAN_YINYANG, CANG_GAN, NAYIN,
  ZS_STAGES, CHANGSHENG, WUXING_SHENG, WUXING_KE,
} from './data.js';
import { scanShensha } from './shensha.js';
import { detectGeJu } from './geju.js';
import { yongshenAll } from './yongshen.js';

const { Solar, Lunar } = lunar;

/* ---------- 十神：以日主为我，按生克+阴阳定名 ---------- */
export function shiShen(dayGan, targetGan) {
  const dw = GAN_WUXING[dayGan], tw = GAN_WUXING[targetGan];
  const sameYinYang = GAN_YINYANG[dayGan] === GAN_YINYANG[targetGan];
  if (dw === tw) return sameYinYang ? '比肩' : '劫财';
  if (WUXING_SHENG[dw] === tw) return sameYinYang ? '食神' : '伤官';       // 我生
  if (WUXING_SHENG[tw] === dw) return sameYinYang ? '偏印' : '正印';       // 生我
  if (WUXING_KE[tw] === dw) return sameYinYang ? '七杀' : '正官';          // 克我
  return sameYinYang ? '偏财' : '正财';                                     // 我克
}

/* ---------- 长生十二宫：干在某支的星运 ---------- */
export function zhangSheng(gan, zhi) {
  const start = ZHI.indexOf(CHANGSHENG[gan]);
  const cur = ZHI.indexOf(zhi);
  const yang = GAN_YINYANG[gan] === '阳';
  let steps = yang ? (cur - start + 12) % 12 : (start - cur + 12) % 12;
  return ZS_STAGES[steps];
}

/* ---------- 旬空（空亡）：某柱干支的旬内空亡二支 ---------- */
export function xunKong(gz) {
  const i = gzIndex(gz); // 60 甲子序
  const xunStart = i - (i % 10);
  return [ZHI[(xunStart + 10) % 12], ZHI[(xunStart + 11) % 12]];
}
function gzIndex(gz) {
  let g = GAN.indexOf(gz[0]), z = ZHI.indexOf(gz[1]);
  // 同余求解：60 循环里干支同进
  for (let i = 0; i < 60; i++) if (i % 10 === g && i % 12 === z) return i;
  return -1;
}

/* ---------- 五行打分 ----------
 * 口径：四天干各 10 分；地支按藏干分权（三藏 0.6/0.25/0.15、两藏 0.7/0.3、一藏 1.0），
 * 月令支总量翻倍 20 分、其余支 10 分；四柱合计 90 分。
 */
export function wuxingScores(gans, zhis) {
  const scores = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };
  const detail = [];
  gans.forEach((g) => {
    const w = GAN_WUXING[g];
    scores[w] += 10;
    detail.push({ label: g, wuxing: w, score: 10, from: '天干' });
  });
  zhis.forEach((z, i) => {
    const hidden = CANG_GAN[z];
    const total = i === 1 ? 20 : 10;
    const weights = hidden.length === 1 ? [1] : hidden.length === 2 ? [0.7, 0.3] : [0.6, 0.25, 0.15];
    hidden.forEach((h, j) => {
      const w = GAN_WUXING[h];
      const s = +(total * weights[j]).toFixed(1);
      scores[w] += s;
      detail.push({ label: h, wuxing: w, score: s, from: z + (i === 1 ? '(月令)' : '') });
    });
  });
  return { scores, detail, total: 90 };
}

/* ---------- 日主强弱：同党（比劫+印）占比分界 ----------
 * <38 身弱 / <46 偏弱 / ≤54 中和 / ≤62 偏强 / >62 身强
 */
export function strengthAnalysis(dayGan, scoreResult) {
  const dw = GAN_WUXING[dayGan];
  let yin = null;
  for (const k in WUXING_SHENG) if (WUXING_SHENG[k] === dw) yin = k;
  const sameSide = scoreResult.scores[dw] + scoreResult.scores[yin];
  let total = 0;
  for (const k in scoreResult.scores) total += scoreResult.scores[k];
  const pct = Math.round((sameSide / total) * 100);
  let label, code;
  if (pct < 38) { label = '身弱'; code = 'weak'; }
  else if (pct < 46) { label = '偏弱'; code = 'slightly_weak'; }
  else if (pct <= 54) { label = '中和'; code = 'balanced'; }
  else if (pct <= 62) { label = '偏强'; code = 'slightly_strong'; }
  else { label = '身强'; code = 'strong'; }
  return { dayWuxing: dw, yinWuxing: yin, sameSide: +sameSide.toFixed(1), total: +total.toFixed(1), pct, label, code };
}

/* ---------- 主入口：buildChart ---------- */
export function buildChart(opt) {
  const {
    year, month, day, hour = 12, minute = 0,
    gender = 1,            // 1 男 0 女
    calendar = 'solar',    // 'solar' 公历 | 'lunar' 农历
    sect = 2,              // 2 晚子换日（默认）| 1 子初换日
    tstOffsetMin = 0,      // 真太阳时修正（分钟，含经度差+均时差）
  } = opt;

  // 真太阳时偏移先落到钟表时上
  let ts = new Date(year, month - 1, day, hour, minute);
  if (tstOffsetMin) ts = new Date(ts.getTime() + tstOffsetMin * 60000);

  const solar = Solar.fromYmdHms(ts.getFullYear(), ts.getMonth() + 1, ts.getDate(), ts.getHours(), ts.getMinutes(), 0);
  const lunarObj = calendar === 'lunar'
    ? Lunar.fromYmdHms(year, month, day, hour, minute, 0)
    : solar.getLunar();
  const ec = lunarObj.getEightChar();
  ec.setSect(sect);

  const gans = [ec.getYearGan(), ec.getMonthGan(), ec.getDayGan(), ec.getTimeGan()];
  const zhis = [ec.getYearZhi(), ec.getMonthZhi(), ec.getDayZhi(), ec.getTimeZhi()];
  const gz = gans.map((g, i) => g + zhis[i]);
  const dayGan = gans[2];
  const names = ['年柱', '月柱', '日柱', '时柱'];

  // 逐柱组装
  const pillars = gz.map((g, i) => {
    const hideGans = CANG_GAN[zhis[i]].map((h) => ({ gan: h, shiShen: shiShen(dayGan, h) }));
    const xun = xunKong(g);
    return {
      name: names[i], gan: gans[i], zhi: zhis[i], gz: g,
      shiShen: i === 2 ? '日主' : shiShen(dayGan, gans[i]),
      hideGans,
      xingYun: zhangSheng(dayGan, zhis[i]),   // 星运：日干在该支
      ziZuo: zhangSheng(gans[i], zhis[i]),     // 自坐：柱干在其支
      naYin: NAYIN[g] || '',
      xunKong: xun,
    };
  });

  // 空亡命中：年空/日空落到四支
  const yearKong = pillars[0].xunKong, dayKong = pillars[2].xunKong;
  pillars.forEach((p, i) => {
    p.kongYear = yearKong.includes(p.zhi);
    p.kongDay = dayKong.includes(p.zhi);
  });

  // 五行与强弱
  const wuxing = wuxingScores(gans, zhis);
  const strength = strengthAnalysis(dayGan, wuxing);

  // 大运：阳男阴女顺排、阴男阳女逆排（lunar 内含），起运岁数精确到年月
  const yun = ec.getYun(gender);
  const dys = yun.getDaYun(11);
  const dayunList = [];
  for (const d of dys) {
    const item = {
      startAge: d.getStartAge(), endAge: d.getEndAge(),
      startYear: d.getStartYear(), endYear: d.getEndYear(),
      ganZhi: d.getGanZhi(),
    };
    if (item.ganZhi) {
      const dg = item.ganZhi[0], dz = item.ganZhi[1];
      item.shiShen = shiShen(dayGan, dg);
      item.zhiShiShen = shiShen(dayGan, CANG_GAN[dz][0]);
      item.naYin = NAYIN[item.ganZhi] || '';
      item.xingYun = zhangSheng(dayGan, dz);
    }
    dayunList.push(item);
  }

  // 神煞 / 格局 / 用神（M2 规则层）
  const shensha = scanShensha({ gans, zhis, dayGan, gender });
  pillars.forEach((p, i) => { p.shensha = shensha.perPillar[i]; });
  const geju = detectGeJu(dayGan, gans, zhis, strength);
  const yongshen = yongshenAll({ dayGan, pillars, wuxing, strength });

  // 农历/属相/星座等基础信息（公历文本一律从历法对象反查，农历输入时 ts 已无意义）
  const solarFinal = calendar === 'lunar' ? lunarObj.getSolar() : solar;
  const info = {
    lunarText: `${lunarObj.toString()} ${lunarObj.getTimeZhi()}时`,
    shengXiao: lunarObj.getYearShengXiao(),
    jieQi: lunarObj.getJieQi() || '',
    solarText: `${solarFinal.getYear()}-${String(solarFinal.getMonth()).padStart(2, '0')}-${String(solarFinal.getDay()).padStart(2, '0')} ${String(solarFinal.getHour()).padStart(2, '0')}:${String(solarFinal.getMinute()).padStart(2, '0')}`,
  };

  return {
    input: { ...opt, appliedSolar: info.solarText },
    pillars, dayGan, dayWuxing: GAN_WUXING[dayGan],
    wuxing, strength,
    shensha, geju, yongshen,
    dayun: {
      startYear: yun.getStartYear(), startMonth: yun.getStartMonth(), startDay: yun.getStartDay(),
      list: dayunList,
    },
    info,
  };
}
