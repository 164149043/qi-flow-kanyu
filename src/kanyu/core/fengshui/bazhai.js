/**
 * bazhai.js —— 大游年八宅（八宅明镜）
 * ============================================================
 * 八宅派核心：门朝向 → 坐山（对宫）→ 以坐山为本，按「大游年歌诀」布八方九星。
 *
 * ★ 数据来源：原站 kanyu 页 DAYOUNIAN_SONG 实锤（curl 逆向），与公认八宅明镜一致。
 *   歌诀 7 字对应卦序 = 坎艮震巽离坤兑（后天八卦方位顺时针，跳本宫与中宫）。
 *   本宫（坐山）= 伏位。
 *
 * 字义：生=生气(贪狼·吉) 天=天医(巨门·吉) 延=延年(武曲·吉) 伏=伏位(辅弼·吉)
 *       绝=绝命(破军·凶) 五=五鬼(廉贞·凶) 六=六煞(文曲·凶) 祸=祸害(禄存·凶)
 *
 * 依赖：core/index.js 的 BAGUA_BY_NAME（方位文字标注）。
 */
import { BAGUA_BY_NAME } from '../index.js';

// 大游年歌诀（原站 DAYOUNIAN_SONG 实锤，8 坐山卦各一句）
const DAYOU_SONG = {
  乾: '六天五祸绝延生',
  坎: '五天生延绝祸六',
  艮: '六绝祸生延天五',
  震: '延生祸绝五天六',
  巽: '天五六祸生绝延',
  离: '六五绝延祸生天',
  坤: '天延绝生祸五六',
  兑: '生祸延绝六五天',   // ★ 2026-08-18 校正：原抄'六天五'为倒字传本——配合对称性（坤宅侧"兑=天"）要求兑坤=天医/兑离=五鬼
};

// 歌诀字 → 九星详情
const CHAR_TO_STAR = {
  '生': { name: '生气', beidou: '贪狼', wuxing: '木', ji: '吉', meaning: '生机·旺丁·催财' },
  '天': { name: '天医', beidou: '巨门', wuxing: '土', ji: '吉', meaning: '医药·健康·贵人' },
  '延': { name: '延年', beidou: '武曲', wuxing: '金', ji: '吉', meaning: '长寿·感情·和顺' },
  '伏': { name: '伏位', beidou: '辅弼', wuxing: '木', ji: '吉', meaning: '平稳·守成·蓄势' },
  '绝': { name: '绝命', beidou: '破军', wuxing: '金', ji: '凶', meaning: '破败·损伤' },
  '五': { name: '五鬼', beidou: '廉贞', wuxing: '火', ji: '凶', meaning: '惹灾·官非' },
  '六': { name: '六煞', beidou: '文曲', wuxing: '水', ji: '凶', meaning: '口舌·桃花劫' },
  '祸': { name: '祸害', beidou: '禄存', wuxing: '土', ji: '凶', meaning: '病耗·是非' },
};

// 八卦对宫（门=向，坐=对宫）
const OPPOSITE_GUA = { 坎: '离', 离: '坎', 震: '兑', 兑: '震', 乾: '巽', 巽: '乾', 艮: '坤', 坤: '艮' };

// 歌诀字对应的卦序（后天方位顺时针，全 8 卦遍历用）
const GONG_ORDER8 = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'];

// 45° 一卦的索引表（degToGua 用）
const GUA_BY_45 = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'];

/** 方位角（0=北顺时针）→ 卦名 */
export function degToGua(deg) {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return GUA_BY_45[i];
}

/** 卦名 → 对宫卦名 */
export function oppositeGua(name) {
  return OPPOSITE_GUA[name];
}

/**
 * 八宅排盘：门朝向 → 坐山 → 八方九星
 * @param {string} doorGuaName 门朝向卦名（门=向，如门朝南='离'）
 * @returns {{zuoGua, xiangGua, palaces: [{gong, dir, jiuXing, info}]}}
 */
export function bazhaiPan(doorGuaName) {
  const xiangGua = doorGuaName;               // 门=向
  const zuoGua = OPPOSITE_GUA[xiangGua];      // 坐=对宫
  const song = DAYOU_SONG[zuoGua];            // 坐山歌诀（7字）

  // 布星：大游年歌第 1 字布在「坐山的下一卦」（后天方位顺时针），依次顺布，回到本宫=伏位。
  // ★ 2026-08-18 修正：原实现从 GONG_ORDER8 头（坎）起跳过坐山——坐山为坎/乾时下一卦恰为起点、
  //   侥幸正确，其余 6 宅整体错位（如离宅坎得六煞，实为延年）。经卦配配合表独立基准全量验证锁定。
  const palaces = [];
  const zuoIdx = GONG_ORDER8.indexOf(zuoGua);
  let songIdx = 0;
  for (let k = 1; k <= 8; k++) {
    const gong = GONG_ORDER8[(zuoIdx + k) % 8];
    if (gong === zuoGua) {
      // 本宫 = 伏位
      palaces.push({
        gong,
        dir: BAGUA_BY_NAME[gong].dir,
        jiuXing: '伏',
        info: CHAR_TO_STAR['伏'],
      });
    } else {
      const ch = song[songIdx++];
      palaces.push({
        gong,
        dir: BAGUA_BY_NAME[gong].dir,
        jiuXing: ch,
        info: CHAR_TO_STAR[ch],
      });
    }
  }
  return { zuoGua, xiangGua, palaces };
}

export { DAYOU_SONG, CHAR_TO_STAR };
