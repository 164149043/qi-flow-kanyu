/**
 * compass.js —— 罗盘 5 模式 2D 渲染（右侧栏独立小 canvas）
 * ============================================================
 * 原站 kanyu 页 drawCompass 实锤（curl 逆向 888~1005 行），忠实移植为 ES Module。
 * 5 模式：luopan（专业罗盘）/ hetu（河图）/ luoshu（洛书）/ xiantian（先天）/ houtian（后天）。
 *
 * 用法：drawCompass(ctx, S, facing, shichenIdx, mode)
 *   ctx: 2d 上下文；S: 画布逻辑尺寸（正方形，如 284）；原点在左上 (0,0)~(S,S)。
 *   facing: 朝向（北=0°，顺时针 0~359，同 doorSlider）；shichenIdx: 0~11 时辰序号；mode: 见上。
 *
 * 不依赖 KanyuStage，自成一体（原站就是独立 canvas，不放中央 panzoom）。
 */
import {
  dir2, GUA_LINES, BAGUA8, DIRN, HETU, LUOSHU, LUOSHU_LUCK, SHAN24, ZHI12,
} from '../../core/fengshui/compass-plates.js';
import { moonAgeDays, moonPhaseName } from '../../core/calendar/moonphase.js';
import { PAL } from '../../palette.js';

/** 画三爻卦：x,y 中心，w 总宽，lines=[初,中,上]（自下而上），阳爻整条/阴爻断两段。原站 drawGua 同款。 */
function drawGua(ctx, x, y, w, lines, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const yy = y + (2 - i) * w * 0.30;
    if (lines[i]) {
      ctx.fillRect(x - w / 2, yy, w, w * 0.13);
    } else {
      ctx.fillRect(x - w / 2, yy, w * 0.40, w * 0.13);
      ctx.fillRect(x + w * 0.10, yy, w * 0.40, w * 0.13);
    }
  }
}

