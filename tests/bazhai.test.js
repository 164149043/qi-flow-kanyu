/**
 * 八宅大游年单测 —— 用经典公认案例锁定（门朝向→坐山→九星）
 * 案例依据：八宅明镜公认值 + 原站 kanyu 页 DAYOUNIAN_SONG
 */
import { describe, test, expect } from 'vitest';
import { bazhaiPan, oppositeGua, degToGua } from '../src/kanyu/core/fengshui/bazhai.js';

describe('八宅 · 对宫反推', () => {
  test('门=向，坐=对宫', () => {
    expect(oppositeGua('离')).toBe('坎');
    expect(oppositeGua('坎')).toBe('离');
    expect(oppositeGua('乾')).toBe('巽');
    expect(oppositeGua('震')).toBe('兑');
  });
});

describe('八宅 · degToGua 方位转卦', () => {
  test('四正四隅', () => {
    expect(degToGua(0)).toBe('坎');    // 北
    expect(degToGua(90)).toBe('震');   // 东
    expect(degToGua(180)).toBe('离');  // 南
    expect(degToGua(270)).toBe('兑');  // 西
    expect(degToGua(45)).toBe('艮');   // 东北
    expect(degToGua(315)).toBe('乾');  // 西北
  });
});

describe('八宅 · 坎宅（门朝南离向）经典九星', () => {
  // 坎宅歌诀"五天生延绝祸六" → 艮五 震天 巽生 离延 坤绝 兑祸 乾六，坎伏位
  const r = bazhaiPan('离');
  const byName = (g) => r.palaces.find((p) => p.gong === g);

  test('坐向反推', () => {
    expect(r.zuoGua).toBe('坎');
    expect(r.xiangGua).toBe('离');
  });
  test('坎=伏位', () => expect(byName('坎').jiuXing).toBe('伏'));
  test('震=天医', () => expect(byName('震').jiuXing).toBe('天'));
  test('巽=生气', () => expect(byName('巽').jiuXing).toBe('生'));
  test('离=延年（门朝南吉）', () => expect(byName('离').jiuXing).toBe('延'));
  test('坤=绝命', () => expect(byName('坤').jiuXing).toBe('绝'));
  test('兑=祸害', () => expect(byName('兑').jiuXing).toBe('祸'));
  test('乾=六煞', () => expect(byName('乾').jiuXing).toBe('六'));
  test('艮=五鬼', () => expect(byName('艮').jiuXing).toBe('五'));
});

describe('八宅 · 乾宅（门朝巽向）', () => {
  // 乾宅歌诀"六天五祸绝延生" → 坎六 艮天 震五 巽祸 离绝 坤延 兑生，乾伏位
  const r = bazhaiPan('巽');
  const byName = (g) => r.palaces.find((p) => p.gong === g);

  test('坐乾向巽', () => {
    expect(r.zuoGua).toBe('乾');
    expect(r.xiangGua).toBe('巽');
  });
  test('兑=生气（乾兑配延年? 验证歌诀）', () => expect(byName('兑').jiuXing).toBe('生'));
  test('巽=祸害', () => expect(byName('巽').jiuXing).toBe('祸'));
  test('坤=延年', () => expect(byName('坤').jiuXing).toBe('延'));
});

describe('八宅 · 四吉四凶数量恒定', () => {
  test('任一坐山都是 4 吉 + 4 凶', () => {
    for (const door of ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾']) {
      const r = bazhaiPan(door);
      const ji = r.palaces.filter((p) => p.info.ji === '吉').length;
      const xiong = r.palaces.filter((p) => p.info.ji === '凶').length;
      expect(ji).toBe(4);   // 生气/天医/延年/伏位
      expect(xiong).toBe(4); // 绝命/五鬼/六煞/祸害
    }
  });
});
