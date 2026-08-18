/**
 * geju.js —— 格局标注（房间类型 + 五行生克 + 三层评判）
 * ============================================================
 * 阶段E「格局标注」用。原站 kanyu 页 ROOM_TYPES/judgeRoom 实锤（curl 逆向 1773~1834 行），
 * 适配本项目的 bazhai.palaces / yearFx.palaces 数据结构（按卦名查，而非原站 index）。
 *
 * 三层评判：① 宫位五行 vs 房间五行生克 ② 八宅星（吉位宜居/凶位宜厨卫储）③ 流年星特殊加成。
 * 用法：judgeRoom(room, bazhai, yearFx, innerR) → {pts, reasons, gong}
 */

/** 房间类型：name 名称 / mark 画布字标 / col 配色 / elem 五行。原站 ROOM_TYPES 照搬。 */
export const ROOM_TYPES = {
  kitchen:   { name: '厨房',   mark: '厨', col: '#e05252', elem: '火' },
  bathroom:  { name: '卫生间', mark: '卫', col: '#4a8ce0', elem: '水' },
  bedroom:   { name: '卧室',   mark: '卧', col: '#a888d0', elem: '土' },
  study:     { name: '书房',   mark: '书', col: '#3aa860', elem: '木' },
  balcony:   { name: '阳台',   mark: '台', col: '#1fa89a', elem: '木' },
  living:    { name: '客厅',   mark: '厅', col: '#d09818', elem: '土' },
  storage:   { name: '储物间', mark: '储', col: '#7888a0', elem: '金' },
};

/** 五行配色（列表/详情用）。原站 ELEM_COLORS 同款。 */
export const ELEM_COLORS = { 金: '#a8b4c8', 木: '#3aa860', 水: '#4a8ce0', 火: '#e05252', 土: '#b89058' };

/** 九宫五行（按卦名）：坎水·坤土·震木·巽木·中土·乾金·兑金·艮土·离火。 */
const PALACE_ELEM = { 坎: '水', 坤: '土', 震: '木', 巽: '木', 中: '土', 乾: '金', 兑: '金', 艮: '土', 离: '火' };
const SHENG = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' }; // 我生者为相生
const KE = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };   // 我克者为相克

/** 五行生克关系（宫位五行 gongE vs 房间五行 roomE）→ {rel,pts,desc}。原站 elemRelation 同款。 */
export function elemRelation(gongE, roomE) {
  if (gongE === roomE) return { rel: '比和', pts: 6, desc: `比和（${gongE}同气相扶）+6` };
  if (SHENG[gongE] === roomE) return { rel: '宫生房', pts: 8, desc: `${gongE}生${roomE}（宫生房，得生扶）+8` };
  if (SHENG[roomE] === gongE) return { rel: '房生宫', pts: -3, desc: `${roomE}生${gongE}（房生宫，泄气）-3` };
  if (KE[gongE] === roomE) return { rel: '宫克房', pts: -8, desc: `${gongE}克${roomE}（宫克房，被压制）-8` };
  if (KE[roomE] === gongE) return { rel: '房克宫', pts: -5, desc: `${roomE}克${gongE}（房克宫，相斗耗气）-5` };
  return { rel: '比和', pts: 6, desc: '比和+6' };
}

// 八方卦序（上=坎北 起顺时针），与画布点击命中同款
const ORDER = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾'];

/** 盘式坐标 (x,y) → 卦名（含中宫）。innerR=中宫半径阈值；r<innerR 判中宫。上北下南。 */
export function posToGong(x, y, innerR) {
  const r = Math.hypot(x, y);
  if (r < innerR) return '中';
  let rel = Math.atan2(y, x) + Math.PI / 2;
  rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return ORDER[Math.floor(rel / (Math.PI / 4)) % 8];
}

/**
 * 格局评判（五行生克 + 八宅星 + 流年星 三层）。原站 judgeRoom 算法照搬，数据源适配本项目。
 * @param room {x,y,type,elem} 房间（盘式坐标）
 * @param bazhai bazhaiPan() 结果（palaces[].gong/info.name/info.ji）
 * @param yearFx yearFeixingPan() 结果（palaces[].gong/star）
 * @param innerR 中宫半径阈值
 * @returns {pts:-25~25, reasons:[], gong}
 */
export function judgeRoom(room, bazhai, yearFx, innerR) {
  const gong = posToGong(room.x, room.y, innerR);
  let pts = 0;
  const reasons = [];

  // ① 五行生克（宫位五行 vs 房间五行）
  const rel = elemRelation(PALACE_ELEM[gong], room.elem);
  pts += rel.pts; reasons.push(rel.desc);

  // ② 八宅星（中宫跳过）：凶位宜厨/卫/储（以凶压凶），吉位宜居
  if (gong !== '中') {
    const p = bazhai.palaces.find((pp) => pp.gong === gong);
    if (p) {
      const isJi = p.info.ji === '吉';
      const nm = p.info.name;
      if (room.type === 'bathroom' || room.type === 'storage') {
        if (!isJi) { pts += 8; reasons.push(`「${nm}」凶位：污压凶煞+8（以凶压凶）`); }
        else { pts -= 10; reasons.push(`「${nm}」吉位：污损吉位-10`); }
      } else if (room.type === 'kitchen') {
        if (!isJi) { pts += 6; reasons.push(`「${nm}」凶位：灶火制煞+6`); }
        else { pts += 2; reasons.push(`「${nm}」吉位：火气平和+2`); }
      } else if (isJi) {
        pts += 10; reasons.push(`「${nm}」吉位：宜居+10`);
      } else {
        pts -= 9; reasons.push(`「${nm}」凶位：不宜久居-9`);
      }
    }
  }

  // ③ 流年星（当年飞布）特殊加成
  const fp = yearFx.palaces.find((pp) => pp.gong === gong);
  const fs = fp ? fp.star : 0;
  if (fs === 5 && room.elem === '火') { pts -= 12; reasons.push('火生五黄土（助纣为虐）-12'); }
  if (fs === 5 && room.elem === '金') { pts += 6; reasons.push('金泄五黄土（化煞）+6'); }
  if (fs === 2 && room.elem === '金') { pts += 5; reasons.push('金泄二黑（化病符）+5'); }
  if (fs === 8 && room.type !== 'bathroom') { pts += 6; reasons.push('居八白财星宫+6'); }
  if (fs === 9 && room.type === 'bedroom') { pts += 6; reasons.push('卧室居九紫喜庆+6'); }
  if (fs === 4 && room.type === 'study') { pts += 8; reasons.push('书房居四绿文曲+8'); }
  if (fs === 1 && room.type === 'bedroom') { pts += 4; reasons.push('卧室居一白桃花+4'); }

  return { pts: Math.max(-25, Math.min(25, pts)), reasons, gong };
}
