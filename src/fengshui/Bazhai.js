// Bazhai.js —— 八宅九星：大门朝向 → 宅卦 → 8 方位吉凶（对照原站扒取的大游年表）
// 四吉：生气/天医/延年/伏位；四凶：绝命/五鬼/六煞/祸害

// 8 星：name 星名, ji 吉凶值(正吉负凶), col 颜色 RGB
export const BAZHAI_STARS = [
  { name: '生气', ji: 4,  col: [30, 150, 60], desc: '主生机旺盛，旺丁旺财，最宜主门与主卧', source: '《八宅明镜》' },
  { name: '天医', ji: 3,  col: [50, 170, 90], desc: '主健康延年，除病化灾，宜病人卧室', source: '《八宅明镜》' },
  { name: '延年', ji: 2,  col: [90, 190, 110], desc: '主姻缘和合，夫妻和睦长寿，宜主卧', source: '《八宅明镜》' },
  { name: '伏位', ji: 1,  col: [120, 200, 150], desc: '主安稳平顺，宜静居安床', source: '《八宅明镜》' },
  { name: '绝命', ji: -4, col: [200, 30, 30], desc: '大凶，主破财多病伤亡，忌久居与主门', source: '《八宅明镜》' },
  { name: '五鬼', ji: -3, col: [220, 80, 40], desc: '主邪祟官灾火灾贼盗，忌主门动土', source: '《八宅明镜》' },
  { name: '六煞', ji: -2, col: [230, 130, 50], desc: '主口舌桃花烦恼，忌卧室久居', source: '《八宅明镜》' },
  { name: '祸害', ji: -1, col: [200, 120, 90], desc: '主病痛是非霉运，宜静忌动', source: '《八宅明镜》' }
];

// 大游年表已删（2026-08-18 收口）：算法统一走 kanyu/core 唯一术数源，勿在此重写术数。

export const ZHAI_NAME = {
  0: '坎宅(坐北朝南)', 4: '离宅(坐南朝北)', 2: '震宅(坐东朝西)', 6: '兑宅(坐西朝东)',
  3: '巽宅(坐东南朝西北)', 7: '乾宅(坐西北朝东南)', 5: '坤宅(坐西南朝东北)', 1: '艮宅(坐东北朝西南)'
};

// 8 方位角度：北/东北/东/东南/南/西南/西/西北
export const DIR8_B = [0, 45, 90, 135, 180, 225, 270, 315];
export const WIND8 = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

// 方位角 → 方向向量（x 东, z 南；用于 canvas/世界偏移）
export function bearingToDir(bDeg) {
  const r = bDeg * Math.PI / 180;
  return { x: Math.sin(r), z: -Math.cos(r) };   // 北0→z=-1(上) 南180→z=1(下)
}

// 八宅计算：doorFacing 门朝向(度) → {facing, sitting, sitIdx, zhaiName, sectors[8]}
// 收口(2026-08-18)：内核走 kanyu/core bazhaiPan（唯一术数源），本函数只做"卦宫制→WIND8 方位序 + 炁流皮肤"转换
import { bazhaiPan, degToGua } from '../kanyu/core/fengshui/bazhai.js';
const STAR_SKIN = Object.fromEntries(BAZHAI_STARS.map((s) => [s.name, s]));
export function bazhaiCompute(doorFacing) {
  const facing = ((doorFacing % 360) + 360) % 360;
  const sitting = (facing + 180) % 360;          // 坐山 = 门朝 + 180
  const sitIdx = Math.round(sitting / 45) % 8;   // 宅卦索引（0坎1艮2震3巽4离5坤6兑7乾，与 core GUA_BY_45 一致）
  const pan = bazhaiPan(degToGua(facing));       // core：度→向卦→大游年（含 2026-08-18 起布修正+兑句校正）
  const sectors = WIND8.map((dir, i) => {
    const p = pan.palaces.find((q) => q.dir === dir);
    const skin = STAR_SKIN[p.info.name];
    return { bearing: DIR8_B[i], name: p.info.name, ji: skin.ji, col: skin.col, desc: skin.desc, source: skin.source };
  });
  return { facing, sitting, sitIdx, zhaiName: ZHAI_NAME[sitIdx], zuoGua: pan.zuoGua, xiangGua: pan.xiangGua, sectors };
}

// 在 canvas 上画 8 扇区吉凶色块 + 星名（对照原站 drawBazhai）
// ctx: 2d context; W/H/HSCALE: 网格与缩放; doorFacing: 门朝向
export function drawBazhai(ctx, W, H, HSCALE, doorFacing) {
  const cx = (W / 2) * HSCALE, cy = (H / 2) * HSCALE;
  const R = Math.min(W, H) * HSCALE * 0.46;
  const bz = bazhaiCompute(doorFacing);
  ctx.clearRect(0, 0, W * HSCALE, H * HSCALE);
  for (let di = 0; di < 8; di++) {
    const sec = bz.sectors[di];
    const a0 = DIR8_B[di] - 22.5, a1 = DIR8_B[di] + 22.5;
    // 扇形
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let aa = a0; aa <= a1; aa += 3) {
      const dd = bearingToDir(aa);
      ctx.lineTo(cx + dd.x * R, cy + dd.z * R);
    }
    ctx.closePath();
    const alpha = sec.ji > 0 ? 0.24 + sec.ji * 0.03 : 0.30 - sec.ji * 0.03;
    ctx.fillStyle = `rgba(${sec.col[0]},${sec.col[1]},${sec.col[2]},${alpha})`;
    ctx.fill();
    ctx.strokeStyle = `rgb(${sec.col[0]},${sec.col[1]},${sec.col[2]})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 星名 + 吉凶（加大 + 深色描边，明显）
    const mid = bearingToDir(DIR8_B[di]);
    const tx = cx + mid.x * R * 0.66, ty = cy + mid.z * R * 0.66;
    ctx.font = 'bold 22px Microsoft YaHei';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(8,10,16,.95)'; ctx.lineWidth = 5;
    ctx.strokeText(sec.name, tx, ty);
    ctx.fillStyle = `rgb(${sec.col[0]},${sec.col[1]},${sec.col[2]})`;
    ctx.fillText(sec.name, tx, ty);
    ctx.font = 'bold 13px Microsoft YaHei';
    ctx.strokeStyle = 'rgba(8,10,16,.9)'; ctx.lineWidth = 4;
    ctx.strokeText(sec.ji > 0 ? '吉' : '凶', tx, ty + 16);
    ctx.fillStyle = '#cfe0f5';
    ctx.fillText(sec.ji > 0 ? '吉' : '凶', tx, ty + 16);
  }
  return bz;
}
