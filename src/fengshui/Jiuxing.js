// Jiuxing.js —— 九宫飞星：一白~九紫 9 星，按流年飞布九宫，泄耗炁场
// 1一白(水,吉) 2二黑(土,凶) 3三碧(木,凶) 4四绿(木,吉) 5五黄(土,大凶)
// 6六白(金,吉) 7七赤(金,凶) 8八白(土,吉) 9九紫(火,吉)

export const JIUXING_STARS = [
  null,
  { name: '一白', wuxing: '水', ji: 1,  col: [170, 200, 255], desc: '桃花·官贵',
    yi: '求财、催官、旺丁、安床', avoid: '桃花过滥（已婚慎之）', solve: '生气吉星，宜动宜催，常保洁净明亮', source: '《紫白诀》' },
  { name: '二黑', wuxing: '土', ji: -2, col: [170, 120, 70],  desc: '病符',
    yi: '宜静', avoid: '动土、安床、久坐其位', solve: '金泄土：挂铜铃或金属物，置安忍水化解', source: '《紫白诀》' },
  { name: '三碧', wuxing: '木', ji: -1, col: [120, 180, 90],  desc: '是非·蚩尤',
    yi: '—', avoid: '争吵、诉讼、动土', solve: '火泄木：置红色物品，或以八白土制化', source: '《紫白诀》' },
  { name: '四绿', wuxing: '木', ji: 2,  col: [100, 200, 120], desc: '文昌·学业',
    yi: '读书、考试、求名、布文昌位', avoid: '污秽杂乱（污文昌不利学业）', solve: '常保洁净，宜设书桌于该方', source: '《紫白诀》' },
  { name: '五黄', wuxing: '土', ji: -4, col: [200, 160, 40],  desc: '灾瘟·大凶',
    yi: '—', avoid: '动土、安床、开门、久居', solve: '宜静忌动，挂六字真言铜铃或安忍水化煞', source: '《紫白诀》《沈氏玄空学》' },
  { name: '六白', wuxing: '金', ji: 2,  col: [210, 215, 230], desc: '武贵·官',
    yi: '求职、升迁、武职、权威', avoid: '污秽、受压', solve: '武曲主权威，宜净不宜压', source: '《紫白诀》' },
  { name: '七赤', wuxing: '金', ji: -1, col: [220, 130, 130], desc: '贼盗·口舌',
    yi: '—', avoid: '口舌、借贷、置贵重物', solve: '水泄金：置黑色或水属性物品，或以八白制', source: '《紫白诀》' },
  { name: '八白', wuxing: '土', ji: 3,  col: [190, 180, 140], desc: '财',
    yi: '求财、置业、经商、安床', avoid: '—', solve: '当旺财星，宜动宜催，宜置水或动象', source: '《紫白诀》' },
  { name: '九紫', wuxing: '火', ji: 3,  col: [225, 90, 90],   desc: '喜庆·姻缘',
    yi: '结婚、喜庆、求子、相亲', avoid: '灶火过旺（火炎土燥）', solve: '喜庆吉星，宜催旺，常保明亮', source: '《紫白诀》' }
];

// 收口(2026-08-18)：算法统一走 kanyu/core 唯一术数源（yearStar/flyForward），本文件只留炁流展示皮肤与 worker 泄耗
import { yearStar, flyForward, palaceBoost } from '../kanyu/core/index.js';

// 流年中宫星（=core yearStar 别名，保持炁流侧 API；2000 九紫入中锚点已在 core 验证）
export const yearCenterStar = yearStar;

// core 卦名制 → 炁流方位文字制
const GUA2DIR8 = { 乾: '西北', 兑: '西', 艮: '东北', 离: '南', 坎: '北', 坤: '西南', 震: '东', 巽: '东南' };

// 九宫飞星：中宫星 → {方位: 星数1-9}（8 方位 + 中宫；轨迹=core flyForward 洛书序顺飞）
export function flyStars(centerStar) {
  const pan = flyForward(centerStar);
  const r = { 中: pan['中'] };
  for (const g in GUA2DIR8) r[GUA2DIR8[g]] = pan[g];
  return r;
}

