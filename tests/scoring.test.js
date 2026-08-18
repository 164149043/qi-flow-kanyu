/**
 * 综合评分单测（四层）
 */
import { describe, test, expect } from 'vitest';
import { comprehensiveScore } from '../src/kanyu/core/fengshui/scoring.js';
import { bazhaiPan } from '../src/kanyu/core/fengshui/bazhai.js';
import { yearFeixingPan } from '../src/kanyu/core/fengshui/feixing-year.js';
import { xuankongPan } from '../src/kanyu/core/index.js';

describe('综合评分 · 四层', () => {
  test('分组与三层齐全（m24 已改为不计分立向参考）', () => {
    const s = comprehensiveScore({
      bazhai: bazhaiPan('离'),
      yearFx: yearFeixingPan(2026),
      xuankong: xuankongPan(2010, '子'),
    });
    // 宅本盘组：格局(45%) + 八宅(30%)；流年组：九星(25%)
    expect(s.groups.basePans.map((l) => l.key)).toEqual(expect.arrayContaining(['geju', 'bazhai']));
    expect(s.groups.flowYear.map((l) => l.key)).toContain('jiuxing');
    expect(s.groups.basePans).toHaveLength(2);
    expect(s.groups.flowYear).toHaveLength(1);
    // 廿四山摘为不计分参考
    expect(s.reference.text).toMatch(/^坐/);
  });

  test('八运子山午向（旺山旺向）格局层=88，综合偏吉', () => {
    const s = comprehensiveScore({
      bazhai: bazhaiPan('离'),
      yearFx: yearFeixingPan(2026),
      xuankong: xuankongPan(2010, '子'),
    });
    const geju = s.groups.basePans.find((l) => l.key === 'geju');
    expect(geju.score).toBe(88);
    expect(s.score).toBeGreaterThan(55);
  });

  test('评分恒在 0~100', () => {
    for (const door of ['坎', '离', '震', '兑', '乾', '巽']) {
      for (const year of [2000, 2010, 2024]) {
        const s = comprehensiveScore({
          bazhai: bazhaiPan(door),
          yearFx: yearFeixingPan(year),
          xuankong: xuankongPan(year, '子'),
        });
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
        expect(['大吉', '吉', '平', '凶', '大凶']).toContain(s.level);
      }
    }
  });

  test('level 与 score 区间一致', () => {
    const s = comprehensiveScore({
      bazhai: bazhaiPan('离'),
      yearFx: yearFeixingPan(2026),
      xuankong: xuankongPan(2010, '子'),
    });
    if (s.score >= 75) expect(s.level).toBe('大吉');
    else if (s.score >= 60) expect(s.level).toBe('吉');
    else if (s.score >= 45) expect(s.level).toBe('平');
  });
});
