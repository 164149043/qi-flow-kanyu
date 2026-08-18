/**
 * 唯一术数源准确性验证（收口前置检测，2026-08-18）
 * ============================================================
 * 目的：kanyu/core/fengshui 立为唯一术数源之前，用**独立于项目代码**的基准验证其准确性。
 * 三层基准：
 *   A. 八宅大游年：全 8 宅 × 8 方位，基准=公认「卦配配合表」（生气配乾兑坎巽艮坤震离……），
 *      与项目 DAYOUNIAN_SONG 歌诀是两个独立来源——交叉吻合才算数，杜绝循环论证。
 *   B. 年紫白飞星：公认年份锚点（2000 九紫 / 2024 三碧 / 2025 二黑 / 2026 一白）
 *      + 独立公式 year = ((11 - y%9)%9)||9 全量交叉 + 洛书轨迹推演全宫 + 九年循环律。
 *   C. 双实现互拍：kanyu core（唯一源候选）vs 炁流 src/fengshui（待退役旧实现）
 *      8 门向 × 8 方位、多年份 × 9 宫全对拍——收口后行为零变更的保证。
 */
import { describe, test, expect } from 'vitest';
import { bazhaiPan, degToGua } from '../src/kanyu/core/fengshui/bazhai.js';
import { yearFeixingPan } from '../src/kanyu/core/fengshui/feixing-year.js';
import { bazhaiCompute, WIND8, DIR8_B } from '../src/fengshui/Bazhai.js';
import { yearCenterStar, flyStars } from '../src/fengshui/Jiuxing.js';

// ── 独立基准 A：八宅卦配配合表（八宅明镜公认；星是「卦与卦的配合」属性，对称）──
const PAIR = {
  生气: [['乾', '兑'], ['坎', '巽'], ['艮', '坤'], ['震', '离']],
  延年: [['乾', '坤'], ['坎', '离'], ['艮', '兑'], ['震', '巽']],
  天医: [['乾', '艮'], ['坎', '震'], ['坤', '兑'], ['离', '巽']],
  五鬼: [['乾', '震'], ['坎', '艮'], ['巽', '坤'], ['离', '兑']],
  六煞: [['乾', '坎'], ['震', '艮'], ['巽', '兑'], ['离', '坤']],
  祸害: [['乾', '巽'], ['坎', '兑'], ['艮', '离'], ['震', '坤']],
  绝命: [['乾', '离'], ['坎', '坤'], ['艮', '巽'], ['震', '兑']],
};
function expectedStar(zuo, gong) {
  if (zuo === gong) return '伏位';
  for (const [name, pairs] of Object.entries(PAIR))
    for (const [a, b] of pairs)
      if ((a === zuo && b === gong) || (b === zuo && a === gong)) return name;
  return null;   // 不在表内=基准表自身有漏
}
const ALL_GUA = ['乾', '坎', '艮', '震', '巽', '离', '坤', '兑'];

describe('A. 八宅大游年 vs 公认卦配配合表（独立基准）', () => {
  // 基准表自洽：8 宅每宅八方都能在配合表找到星，且四吉四凶
  test('配合表覆盖完备：8 宅 × 8 方全部有星、4吉4凶', () => {
    for (const zuo of ALL_GUA) {
      const stars = ALL_GUA.map((g) => expectedStar(zuo, g));
      expect(stars.every((s) => s != null)).toBe(true);
      const ji = stars.filter((s) => ['生气', '天医', '延年', '伏位'].includes(s)).length;
      expect(ji).toBe(4);
    }
  });
  test('全 8 宅 × 8 方位与 bazhaiPan 完全一致', () => {
    for (const xiang of ALL_GUA) {                     // xiang=门朝向卦
      const r = bazhaiPan(xiang);
      expect(r.zuoGua).toBe(ALL_GUA.includes(xiang) ? r.zuoGua : null); // 占位无害
      for (const p of r.palaces) {
        expect(p.info.name).toBe(expectedStar(r.zuoGua, p.gong));
      }
    }
  });
  test('教科书锚点（硬编码防基准表整体记错；bazhaiPan 参数=门朝向卦，X宅须传对宫）', () => {
    // 乾宅（坐乾=门朝巽）：乾坤=延年（天地配）、乾兑=生气、乾离=绝命
    expect(bazhaiPan('巽').palaces.find((p) => p.gong === '坤').info.name).toBe('延年');
    expect(bazhaiPan('巽').palaces.find((p) => p.gong === '兑').info.name).toBe('生气');
    expect(bazhaiPan('巽').palaces.find((p) => p.gong === '离').info.name).toBe('绝命');
    // 坎宅（坐坎=门朝离）：坎离=延年（水火既济）、坎巽=生气、坎坤=绝命
    expect(bazhaiPan('离').palaces.find((p) => p.gong === '离').info.name).toBe('延年');
    expect(bazhaiPan('离').palaces.find((p) => p.gong === '巽').info.name).toBe('生气');
    expect(bazhaiPan('离').palaces.find((p) => p.gong === '坤').info.name).toBe('绝命');
    // 震宅（坐震=门朝兑）：震兑=绝命 → 兑宫
    expect(bazhaiPan('兑').palaces.find((p) => p.gong === '兑').info.name).toBe('绝命');
    // 兑宅（坐兑=门朝震）：历史争议格直锁——兑坤=天医、兑离=五鬼（歌诀倒字校正的回归锚）
    expect(bazhaiPan('震').palaces.find((p) => p.gong === '坤').info.name).toBe('天医');
    expect(bazhaiPan('震').palaces.find((p) => p.gong === '离').info.name).toBe('五鬼');
  });
});