// 网格 (i,j, 1-based) → 九宫方位（3×3：i 小西/中/东，j 小北/中/南）
// f=分野范围(0.4~1)：九宫网格套在域中心 f 比例区间内，区间外格子 clamp 归最近外圈宫
// （上传户型有大有小——f 收缩让九宫套住户型而非铺满全域；f=1 退化为全域分野=旧行为）
export function palaceDir(i, j, W, H, f = 1) {
  const x0 = W * (1 - f) / 2, x1 = W * (1 + f) / 2;
  const y0 = H * (1 - f) / 2, y1 = H * (1 + f) / 2;
  const ci = i <= x0 + (x1 - x0) / 3 ? '西' : (i <= x0 + (x1 - x0) * 2 / 3 ? '中' : '东');
  const cj = j <= y0 + (y1 - y0) / 3 ? '北' : (j <= y0 + (y1 - y0) * 2 / 3 ? '中' : '南');
  if (ci === '中' && cj === '中') return '中';
  if (cj === '北') return ci === '西' ? '西北' : (ci === '东' ? '东北' : '北');
  if (cj === '南') return ci === '西' ? '西南' : (ci === '东' ? '东南' : '南');
  return ci;   // cj 中：西/东
}

// 星 → 保留系数（连续档，原站 xunqi 同款）：fortune=(palaceBoost-0.7)/0.5 约 0.05~1，
// 吉星聚 ≈0.995/s（近不衰减），凶星泄 ≈0.924/s（衰减快）——悬浮盘三态文字与物理同源
function starDrain(starN) {
  return 0.92 + 0.075 * ((palaceBoost(starN) - 0.7) / 0.5);
}

// 宫位三态（悬浮盘标签用）：≥0.98 聚炁 / ≤0.94 散炁 / 其间 流转（阈值原站同款）
export function palaceInfluenceText(starN) {
  const d = starDrain(starN);
  if (d >= 0.98) return '聚炁';
  if (d <= 0.94) return '散炁';
  return '流转';
}

// 生成 palaceDrain 数组（每格衰减系数，连续档）：吉星聚炁 凶星泄炁，炁流模式泄耗 dye
// f=分野范围（与悬浮九宫盘同一 palaceScale——视觉分野与物理泄耗同步收缩）
export function buildPalaceDrain(W, H, SW, year, f = 1) {
  const center = yearCenterStar(year);
  const stars = flyStars(center);
  const drain = new Float32Array(SW * (H + 2));
  for (let j = 1; j <= H; j++) {
    for (let i = 1; i <= W; i++) {
      const dir = palaceDir(i, j, W, H, f);
      const starN = stars[dir] || center;
      const c = i + SW * j;
      drain[c] = starDrain(starN);
    }
  }
  return drain;
}

// 在 canvas 画九宫格（3×3，每格星名+方位+吉凶色），上北下南
export function drawJiuxing(ctx, W, H, HSCALE, year) {
  const center = yearCenterStar(year);
  const stars = flyStars(center);
  ctx.clearRect(0, 0, W * HSCALE, H * HSCALE);
  const cellW = W * HSCALE / 3, cellH = H * HSCALE / 3;
  // 行(上北下南) × 列(左西右东)
  const layout = [
    ['西北', '北', '东北'],
    ['西', '中', '东'],
    ['西南', '南', '东南']
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const dir = layout[r][c];
      const starN = stars[dir];
      const star = JIUXING_STARS[starN];
      const x = c * cellW, y = r * cellH;
      ctx.fillStyle = `rgba(${star.col[0]},${star.col[1]},${star.col[2]},${star.ji >= 0 ? 0.3 : 0.48})`;
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeStyle = `rgb(${star.col[0]},${star.col[1]},${star.col[2]})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, cellW, cellH);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // 星名：深色描边 + 彩色填充（加粗明显）
      ctx.font = 'bold 26px Microsoft YaHei';
      ctx.strokeStyle = 'rgba(8,10,16,.95)'; ctx.lineWidth = 5;
      ctx.strokeText(star.name, x + cellW / 2, y + cellH / 2 - 10);
      ctx.fillStyle = `rgb(${star.col[0]},${star.col[1]},${star.col[2]})`;
      ctx.fillText(star.name, x + cellW / 2, y + cellH / 2 - 10);
      // 方位·吉凶
      ctx.font = '12px Microsoft YaHei';
      ctx.strokeStyle = 'rgba(8,10,16,.9)'; ctx.lineWidth = 4;
      ctx.strokeText(dir + '·' + (star.ji >= 0 ? '吉' : '凶'), x + cellW / 2, y + cellH / 2 + 16);
      ctx.fillStyle = '#cfe0f5';
      ctx.fillText(dir + '·' + (star.ji >= 0 ? '吉' : '凶'), x + cellW / 2, y + cellH / 2 + 16);
    }
  }
  return { year, center, centerStar: JIUXING_STARS[center], stars };
}
