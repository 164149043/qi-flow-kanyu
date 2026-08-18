/**
 * bagua.js —— 八卦 / 九宫 / 二十四山 数据层
 * ============================================================
 * 这是整个风水排盘的「数据基石」。所有上层算法（八宅、飞星、玄空）
 * 都建立在这些固定映射之上。风水工程化的核心就是把这些定性理论
 * 变成精确的、可计算的数据表。
 *
 * 本文件零依赖、零副作用，纯数据导出（挂到 window.XQ 上）。
 */

(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // 一、八卦（后天八卦）
  // ──────────────────────────────────────────────────────────
  // name  卦名
  // dir   方位文字
  // deg   方位角度（正北=0，顺时针）
  // num   后天八卦数（洛书数）：坎1 坤2 震3 巽4 中5 乾6 兑7 艮8 离9
  //       注意「中」宫没有卦，但洛书数5归中。
  // wuxing 五行
  // yin    卦本身阴阳（用于某些粗粒度算法；玄空精细算法用二十四山阴阳，见下）
  const BAGUA = [
    { name: '坎', dir: '北',   deg: 0,   num: 1, wuxing: '水', yin: false },
    { name: '坤', dir: '西南', deg: 225, num: 2, wuxing: '土', yin: true  },
    { name: '震', dir: '东',   deg: 90,  num: 3, wuxing: '木', yin: false },
    { name: '巽', dir: '东南', deg: 135, num: 4, wuxing: '木', yin: true  },
    { name: '中', dir: '中',   deg: -1,  num: 5, wuxing: '土', yin: null  },
    { name: '乾', dir: '西北', deg: 315, num: 6, wuxing: '金', yin: true  },
    { name: '兑', dir: '西',   deg: 270, num: 7, wuxing: '金', yin: false },
    { name: '艮', dir: '东北', deg: 45,  num: 8, wuxing: '土', yin: true  },
    { name: '离', dir: '南',   deg: 180, num: 9, wuxing: '火', yin: false },
  ];

  // 按名字快速查
  const BAGUA_BY_NAME = {};
  BAGUA.forEach((b) => (BAGUA_BY_NAME[b.name] = b));

  // ──────────────────────────────────────────────────────────
  // 二、九宫飞星的「飞行轨迹」
  // ──────────────────────────────────────────────────────────
  // 飞星不是按方位顺序飞的，而是按「洛书轨迹」飞。
  // 入中之星从「中宫」出发，依次落到以下宫位（这是顺飞顺序）：
  //   中 → 乾 → 兑 → 艮 → 离 → 坎 → 坤 → 震 → 巽
  // 每落一宫，星数 +1（1~9 循环）。逆飞就是这条轨迹反过来走。
  //
  // PALACE_ORDER 存的是宫位名字（卦名），顺序即顺飞落点。
  const PALACE_ORDER = ['中', '乾', '兑', '艮', '离', '坎', '坤', '震', '巽'];

  // ──────────────────────────────────────────────────────────
  // 三、二十四山（含三元阴阳 —— 玄空飞星的核心难点）
  // ──────────────────────────────────────────────────────────
  // 360° 等分为 24 山，每山 15°。每卦管 3 山，3 山按「地元/天元/人元」分三元。
  // 玄空飞星决定「顺飞还是逆飞」就靠这个三元阴阳表：
  //
  //   天元龙：乾 艮 巽 坤 = 阳(顺飞) ；子 午 卯 酉 = 阴(逆飞)
  //   地元龙：甲 丙 庚 壬 = 阳(顺飞) ；辰 戌 丑 未 = 阴(逆飞)
  //   人元龙：寅 申 巳 亥 = 阳(顺飞) ；乙 辛 丁 癸 = 阴(逆飞)
  //
  // 口诀：四维四阳干四长生为阳顺；四正四墓库四阴干为阴逆。
  //
  // 数据字段：
  //   name   山名
  //   deg    中心角度
  //   gua    所属卦（坎/艮/震/巽/离/坤/兑/乾）
  //   yuan   三元：'地' | '天' | '人'
  //   yin    阴阳：true=阴(逆飞) false=阳(顺飞)
  const M24 = [
    // 坎卦（北）：壬 / 子 / 癸
    { name: '壬', deg: 345, gua: '坎', yuan: '地', yin: false },
    { name: '子', deg: 0,   gua: '坎', yuan: '天', yin: true  },
    { name: '癸', deg: 15,  gua: '坎', yuan: '人', yin: true  },
    // 艮卦（东北）：丑 / 艮 / 寅
    { name: '丑', deg: 30,  gua: '艮', yuan: '地', yin: true  },
    { name: '艮', deg: 45,  gua: '艮', yuan: '天', yin: false },
    { name: '寅', deg: 60,  gua: '艮', yuan: '人', yin: false },
    // 震卦（东）：甲 / 卯 / 乙
    { name: '甲', deg: 75,  gua: '震', yuan: '地', yin: false },
    { name: '卯', deg: 90,  gua: '震', yuan: '天', yin: true  },
    { name: '乙', deg: 105, gua: '震', yuan: '人', yin: true  },
    // 巽卦（东南）：辰 / 巽 / 巳
    { name: '辰', deg: 120, gua: '巽', yuan: '地', yin: true  },
    { name: '巽', deg: 135, gua: '巽', yuan: '天', yin: false },
    { name: '巳', deg: 150, gua: '巽', yuan: '人', yin: false },
    // 离卦（南）：丙 / 午 / 丁
    { name: '丙', deg: 165, gua: '离', yuan: '地', yin: false },
    { name: '午', deg: 180, gua: '离', yuan: '天', yin: true  },
    { name: '丁', deg: 195, gua: '离', yuan: '人', yin: true  },
    // 坤卦（西南）：未 / 坤 / 申
    { name: '未', deg: 210, gua: '坤', yuan: '地', yin: true  },
    { name: '坤', deg: 225, gua: '坤', yuan: '天', yin: false },
    { name: '申', deg: 240, gua: '坤', yuan: '人', yin: false },
    // 兑卦（西）：庚 / 酉 / 辛
    { name: '庚', deg: 255, gua: '兑', yuan: '地', yin: false },
    { name: '酉', deg: 270, gua: '兑', yuan: '天', yin: true  },
    { name: '辛', deg: 285, gua: '兑', yuan: '人', yin: true  },
    // 乾卦（西北）：戌 / 乾 / 亥
    { name: '戌', deg: 300, gua: '乾', yuan: '地', yin: true  },
    { name: '乾', deg: 315, gua: '乾', yuan: '天', yin: false },
    { name: '亥', deg: 330, gua: '乾', yuan: '人', yin: false },
  ];

  const M24_BY_NAME = {};
  M24.forEach((m) => (M24_BY_NAME[m.name] = m));

  // 二十四山「对宫」（相隔180°）—— 用于由坐山反推朝向
  function oppositeMountain(name) {
    const m = M24_BY_NAME[name];
    if (!m) return null;
    const oppDeg = (m.deg + 180) % 360;
    // 找角度最接近的山（中心角度差<7.5）
    let best = M24[0],
      bestD = 999;
    for (const x of M24) {
      let d = Math.abs(x.deg - oppDeg);
      if (d > 180) d = 360 - d;
      if (d < bestD) {
        bestD = d;
        best = x;
      }
    }
    return best.name;
  }

  // ──────────────────────────────────────────────────────────
  // 四、导出
  // ──────────────────────────────────────────────────────────
  global.XQ = global.XQ || {};
  Object.assign(global.XQ, {
    BAGUA,
    BAGUA_BY_NAME,
    PALACE_ORDER,
    M24,
    M24_BY_NAME,
    oppositeMountain,
  });
})(window);
