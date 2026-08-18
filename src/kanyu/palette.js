/**
 * palette.js —— 堪舆页素绢霁青色板（P1.5 换皮）
 * ============================================================
 * 设计语言对齐 DESIGN.md「炁流风洞」：浅灰留白（素绢）、霁青一根刻线、赭金读数、
 * 冷蓝灰阴影（非纯黑）。原深色霓虹系（蓝黑底+荧光金 #0b0e16/#ffd76a）为明确反参考。
 *
 * 规矩：所有 Canvas 绘制（layers/compass/main/KanyuStage）只许从本文件取色，
 * 以后再换皮只改这里 + kanyu.css 的 :root，别处一个色值都不许硬编码。
 *
 * 语义分配（DESIGN.md 约定）：
 *   - 霁青 = 结构刻线（盘圈/主刻度/主方位字），与 3D 页墙棱/罗盘同族
 *   - 赭金 = 读数数字与参数值；赤金 = 被选中的东西（选中环/箭头）
 *   - 吉绿/凶红 = 语义色压饱和（status-green/alert-red 系），透明档做底
 *   - 罗盘磁针朱红、月相天池夜空深蓝 = 仪器本体语义，保留深色不换
 *   - 太极黑鱼 = 深墨（阴阳语义不换，仅从纯黑调为墨蓝）
 */
export const PAL = {
  // ── 纸面 ──
  paper: '#f7f8fa',          // 盘面白绢底（原 #0d1117 深底）
  compassBase: '#fdfdfe',    // 罗盘底盘（原 rgba(10,14,24,0.9)）

  // ── 墨（DESIGN.md ink 系）──
  ink: '#333333',            // 主文字（原 #e8ecf2 反转）
  inkSoft: '#555555',        // 次文字（原 #8fa2c8）
  inkFaint: '#8a94a4',       // 弱文字（原 #6a7383）
  inkDeep: '#2a3242',        // 深墨（太极阴鱼/洛书偶数块）

  // ── 霁青（结构刻线）──
  qing: '#2b6cb0',           // 主结构线/主刻度/主方位字
  qingBright: '#4a80d9',     // 强调边
  qingMist: 'rgba(43,108,176,0.32)',  // 淡青刻度（次档分界）
  qingPale: 'rgba(43,108,176,0.12)',  // 极淡青底

  // ── 赭金（读数）/赤金（选中）──
  gold: '#c77800',           // 读数金（原 #ffd76a）
  goldDim: '#a86500',        // 深金（原 #c8a040）
  chi: '#d89000',            // 赤金·选中环/朝向箭头（原 #ffb020/#ffd76a 箭头）
  chiBg: 'rgba(216,144,0,0.14)',      // 赤金淡底（时辰扇区等）

  // ── 吉凶（压饱和）──
  ji: '#2a8a3a',  jiDa: '#1e7a30',
  xiong: '#c0392b', xiongDa: '#a93226',
  ping: '#7888a0',
  jiBg: 'rgba(42,138,58,0.11)',   jiBgDa: 'rgba(30,122,48,0.16)',
  xiongBg: 'rgba(192,57,43,0.09)', xiongBgDa: 'rgba(169,50,38,0.14)',
  pingBg: 'rgba(120,130,150,0.10)',

  // ── 仪器（深色语义保留）──
  needleRed: '#d94a30',      // 罗盘磁针朱红（仪器本体，压深一档）
  needleTail: '#c8d0e0',    // 针尾
  needleEdge: 'rgba(60,70,90,0.55)', // 针描边（浅底上冷蓝灰替代原深黑描边）
  nightSky: '#2e3550',       // 月相天池夜空底（夜空语义保留）
  moon: '#e8e4d8',           // 月白
  hetuYang: '#ffffff',       // 河图白点（白底上靠描边成"空心"）
  hetuYangEdge: '#555555',
  hetuYin: '#333333',        // 河图黑点
  tick: '#c5cdd9',           // 罗盘次刻度（5°细格）
  guaPurple: '#8e4ec0',      // 二十四山·四维卦紫（艮巽坤乾）
  luoshuEven: 'rgba(42,50,66,0.92)',  // 洛书偶数棋子（墨青）
  luoshuOdd: '#8a5f40',      // 洛书奇数棋子（棕）
  luoshuCenter: '#8a6a1a',   // 洛书中宫5（深金棋子）
  chessText: '#ffffff',      // 深棋子上的白字

  // ── 冷蓝灰阴影（系统指纹）──
  shadow: 'rgba(60,70,90,0.35)',
  shadowSoft: 'rgba(60,70,90,0.12)',
  badgeBg: 'rgba(255,255,255,0.92)', // 外围方位标/浮起圆的白底

  // ── 太极 ──
  taijiYang: '#ffffff',
  taijiYin: '#2a3242',

  // ── 文字 halo（五盘层描边）：把刻字从叠层背景里提出来，地图标注/古籍批注手法 ──
  outline: '#ffffff',
};

/** 吉凶 → {bg, text}（九宫格底色+字色；原 luckColor 浅色版） */
export function luckColor(ji) {
  switch (ji) {
    case '大吉': return { bg: PAL.jiBgDa,   text: PAL.jiDa };
    case '吉':   return { bg: PAL.jiBg,     text: PAL.ji };
    case '大凶': return { bg: PAL.xiongBgDa, text: PAL.xiongDa };
    case '凶':   return { bg: PAL.xiongBg,   text: PAL.xiong };
    default:     return { bg: PAL.pingBg,    text: PAL.ping };
  }
}

