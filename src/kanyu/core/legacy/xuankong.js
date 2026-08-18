/**
 * xuankong.js —— 玄空宅命盘（三盘叠加）主算法  ★★★★★ 项目最硬的骨头之一
 * ============================================================
 * 「玄空飞星」断宅的核心：一栋房子排出一个「宅命盘」，由三盘叠加：
 *
 *   运盘：当运之星入中顺飞            —— 时间维（哪一运建的）
 *   山盘：坐山运星入中，按坐山阴阳顺/逆飞 —— 主「人丁、健康」（山星宜高宜实）
 *   向盘：朝向运星入中，按朝向阴阳顺/逆飞 —— 主「财禄、事业」（向星宜低宜水）
 *
 * 每个宫位最终叠三个数：上=山星 / 中=运星 / 下=向星。
 *
 * ── 三步成盘（以「子山午向，2010年建」为例）──
 * 1) 运：2010 → 八运。运盘：8入中顺飞 → 中8乾9兑1艮2离3坎4坤5震6巽7
 * 2) 山：坐山=子(坎方)。运盘坎宫星=4 → 山盘入中星=4。
 *       子属天元龙、为阴 → 逆飞。山盘：4入中逆飞。
 * 3) 向：朝向=午(离方，子的对宫)。运盘离宫星=3 → 向盘入中星=3。
 *       午属天元龙、为阴 → 逆飞。向盘：3入中逆飞。
 *
 * ── 顺逆飞怎么定？看坐山/朝向的「三元阴阳」（bagua.js 的 M24 表）──
 *   阳龙 → 顺飞（flyForward）   阴龙 → 逆飞（flyBackward）
 *
 * 依赖：bagua.js, feixing.js
 */

(function (global) {
  'use strict';

  const { M24_BY_NAME, oppositeMountain } = global.XQ;
  const { flyForward, fly, yuanYun, yuanYunLabel, STARS } = global.XQ;

  /**
   * 排玄空宅命盘
   * @param {number} buildYear 建造年份（如 2010）
   * @param {string} zuoshan   坐山（二十四山名，如 '子'）
   * @returns {object} 完整盘局结构（见下方字段）
   */
  function xuankongPan(buildYear, zuoshan) {
    // 0. 基础：运、朝向
    const yun = yuanYun(buildYear);          // 当运星 1~9
    const yunLabel = yuanYunLabel(buildYear);// 「下元 八运」之类

    const z = M24_BY_NAME[zuoshan];
    if (!z) throw new Error('未知坐山: ' + zuoshan);

    const chaoxiang = oppositeMountain(zuoshan); // 朝向（二十四山）
    const c = M24_BY_NAME[chaoxiang];            // 朝向对象

    // 1. 运盘：当运星入中，永远顺飞
    const yunPan = flyForward(yun);

    // 2. 山盘：运盘中「坐山卦宫」的星数 → 作为山盘入中星
    //    坐山所属卦宫（如 子→坎），取运盘坎宫的星。
    const shanEnter = yunPan[z.gua];        // 山盘入中星
    const shanPan = fly(shanEnter, z.yin);  // 按坐山阴阳顺/逆飞

    // 3. 向盘：运盘中「朝向卦宫」的星数 → 作为向盘入中星
    const xiangEnter = yunPan[c.gua];       // 向盘入中星
    const xiangPan = fly(xiangEnter, c.yin);// 按朝向阴阳顺/逆飞

    // 4. 组装「每宫三盘」显示数据（给渲染层用）
    //    PALACE_ORDER 九宫顺序：中 乾 兑 艮 离 坎 坤 震 巽
    const palaces = global.XQ.PALACE_ORDER.map((gong) => {
      const yunS = yunPan[gong];
      const shanS = shanPan[gong];
      const xiangS = xiangPan[gong];
      return {
        gong,                                   // 宫位名（卦）
        dir: global.XQ.BAGUA_BY_NAME[gong].dir, // 方位文字
        yun: yunS,
        shan: shanS,
        xiang: xiangS,
        yunInfo: STARS[yunS],
        shanInfo: STARS[shanS],
        xiangInfo: STARS[xiangS],
      };
    });

    // 5. 正神 / 零神 位置（当运旺方判断）
    //    当运星=正神（宜山、宜高宜实）；其「合十」之数=零神（宜水、宜低宜空）。
    //    合十：1↔9, 2↔8, 3↔7, 4↔6, 5↔5
    const lingShen = 10 - yun;                       // 零神数（运星的合十）
    const zhengGong = findGongByStar(yunPan, yun);   // 正神所在宫（运星落点）
    const lingGong = findGongByStar(yunPan, lingShen === 10 ? 0 : lingShen); // 零神所在宫
    // 注：零神数若算出 10 取 0 不可能（yun 1~9 → lingShen 1~9），保平安
    const lingNum = lingShen === 10 ? 5 : lingShen;

    // 6. 简化格局判断（教学版，进阶流派有更细规则）
    //    「到山到向」最旺；「上山下水」需靠地形补救；「反吟/伏吟」略。
    const pattern = judgePattern(yun, z, c, shanPan, xiangPan);

    return {
      buildYear,
      yun,                 // 当运星
      yunLabel,            // 「下元 八运」
      zuoshan,             // 坐山
      chaoxiang,           // 朝向
      zuoshanMeta: z,      // {gua, yuan, yin}
      chaoxiangMeta: c,
      shanEnter,           // 山盘入中星
      xiangEnter,          // 向盘入中星
      shanFlyDir: z.yin ? '逆飞' : '顺飞',
      xiangFlyDir: c.yin ? '逆飞' : '顺飞',
      yunPan,              // {中:8, 乾:9, ...}
      shanPan,
      xiangPan,
      palaces,             // 九宫显示数据（渲染层用）
      zhengGong,           // 正神宫
      lingGong,            // 零神宫
      lingNum,
      pattern,             // 格局判断
    };
  }

  // 在某盘里找「星数=X」落在哪个宫
  function findGongByStar(pan, star) {
    for (const gong of global.XQ.PALACE_ORDER) {
      if (pan[gong] === star) return gong;
    }
    return null;
  }

  // ── 简化格局判断（教学版，附说明）──
  // 到山到向（旺山旺向）：当运山星落坐山宫 且 当运向星落朝向宫 —— 丁财两旺
  // 上山下水：当运山星落朝向宫 且 当运向星落坐山宫 —— 山星下水、向星上山，主退
  // （其余情况为平淡或需结合峦头，此处仅判这两种典型）
  function judgePattern(yun, z, c, shanPan, xiangPan) {
    const zGong = z.gua; // 坐山宫
    const cGong = c.gua; // 朝向宫
    const shanAtZ = shanPan[zGong] === yun; // 山星是否到山
    const xiangAtC = xiangPan[cGong] === yun; // 向星是否到向
    const shanAtC = shanPan[cGong] === yun;   // 山星是否下水(落向方)
    const xiangAtZ = xiangPan[zGong] === yun; // 向星是否上山(落坐方)

    if (shanAtZ && xiangAtC) {
      return { name: '到山到向（旺山旺向）', level: '大吉', detail: '当运山星到坐、向星到向，丁财两旺，玄空最吉之局' };
    }
    if (shanAtC && xiangAtZ) {
      return { name: '上山下水', level: '凶', detail: '山星下水、向星上山，丁财俱退，需以实地峦头（后有山前有水）补救' };
    }
    return { name: '平和之局', level: '平', detail: '非典型旺/衰局，需结合运星、峦头与流年飞星细推' };
  }

  // 导出
  global.XQ.xuankongPan = xuankongPan;
})(window);
