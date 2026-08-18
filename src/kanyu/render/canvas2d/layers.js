/**
 * layers.js —— 堪舆页排盘图层绘制（在 KanyuStage 变换坐标系内，盘心=0,0）
 * ============================================================
 * 原站 kanyu 页实锤（5 张截图对位）：右上角 5 个标签开关，每个点开显示对应盘式：
 *   ① 八宅     —— 八方游年九星（伏位/生气…）   对位 图2
 *   ② 九星     —— 流年九星名盘（星名主导）       对位 图1
 *   ③ 二十四山 —— 二十四山环绕罗盘               对位 图4
 *   ④ 格局     —— 玄空三盘（运/山/向 三数字）    对位 图5
 *   ⑤ 动态九宫 —— 太极+后天八卦方位盘            对位 图3
 *
 * 每个图层函数接收 (ctx, data, cell/radius)，以 (0,0) 为盘心绘制，
 * 跟随 KanyuStage 的 scale/offset 同步缩放平移。
 */
import { M24, BAGUA_BY_NAME } from '../../core/index.js';
import { PAL, DISK, luckColorDisk, BAZHAI_STAR_STYLE_DISK, starColorDisk } from '../../palette.js';

// 九宫相对盘心的行列偏移（col,row ∈ {-1,0,1}）。上北下南·左西右东（现代地图方位）
const GONG_REL = {
  乾: [-1, -1], 坎: [0, -1], 艮: [1, -1],
  兑: [-1, 0],  中: [0, 0],  震: [1, 0],
  坤: [-1, 1],  离: [0, 1],  巽: [1, 1],
};
// 八方位对宫（算"坐X朝Y"用）
const OPPOSITE_DIR = { '北':'南','南':'北','东':'西','西':'东','东北':'西南','西南':'东北','东南':'西北','西北':'东南' };

// 八卦符号（Unicode）
const BAGUA_SYM = { 乾: '☰', 兑: '☱', 离: '☲', 震: '☳', 巽: '☴', 坎: '☵', 艮: '☶', 坤: '☷' };

// 先天八卦画布方位（上北下南布局）+ 方位名 + 先天序数(乾1兑2离3震4巽5坎6艮7坤8)
// 先天方位语义：乾南·坤北·离东·坎西（南=下/北=上/东=右/西=左）；后天用 GONG_REL + BAGUA_BY_NAME[gong].num
const XIANTIAN = {
  乾: { rel: [0, 1],    dir: '南',  seq: 1 },
  坤: { rel: [0, -1],   dir: '北',  seq: 8 },
  离: { rel: [1, 0],    dir: '东',  seq: 3 },
  坎: { rel: [-1, 0],   dir: '西',  seq: 6 },
  震: { rel: [1, -1],   dir: '东北', seq: 4 },
  巽: { rel: [-1, 1],   dir: '西南', seq: 5 },
  艮: { rel: [-1, -1],  dir: '西北', seq: 7 },
  兑: { rel: [1, 1],    dir: '东南', seq: 2 },
};

// 色板自 palette.js 统一取——中央盘面走 DISK 盘面档（当前与 PAL 浅底同值）；
// 唯 drawEdgeCompass 的方位字画在白底徽章圆上，取浅底档 PAL。换皮只动 palette.js 的 DISK 区块。
/** 描边文字（纸色 halo）：先 stroke 后 fill，把刻字从叠层背景里提出来（地图标注/古籍批注手法）。
 *  strokeW 缺省按字号 0.12 倍（25px大字≈3px / 10px小字≈1.2px），lineJoin=round 防中文笔画拐角出刺。
 *  调用前先设好 ctx.font/fillStyle/textAlign/textBaseline，本函数只补描边与填充。 */
function outlineText(ctx, text, x, y, strokeW) {
  const fs = parseFloat(ctx.font) || 12;
  if (fs < 10) { ctx.fillText(text, x, y); return; }  // 极小字笔画密，描边会粘连——直接填充
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokeW != null ? strokeW : Math.max(1.2, fs * 0.12);
  ctx.strokeStyle = DISK.outline;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}


// 卦名 → 方位文字（中宫返回'中'）
function dirOf(gong) {
  const b = BAGUA_BY_NAME[gong];
  return b ? b.dir : '中';
}

