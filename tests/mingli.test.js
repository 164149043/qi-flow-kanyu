/**
 * mingli.test.js —— 命理 core 层 golden 对拍
 * ============================================================
 * 真值口径：lunar-javascript（与参考站同源同库）+ 参考站规则口径手工核算。
 * 覆盖：四柱/十神/藏干/星运/空亡/纳音/五行打分/强弱/大运顺逆/历法边界。
 */
import { describe, it, expect } from 'vitest';
import { buildChart, shiShen, zhangSheng, xunKong, wuxingScores, strengthAnalysis } from '../src/mingli/core/chart.js';
import { CANG_GAN } from '../src/mingli/core/data.js';
import { scanShensha } from '../src/mingli/core/shensha.js';
import { detectGeJu } from '../src/mingli/core/geju.js';
import { tiaohouOf, tongGenScore } from '../src/mingli/core/yongshen.js';
import { equationOfTime, trueSolarOffset } from '../src/mingli/core/truesolar.js';
import { hePan } from '../src/mingli/core/hepan.js';

describe('十神 shiShen（以日主为我）', () => {
  it('己土日主四关系', () => {
    expect(shiShen('己', '戊')).toBe('劫财'); // 同我异阴阳
    expect(shiShen('己', '庚')).toBe('伤官'); // 我生异阴阳
    expect(shiShen('己', '辛')).toBe('食神'); // 我生同阴阳
    expect(shiShen('己', '壬')).toBe('正财'); // 我克异阴阳
    expect(shiShen('己', '癸')).toBe('偏财'); // 我克同阴阳
    expect(shiShen('己', '甲')).toBe('正官'); // 克我异阴阳
    expect(shiShen('己', '乙')).toBe('七杀'); // 克我同阴阳
    expect(shiShen('己', '丙')).toBe('正印'); // 生我异阴阳
    expect(shiShen('己', '丁')).toBe('偏印'); // 生我同阴阳
    expect(shiShen('己', '己')).toBe('比肩');
  });
  it('庚金日主抽查', () => {
    expect(shiShen('庚', '甲')).toBe('偏财');
    expect(shiShen('庚', '丁')).toBe('正官');
    expect(shiShen('庚', '癸')).toBe('伤官');
  });
});

describe('长生十二宫 zhangSheng', () => {
  it('阳干顺行：甲长生亥、帝旺卯', () => {
    expect(zhangSheng('甲', '亥')).toBe('长生');
    expect(zhangSheng('甲', '卯')).toBe('帝旺');
    expect(zhangSheng('甲', '未')).toBe('墓');
  });
  it('阴干逆行：乙长生午、辛长生子', () => {
    expect(zhangSheng('乙', '午')).toBe('长生');
    expect(zhangSheng('乙', '亥')).toBe('死');
    expect(zhangSheng('辛', '子')).toBe('长生');
    expect(zhangSheng('辛', '辰')).toBe('墓');
  });
});

describe('旬空 xunKong', () => {
  it('甲子旬空戌亥、己酉旬空寅卯', () => {
    expect(xunKong('甲子')).toEqual(['戌', '亥']);
    expect(xunKong('己酉')).toEqual(['寅', '卯']);
    expect(xunKong('壬申')).toEqual(['戌', '亥']);
    expect(xunKong('癸亥')).toEqual(['子', '丑']);
  });
});

describe('五行打分 wuxingScores（总分恒 90）', () => {
  it('1988-08-22 14:30 盘：木4 火2.5 土35 金42 水6.5', () => {
    const r = wuxingScores(['戊', '庚', '己', '辛'], ['辰', '申', '酉', '未']);
    expect(r.total).toBe(90);
    expect(r.scores).toEqual({ '木': 4, '火': 2.5, '土': 35, '金': 42, '水': 6.5 });
  });
  it('月令权重翻倍：月支藏干总量 20', () => {
    const r = wuxingScores(['甲', '丙', '戊', '庚'], ['子', '午', '卯', '酉']);
    // 月支午两藏[0.7,0.3]×20=丁14+己6；子癸10；卯乙10；酉辛10；干40 → 90
    expect(r.scores['火']).toBeCloseTo(24); // 丙10 + 丁14
    expect(r.scores['土']).toBeCloseTo(16); // 戊10 + 己6
    expect(r.total).toBe(90);
  });
});