/** n 个圆点矩阵（每行5个，居中排布）。原站 dotGroup 同款。 */
function dotGroup(ctx, px, py, n, fill, stroke) {
  const cols = Math.ceil(n / 5);
  for (let k = 0; k < n; k++) {
    const col = (k / 5) | 0, row = k % 5;
    const dx = (col - (cols - 1) / 2) * 9, dy = (row - 2) * 9;
    ctx.beginPath();
    ctx.arc(px + dx, py + dy, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  }
}

/**
 * 月相天池（luopan 模式中心）。age=月龄天数。
 * 画法：深底圆 → 按 phase 算 illum → 椭圆裁剪叠亮区。原站 drawMoonPhase 同款。
 */
export function drawMoonPhase(ctx, x, y, r, age) {
  const phase = (age % 29.53) / 29.53;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = PAL.nightSky; ctx.fill();
  ctx.strokeStyle = PAL.inkSoft; ctx.lineWidth = 1.5; ctx.stroke();
  if (illum < 0.02) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r - 0.6, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = PAL.moon;
  const rx = Math.max(0.5, r * Math.abs(illum * 2 - 1));
  const waxing = phase < 0.5;
  ctx.beginPath();
  ctx.arc(x, y, r, waxing ? -Math.PI / 2 : Math.PI / 2, waxing ? Math.PI / 2 : Math.PI * 1.5);
  ctx.ellipse(
    x, y, rx, r, 0,
    waxing ? Math.PI / 2 : -Math.PI / 2,
    waxing ? Math.PI * 1.5 : Math.PI / 2,
    (illum < 0.5) === waxing,
  );
  ctx.fill();
  ctx.restore();
}

/**
 * 罗盘 5 模式主渲染。在 (0,0)~(S,S) 内绘制，cx=cy=S/2。
 * 刻度环 → 模式分支内容 → 朝向指针（红色，随 facing 转）。
 */
export function drawCompass(ctx, S, facing, shichenIdx, mode) {
  const cx = S / 2, cy = S / 2;
  ctx.clearRect(0, 0, S, S);
  // 底盘
  ctx.fillStyle = PAL.compassBase;
  ctx.beginPath(); ctx.arc(cx, cy, S / 2 - 4, 0, Math.PI * 2); ctx.fill();
  const sp = (bDeg, R) => {
    const d = dir2(bDeg);
    return [cx + d.x * R, cy + d.y * R];
  };
  // 刻度环（72 等分，每 5°；30° 主刻度加粗）
  for (let i = 0; i < 72; i++) {
    const a0 = i * 5 * Math.PI / 180;
    const mj = (i % 6 === 0);
    const r1 = S / 2 - 6, r2 = mj ? S / 2 - 15 : S / 2 - 10;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a0) * r1, cy - Math.cos(a0) * r1);
    ctx.lineTo(cx + Math.sin(a0) * r2, cy - Math.cos(a0) * r2);
    ctx.strokeStyle = mj ? PAL.inkSoft : PAL.tick;
    ctx.lineWidth = mj ? 2 : 1;
    ctx.stroke();
  }

  if (mode === 'luopan') {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 二十四山（外圈）：子=0° 每山 15° 顺时针，字头朝外放射
    for (let s24 = 0; s24 < 24; s24++) {
      const ang = s24 * 15;
      const pt5 = sp(ang, S / 2 - 26);
      const isZheng = (ang % 90 === 0);       // 子午卯酉四正
      const isGua = (s24 % 3 === 1);          // 艮巽坤乾四维
      const isZhi = (ZHI12.indexOf(SHAN24[s24]) >= 0);
      ctx.save();
      ctx.translate(pt5[0], pt5[1]);
      ctx.rotate(ang * Math.PI / 180);
      ctx.fillStyle = isZheng ? PAL.gold : (isGua ? PAL.guaPurple : (isZhi ? PAL.ink : PAL.inkSoft));
      ctx.font = (isZheng ? 'bold ' : '') + (isZheng ? 17 : 14) + 'px "LXGW WenKai Lite", "KaiTi", serif';
      ctx.fillText(SHAN24[s24], 0, 0);
      ctx.restore();
    }
    // 24 山分界刻度（每 15°，错开 7.5°）
    for (let t24 = 0; t24 < 24; t24++) {
      const ta = (t24 * 15 - 7.5) * Math.PI / 180;
      const tr1 = S / 2 - 14, tr2 = S / 2 - 38;
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(ta) * tr1, cy - Math.cos(ta) * tr1);
      ctx.lineTo(cx + Math.sin(ta) * tr2, cy - Math.cos(ta) * tr2);
      ctx.strokeStyle = PAL.qingMist; ctx.lineWidth = 1; ctx.stroke();
    }
    // 八卦圈（后天）
    BAGUA8.houtian.forEach((wd) => {
      const pt4 = sp(wd[1], S / 2 - 56);
      const isCard = (wd[1] % 90 === 0);
      drawGua(ctx, pt4[0], pt4[1] - 8, 20, GUA_LINES[wd[0]], isCard ? PAL.ink : PAL.inkFaint);
      ctx.fillStyle = isCard ? PAL.inkSoft : PAL.inkFaint;
      ctx.font = '10px "LXGW WenKai Lite", "KaiTi", serif';
      ctx.fillText(wd[0] + '·' + DIRN[wd[1]], pt4[0], pt4[1] + 12);
    });
    // 时辰扇区 + 月相天池
    const hb = shichenIdx * 30;
    const p1 = sp(hb - 15, 30), p2 = sp(hb + 15, 30);
    ctx.fillStyle = PAL.chiBg;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p1[0], p1[1]);
    ctx.arc(cx, cy, 30, Math.atan2(p1[1] - cy, p1[0] - cx), Math.atan2(p2[1] - cy, p2[0] - cx));
    ctx.closePath(); ctx.fill();
    const age = moonAgeDaySafe();
    drawMoonPhase(ctx, cx, cy - 6, 18, age);
    ctx.fillStyle = PAL.inkSoft; ctx.font = '10px "LXGW WenKai Lite", "KaiTi", serif';
    ctx.fillText(moonPhaseName(age), cx, cy + 20);
  }

  if (mode === 'xiantian' || mode === 'houtian') {
    BAGUA8[mode].forEach((wd) => {
      const pt = sp(wd[1], S / 2 - 56);
      const isCard = (wd[1] % 90 === 0);
      drawGua(ctx, pt[0], pt[1] - 26, 30, GUA_LINES[wd[0]], isCard ? PAL.ink : PAL.inkFaint);
      ctx.fillStyle = isCard ? PAL.inkSoft : PAL.inkFaint;
      ctx.font = (isCard ? 'bold ' : '') + '15px "LXGW WenKai Lite", "KaiTi", serif';
      ctx.fillText(wd[0] + ' · ' + DIRN[wd[1]], pt[0], pt[1] + 8);
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = PAL.inkSoft; ctx.font = '12px "LXGW WenKai Lite", "KaiTi", serif';
    ctx.fillText(mode === 'xiantian' ? '先天八卦' : '后天八卦', cx, cy + 40);
  }

  if (mode === 'hetu') {
    HETU.forEach((hd) => {
      const p = sp(hd[0], S / 2 - 58);
      dotGroup(ctx, p[0], p[1], hd[1], PAL.hetuYang, PAL.hetuYangEdge);      // 生数（白）
      const p2 = sp(hd[0], S / 2 - 82);
      dotGroup(ctx, p2[0], p2[1], hd[2], PAL.hetuYin, '#999');    // 成数（黑）
    });
    dotGroup(ctx, cx - 16, cy, 5, PAL.hetuYang, PAL.hetuYangEdge);           // 中宫 5 黄（生数）
    dotGroup(ctx, cx + 16, cy, 10, PAL.hetuYin, '#999');          // 中宫 10 黑（成数）
    ctx.fillStyle = PAL.inkSoft; ctx.font = '12px "LXGW WenKai Lite", "KaiTi", serif'; ctx.textAlign = 'center';
    ctx.fillText('河图', cx, cy + 42);
  }

  if (mode === 'luoshu') {
    const luoshuOff = (facing - 180 + 360) % 360; // 洛书随朝向转（2/4/9 朝门）
    LUOSHU.forEach((lw) => {
      const pt = sp((lw[0] + luoshuOff) % 360, S / 2 - 66);
      const isLuck = LUOSHU_LUCK.has(lw[1]);
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 13, 0, Math.PI * 2);
      ctx.fillStyle = (lw[1] % 2 === 0) ? PAL.luoshuEven : PAL.luoshuOdd;
      ctx.fill();
      ctx.strokeStyle = isLuck ? PAL.gold : PAL.qingMist;
      ctx.lineWidth = isLuck ? 2 : 1; ctx.stroke();
      ctx.fillStyle = isLuck ? PAL.gold : PAL.ink;
      ctx.font = 'bold 18px "LXGW WenKai Lite", "KaiTi", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(lw[1], pt[0], pt[1] + 1);
    });
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = PAL.luoshuCenter; ctx.fill();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = PAL.gold; ctx.font = 'bold 17px "LXGW WenKai Lite", "KaiTi", serif';
    ctx.fillText('5', cx, cy + 1);
    ctx.fillStyle = PAL.inkSoft; ctx.font = '12px "LXGW WenKai Lite", "KaiTi", serif';
    ctx.fillText('洛书 · 2/4/9 朝门', cx, cy + 44);
  }

  // 朝向磁针（罗盘天池式，随 facing 转）：红头指向朝向 + 灰尾 + 金轴钉。
  // 加粗 + 深色描边，确保罗盘模式（中心天池月相/时辰扇区/八卦/24山密集）也醒目，不被淹没。
  const fd2 = dir2(facing);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(fd2.x, -fd2.y));
  ctx.lineJoin = 'round';
  // 红头（指向朝向，→外圈刻度内沿）
  ctx.fillStyle = PAL.needleRed; ctx.strokeStyle = PAL.needleEdge; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -(S / 2 - 18)); ctx.lineTo(-7, -14); ctx.lineTo(7, -14);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 灰尾（背向，短）
  ctx.fillStyle = PAL.needleTail; ctx.strokeStyle = PAL.needleEdge;
  ctx.beginPath();
  ctx.moveTo(0, 36); ctx.lineTo(-5, 14); ctx.lineTo(5, 14);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 中心金轴钉
  ctx.fillStyle = PAL.gold; ctx.strokeStyle = PAL.needleEdge; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (mode === 'luopan') {
    ctx.fillStyle = PAL.ink; ctx.font = 'bold 13px "LXGW WenKai Lite", "KaiTi", serif'; ctx.textAlign = 'center';
    ctx.fillText('朝向', cx, cy + 36);
  }
}

/** 取当前月龄（drawCompass 内部用，隔离 Date.now 便于后续可注入测试） */
function moonAgeDaySafe() {
  return moonAgeDays(Date.now());
}
