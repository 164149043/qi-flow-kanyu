// PlanEditor.js —— 户型图校准 + 识别 + 画笔编辑浮层（升级版）
// ①旋转正北朝上 ②自动识别(Sauvola) ③灵敏度/去噪/膨胀/方法 实时调 ④画墙/擦除(可调笔刷) ⑤复位 ⑥确定
// 性能：preprocess+binarize 只跑一次缓存 bin，滑块只触发轻量 binToGridSolid

import { preprocessImage, binarize, binToGridSolid } from '../vision/LineDetector.js';

export class PlanEditor {
  constructor(gridW, gridH) {
    this.gridW = gridW; this.gridH = gridH;
    this.SW = gridW + 2;
    this.cellPx = 8;
    this.cw = gridW * this.cellPx; this.ch = gridH * this.cellPx;
    this.rotation = 0; this.scale = 1;
    this.tool = 'draw'; this.brushSize = 2;
    this.solid = null; this.glass = null; this.image = null; this.locked = false;
    this.gray = null; this.imgW = 0; this.imgH = 0; this.bin = null;
    this.recParams = { method: 'sauvola', window: 15, wallRatio: 0.10, dilate: 1, minSize: 6 };
    this.history = [];                // 画笔撤销栈（每笔触一个 solid 快照）
    this.stage = 'calib';             // 阶段：calib(校准) | edit(识别+编辑)
  }

  open(image, onConfirm) {
    this.image = image; this.onConfirm = onConfirm;
    this._buildDOM(); this._render();
  }