describe('强弱 strengthAnalysis 分界', () => {
  const mk = (n) => ({ scores: { '木': n, '火': 0, '土': 0, '金': 100 - n, '水': 0 }, total: 100 });
  it('37/38/45/46/54/55/62/63 走对应档', () => {
    expect(strengthAnalysis('甲', mk(37)).code).toBe('weak');
    expect(strengthAnalysis('甲', mk(38)).code).toBe('slightly_weak');
    expect(strengthAnalysis('甲', mk(45)).code).toBe('slightly_weak');
    expect(strengthAnalysis('甲', mk(46)).code).toBe('balanced');
    expect(strengthAnalysis('甲', mk(54)).code).toBe('balanced');
    expect(strengthAnalysis('甲', mk(55)).code).toBe('slightly_strong');
    expect(strengthAnalysis('甲', mk(62)).code).toBe('slightly_strong');
    expect(strengthAnalysis('甲', mk(63)).code).toBe('strong');
  });
});

describe('buildChart 主 golden：1988-08-22 14:30 男', () => {
  const c = buildChart({ year: 1988, month: 8, day: 22, hour: 14, minute: 30, gender: 1 });
  it('四柱与十神', () => {
    expect(c.pillars.map((p) => p.gz)).toEqual(['戊辰', '庚申', '己酉', '辛未']);
    expect(c.pillars.map((p) => p.shiShen)).toEqual(['劫财', '伤官', '日主', '食神']);
  });
  it('星运与自坐', () => {
    expect(c.pillars.map((p) => p.xingYun)).toEqual(['衰', '沐浴', '长生', '冠带']);
    expect(c.pillars.map((p) => p.ziZuo)).toEqual(['冠带', '临官', '长生', '衰']);
  });
  it('空亡', () => {
    expect(c.pillars[2].xunKong).toEqual(['寅', '卯']);
    expect(c.pillars[0].xunKong).toEqual(['戌', '亥']);
  });
  it('纳音', () => {
    expect(c.pillars.map((p) => p.naYin)).toEqual(['大林木', '石榴木', '大驿土', '路旁土']);
  });
  it('强弱结论', () => {
    expect(c.strength.label).toBe('偏弱');
    expect(c.strength.pct).toBe(42);
  });
  it('大运顺排（阳男顺）', () => {
    expect(`${c.dayun.startYear}年${c.dayun.startMonth}月`).toBe('5年4月');
    const d = c.dayun.list.slice(1, 4);
    expect(d.map((x) => x.ganZhi)).toEqual(['辛酉', '壬戌', '癸亥']);
    expect(d.map((x) => x.shiShen)).toEqual(['食神', '正财', '偏财']);
    expect(d.map((x) => x.startAge)).toEqual([7, 17, 27]);
  });
  it('藏干', () => {
    expect(c.pillars[2].hideGans).toEqual([{ gan: '辛', shiShen: '食神' }]);
    expect(c.pillars[1].hideGans.map((h) => h.gan)).toEqual(CANG_GAN['申']);
  });
});