/* ══════════ 盘面档 DISK（中央盘面专用；2026-08-18 玄石深衬底试用后被用户否决，还原浅绢）══════════
 * 分工：PAL 供右栏白底罗盘 compass.js；DISK 供中央盘 layers.js/KanyuStage/main.js 盘面绘制。
 * 当前两档同值（浅绢）。将来再换深衬底/其他盘面皮，只改本区块值即可，引用处零改动。 */
export const DISK = {
  // ── 衬底 ──
  bg: '#f7f8fa',                     // 白绢盘面底（KanyuStage bgColor）
  frame: '#eceef2',

  // ── 刻线（霁青）──
  qing: '#2b6cb0',
  qingBright: '#4a80d9',
  qingMist: 'rgba(43,108,176,0.32)',
  qingEdge: 'rgba(43,108,176,0.55)',

  // ── 字（墨系）──
  ink: '#333333',
  inkSoft: '#555555',
  inkFaint: '#8a94a4',

  // ── 金 ──
  gold: '#c77800',
  goldDim: '#a86500',
  chi: '#d89000',

  // ── 吉凶 ──
  jiBg: 'rgba(42,138,58,0.11)',   jiBgDa: 'rgba(30,122,48,0.16)',
  xiong: '#c0392b', xiongDa: '#a93226',
  xiongBg: 'rgba(192,57,43,0.09)', xiongBgDa: 'rgba(169,50,38,0.14)',
  pingBg: 'rgba(120,130,150,0.10)',

  // ── 共用件 ──
  outline: '#ffffff',                // 文字 halo
  badgeBg: 'rgba(255,255,255,0.92)', // 外围方位标/房间徽章白底圆
  shadow: 'rgba(60,70,90,0.35)',

  // ── 太极 ──
  taijiYang: '#ffffff',
  taijiYin: '#2a3242',
};

/** 吉凶 → {bg,text} 盘面档（当前=浅底，与 luckColor 同值） */
export function luckColorDisk(ji) {
  switch (ji) {
    case '大吉': return { bg: DISK.jiBgDa,   text: '#1e7a30' };
    case '吉':   return { bg: DISK.jiBg,     text: '#2a8a3a' };
    case '大凶': return { bg: DISK.xiongBgDa, text: '#a93226' };
    case '凶':   return { bg: DISK.xiongBg,   text: '#c0392b' };
    default:     return { bg: DISK.pingBg,    text: '#7888a0' };
  }
}

/** 八宅八星盘面档（当前=浅底，与 BAZHAI_STAR_STYLE 同值） */
export const BAZHAI_STAR_STYLE_DISK = {
  '生气': { text: '#1e7a30', bg: 'rgba(30,122,48,0.16)' },
  '天医': { text: '#2a8a3a', bg: 'rgba(42,138,58,0.12)' },
  '延年': { text: '#3a9a4a', bg: 'rgba(58,154,74,0.10)' },
  '伏位': { text: '#4aa858', bg: 'rgba(74,168,88,0.08)' },
  '绝命': { text: '#a93226', bg: 'rgba(169,50,38,0.14)' },
  '五鬼': { text: '#b04a30', bg: 'rgba(176,74,48,0.11)' },
  '六煞': { text: '#a8720a', bg: 'rgba(168,114,10,0.10)' },
  '祸害': { text: '#b06848', bg: 'rgba(176,104,72,0.09)' },
};

/** 九星文字色盘面档（当前=浅底，与 starColor 同值） */
export function starColorDisk(n) {
  return ({
    1: '#7890a8', 2: '#555555', 3: '#2f8f8f', 4: '#3a9a3f',
    5: '#b8860b', 6: '#7890a8', 7: '#c0392b', 8: '#7890a8', 9: '#8e4ec0',
  })[n] || '#8a94a4';
}

/** 八宅八星配色（浅底版：吉绿系浓淡、凶红橙系浓淡、六煞赭金）
 *  按能量渐变：生气最浓→伏位最淡；绝命最浓→祸害最淡 */
export const BAZHAI_STAR_STYLE = {
  '生气': { text: '#1e7a30', bg: 'rgba(30,122,48,0.16)' },
  '天医': { text: '#2a8a3a', bg: 'rgba(42,138,58,0.12)' },
  '延年': { text: '#3a9a4a', bg: 'rgba(58,154,74,0.10)' },
  '伏位': { text: '#4aa858', bg: 'rgba(74,168,88,0.08)' },
  '绝命': { text: '#a93226', bg: 'rgba(169,50,38,0.14)' },
  '五鬼': { text: '#b04a30', bg: 'rgba(176,74,48,0.11)' },
  '六煞': { text: '#a8720a', bg: 'rgba(168,114,10,0.10)' },
  '祸害': { text: '#b06848', bg: 'rgba(176,104,72,0.09)' },
};

/** 九星文字色（按星数 1~9，浅底版）：
 *  一/六/八白→雾蓝灰（白在白底不可见，用青灰承"白"）；二黑灰；三碧青；四绿；五黄金；七赤红；九紫 */
export function starColor(n) {
  return ({
    1: '#7890a8', 2: '#555555', 3: '#2f8f8f', 4: '#3a9a3f',
    5: '#b8860b', 6: '#7890a8', 7: '#c0392b', 8: '#7890a8', 9: '#8e4ec0',
  })[n] || '#8a94a4';
}
