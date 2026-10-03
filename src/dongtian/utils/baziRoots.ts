/**
 * 生辰四柱 → 五行灵根
 * 用 lunar-javascript EightChar 排四柱（与主站命理页同源引擎），
 * 按八字五行占比确定性映射灵根数值——同一年月日时永远同一套灵根，命理有常。
 * 权重：四天干各 1 分 + 四地支本气各 1 分（共 8 分）；
 * 映射：share × 45，clamp 3~40（缺项给 3 分底，纯盘最高 40 可出天灵根）。
 */
import { Solar } from 'lunar-javascript';
import type { PlayerStats } from '../types';

type Wuxing = keyof PlayerStats['spiritualRoots'];

const GAN_WUXING: Record<string, Wuxing> = {
  甲: 'wood', 乙: 'wood', 丙: 'fire', 丁: 'fire', 戊: 'earth',
  己: 'earth', 庚: 'metal', 辛: 'metal', 壬: 'water', 癸: 'water',
};
const ZHI_WUXING: Record<string, Wuxing> = {
  子: 'water', 丑: 'earth', 寅: 'wood', 卯: 'wood', 辰: 'earth', 巳: 'fire',
  午: 'fire', 未: 'earth', 申: 'metal', 酉: 'metal', 戌: 'earth', 亥: 'water',
};

export interface BaziReading {
  /** 四柱干支，如 ['甲子','丙寅','戊午','壬子'] */
  pillars: string[];
  /** 由八字五行占比映射出的灵根 */
  roots: PlayerStats['spiritualRoots'];
  /** 日主天干 */
  dayGan: string;
  /** 五行分布（天干+地支本气计分） */
  weights: PlayerStats['spiritualRoots'];
}

export function readBaziRoots(
  year: number,
  month: number,
  day: number,
  hour: number
): BaziReading | null {
  try {
    const solar = Solar.fromYmdHms(year, month, day, hour, 0, 0);
    const ec = solar.getLunar().getEightChar();
    const gans = [ec.getYearGan(), ec.getMonthGan(), ec.getDayGan(), ec.getTimeGan()];
    const zhis = [ec.getYearZhi(), ec.getMonthZhi(), ec.getDayZhi(), ec.getTimeZhi()];

    const weights: PlayerStats['spiritualRoots'] = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
    gans.forEach((g) => { weights[GAN_WUXING[g]] += 1; });
    zhis.forEach((z) => { weights[ZHI_WUXING[z]] += 1; });

    const roots = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 } as PlayerStats['spiritualRoots'];
    (Object.keys(weights) as Wuxing[]).forEach((k) => {
      roots[k] = Math.max(3, Math.min(40, Math.round((weights[k] / 8) * 45)));
    });

    return {
      pillars: gans.map((g, i) => g + zhis[i]),
      roots,
      dayGan: gans[2],
      weights,
    };
  } catch {
    return null;
  }
}

/** 十二时辰选项（取时辰中点小时排盘，规避晚子时跨日歧义） */
export const HOUR_OPTIONS: { label: string; hour: number }[] = [
  { label: '子时 23~1', hour: 0 },
  { label: '丑时 1~3', hour: 2 },
  { label: '寅时 3~5', hour: 4 },
  { label: '卯时 5~7', hour: 6 },
  { label: '辰时 7~9', hour: 8 },
  { label: '巳时 9~11', hour: 10 },
  { label: '午时 11~13', hour: 12 },
  { label: '未时 13~15', hour: 14 },
  { label: '申时 15~17', hour: 16 },
  { label: '酉时 17~19', hour: 18 },
  { label: '戌时 19~21', hour: 20 },
  { label: '亥时 21~23', hour: 22 },
];

/** 五行灵根的专属属性影响（每点：主属性 +0.2% / 副属性 +0.1%），与 constants/spiritualRoots.ts 的映射一致 */
export const ROOT_ATTRIBUTE_HINT: Record<Wuxing, string> = {
  metal: '攻击 +0.2%/点 · 防御 +0.1%/点',
  wood: '气血 +0.2%/点 · 体魄 +0.1%/点',
  water: '神识 +0.2%/点 · 防御 +0.1%/点',
  fire: '攻击 +0.2%/点 · 速度 +0.1%/点',
  earth: '防御 +0.2%/点 · 体魄 +0.1%/点',
};
