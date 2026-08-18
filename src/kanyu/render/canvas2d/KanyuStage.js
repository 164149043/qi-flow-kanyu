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
    // 滚轮缩放
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.scale = clamp(this.scale * f, 0.3, 6);
      if (this.onScaleChange) this.onScaleChange(this.scale);
      this.render();
    }, { passive: false });
    // 拖拽平移
    let dragging = false, lx = 0, ly = 0;
    cv.addEventListener('mousedown', (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      this._didDrag = false; // 重置：新一次按下重新判定，移动>3px 才算拖拽；否则上次拖拽后 _didDrag 永真，所有 click 被误杀
      cv.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      if (Math.abs(dx) + Math.abs(dy) > 3) this._didDrag = true; // 移动超阈值=拖拽，抑制后续 click
      this.offsetX += dx;
      this.offsetY += dy;
      lx = e.clientX; ly = e.clientY;
      this.render();
    });
    window.addEventListener('mouseup', () => {
      dragging = false; cv.style.cursor = 'grab';
    });
    cv.style.cursor = 'grab';
  }
}
