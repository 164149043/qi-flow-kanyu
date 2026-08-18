/**
 * CanvasStage —— 通用 Canvas2D 舞台（DPR 高清 + 清屏）
 * 抽自 01/02 demo 的 DPR 模板，PanRenderer / FluidRenderer 等渲染器共享。
 */
export class CanvasStage {
  constructor(canvas, w, h) {
    this.canvas = canvas;
    this.w = w;
    this.h = h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  clear(color = null) {
    if (color) {
      this.ctx.globalAlpha = 1;
      this.ctx.fillStyle = color;
      this.ctx.fillRect(0, 0, this.w, this.h);
    } else {
      this.ctx.clearRect(0, 0, this.w, this.h);
    }
  }
}