/** ① 八宅图层：八方游年九星（不含中宫）—— 对位 图2「坎宅八方九星」 */
export function drawBazhaiLayer(ctx, bazhai, cell = 90) {
  ctx.lineWidth = 1;
  for (const p of bazhai.palaces) {
    const [col, row] = GONG_REL[p.gong];
    const x = col * cell - cell / 2, y = row * cell - cell / 2;
    const c = luckColorDisk(p.info.ji);
    ctx.fillStyle = c.bg;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = DISK.qingMist;
    ctx.strokeRect(x, y, cell, cell);
    // 九星名（中央大字）
    ctx.fillStyle = c.text;
    ctx.font = `bold ${cell * 0.26}px "LXGW WenKai Lite", "KaiTi", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlineText(ctx, p.info.name, x + cell / 2, y + cell / 2 - cell * 0.06);
    // 方位（下方小字）
    ctx.fillStyle = DISK.inkFaint;
    ctx.font = `${cell * 0.13}px "LXGW WenKai Lite", "KaiTi", serif`;
    outlineText(ctx, p.gong + '·' + dirOf(p.gong), x + cell / 2, y + cell / 2 + cell * 0.2);
  }
}

/** ② 九星图层：流年九星名盘（星名主导+五行吉凶+方位）—— 对位 图1「一白入中星名盘」 */
export function drawFeixingYearLayer(ctx, yearFx, cell = 90) {
  ctx.lineWidth = 1;
  for (const p of yearFx.palaces) {
    const [col, row] = GONG_REL[p.gong];
    const x = col * cell - cell / 2, y = row * cell - cell / 2;
    const c = luckColorDisk(p.info.ji);
    ctx.fillStyle = c.bg;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = p.gong === '中' ? DISK.gold : DISK.qingMist;
    ctx.lineWidth = p.gong === '中' ? 1.6 : 1;
    ctx.strokeRect(x, y, cell, cell);
    ctx.lineWidth = 1;
    // 星名（大字，星色）
    ctx.fillStyle = starColorDisk(p.star);
    ctx.font = `bold ${cell * 0.27}px "LXGW WenKai Lite", "KaiTi", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlineText(ctx, p.info.star, x + cell / 2, y + cell / 2 - cell * 0.12);
    // 五行·吉凶（小字）
    ctx.fillStyle = DISK.inkFaint;
    ctx.font = `${cell * 0.12}px "LXGW WenKai Lite", "KaiTi", serif`;
    outlineText(ctx, `${p.info.wuxing}·${p.info.ji}`, x + cell / 2, y + cell / 2 + cell * 0.1);
    // 卦·方位（最底小字）
    ctx.fillStyle = DISK.inkFaint;
    ctx.font = `${cell * 0.11}px "LXGW WenKai Lite", "KaiTi", serif`;
    outlineText(ctx, `${p.gong}·${dirOf(p.gong)}`, x + cell / 2, y + cell / 2 + cell * 0.27);
  }
}