describe('历法边界', () => {
  it('立春切年：2024-02-04 16:00 前属癸卯，17:00 后属甲辰', () => {
    const before = buildChart({ year: 2024, month: 2, day: 4, hour: 16, minute: 0 });
    const after = buildChart({ year: 2024, month: 2, day: 4, hour: 17, minute: 0 });
    expect(before.pillars[0].gz).toBe('癸卯');
    expect(before.pillars[1].gz).toBe('乙丑');
    expect(after.pillars[0].gz).toBe('甲辰');
    expect(after.pillars[1].gz).toBe('丙寅');
  });
  it('晚子换日(sect=2)日柱按当日；子初换日(sect=1)日柱进一天', () => {
    const late = buildChart({ year: 2024, month: 2, day: 4, hour: 23, minute: 30, sect: 2 });
    const early = buildChart({ year: 2024, month: 2, day: 4, hour: 23, minute: 30, sect: 1 });
    expect(late.pillars[2].gz).toBe('戊戌');
    expect(early.pillars[2].gz).toBe('己亥');
  });
  it('女命大运逆排（阳女逆）', () => {
    const f = buildChart({ year: 1988, month: 8, day: 22, hour: 14, minute: 30, gender: 0 });
    expect(f.dayun.list.slice(1, 4).map((x) => x.ganZhi)).toEqual(['己未', '戊午', '丁巳']);
  });
  it('农历闰月输入 ↔ 公历往返同盘', () => {
    const byLunar = buildChart({ year: 1990, month: -5, day: 15, hour: 10, minute: 0, calendar: 'lunar' });
    const bySolar = buildChart({ year: 1990, month: 7, day: 7, hour: 10, minute: 0 });
    expect(byLunar.pillars.map((p) => p.gz)).toEqual(bySolar.pillars.map((p) => p.gz));
    expect(byLunar.info.solarText).toBe('1990-07-07 10:00');
    expect(byLunar.info.lunarText).toContain('闰五月十五');
  });
  it('真太阳时偏移：+40 分跨时辰换柱', () => {
    const raw = buildChart({ year: 2024, month: 2, day: 4, hour: 12, minute: 40 });
    const tst = buildChart({ year: 2024, month: 2, day: 4, hour: 12, minute: 40, tstOffsetMin: 40 });
    expect(raw.pillars[3].gz).toBe('戊午');
    expect(tst.pillars[3].gz).toBe('己未');
  });
});

describe('M2 · 神煞落点（1988-08-22 14:30 男）', () => {
  const c = buildChart({ year: 1988, month: 8, day: 22, hour: 14, minute: 30, gender: 1 });
  it('按柱命中（与参考站全量对齐）：年[太极,红艳,华盖] 月[金舆,天乙,亡神] 日[文昌,将星,桃花] 时[太极,羊刃]', () => {
    const names = (i) => c.pillars[i].shensha.map((s) => s.name);
    expect(names(0)).toEqual(['太极贵人', '红艳', '华盖']);
    expect(names(1)).toEqual(['金舆', '天乙贵人', '亡神']);
    expect(names(2)).toEqual(['文昌', '将星', '桃花']);
    expect(names(3)).toEqual(['太极贵人', '羊刃']);
  });
  it('羊刃从顺行派：己日干刃在未（阴干禄后一位）', () => {
    const ss = scanShensha({ gans: ['甲', '甲', '己', '甲'], zhis: ['子', '子', '子', '未'], dayGan: '己' });
    expect(ss.perPillar[3].some((s) => s.id === 'yangren')).toBe(true);
  });
  it('将星/华盖旺库自坐也算：巳酉丑日支酉自坐将星', () => {
    const ss = scanShensha({ gans: ['甲', '甲', '甲', '甲'], zhis: ['子', '子', '酉', '子'], dayGan: '甲' });
    expect(ss.perPillar[2].some((s) => s.id === 'jiangxing')).toBe(true);
  });
  it('建禄：甲日干见寅支为禄神', () => {
    const ss = scanShensha({ gans: ['甲', 'x', '甲', 'x'], zhis: ['x', 'x', 'x', '寅'], dayGan: '甲' });
    expect(ss.perPillar[3].some((s) => s.id === 'lushen')).toBe(true);
  });
  it('魁罡：日柱庚辰', () => {
    const ss = scanShensha({ gans: ['甲', '甲', '庚', '甲'], zhis: ['子', '子', '辰', '子'], dayGan: '庚' });
    expect(ss.perPillar[2].some((s) => s.id === 'kuigang')).toBe(true);
  });
});

describe('M2 · 格局', () => {
  const c = buildChart({ year: 1988, month: 8, day: 22, hour: 14, minute: 30, gender: 1 });
  it('1988 盘：伤官格（申藏庚透月干）', () => {
    expect(c.geju.main).toBe('伤官格');
    expect(c.geju.tougan).toEqual(['庚', '戊']);
  });
  it('比劫月令：甲生子月为正印格路径外——乙生卯月走建禄', () => {
    const g = detectGeJu('乙', ['乙', '丁', '乙', '乙'], ['卯', '卯', '亥', '卯'], { code: 'balanced' });
    expect(g.main).toBe('建禄格');
  });
  it('阳刃格：甲日主生卯月（劫财月令+阳干）', () => {
    const g = detectGeJu('甲', ['甲', '丁', '甲', '甲'], ['子', '卯', '子', '子'], { code: 'balanced' });
    expect(g.main).toBe('阳刃格');
  });
});

