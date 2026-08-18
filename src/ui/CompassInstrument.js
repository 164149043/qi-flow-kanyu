// CompassInstrument.js —— 可交互 3D 堪舆罗盘仪器（签名组件）
// 24山外环(固定方位基准) + 八宅中环(吉凶扇区) + 九星内环(飞星) + 可拖门向/风向指针 + 中心模式徽标
// warm-up hero→anchor 状态机。吃掉原 bazhaiRow/yearRow/windRow 的方位/时间参数。
// 设计（DESIGN.md）：浅灰底上一霁青一根线 + 赤金门向 + 沧浪风向 + 赭金读数；冷蓝灰不霓虹。
//
// 方位对齐：环 = CircleGeometry(rotation.x=-PI/2) + CanvasTexture(flipY 默认 true)。
// canvas 顶部画「北」→ 几何 +Y 顶点 → 旋转后世界 -Z(北)。bearing→canvas (cx+r·sinb, cy-r·cosb)。

import * as THREE from 'three';
import { bazhaiCompute } from '../fengshui/Bazhai.js';
import { yearCenterStar, flyStars, JIUXING_STARS } from '../fengshui/Jiuxing.js';

// 24 山（顺时针，北=子 起，每山 15°）
const MOUNTAINS = ['子', '癸', '丑', '艮', '寅', '甲', '卯', '乙', '辰', '巽', '巳', '丙',
                   '午', '丁', '未', '坤', '申', '庚', '酉', '辛', '戌', '乾', '亥', '壬'];
// 8 方位名（bearing = idx*45），用于九星 flyStars 返回的方位键
const DIR8 = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const TEX = 512;   // 环 canvas 分辨率
// 中心徽标模式色（赭金/沧浪/暖金）
const MODE_HUB = { energy: 0xc77800, speed: 0x4aa8ff, light: 0xffee66 };

export class CompassInstrument {
  // scene: THREE.Scene; camera: THREE.Camera; opts: { FW, FD, getMode, onDoorFacing, onWindDir, onYear, onWindSpd }
  constructor(scene, camera, opts) {
    this.scene = scene; this.camera = camera; this.opts = opts;
    this.R = Math.min(opts.FW, opts.FD) * 0.52;   // 罗盘外半径（沿用原 compassR）
    this.Y = 2.8;                                  // 悬浮高度（墙高之上）
    this.group = new THREE.Group();
    this.group.position.set(0, this.Y, 0);
    scene.add(this.group);

    // 状态机：构造即 hero 入场（op 0→1 渐显撑场）
    this.state = 'hero';
    this.cur = { scale: 0.85, op: 0, spin: 0, breathe: 0 };
    this.target = { scale: 1.0, op: 1.0, spin: 1, breathe: 1 };

    this.mode = opts.getMode ? opts.getMode() : 'energy';
    this.bazhaiOn = false; this.jiuxingOn = false;
    this.doorFacing = 180; this.windDir = 180; this.year = 2026;

    this._build();
    this._draw24();
    // hero 图腾要有内容：立即画一次默认八宅/九星/风向（即便未开启）
    this.updateBazhai(this.doorFacing, bazhaiCompute(this.doorFacing));
    const c = yearCenterStar(this.year);
    this.updateJiuxing(this.year, { stars: flyStars(c), centerStar: JIUXING_STARS[c] });
    this.updateWind(this.windDir);
    this.group.scale.setScalar(this.cur.scale);
    this._applyVisibility();
  }

