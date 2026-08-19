import { CanvasStage } from './CanvasStage.js';
import { DISK } from '../../palette.js';

/**
 * KanyuStage —— 堪舆页中央 panzoom 画布 + 图层系统
 * ============================================================
 * 原站逆向实锤：kanyu 中央是可拖拽/缩放的画布，八宅/九星/二十四山/大玄空
 * 都是叠加图层（跟随画布变换同步缩放），户型图作底图。
 *
 * 本类管理变换矩阵（scale + offset），调度多个图层渲染。
 * 图层接口：{ name, visible, render(ctx) } —— render 在已变换的坐标系内绘制
 * （原点在画布中心 + offset，已 scale）。图层以 (0,0) 为盘心绘制。
 */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export class KanyuStage {
  constructor(canvas, w, h) {
    this.w = w;
    this.h = h;
    this.canvas = canvas; // 暴露 dom canvas（PDF 截图 toDataURL 用）
    this.stage = new CanvasStage(canvas, w, h);
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.rotation = 0; // 户型图底图旋转（弧度）——盘式方位钉死上南下北，只户型图随此转
    this.layers = []; // [{ name, visible, render, rotate }] —— 跟随 panzoom
    this.overlays = []; // [{ name, visible, render(ctx,w,h) }] —— 固定方位标，不受变换影响
    this._didDrag = false; // 拖拽标记（区分点击 vs 拖拽）
    this.onScaleChange = null; // 缩放回调（滚轮缩放后通知外部，如同步滑块）
    this.plateScale = 1; // 盘式独立缩放（只作用于非旋转层=5盘式，不影响户型图）
    this.bgColor = DISK.bg; // 白绢盘面底（palette 统一取色）
    this._bindPanZoom();
  }

  /** 添加图层；render(ctx) 在变换坐标系内绘制（盘心=0,0）。
   *  rotate=true 时该层随 rotation 转（仅户型图底图用），其余盘式钉死方位。 */
  addLayer(name, renderFn, visible = true, rotate = false) {
    this.layers.push({ name, visible, render: renderFn, rotate });
    return this;
  }

  /** 添加固定覆盖层（方位标等）；render(ctx,w,h) 在原始坐标系绘制，不受 panzoom/rotation 影响 */
  addOverlay(name, renderFn, visible = true) {
    this.overlays.push({ name, visible, render: renderFn });
    return this;
  }

  setOverlayVisible(name, v) {
    const o = this.overlays.find((x) => x.name === name);
    if (o) o.visible = v;
  }

  toggleLayer(name) {
    const l = this.layers.find((x) => x.name === name);
    if (l) l.visible = !l.visible;
  }

  setLayerVisible(name, v) {
    const l = this.layers.find((x) => x.name === name);
    if (l) l.visible = v;
  }

  resetView() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.rotation = 0;
    this.plateScale = 1;
  }

  /** 临时改背景色（PDF 截图换浅底，用完恢复） */
  setBg(c) { this.bgColor = c; }

  setRotation(deg) {
    this.rotation = (((deg % 360) + 360) % 360) * Math.PI / 180;
    this.render();
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.stage.resize(w, h);
    this.render();
  }

  /** 屏幕坐标(clientX/Y) → 盘式坐标（盘心=0,0；扣 panzoom translate + scale×plateScale，不含 rotation——盘式不转）*/
  screenToDisk(clientX, clientY) {
    const rect = this.stage.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const s = this.scale * this.plateScale; // 盘式层受 panzoom×plateScale 双重缩放，反算都要除
    return {
      x: (x - (this.w / 2 + this.offsetX)) / s,
      y: (y - (this.h / 2 + this.offsetY)) / s,
    };
  }

  /** 渲染：①旋转层(户型图底图,绕盘心转) → ②非旋转层(5盘式,钉死方位,叠在上) → ③固定覆盖(方位标)。
   *  panzoom(translate+scale)所有层共享；rotation 只作用于 rotate=true 的层。 */
  render() {
    const { ctx } = this.stage;
    this.stage.clear(this.bgColor);
    ctx.save();
    ctx.translate(this.w / 2 + this.offsetX, this.h / 2 + this.offsetY);
    ctx.scale(this.scale, this.scale);
    // ① 旋转层（户型图底图）先画，在最底，绕盘心转
    ctx.save();
    ctx.rotate(this.rotation);
    for (const l of this.layers) {
      if (l.visible && l.rotate) {
        ctx.save();
        l.render(ctx);
        ctx.restore();
      }
    }
    ctx.restore();
    // ② 非旋转层（5 盘式）后画，钉死上南下北，叠加在户型图上；plateScale 只缩盘式不缩户型图
    ctx.save();
    ctx.scale(this.plateScale, this.plateScale);
    for (const l of this.layers) {
      if (l.visible && !l.rotate) {
        ctx.save();
        l.render(ctx);
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.restore();
    // ③ 固定覆盖层（外围方位标等）：不受 panzoom/rotation 影响
    for (const o of this.overlays) {
      if (o.visible) {
        ctx.save();
        o.render(ctx, this.w, this.h);
        ctx.restore();
      }
    }
  }

  _bindPanZoom() {
    const cv = this.stage.canvas;
    // 滚轮缩放（桌面）
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.scale = clamp(this.scale * f, 0.3, 6);
      if (this.onScaleChange) this.onScaleChange(this.scale);
      this.render();
    }, { passive: false });

    // 拖拽/捏合：pointer 统一事件（鼠标左键拖 + 触摸单指拖 + 双指捏合缩放）
    // 触摸适配 2026-08-19：mouse 三件套 → pointer 三件套，一套通吃桌面/手机
    const pointers = new Map(); // pointerId -> 最新坐标（按压中的手指/鼠标）
    let pinch = null;           // 双指捏合状态：{ d0, s0, cx, cy }
    let downX = 0, downY = 0;   // 首指按下点（累计位移判定 _didDrag，慢速微滑也能正确识别为拖拽）

    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return; // 鼠标只认左键；触摸/笔 button 恒 0
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); // 先记录坐标：capture 失败（合成事件/老 WebView）拖拽照常
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 非激活指针无 capture——不影响拖拽，move 仍派发到 canvas */ }
      this._didDrag = false; // 重置：新一次按下重新判定；否则上次拖拽后 _didDrag 永真，所有 click 被误杀
      if (pointers.size === 1) { downX = e.clientX; downY = e.clientY; cv.style.cursor = 'grabbing'; }
      if (pointers.size === 2) {           // 第二指落下 → 进入捏合
        const [a, b] = [...pointers.values()];
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: this.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      }
    });

    const release = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) pinch = null; // 捏合结束（含双指抬一指回单指：pointers 存的是各指最新坐标，天然无跳变）
      if (pointers.size === 0) cv.style.cursor = 'grab';
    };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release); // 系统手势抢走（边缘滑返回等）：清手指，不留死状态

    cv.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pinch && pointers.size === 2) {
        // 双指捏合：scale = 起始scale × 当前指距/起始指距；双指中心位移顺带平移
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.scale = clamp(pinch.s0 * (d / (pinch.d0 || 1)), 0.3, 6);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        this.offsetX += cx - pinch.cx;
        this.offsetY += cy - pinch.cy;
        pinch.cx = cx; pinch.cy = cy;
        this._didDrag = true; // 捏合同样抑制后续 click
        if (this.onScaleChange) this.onScaleChange(this.scale);
        this.render();
        return;
      }
      // 单指/鼠标拖拽平移
      this.offsetX += dx;
      this.offsetY += dy;
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 3) this._didDrag = true; // 累计位移超阈值=拖拽
      this.render();
    });

    cv.style.touchAction = 'none'; // 触摸拖拽/捏合时禁浏览器默认手势（页面滚动/双击缩放），手势全归画布
    cv.style.cursor = 'grab';
  }
}