describe('M2 · 用神三路与通根', () => {
  const c = buildChart({ year: 1988, month: 8, day: 22, hour: 14, minute: 30, gender: 1 });
  it('扶抑：偏弱用印(火)比劫(土)', () => {
    expect(c.yongshen.fuyi.yong).toEqual(['火', '土']);
  });
  it('病药：用印被财坏印，比劫为药', () => {
    expect(c.yongshen.bingyao.bing).toBe('水');
    expect(c.yongshen.bingyao.yao).toBe('土');
  });
  it('调候：申月己土首取丙癸', () => {
    expect(tiaohouOf('己', '申').yong).toEqual(['丙', '癸']);
  });
  it('通根：1988 盘 46 分有根', () => {
    const tg = tongGenScore('己', ['戊', '庚', '己', '辛'], ['辰', '申', '酉', '未']);
    expect(tg.total).toBe(46);
    expect(tg.label).toBe('有根');
  });
});

describe('M3 · 真太阳时', () => {
  it('均时差极值：2 月中约 -14 分、11 月初约 +16 分、4 月中近 0', () => {
    const feb = equationOfTime(new Date(2026, 1, 13));
    const nov = equationOfTime(new Date(2026, 10, 3));
    const apr = equationOfTime(new Date(2026, 3, 15));
    expect(feb).toBeLessThan(-13.5);
    expect(feb).toBeGreaterThan(-16);
    expect(nov).toBeGreaterThan(15.5);
    expect(nov).toBeLessThan(17);
    expect(Math.abs(apr)).toBeLessThan(1);
  });
  it('成都：经度差 -64 分为负（西于东经120°）', () => {
    const r = trueSolarOffset({ year: 2026, month: 9, day: 18 }, '成都');
    expect(r.ok).toBe(true);
    expect(r.lonDelta).toBeCloseTo(-63.7, 0);
  });
  it('未识别城市返回 ok:false 不校正', () => {
    expect(trueSolarOffset({ year: 2026, month: 9, day: 18 }, 'Atlantis').ok).toBe(false);
  });
  it('城市真太阳时改柱：乌鲁木齐 12:40 → 偏移约 -83 分跨回上一时辰', () => {
    const raw = buildChart({ year: 2026, month: 9, day: 18, hour: 12, minute: 40 });
    const r = trueSolarOffset({ year: 2026, month: 9, day: 18 }, '乌鲁木齐');
    const tst = buildChart({ year: 2026, month: 9, day: 18, hour: 12, minute: 40, tstOffsetMin: r.offsetMin });
    expect(raw.pillars[3].gz).not.toBe(tst.pillars[3].gz);
  });
});

describe('M3 · 合盘', () => {
  const A = buildChart({ year: 1988, month: 8, day: 22, hour: 14, minute: 30, gender: 1 });
  const B = buildChart({ year: 1992, month: 6, day: 15, hour: 10, minute: 0, gender: 0 });
  const he = hePan(A, B);
  it('年支辰⇄申判三合（吉）', () => {
    const item = he.items.find((i) => i.cap === '年支根基');
    expect(item.main).toContain('三合');
    expect(item.luck).toBe('吉');
  });
  it('日支酉⇄戌判相害（凶）', () => {
    const item = he.items.find((i) => i.cap === '日支互看');
    expect(item.main).toContain('相害');
    expect(item.luck).toBe('凶');
  });
  it('日干五合：甲己盘出「日干五合」条目', () => {
    const X = buildChart({ year: 2024, month: 2, day: 10, hour: 12, minute: 0, gender: 1 }); // 02-10 甲辰日 → 甲日主
    const Y = buildChart({ year: 1988, month: 8, day: 22, hour: 14, minute: 30, gender: 0 }); // 己酉日 → 己日主
    const h = hePan(X, Y);
    expect(h.items.some((i) => i.cap === '日干五合' && i.luck === '吉')).toBe(true);
  });
  it('参考分范围 20~98 且有汇总语', () => {
    expect(he.score).toBeGreaterThanOrEqual(20);
    expect(he.score).toBeLessThanOrEqual(98);
    expect(he.summary).toContain('参考分');
  });
});