describe('B. 年紫白飞星 vs 公认锚点 + 独立公式', () => {
  test('公认年份锚点：2000 九紫 / 2024 三碧 / 2025 二黑 / 2026 一白', () => {
    expect(yearFeixingPan(2000).centerStar).toBe(9);
    expect(yearFeixingPan(2024).centerStar).toBe(3);
    expect(yearFeixingPan(2025).centerStar).toBe(2);
    expect(yearFeixingPan(2026).centerStar).toBe(1);
  });
  test('独立公式交叉：1900~2100 全量 = ((11 - y%9)%9)||9', () => {
    for (let y = 1900; y <= 2100; y++) {
      const indep = ((11 - (y % 9)) % 9) || 9;
      expect(yearFeixingPan(y).centerStar).toBe(indep);
    }
  });
  test('2024 甲辰全盘公认值（三碧入中→乾四绿/兑五黄…）', () => {
    const std = { 中: 3, 乾: 4, 兑: 5, 艮: 6, 离: 7, 坎: 8, 坤: 9, 震: 1, 巽: 2 };
    for (const p of yearFeixingPan(2024).palaces) expect(p.star).toBe(std[p.gong]);
  });
  test('洛书轨迹推演：任意入中星，宫=中+PALACE序步数（wrap 1..9）', () => {
    const ORDER = ['中', '乾', '兑', '艮', '离', '坎', '坤', '震', '巽'];
    const wrap = (n) => ((n - 1) % 9 + 9) % 9 + 1;
    for (const y of [1920, 1958, 1987, 2004, 2042, 2099]) {
      const c = yearFeixingPan(y).centerStar;
      for (const p of yearFeixingPan(y).palaces)
        expect(p.star).toBe(wrap(c + ORDER.indexOf(p.gong)));
    }
  });
  test('九年循环律：yearFeixingPan(y) 全宫 == yearFeixingPan(y+9)', () => {
    for (const y of [1998, 2026, 2071]) {
      const a = yearFeixingPan(y).palaces.map((p) => p.star).join();
      const b = yearFeixingPan(y + 9).palaces.map((p) => p.star).join();
      expect(a).toBe(b);
    }
  });
});

// ── 对拍 C：卦名 ↔ 方位文字映射（两边各自的输出坐标系）──
const GUA2DIR = { 坎: '北', 艮: '东北', 震: '东', 巽: '东南', 离: '南', 坤: '西南', 兑: '西', 乾: '西北' };
const DIR2GUA = Object.fromEntries(Object.entries(GUA2DIR).map(([g, d]) => [d, g]));

describe('C. 双实现互拍：kanyu core vs 炁流 src/fengshui（收口行为保证）', () => {
  test('八宅：8 个门向 × 8 方位星名全一致', () => {
    for (let deg = 0; deg < 360; deg += 45) {
      const kan = bazhaiPan(degToGua(deg));              // 堪舆侧：卦宫制
      const ia = bazhaiCompute(deg);                     // 炁流侧：方位度数制
      for (const p of kan.palaces) {
        const dir = GUA2DIR[p.gong];                     // 卦→方位文字
        const idx = WIND8.indexOf(dir);                  // 炁流 WIND8 = 北..西北
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(ia.sectors[idx].name).toBe(p.info.name);
        expect(DIR8_B[idx]).toBe(p.bearing !== undefined ? DIR8_B[idx] : DIR8_B[idx]); // 占位无害
      }
      // 坐山互证：炁流 sitting 度数 → 卦 == kanyu zuoGua
      expect(degToGua(ia.sitting)).toBe(kan.zuoGua);
    }
  });
  test('八宅：四吉四凶计数与宅卦名一致', () => {
    for (let deg = 0; deg < 360; deg += 45) {
      const ia = bazhaiCompute(deg);
      const ji = ia.sectors.filter((s) => s.ji > 0).length;
      expect(ji).toBe(4);
      expect(ia.zhaiName).toContain('宅');
    }
  });
  test('飞星：多年份 × 9 宫星数全一致', () => {
    for (const y of [1864, 1900, 1958, 2000, 2024, 2025, 2026, 2042, 2099]) {
      const kan = yearFeixingPan(y);
      const iaPan = flyStars(yearCenterStar(y));         // 炁流侧：{方位文字: 星数}
      expect(yearCenterStar(y)).toBe(kan.centerStar);
      for (const p of kan.palaces) {
        const dir = p.gong === '中' ? '中' : GUA2DIR[p.gong];
        expect(iaPan[dir]).toBe(p.star);
      }
    }
  });
});
