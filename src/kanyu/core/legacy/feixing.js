/**
 * feixing.js —— 飞星核心算法
 * ============================================================
 * 飞星（九宫飞星）是风水里最「数学化」的部分。一句话：
 *   「某颗星入中宫，然后按洛书轨迹走，每走一步星数 +1（顺飞）或 -1（逆飞）」
 *
 * 本文件实现：
 *   1. STARS          九星属性表（1~9 各自的五行/吉凶/寓意）
 *   2. flyForward()   顺飞（星数递增，按中→乾→兑→艮→离→坎→坤→震→巽）
 *   3. flyBackward()  逆飞（星数递减，轨迹反过来）
 *   4. yuanYun()      建造年份 → 当运星（三元九运）
 *   5. yearStar()     流年 → 年入中之星（年紫白，附赠，蓝图4.3用）
 *
 * 依赖：bagua.js（提供 PALACE_ORDER）
 */

(function (global) {
  'use strict';

  const { PALACE_ORDER } = global.XQ;

  // ──────────────────────────────────────────────────────────
  // 一、九星属性表
  // ──────────────────────────────────────────────────────────
  // 紫白九星：1~9。每颗星有：贪狼巨门等(北斗九星名)、五行、吉凶、寓意。
  // 这是渲染吉凶颜色、tooltip 详情的依据。
  // 九星属性表。ji=吉凶(配色用)，luck=能量系数(原站 stars.js NINE_STARS.luck 实锤，
  // 供 palaceBoost/starGlobalBoost 算九星能量场，驱动炁流"九星干扰")。
  const STARS = {
    1: { star: '一白', beidou: '贪狼', wuxing: '水', ji: '吉',   jibad: false, luck: 1.00, meaning: '桃花·人缘' },
    2: { star: '二黑', beidou: '巨门', wuxing: '土', ji: '凶',   jibad: false, luck: 0.15, meaning: '病符·暗滞' },
    3: { star: '三碧', beidou: '禄存', wuxing: '木', ji: '平',   jibad: false, luck: 0.40, meaning: '是非·争执' },
    4: { star: '四绿', beidou: '文曲', wuxing: '木', ji: '吉',   jibad: false, luck: 0.80, meaning: '文昌·学业' },
    5: { star: '五黄', beidou: '廉贞', wuxing: '土', ji: '大凶', jibad: true,  luck: 0.05, meaning: '戊己·灾煞' },
    6: { star: '六白', beidou: '武曲', wuxing: '金', ji: '吉',   jibad: false, luck: 0.85, meaning: '权贵·事业' },
    7: { star: '七赤', beidou: '破军', wuxing: '金', ji: '平',   jibad: false, luck: 0.45, meaning: '破败·口舌' },
    8: { star: '八白', beidou: '左辅', wuxing: '土', ji: '大吉', jibad: false, luck: 1.00, meaning: '财帛·田宅' },
    9: { star: '九紫', beidou: '右弼', wuxing: '火', ji: '吉',   jibad: false, luck: 0.90, meaning: '喜庆·姻缘' },
  };

  // 把星数循环到 1~9（0→9，10→1，-1→9...）
  function wrap(n) {
    n = ((n - 1) % 9 + 9) % 9;
    return n + 1;
  }

  // ──────────────────────────────────────────────────────────
  // 二、飞星：顺飞 / 逆飞
  // ──────────────────────────────────────────────────────────
  // 入中之星 centerStar（1~9）放在「中宫」，
  // 然后沿 PALACE_ORDER 轨迹：顺飞每步 +1，逆飞每步 -1。
  // 返回 { 中:星数, 乾:星数, ... }（9 个宫位 → 星数 1~9）
  function flyForward(centerStar) {
    const pan = {};
    PALACE_ORDER.forEach((gong, i) => {
      pan[gong] = wrap(centerStar + i); // 顺飞：第 i 步星数 = 入中星 + i
    });
    return pan;
  }

  function flyBackward(centerStar) {
    const pan = {};
    PALACE_ORDER.forEach((gong, i) => {
      pan[gong] = wrap(centerStar - i); // 逆飞：第 i 步星数 = 入中星 - i
    });
    return pan;
  }

  // 通用：根据阴阳选顺逆（玄空里山盘/向盘就是这么决定方向）
  function fly(centerStar, yin) {
    return yin ? flyBackward(centerStar) : flyForward(centerStar);
  }

  // ──────────────────────────────────────────────────────────
  // 三、三元九运：建造年份 → 当运星
  // ──────────────────────────────────────────────────────────
  // 三元九运，每运 20 年：
  //   上元：一运 1864-1883 | 二运 1884-1903 | 三运 1904-1923
  //   中元：四运 1924-1943 | 五运 1944-1963 | 六运 1964-1983
  //   下元：七运 1984-2003 | 八运 2004-2023 | 九运 2024-2043
  // 2044 起又回到一运（上元开始新一轮）。
  //
  // 算法：以 1864 为一运起点，每 20 年一运，运星 = (year-1864)/20 + 1，对 9 取余。
  function yuanYun(buildYear) {
    const idx = Math.floor((buildYear - 1864) / 20); // 第几运(0基)
    return wrap(idx + 1); // 运星 1~9（wrap 处理 2044+ 的循环）
  }

  // 给定年份返回运的中文描述（如「下元 九运」）
  function yuanYunLabel(buildYear) {
    const yun = yuanYun(buildYear);
    const idx = Math.floor((buildYear - 1864) / 20) % 9; // 0~8
    const yuan = idx < 3 ? '上元' : idx < 6 ? '中元' : '下元';
    const yunHan = ['一','二','三','四','五','六','七','八','九'];
    return `${yuan} ${yunHan[yun - 1]}运`;
  }

  // ──────────────────────────────────────────────────────────
  // 四、附赠：年紫白入中之星（蓝图 4.3 用，玄空也会顺带显示运盘）
  // ──────────────────────────────────────────────────────────
  // 年入中星公式（紫白诀，2000 年为例九紫入中）：
  //   入中星 = (9 - (year - 2000) % 9 + 9) % 9，为 0 则取 9
  // 用 2000 年九紫入中作为锚点校准。
  function yearStar(year) {
    let s = (9 - ((year - 2000) % 9) + 9) % 9;
    if (s === 0) s = 9;
    return s;
  }

  // ──────────────────────────────────────────────────────────
  // 四-2、九星能量场（原站 stars.js 实锤，驱动炁流"九星干扰"）
  // ──────────────────────────────────────────────────────────
  // 值时星（时家紫白·阳顺简化）：子时一白起，逐时辰顺行。shichenIdx=0..11（子..亥）
  function starOfHour(shichenIdx) {
    return (shichenIdx % 9) + 1;
  }
  // 单宫能量系数：0.7 + 0.5*luck → 0.725~1.20（五黄 luck=0.05 最衰→0.725；一白/八白 1.00 最旺→1.20）。
  // 该宫飞星决定对 dye 能量场的聚散加成（非速度场）：palaceDrain = 0.90+0.14*((palaceBoost-0.7)/0.5)。
  function palaceBoost(starId) {
    return 0.7 + 0.5 * STARS[starId].luck;
  }
  // 值时星全局加成：0.85 + 0.3*值时星luck → 0.865~1.15，随时辰变。
  function starGlobalBoost(shichenIdx) {
    return 0.85 + 0.3 * STARS[starOfHour(shichenIdx)].luck;
  }

  // ──────────────────────────────────────────────────────────
  // 五、导出
  // ──────────────────────────────────────────────────────────
  Object.assign(global.XQ, {
    STARS,
    flyForward,
    flyBackward,
    fly,
    yuanYun,
    yuanYunLabel,
    yearStar,
    starOfHour,
    palaceBoost,
    starGlobalBoost,
  });
})(window);
