/**
 * 年紫白飞星单测
 * 锚点：2000 年九紫入中（紫白诀标准）
 */
import { describe, test, expect } from 'vitest';
import { yearFeixingPan } from '../src/kanyu/core/fengshui/feixing-year.js';

describe('年紫白飞星', () => {
  test('2000 年九紫入中（标准锚点）', () => {
    const r = yearFeixingPan(2000);
    expect(r.centerStar).toBe(9);
    expect(r.palaces.find((p) => p.gong === '中').star).toBe(9);
    expect(r.centerInfo.star).toBe('九紫');
  });

  test('2026 年一白入中', () => {
    const r = yearFeixingPan(2026);
    expect(r.centerStar).toBe(1);
    expect(r.centerInfo.star).toBe('一白');
  });

  test('顺飞轨迹：中→乾→兑... 每步 +1', () => {
    const r = yearFeixingPan(2026); // 1 入中
    expect(r.palaces.find((p) => p.gong === '中').star).toBe(1);
    expect(r.palaces.find((p) => p.gong === '乾').star).toBe(2); // 1+1
    expect(r.palaces.find((p) => p.gong === '兑').star).toBe(3); // 1+2
  });

  test('九宫齐全（9 宫）', () => {
    expect(yearFeixingPan(2026).palaces.length).toBe(9);
  });

  test('desc 文案', () => {
    expect(yearFeixingPan(2026).desc).toBe('2026年 一白入中');
  });
});