  // ===== 几何搭建 =====
  _build() {
    const R = this.R;
    // 底盘（霁青半透明，给罗盘实体感 + 滚轮/drag 的 raycast 命中面）
    this.disk = new THREE.Mesh(
      new THREE.CircleGeometry(R * 1.15, 64),
      new THREE.MeshBasicMaterial({ color: 0x2b6cb0, transparent: true, opacity: 0.10, depthWrite: false })
    );
    this.disk.rotation.x = -Math.PI / 2;
    this.group.add(this.disk);
    // 底盘描边环（霁青一根线）
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(R * 1.13, R * 1.15, 64),
      new THREE.MeshBasicMaterial({ color: 0x2b6cb0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.0005;
    this.group.add(rim);

    // 三环（CircleGeometry + CanvasTexture；同心叠放，y 微差防 z-fight）
    this.ring24 = this._ringMesh(0.0010); this.group.add(this.ring24);
    this.ringBazhai = this._ringMesh(0.0015); this.ringBazhai.visible = false; this.group.add(this.ringBazhai);
    this.ringJiuxing = this._ringMesh(0.0020); this.ringJiuxing.visible = false; this.group.add(this.ringJiuxing);

    // 中心模式徽标
    this.hub = new THREE.Mesh(
      new THREE.CircleGeometry(R * 0.16, 32),
      new THREE.MeshStandardMaterial({ color: MODE_HUB[this.mode], emissive: MODE_HUB[this.mode], emissiveIntensity: 0.5, transparent: true, depthWrite: false })
    );
    this.hub.rotation.x = -Math.PI / 2; this.hub.position.y = 0.0025;
    this.group.add(this.hub);

    // 双指针（杆+锥，默认朝 +Y，_pointNeedle 旋到 bearing 水平方向）
    this.needleDoor = this._makeNeedle(0xd89000);   // 赤金 门向
    this.needleWind = this._makeNeedle(0x4aa8ff);   // 沧浪 风向
    this.needleDoor.visible = false; this.needleWind.visible = false;
    this.group.add(this.needleDoor); this.group.add(this.needleWind);

    // 收集所有材质（update 时统一乘 stateOpacity）
    this.mats = []; this.baseOp = [];
    this.group.traverse(o => {
      if (!o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => { if (!this.mats.includes(m)) { this.mats.push(m); this.baseOp.push(m.opacity); } });
    });
  }

  _ringMesh(y) {
    const cvs = document.createElement('canvas'); cvs.width = TEX; cvs.height = TEX;
    const tex = new THREE.CanvasTexture(cvs);
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(this.R, 72),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2; m.position.y = y;
    m.userData.tex = tex;
    return m;
  }

  _makeNeedle(color) {
    const g = new THREE.Group();
    const mat = () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, transparent: true });
    const len = this.R * 0.78;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(this.R * 0.022, this.R * 0.022, len, 12), mat());
    shaft.position.y = len / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(this.R * 0.07, this.R * 0.16, 14), mat());
    head.position.y = len + this.R * 0.07;
    g.add(shaft); g.add(head);
    g.userData.isNeedle = true;
    return g;
  }
  _pointNeedle(needle, bearing) {
    const rad = bearing * Math.PI / 180;
    needle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(rad), 0, -Math.cos(rad)));
  }

  // ===== canvas 绘制原语（canvas 上=北；bearing→(cx+rR·sinb, cy-rR·cosb)）=====
  _ctx(ring) { return ring.userData.tex.image.getContext('2d'); }
  _annulus(ctx, rIn, rOut, b0, b1, fill, steps = 10) {
    const cx = TEX / 2, cy = TEX / 2, R = TEX / 2, ri = rIn * R, ro = rOut * R;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) { const b = (b0 + (b1 - b0) * i / steps) * Math.PI / 180; const x = cx + ro * Math.sin(b), y = cy - ro * Math.cos(b); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = steps; i >= 0; i--) { const b = (b0 + (b1 - b0) * i / steps) * Math.PI / 180; ctx.lineTo(cx + ri * Math.sin(b), cy - ri * Math.cos(b)); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  _radialLine(ctx, b, r0, r1, color, w) {
    const cx = TEX / 2, cy = TEX / 2, R = TEX / 2, rad = b * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(cx + r0 * R * Math.sin(rad), cy - r0 * R * Math.cos(rad));
    ctx.lineTo(cx + r1 * R * Math.sin(rad), cy - r1 * R * Math.cos(rad));
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  _arc(ctx, r, color, w) {
    ctx.beginPath(); ctx.arc(TEX / 2, TEX / 2, r * TEX / 2, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  _text(ctx, bearing, r, text, font, fill, strokeW = 0) {
    const cx = TEX / 2, cy = TEX / 2, R = TEX / 2, rad = bearing * Math.PI / 180;
    const x = cx + r * R * Math.sin(rad), y = cy - r * R * Math.cos(rad);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (strokeW) { ctx.strokeStyle = 'rgba(8,10,16,.9)'; ctx.lineWidth = strokeW; ctx.strokeText(text, x, y); }
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  }

  // 24 山外环（固定，一次性）
  _draw24() {
    const ctx = this._ctx(this.ring24);
    ctx.clearRect(0, 0, TEX, TEX);
    for (let i = 0; i < 24; i++) {
      const b = i * 15;
      this._radialLine(ctx, b, 0.80, 1.0, i % 6 === 0 ? '#2b6cb0' : '#8a96aa', i % 6 === 0 ? 3 : 1.4);
      this._text(ctx, b, 0.91, MOUNTAINS[i], 'bold 19px "Microsoft YaHei"', '#2b6cb0');
    }
    this._arc(ctx, 1.0, '#2b6cb0', 2);
    this._arc(ctx, 0.80, '#9aa6ba', 1);
    this.ring24.userData.tex.needsUpdate = true;
  }

  // ===== 数据驱动重画（main 的 redrawBazhai/redrawJiuxing/sendWind 调）=====
  updateBazhai(doorFacing, bz) {
    this.doorFacing = doorFacing;
    this._pointNeedle(this.needleDoor, doorFacing);
    const ctx = this._ctx(this.ringBazhai);
    ctx.clearRect(0, 0, TEX, TEX);
    bz.sectors.forEach((sec, di) => {
      const b = di * 45;
      this._annulus(ctx, 0.58, 0.80, b - 22.5, b + 22.5, `rgba(${sec.col[0]},${sec.col[1]},${sec.col[2]},${sec.ji > 0 ? 0.42 : 0.52})`, 8);
      this._text(ctx, b, 0.69, sec.name, 'bold 18px "Microsoft YaHei"', `rgb(${sec.col[0]},${sec.col[1]},${sec.col[2]})`, 4);
    });
    this._arc(ctx, 0.80, '#2b6cb0', 1.5);
    this._arc(ctx, 0.58, '#9aa6ba', 1);
    this.ringBazhai.userData.tex.needsUpdate = true;
  }

  updateJiuxing(year, info) {
    this.year = year;
    const ctx = this._ctx(this.ringJiuxing);
    ctx.clearRect(0, 0, TEX, TEX);
    DIR8.forEach((dirName, di) => {
      const b = di * 45;
      const star = JIUXING_STARS[info.stars[dirName]];
      this._annulus(ctx, 0.34, 0.56, b - 22.5, b + 22.5, `rgba(${star.col[0]},${star.col[1]},${star.col[2]},${star.ji >= 0 ? 0.42 : 0.55})`, 8);
      this._text(ctx, b, 0.45, star.name, 'bold 16px "Microsoft YaHei"', `rgb(${star.col[0]},${star.col[1]},${star.col[2]})`, 3);
    });
    // 中宫星（中心徽标下方读数；锚定正北 0° 偏置以免压 hub）
    const c = info.centerStar;
    this._text(ctx, 0, 0.26, c.name, 'bold 20px "Microsoft YaHei"', `rgb(${c.col[0]},${c.col[1]},${c.col[2]})`, 5);
    this._arc(ctx, 0.56, '#2b6cb0', 1.5);
    this._arc(ctx, 0.34, '#9aa6ba', 1);
    this.ringJiuxing.userData.tex.needsUpdate = true;
  }

  updateWind(windDir) { this.windDir = windDir; this._pointNeedle(this.needleWind, windDir); }

  // ===== 可见性（hero 态强制全显当图腾；anchor 态按开关/模式）=====
  setMode(m) {
    this.mode = m;
    this.hub.material.color.setHex(MODE_HUB[m]);
    this.hub.material.emissive.setHex(MODE_HUB[m]);
    this._applyVisibility();
  }
  setBazhaiVisible(on) { this.bazhaiOn = on; this._applyVisibility(); }
  setJiuxingVisible(on) { this.jiuxingOn = on; this._applyVisibility(); }
  _applyVisibility() {
    const force = this.state === 'hero';
    this.ringBazhai.visible = force || this.bazhaiOn;
    this.ringJiuxing.visible = force || this.jiuxingOn;
    this.needleDoor.visible = force || this.bazhaiOn;
    this.needleWind.visible = force || (this.mode === 'speed');
  }

  // ===== 状态机 =====
  setState(s) {
    this.state = s;
    this.target = s === 'hero'
      ? { scale: 1.0, op: 1.0, spin: 1, breathe: 1 }
      : { scale: 0.5, op: 0.7, spin: 0, breathe: 0 };
    this._applyVisibility();
  }
  update(dt) {
    const k = 1 - Math.exp(-dt * 3.0);   // 缓动收敛
    this.cur.scale += (this.target.scale - this.cur.scale) * k;
    this.cur.op += (this.target.op - this.cur.op) * k;
    this.cur.spin += (this.target.spin - this.cur.spin) * k;
    this.cur.breathe += (this.target.breathe - this.cur.breathe) * k;
    this.group.scale.setScalar(this.cur.scale);
    this.mats.forEach((m, i) => { m.opacity = this.baseOp[i] * this.cur.op; });
    const now = performance.now();
    // 中心徽标自转 + emissive 脉动（hero 明显，anchor 几乎停）
    this.hub.rotation.z += dt * 0.6 * this.cur.spin;
    this.hub.material.emissiveIntensity = 0.4 + Math.sin(now * 0.004) * 0.25 * this.cur.spin;
    // 整体悬浮呼吸（hero 期撑场感）
    this.group.position.y = this.Y + Math.sin(now * 0.0015) * 0.05 * this.cur.breathe;
  }

  // ===== 交互命中（main 的 pointerdown/wheel 各调一次）=====
  // 返回命中的可交互部位；needle 优先于 disk
  intersect(rc) {
    if (!this.group.visible) return { type: null };   // 隐藏时不劫持点击（raycast 不看 visible，需手动短路）
    if (this.needleDoor.visible) { if (rc.intersectObjects(this.needleDoor.children, true).length) return { type: 'door' }; }
    if (this.needleWind.visible) { if (rc.intersectObjects(this.needleWind.children, true).length) return { type: 'wind' }; }
    if (rc.intersectObject(this.disk).length) return { type: 'disk' };
    return { type: null };
  }
  // 由交点反算 bearing（pointermove 拖指针时用）
  bearingAt(rc) {
    const h = rc.intersectObject(this.disk);
    if (!h.length) return null;
    const dx = h[0].point.x - this.group.position.x;
    const dz = h[0].point.z - this.group.position.z;
    let b = Math.atan2(dx, -dz) * 180 / Math.PI;
    return ((b % 360) + 360) % 360;
  }

  dispose() {
    this.group.traverse(o => {
      o.geometry?.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.map?.dispose(); m.dispose(); }); }
    });
    this.scene.remove(this.group);
  }
}