describe('M3b · 流年与命宫胎元（1988-08-22 14:30 男）', () => {
  const c = buildChart({ year: 1988, month: 8, day: 22, hour: 14, minute: 30, gender: 1 });
  it('命宫甲寅（处暑未过，月数不进）', () => {
    expect(c.mGong.gz).toBe('甲寅');
    expect(c.mGong.naYin).toBe('大溪水');
    expect(c.mGong.shiShen).toBe('正官');
  });
  it('胎元辛亥（庚申月：干进一、支进三）', () => {
    expect(c.tYuan.gz).toBe('辛亥');
    expect(c.tYuan.naYin).toBe('钗钏金');
  });
  it('过中气月数进一：处暑后一天生人命宫支不变/干随月变', () => {
    const c2 = buildChart({ year: 1988, month: 8, day: 24, hour: 14, minute: 30, gender: 1 });
    // 8/24 已过处暑(8/23)，月数进一 → 宫移一位
    expect(c2.mGong.gz).not.toBe(c.mGong.gz);
  });
  it('大运三步癸亥的流年：2022 壬寅冲月、2023 癸卯冲日', () => {
    const dy3 = c.dayun.list[3];
    expect(dy3.ganZhi).toBe('癸亥');
    expect(dy3.liuNian).toHaveLength(10);
    expect(dy3.liuNian[0]).toMatchObject({ year: 2014, ganZhi: '甲午', age: 27, shiShen: '正官' });
    expect(dy3.liuNian.find((l) => l.year === 2022).chongYue).toBe(true);
    expect(dy3.liuNian.find((l) => l.year === 2023).chongRi).toBe(true);
  });
});

describe('M4 · 十神盘点（1988-08-22 14:30 男）', () => {
  const c = buildChart({ year: 1988, month: 8, day: 22, hour: 14, minute: 30, gender: 1 });
  const get = (n) => c.ssTally.find((t) => t.name === n);
  it('劫财3处（年干透+辰藏+申藏）', () => {
    const t = get('劫财');
    expect(t.count).toBe(3);
    expect(t.tou).toEqual(['年干戊']);
    expect(t.cang).toEqual(['年支辰藏戊', '月支申藏戊']);
  });
  it('伤官2处（月干透+申藏本气）', () => {
    const t = get('伤官');
    expect(t.count).toBe(2);
    expect(t.tou).toEqual(['月干庚']);
    expect(t.cang).toEqual(['月支申藏庚']);
  });
  it('正官正印未现（count=0）', () => {
    expect(get('正官').count).toBe(0);
    expect(get('正印').count).toBe(0);
  });
  it('十神总数=天干3+藏干10=13', () => {
    expect(c.ssTally.reduce((s, t) => s + t.count, 0)).toBe(13);
  });
});

describe('M4b · 复核回归（全量审查抓出项）', () => {
  it('纳音用字对齐权威：甲午/乙未＝沙中金（非砂）', () => {
    const { NAYIN } = awaitImport();
    expect(NAYIN['甲午']).toBe('沙中金');
    expect(NAYIN['乙未']).toBe('沙中金');
  });
  it('禄神同支多柱双标：丁日干、日支+时支皆午 → 两柱都标', () => {
    const ss = scanShensha({ gans: ['甲', '甲', '丁', '丁'], zhis: ['卯', '酉', '午', '午'], dayGan: '丁' });
    expect(ss.perPillar[2].some((s) => s.id === 'lushen')).toBe(true);
    expect(ss.perPillar[3].some((s) => s.id === 'lushen')).toBe(true);
  });
});
import { NAYIN as _NAYIN } from '../src/mingli/core/data.js';
function awaitImport() { return { NAYIN: _NAYIN }; }