/** ③ 二十四山图层：外圈 24 方位环绕罗盘 —— 对位 图4 */
export function drawM24Layer(ctx, radius = 200) {
  ctx.strokeStyle = DISK.qingMist;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2); ctx.stroke();
  for (const m of M24) {
    const ang = (m.deg - 90) * Math.PI / 180; // 地理角(0=北)→canvas(上)，上北下南
    const r1 = radius * 0.8, r2 = radius;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
    ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
    ctx.stroke();
    // 三元阴阳着色：阳顺(金) / 阴逆(红)，字号随 radius 放大（原固定 11px 太小）
    ctx.fillStyle = m.yin ? DISK.xiong : DISK.gold;
    ctx.font = `bold ${radius * 0.085}px "LXGW WenKai Lite", "KaiTi", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tr = radius * 0.9;
    outlineText(ctx, m.name, Math.cos(ang) * tr, Math.sin(ang) * tr);
  }
}

/** ④ 格局图层：玄空三盘（运/山/向 三数字九宫）—— 对位 图5「玄空三盘三数字」 */
export function drawXuankongLayer(ctx, xuankong, cell = 90) {
  for (const p of xuankong.palaces) {
    const [col, row] = GONG_REL[p.gong];
    const x = col * cell - cell / 2, y = row * cell - cell / 2;
    const c = luckColorDisk(p.yunInfo.ji);
    ctx.fillStyle = c.bg;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = p.gong === '中' ? DISK.gold : DISK.qingMist;
    ctx.lineWidth = p.gong === '中' ? 2 : 1;
    ctx.strokeRect(x, y, cell, cell);
    ctx.lineWidth = 1;
    // 方位（顶部小字）
    ctx.fillStyle = DISK.inkFaint;
    ctx.font = `${cell * 0.11}px "LXGW WenKai Lite", "KaiTi", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    outlineText(ctx, `${p.gong}·${dirOf(p.gong)}`, x + cell / 2, y + cell * 0.06);
    // 三数字横排：运 / 山 / 向（各按星色）
    const nums = [p.yun, p.shan, p.xiang];
    nums.forEach((n, i) => {
      ctx.fillStyle = starColorDisk(n);
      ctx.font = `bold ${cell * 0.22}px "LXGW WenKai Lite", "KaiTi", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      outlineText(ctx, n, x + cell * (0.25 + 0.25 * i), y + cell * 0.56);
    });
    // 运/山/向 角标（底部极小字）
    ctx.fillStyle = DISK.inkFaint;
    ctx.font = `${cell * 0.085}px "LXGW WenKai Lite", "KaiTi", serif`;
    ctx.textBaseline = 'bottom';
    ['运', '山', '向'].forEach((lab, i) => {
      outlineText(ctx, lab, x + cell * (0.25 + 0.25 * i), y + cell * 0.93);
    });
  }
}

/** 画一个八卦节点：卦符号(中) + 方位名(下) + 序数/洛书数(上) */
function drawBaguaNode(ctx, gong, col, row, dir, num, radius, baguaRot = 0) {
  const ang = Math.atan2(row, col) + baguaRot; // 方位角 + 手动旋转：位置绕盘心转，文字朝向不变（保持正立·不颠倒）
  const rr = radius * 0.88;
  const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
  ctx.fillStyle = DISK.gold;
  ctx.font = `${radius * 0.18}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  outlineText(ctx, BAGUA_SYM[gong], px, py);
  ctx.fillStyle = DISK.inkSoft;
  ctx.font = `bold ${radius * 0.09}px "LXGW WenKai Lite", "KaiTi", serif`;
  outlineText(ctx, `${gong}·${dir}`, px, py + radius * 0.135);
  ctx.fillStyle = DISK.inkFaint;
  ctx.font = `${radius * 0.078}px "LXGW WenKai Lite", "KaiTi", serif`;
  outlineText(ctx, num, px, py - radius * 0.135);
}

/** ⑤ 动态九宫图层：太极 + 八卦方位盘 —— 对位 图3。
 *  mode='后天'(默认)/'先天' 切换；
 *  baguaRot=手动独立旋转（弧度，原站 baguaRot，不影响朝向）—— 整个八卦盘绕盘心转；
 *  driftPhase=太极阴阳消长漂浮相位（弧度，rAF 自动累加）—— 太极在 baguaRot 基础上额外缓慢自转。
 *  八卦方位本体不漂浮（离南坎北钉死），只有中心太极漂浮。*/
export function drawTaijiBaguaLayer(ctx, radius = 180, mode = '后天', baguaRot = 0, driftPhase = 0) {
  // 双外圈（同心圆，不随旋转变）
  ctx.strokeStyle = DISK.qing;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2); ctx.stroke();
  // 八卦盘：方位随 baguaRot 绕盘心转，文字保持正立（位置转·字不倒）
  if (mode === '先天') {
    // 先天八卦：乾南坤北离东坎西，先天序数 1~8
    for (const gong in XIANTIAN) {
      const x = XIANTIAN[gong];
      drawBaguaNode(ctx, gong, x.rel[0], x.rel[1], x.dir, x.seq, radius, baguaRot);
    }
  } else {
    // 后天八卦：离南坎北震东兑西，洛书数 1~9
    for (const gong of ['离', '坤', '兑', '乾', '坎', '艮', '震', '巽']) {
      const [col, row] = GONG_REL[gong];
      drawBaguaNode(ctx, gong, col, row, dirOf(gong), BAGUA_BY_NAME[gong].num, radius, baguaRot);
    }
  }
  // 中心太极：手动 baguaRot + 阴阳消长漂浮 driftPhase（自动缓慢自转，"漂浮"）
  drawTaiji(ctx, 0, 0, radius * 0.13, baguaRot + driftPhase);
}

/** 太极图（阴阳鱼）：cx,cy 圆心，r 半径。
 *  画法：白底大圆 → 右半黑 → 上小圆右半白 → 下小圆左半黑 → 鱼眼 → 金边。
 *  S 曲线由两个半圆弧拼接；下小圆必须走左半(false)，写反成 true 会画成歪鱼。*/
function drawTaiji(ctx, cx, cy, r, rotation = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation); // 太极自转：手动 baguaRot + 阴阳消长漂浮 driftPhase
  ctx.fillStyle = DISK.taijiYang;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  // 右半黑
  ctx.fillStyle = DISK.taijiYin;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.lineTo(0, -r); ctx.closePath(); ctx.fill();
  // 上小圆右半白（成 S 上半段）
  ctx.fillStyle = DISK.taijiYang;
  ctx.beginPath();
  ctx.arc(0, -r / 2, r / 2, -Math.PI / 2, Math.PI / 2, false);
  ctx.lineTo(0, -r); ctx.closePath(); ctx.fill();
  // 下小圆左半黑（成 S 下半段）★ false=走左半（原 true 画反致歪鱼）
  ctx.fillStyle = DISK.taijiYin;
  ctx.beginPath();
  ctx.arc(0, r / 2, r / 2, Math.PI / 2, -Math.PI / 2, false);
  ctx.lineTo(0, r); ctx.closePath(); ctx.fill();
  // 鱼眼
  ctx.fillStyle = DISK.taijiYin;
  ctx.beginPath(); ctx.arc(0, -r / 2, r * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = DISK.taijiYang;
  ctx.beginPath(); ctx.arc(0, r / 2, r * 0.15, 0, Math.PI * 2); ctx.fill();
  // 金边
  ctx.strokeStyle = DISK.gold; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/** ①' 八宅圆盘（扇形罗盘，参考上传图）：8 扇形吉绿凶红 + 圆心宅型 + 金色朝向箭头。
 *  方位布局：上南下北·左东右西（风水正统，与动态九宫/九星/大玄空一致）。
 *  扇形顺序从上方(离·南)顺时针：离→坤→兑→乾→坎→艮→震→巽。
 *  朝向箭头：doorDeg(北0顺时针) → canvas 角 = π/2 + doorDeg·π/180（上南下北映射：北朝下、南朝上）。*/
export function drawBazhaiRoundLayer(ctx, bazhai, doorGua, doorDeg, radius = 180) {
  const map = {};
  for (const p of bazhai.palaces) map[p.gong] = p;
  const order = ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾']; // 上=坎(北)起顺时针（上北下南）
  // 双外圈
  ctx.strokeStyle = DISK.qing; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, radius * 0.965, 0, Math.PI * 2); ctx.stroke();
  const rInner = radius * 0.32;
  ctx.strokeStyle = DISK.qingMist;
  ctx.beginPath(); ctx.arc(0, 0, rInner, 0, Math.PI * 2); ctx.stroke();

  for (let i = 0; i < 8; i++) {
    const gong = order[i];
    const p = map[gong];
    if (!p) continue;
    const center = -Math.PI / 2 + i * Math.PI / 4; // 上方=坎(北)，顺时针递增（上北下南）
    const a0 = center - Math.PI / 8, a1 = center + Math.PI / 8;
    const r0 = rInner, r1 = radius * 0.965;
    const c = BAZHAI_STAR_STYLE_DISK[p.info.name] || luckColorDisk(p.info.ji);
    ctx.fillStyle = c.bg;
    ctx.beginPath();
    ctx.arc(0, 0, r1, a0, a1);
    ctx.arc(0, 0, r0, a1, a0, true);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = DISK.qingMist; ctx.lineWidth = 1; ctx.stroke();
    // 星名（大字，扇形偏外，吉绿凶红色）
    const rStar = radius * 0.7;
    ctx.fillStyle = c.text;
    ctx.font = `bold ${radius * 0.12}px "LXGW WenKai Lite", "KaiTi", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlineText(ctx, p.info.name, Math.cos(center) * rStar, Math.sin(center) * rStar);
    // 宫·方位（小字，扇形偏内）
    const rDir = radius * 0.46;
    ctx.fillStyle = DISK.inkSoft;
    ctx.font = `${radius * 0.062}px "LXGW WenKai Lite", "KaiTi", serif`;
    outlineText(ctx, `${gong}·${dirOf(gong)}`, Math.cos(center) * rDir, Math.sin(center) * rDir);
  }

  // 中心：宅型文字 + 朝向箭头（从内圈边缘射向外圈，不压圆心字）
  const chaoAng = -Math.PI / 2 + doorDeg * Math.PI / 180; // 上北下南：北0°→上方
  const rA0 = rInner * 1.08, rA1 = radius * 0.9;
  const ax0 = Math.cos(chaoAng) * rA0, ay0 = Math.sin(chaoAng) * rA0;
  const ax1 = Math.cos(chaoAng) * rA1, ay1 = Math.sin(chaoAng) * rA1;
  ctx.strokeStyle = DISK.chi; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax1, ay1); ctx.stroke();
  const head = radius * 0.05;
  ctx.fillStyle = DISK.chi;
  ctx.beginPath();
  ctx.moveTo(ax1, ay1);
  ctx.lineTo(ax1 - Math.cos(chaoAng - 0.5) * head * 1.8, ay1 - Math.sin(chaoAng - 0.5) * head * 1.8);
  ctx.lineTo(ax1 - Math.cos(chaoAng + 0.5) * head * 1.8, ay1 - Math.sin(chaoAng + 0.5) * head * 1.8);
  ctx.closePath(); ctx.fill();
  // 宅型 + 坐向（圆心，金）——坐向按朝向自动变换（如朝北359°→坐南朝北）
  const chaoDir = dirOf(doorGua);
  const zuoDir = OPPOSITE_DIR[chaoDir] || chaoDir;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = DISK.gold;
  ctx.font = `bold ${radius * 0.1}px "LXGW WenKai Lite", "KaiTi", serif`;
  outlineText(ctx, `${doorGua}宅`, 0, -radius * 0.045);
  ctx.fillStyle = DISK.goldDim;
  ctx.font = `${radius * 0.058}px "LXGW WenKai Lite", "KaiTi", serif`;
  outlineText(ctx, `坐${zuoDir}朝${chaoDir}`, 0, radius * 0.06);
}

/** 画布外围八方位标注（edgeCompass）：上南下北·左东右西，钉在画布边缘，不受 panzoom/旋转影响。
 *  作为 KanyuStage 的 overlay，render(ctx,w,h) 用画布原始坐标。*/
export function drawEdgeCompass(ctx, w, h) {
  const cx = w / 2, cy = h / 2;
  const pad = 16;
  const R = Math.min(w, h) / 2 - pad;
  if (R < 70) return;
  // 上北下南·左西右东：上=北坎 / 下=南离 / 左=西兑 / 右=东震
  const marks = [
    { x: cx,             y: cy - R,          t: '北·坎', main: true },
    { x: cx,             y: cy + R,          t: '南·离', main: true },
    { x: cx - R,         y: cy,              t: '西·兑', main: true },
    { x: cx + R,         y: cy,              t: '东·震', main: true },
    { x: cx - R * 0.707, y: cy - R * 0.707,  t: '西北·乾' },
    { x: cx + R * 0.707, y: cy - R * 0.707,  t: '东北·艮' },
    { x: cx - R * 0.707, y: cy + R * 0.707,  t: '西南·坤' },
    { x: cx + R * 0.707, y: cy + R * 0.707,  t: '东南·巽' },
  ];
  for (const m of marks) {
    ctx.fillStyle = PAL.badgeBg;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.main ? 18 : 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = m.main ? DISK.qingEdge : DISK.qingMist;
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = m.main ? PAL.qing : PAL.inkSoft;
    ctx.font = `${m.main ? 'bold ' : ''}${m.main ? 12 : 10}px "LXGW WenKai Lite", "KaiTi", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.t, m.x, m.y); // 白底圆托底，无需 halo
  }
}

export { GONG_REL, luckColorDisk, starColorDisk, dirOf, BAGUA_SYM };
