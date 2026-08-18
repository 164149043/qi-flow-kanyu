/**
 * scoring.js —— 宅局综合参考指数（分项诊断式）
 * ============================================================
 * 改造说明（专业评判后重做）：
 *   ① 九星层：旧版取 luck 均值是「死常数」（顺飞九宫恒为 {1..9} 全集，均值恒 5.6/9，
 *      永远 62 分，零区分度）。现改为「门方所临流年星吉凶」：朝向变→门宫变→分变。
 *   ② 二十四山：旧版「坐山打分」理论错位（三吉六秀是选向辅助表）且与玄空格局重复
 *      计分。现摘为不计分「立向参考」。
 *   ③ 八宅层：旧版只看门方。现升级为「门主灶三方九星」——阳宅三要。若用户在画布
 *      标注了主卧(bedroom)/灶(kitchen)，按 judgeRoom 评判（五行生克+八宅星+流年星）
 *      纳入总分；未标注则退化为只看门方（兼容）。门权重 1.0（宅之总气口·主导）、
 *      主卧 0.75、灶 0.75；judgeRoom 的 pts(-25~25) 归一化到 0~100。
 *
 *   结构：宅本盘（固有）+ 流年提示（随年）两组加权。
 *   参考：《八宅明镜》（游年·门主灶）、《沈氏玄空学》（到山到向）、原站 stars.js luck 系数。
 */
import { classifyMountain } from './twentyfour.js';
import { judgeRoom } from './geju.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// judgeRoom pts(-25~25) → 0~100：pts=25→100、pts=0→50、pts=-25→0
const ptsToScore = (p) => clamp(Math.round((p + 25) / 50 * 100), 0, 100);

/**
 * @param {{bazhai, yearFx, xuankong, rooms?:[], innerR?:number}} data
 *   rooms: 格局标注房间 [{id,type,elem,x,y}]（type 含 bedroom/kitchen 等）
 *   innerR: 中宫半径阈值（posToGong 用，默认 30）
 * @returns {{score:number, level:string, groups:{basePans:Layer[],flowYear:Layer[]}, reference:{text}}}
 */
export function comprehensiveScore({ bazhai, yearFx, xuankong, rooms = [], innerR = 30 }) {
  // ① 八宅层（宅本盘）：门主灶三方九星 —— 阳宅三要
  const xiang = bazhai.palaces.find((p) => p.gong === bazhai.xiangGua);
  let bScore = 50;
  if (xiang) bScore += xiang.info.ji === '吉' ? 22 : xiang.info.ji === '凶' ? -18 : 0;
  const jiFang = bazhai.palaces.filter((p) => p.info.ji === '吉').length;
  bScore += (jiFang - 4) * 4; // 恒为 4 吉方，微调项通常 0，保留扩展
  const doorScore = clamp(Math.round(bScore), 0, 100);
  // 门 1.0（宅之总气口·主导）/ 主卧 0.75 / 灶 0.75；未标注则该项不参与（权重归一）
  let wSum = 1, bFinal = doorScore, note = `门${xiang ? xiang.info.name : ''}·${jiFang}吉方`;
  const bed = rooms.find((r) => r.type === 'bedroom');
  const kit = rooms.find((r) => r.type === 'kitchen');
  if (bed) {
    const jb = judgeRoom(bed, bazhai, yearFx, innerR);
    bFinal += ptsToScore(jb.pts) * 0.75; wSum += 0.75;
    note += `·主卧${jb.gong}${jb.pts >= 0 ? '+' : ''}${jb.pts}`;
  }
  if (kit) {
    const jk = judgeRoom(kit, bazhai, yearFx, innerR);
    bFinal += ptsToScore(jk.pts) * 0.75; wSum += 0.75;
    note += `·灶${jk.gong}${jk.pts >= 0 ? '+' : ''}${jk.pts}`;
  }
  const bazhaiLayer = {
    key: 'bazhai', name: '八宅', weight: 30,
    score: clamp(Math.round(bFinal / wSum), 0, 100),
    note,
  };

  // ② 九星层（流年提示）：门方所临流年星吉凶（不取九宫均值死常数）
  const xiangGua = bazhai.xiangGua;
  const doorPalace = yearFx.palaces.find((p) => p.gong === xiangGua);
  let jScore = 60;
  let jNote = `${yearFx.centerInfo.star}入中`;
  if (doorPalace) {
    jScore = clamp(Math.round(doorPalace.info.luck * 100), 0, 100);
    jNote = `门${xiangGua}方临${doorPalace.info.star}·能量${doorPalace.info.luck}`;
  }
  const jiuxingLayer = {
    key: 'jiuxing', name: '九星', weight: 25,
    score: jScore, note: jNote,
  };

  // ③ 二十四山 —— 摘为不计分「立向参考」（理论错位+与格局重复）
  const m = classifyMountain(xuankong.zuoshan);
  const reference = { text: `坐${xuankong.zuoshan}·${m.tag}（${m.luck}）` };

  // ④ 格局层（宅本盘）：玄空 到山到向/上山下水/平和
  const lv = xuankong.pattern.level;
  const gScore = lv === '大吉' ? 88 : lv === '凶' ? 32 : 60;
  const gejuLayer = {
    key: 'geju', name: '格局', weight: 45,
    score: gScore, note: xuankong.pattern.name,
  };

  // 分组：宅本盘（固有 75%）+ 流年提示（随年 25%）
  const groups = {
    basePans: [gejuLayer, bazhaiLayer],
    flowYear: [jiuxingLayer],
  };

  // 综合参考指数 = 各层分 × 占总分权重（格局45 + 八宅30 + 九星25 = 100）
  const total =
    gejuLayer.score * 0.45 +
    bazhaiLayer.score * 0.30 +
    jiuxingLayer.score * 0.25;

  return {
    score: Math.round(total),
    level: total >= 75 ? '大吉' : total >= 60 ? '吉' : total >= 45 ? '平' : total >= 30 ? '凶' : '大凶',
    groups,
    reference,
  };
}