  _buildDOM() {
    const ov = document.createElement('div');
    ov.className = 'plan-overlay';
    ov.innerHTML = `
      <style>
        .plan-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:100}
        .plan-panel{background:#1e1e28;padding:14px;border-radius:10px;max-width:96vw;max-height:96vh;display:flex;flex-direction:column;gap:8px;border:1px solid #3a3a48;overflow:auto}
        .plan-panel h3{margin:0;color:#fa0;font-size:15px}
        .plan-panel canvas{background:#0d0d11;border:1px solid #444;max-width:92vw;max-height:75vh;cursor:crosshair;image-rendering:pixelated;align-self:center}
        .pe-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:#bbb}
        .pe-row label{display:flex;align-items:center;gap:4px;white-space:nowrap}
        .pe-row input[type=range]{width:90px}
        .pe-btn{background:#2c2c34;color:#ddd;border:1px solid #555;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px}
        .pe-btn:hover{border-color:#888}
        .pe-btn.active{background:#c80;border-color:#fa0;color:#fff}
        .pe-btn.primary{background:#2a6;color:#fff;border-color:#4c8}
        .pe-btn:disabled{opacity:.45;cursor:default}
        .pe-hint{font-size:11px;color:#888;line-height:1.5}
      </style>
      <div class="plan-panel">
        <h3>📐 户型图校准与编辑</h3>
        <canvas></canvas>
        <div class="pe-row">
          <label>旋转°<input type="range" id="peRot" min="-180" max="180" value="0"></label>
          <label>缩放<input type="range" id="peScale" min="50" max="200" value="100"></label>
          <button class="pe-btn" id="peRec">🔍 自动识别</button>
        </div>
        <div class="pe-row" id="peRecRow" style="display:none">
          <label>灵敏度<input type="range" id="peSens" min="2" max="50" value="10" title="低=抓细线(噪点多)"></label>
          <label>去噪<input type="range" id="peDen" min="0" max="80" value="6" title="删小区域"></label>
          <label>膨胀<input type="range" id="peDil" min="0" max="4" value="1" title="连细线"></label>
          <button class="pe-btn" id="peMethod">阈值:Sauvola</button>
          <button class="pe-btn" id="peReset">↩ 复位</button>
        </div>
        <div class="pe-row" id="peEditRow" style="display:none">
          <button class="pe-btn" id="peDraw">✏️ 画墙</button>
          <button class="pe-btn" id="peErase">🩹 擦除</button>
          <button class="pe-btn" id="peWin">🪟 窗户</button>
          <button class="pe-btn" id="peUndo">↶ 撤销</button>
          <label>笔刷<input type="range" id="peBrush" min="1" max="8" value="2"></label>
          <button class="pe-btn" id="peClear">🗑 清空</button>
          <span style="flex:1"></span>
          <button class="pe-btn" id="peBack">◀ 上一步</button>
          <button class="pe-btn" id="peCancel">取消</button>
          <button class="pe-btn primary" id="peOk">✅ 确定</button>
        </div>
        <div class="pe-hint" id="peHint">①旋转让<b style="color:#6cf">正北朝上</b> ②🔍自动识别 ③调灵敏度/去噪/膨胀 ④画墙修正 ⑤确定</div>
      </div>`;
    document.body.appendChild(ov);
    this.overlay = ov;
    this.canvas = ov.querySelector('canvas');
    this.canvas.width = this.cw; this.canvas.height = this.ch;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });  // 自动识别要 getImageData，CPU 后端更快
    this.hint = ov.querySelector('#peHint');
    const $ = (id) => ov.querySelector(id);

    this.rotInput = $('#peRot'); this.scaleInput = $('#peScale');
    this.rotInput.oninput = (e) => { if (!this.locked) { this.rotation = +e.target.value; this._render(); } };
    this.scaleInput.oninput = (e) => { if (!this.locked) { this.scale = +e.target.value / 100; this._render(); } };
    $('#peRec').onclick = () => this._recognize();
    $('#peSens').oninput = (e) => { this.recParams.wallRatio = +e.target.value / 100; this._rebuild(); };
    $('#peDen').oninput = (e) => { this.recParams.minSize = +e.target.value; this._rebuild(); };
    $('#peDil').oninput = (e) => { this.recParams.dilate = +e.target.value; this._rebuild(); };
    $('#peMethod').onclick = (e) => {
      this.recParams.method = this.recParams.method === 'sauvola' ? 'otsu' : 'sauvola';
      e.target.textContent = '阈值:' + (this.recParams.method === 'sauvola' ? 'Sauvola' : 'Otsu');
      this._rebin();
    };
    $('#peReset').onclick = () => this._rebuild();   // 撤销画笔编辑，回到当前参数识别态
    $('#peDraw').onclick = () => this._setTool('draw');
    $('#peUndo').onclick = () => this._undo();
    $('#peBack').onclick = () => this._setStage('calib');   // 上一步：回校准阶段
    $('#peErase').onclick = () => this._setTool('erase');
    $('#peWin').onclick = () => this._setTool('window');
    $('#peBrush').oninput = (e) => { this.brushSize = +e.target.value; };
    $('#peClear').onclick = () => { if (this.solid) { this.solid.fill(0); if (this.glass) this.glass.fill(0); this._render(); } };
    $('#peCancel').onclick = () => this._close();
    $('#peOk').onclick = () => this._confirm();

    // 画笔：按住左键拖动绘制
    let drawing = false;
    const toGrid = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const sx = this.cw / r.width, sy = this.ch / r.height;
      return [Math.floor((e.clientX - r.left) * sx / this.cellPx), Math.floor((e.clientY - r.top) * sy / this.cellPx)];
    };
    this._onDown = (e) => { if (!this.solid) return; if (e.button !== undefined && e.button !== 0) return; this._pushHistory(); drawing = true; this._paint(toGrid(e)); };
    this._onMove = (e) => { if (drawing) this._paint(toGrid(e)); };
    this._onUp = () => { drawing = false; };
    this.canvas.addEventListener('pointerdown', this._onDown);
    this.canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    this._setTool('draw');
  }

  _setTool(t) {
    this.tool = t;
    this.overlay?.querySelectorAll('#peDraw,#peErase,#peWin').forEach(b => b.classList.remove('active'));
    const m = { draw: '#peDraw', erase: '#peErase', window: '#peWin' };
    this.overlay?.querySelector(m[t])?.classList.add('active');
  }

  _paint([gi, gj]) {
    if (gi < 0 || gi >= this.gridW || gj < 0 || gj >= this.gridH) return;
    const r = this.brushSize, r2 = r * r, tool = this.tool;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (di * di + dj * dj > r2) continue;
      const i = gi + di, j = gj + dj;
      if (i < 0 || i >= this.gridW || j < 0 || j >= this.gridH) continue;
      const c = (i + 1) + this.SW * (j + 1);
      if (tool === 'draw') { this.solid[c] = 1; if (this.glass) this.glass[c] = 0; }
      else if (tool === 'window') { this.solid[c] = 1; if (!this.glass) this.glass = new Uint8Array(this.SW * (this.gridH + 2)); this.glass[c] = 1; }
      else { this.solid[c] = 0; if (this.glass) this.glass[c] = 0; }   // erase
    }
    this._render();
  }

  // 画笔撤销：笔触(按下→松开)开始前快照入栈，上一步 pop 恢复
  _pushHistory() {
    if (!this.solid) return;
    this.history.push({ solid: new Uint8Array(this.solid), glass: this.glass ? new Uint8Array(this.glass) : null });
    if (this.history.length > 30) this.history.shift();   // 限 30 步
  }
  _undo() {
    if (!this.history.length) return;
    const s = this.history.pop();
    this.solid = s.solid;
    if (s.glass) this.glass = s.glass;
    this._render();
  }

  // 阶段切换：calib(校准，可重新旋转/换图) | edit(识别+编辑)
  _setStage(s) {
    this.stage = s;
    const $ = (id) => this.overlay.querySelector(id);
    if (s === 'calib') {
      this.locked = false;
      this.rotInput.disabled = this.scaleInput.disabled = false;
      $('#peRecRow').style.display = 'none';
      $('#peEditRow').style.display = 'none';
      this.solid = null; this.glass = null; this.bin = null; this.gray = null;   // 清识别态，重新来
      this.history.length = 0;
      this.hint.innerHTML = '①旋转让<b style="color:#6cf">正北朝上</b> ②🔍自动识别';
      this._render();
    } else {  // edit
      this.locked = true;
      this.rotInput.disabled = this.scaleInput.disabled = true;
      $('#peRecRow').style.display = '';
      $('#peEditRow').style.display = '';
    }
  }

  // 自动识别：抓当前 canvas(旋转后) → 预处理(缓存gray) → 进入编辑阶段
  _recognize() {
    const imgData = this.ctx.getImageData(0, 0, this.cw, this.ch);
    const pp = preprocessImage(imgData);
    this.gray = pp.gray; this.imgW = pp.w; this.imgH = pp.h;
    if (!this.glass) this.glass = new Uint8Array(this.SW * (this.gridH + 2));  // 窗户场（识别后用户可画窗）
    this._rebin();
    this._setStage('edit');
    this.hint.innerHTML = '✅ 已识别(<b style="color:#f88">红=墙</b>)。调灵敏度/去噪/膨胀 → 画墙修正 → 确定。<b>上一步</b>=回校准';
  }

  // 重跑二值化（方法/窗口变时，较重）
  _rebin() {
    if (!this.gray) return;
    const { bin } = binarize(this.gray, this.imgW, this.imgH, { method: this.recParams.method, window: this.recParams.window });
    this.bin = bin;
    this._rebuild();
  }

  // 轻量：二值图 → 网格 solid（滑块拖动用这个，不重跑 Sauvola）
  _rebuild() {
    if (!this.bin) return;
    const { solid } = binToGridSolid(this.bin, this.imgW, this.imgH, this.gridW, this.gridH, this.recParams);
    this.solid = solid;
    this.history.length = 0;   // 重识别/调参后编辑基线变了，清空撤销栈
    this._render();
  }

  _render() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0d0d11';
    ctx.fillRect(0, 0, this.cw, this.ch);
    if (this.image) {
      ctx.save();
      ctx.translate(this.cw / 2, this.ch / 2);
      ctx.rotate(this.rotation * Math.PI / 180);
      ctx.scale(this.scale, this.scale);
      const fit = Math.min(this.cw / this.image.width, this.ch / this.image.height);
      const dw = this.image.width * fit, dh = this.image.height * fit;
      ctx.drawImage(this.image, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
    if (this.solid) {
      for (let gj = 0; gj < this.gridH; gj++) for (let gi = 0; gi < this.gridW; gi++) {
        const c = (gi + 1) + this.SW * (gj + 1);
        if (this.glass && this.glass[c]) ctx.fillStyle = 'rgba(80,170,255,0.6)';        // 窗户=蓝
        else if (this.solid[c]) ctx.fillStyle = 'rgba(255,70,70,0.55)';                  // 墙=红
        else continue;
        ctx.fillRect(gi * this.cellPx, gj * this.cellPx, this.cellPx, this.cellPx);
      }
    }
  }

  _confirm() {
    if (!this.solid) this.solid = new Uint8Array(this.SW * (this.gridH + 2));
    if (!this.glass) this.glass = new Uint8Array(this.SW * (this.gridH + 2));
    const result = { solid: this.solid, glass: this.glass, north: this.rotation };
    this._close();
    this.onConfirm?.(result);
  }

  _close() {
    if (this._onUp) window.removeEventListener('pointerup', this._onUp);
    this.overlay?.remove();
    this.overlay = null;
  }
}
