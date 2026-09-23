// PlanEditor.js —— 户型编辑浮层（两种模式）
// open(image)：上传校准流程 ①旋转正北朝上 ②自动识别(Sauvola) ③调灵敏度/去噪/膨胀 ④编辑 ⑤确定
// openDraw(solid, glass, door)：独立手绘 ①选材质(墙/窗/门) ②直线(Shift=正交)/矩形房间/笔刷/擦除 ③撤销/清空 ④确定（2026-09-19；09-23 增门）
// 门=格标记不写 solid（墙上画门保留墙格，确定后由 main.js 转结构件门凿洞洪泛判墙厚）；窗=solid+glass 双写
// 性能：preprocess+binarize 只跑一次缓存 bin，滑块只触发轻量 binToGridSolid；格线参照层离屏缓存

import { preprocessImage, binarize, binToGridSolid } from '../vision/LineDetector.js';

export class PlanEditor {
  constructor(gridW, gridH, cellMeters = 0.2) {
    this.gridW = gridW; this.gridH = gridH;
    this.SW = gridW + 2;
    this.cellPx = 8;
    this.cellMeters = cellMeters;      // 米/格（粗细换算与标尺用）
    this.cw = gridW * this.cellPx; this.ch = gridH * this.cellPx;
    this.rotation = 0; this.scale = 1;
    this.tool = 'brush'; this.mat = 'wall'; this.brushSize = 2;
    this.solid = null; this.glass = null; this.door = null; this.image = null; this.locked = false;
    this.gray = null; this.imgW = 0; this.imgH = 0; this.bin = null;
    this.recParams = { method: 'sauvola', window: 15, wallRatio: 0.10, dilate: 1, minSize: 6 };
    this.history = [];                // 撤销栈（笔刷=每笔触一快照；直线/矩形=落墨前一快照）
    this.stage = 'calib';             // 阶段：calib(校准) | edit(识别+编辑)
    this.mode = 'calib';              // 模式：calib(上传流程) | draw(独立手绘)
    this._drag = null;                // 直线/矩形拖画 {a:[i,j], b:[i,j]}（拖动中只画幽灵，松手落墨）
    this._drawing = false;            // 笔刷拖画中
  }

  open(image, onConfirm) {
    this.mode = 'calib';
    this.image = image; this.onConfirm = onConfirm;
    this.door = new Uint8Array(this.SW * (this.gridH + 2));   // 门场（识别流程里手补门也走它）
    this._buildDOM(); this._render();
  }

  // 独立手绘入口：内部持有副本，取消/未确定不影响调用方数组（door=已放门的投影场，可改可擦）
  openDraw(solid, glass, door, onConfirm) {
    this.mode = 'draw';
    this.onConfirm = onConfirm;
    this.solid = new Uint8Array(solid);
    this.glass = new Uint8Array(glass);
    this.door = new Uint8Array(door);
    this.tool = 'line';               // 画墙主力=直线拖画
    this._buildDOM();
    this._setStage('edit');
    this.hint.innerHTML = '🧱墙/🪟窗/🚪门选材质 → <b style="color:#f88">╱直线</b>拖画(Shift=横平竖直) · ▭矩形画房间 · ✏️笔刷修细节 → ✅确定。门窗<b style="color:#fc6">沿墙画</b>（确定后成可点选开关的门窗件）';
    this._render();
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
        .pe-sep{width:1px;height:18px;background:#444}
        .pe-hint{font-size:11px;color:#888;line-height:1.5}
      </style>
      <div class="plan-panel">
        <h3>${this.mode === 'draw' ? '📐 绘制户型' : '📐 户型图校准与编辑'}</h3>
        <canvas></canvas>
        <div class="pe-row" id="peCalibRow">
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
          <button class="pe-btn active" id="peWall">🧱 墙</button>
          <button class="pe-btn" id="peWin">🪟 窗</button>
          <button class="pe-btn" id="peDoor">🚪 门</button>
          <span class="pe-sep"></span>
          <button class="pe-btn" id="peLine">╱ 直线</button>
          <button class="pe-btn" id="peBrush">✏️ 笔刷</button>
          <button class="pe-btn" id="peRect">▭ 矩形</button>
          <button class="pe-btn" id="peErase">🩹 擦除</button>
          <button class="pe-btn" id="peUndo">↶ 撤销</button>
          <label>粗细<input type="range" id="peSize" min="1" max="8" value="${this.brushSize}"><b id="peThk" style="color:#888;font-weight:400"></b></label>
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

    if (this.mode === 'draw') {           // 手绘模式：无图片，铺格线参照层；无校准可回
      $('#peCalibRow').style.display = 'none';
      $('#peBack').style.display = 'none';
      this.gridLayer = this._makeGridLayer();
    }

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
    // 材质（墙/窗/门）与工具（直线/笔刷/矩形/擦除）两组独立：上传流程的"画墙笔刷"= 墙+笔刷
    $('#peWall').onclick = () => this._setMat('wall');
    $('#peWin').onclick = () => this._setMat('win');
    $('#peDoor').onclick = () => this._setMat('door');
    $('#peLine').onclick = () => this._setTool('line');
    $('#peBrush').onclick = () => this._setTool('brush');
    $('#peRect').onclick = () => this._setTool('rect');
    $('#peErase').onclick = () => this._setTool('erase');
    $('#peUndo').onclick = () => this._undo();
    $('#peBack').onclick = () => this._setStage('calib');   // 上一步：回校准阶段（仅上传流程）
    this.thkLabel = $('#peThk');
    $('#peSize').oninput = (e) => { this.brushSize = +e.target.value; this._updThk(); };
    // 清空两段确认（首点变红字"再点确认"，2.5s 超时复原）
    let clearArm = null;
    $('#peClear').onclick = (e) => {
      const btn = e.currentTarget;
      if (clearArm) {
        clearTimeout(clearArm); clearArm = null; btn.textContent = '🗑 清空';
        if (this.solid) { this.solid.fill(0); if (this.glass) this.glass.fill(0); if (this.door) this.door.fill(0); this._render(); }
        return;
      }
      btn.textContent = '⚠ 再点确认清空';
      clearArm = setTimeout(() => { btn.textContent = '🗑 清空'; clearArm = null; }, 2500);
    };
    $('#peCancel').onclick = () => this._close();
    $('#peOk').onclick = () => this._confirm();

    // 指针：笔刷=按下即画；直线/矩形=按下记起点、拖动画幽灵、松手才落墨（原地点击不落墨不留快照）
    const toGrid = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const sx = this.cw / r.width, sy = this.ch / r.height;
      return [Math.floor((e.clientX - r.left) * sx / this.cellPx), Math.floor((e.clientY - r.top) * sy / this.cellPx)];
    };
    this._onDown = (e) => {
      if (!this.solid) return;
      if (e.button !== undefined && e.button !== 0) return;
      const p = toGrid(e);
      if (this.tool === 'line' || this.tool === 'rect') { this._drag = { a: p, b: p }; this._render(); return; }
      this._pushHistory(); this._drawing = true; this._paint(p);
    };
    this._onMove = (e) => {
      if (this._drawing) this._paint(toGrid(e));
      else if (this._drag) { this._drag.b = this._ortho(toGrid(e), e.shiftKey); this._render(); }
    };
    this._onUp = () => {
      this._drawing = false;
      if (!this._drag) return;
      const { a, b } = this._drag; this._drag = null;
      if (a[0] !== b[0] || a[1] !== b[1]) {
        this._pushHistory();
        if (this.tool === 'line') this._paintLine(a, b); else this._paintRect(a, b);
      }
      this._render();
    };
    this.canvas.addEventListener('pointerdown', this._onDown);
    this.canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    this._setTool(this.tool);
    this._updThk();
  }

  // Shift 吸附：直线→横平竖直；矩形→正方形（户型以正交墙为主）
  _ortho([i, j], snap) {
    const a = this._drag?.a;
    if (!snap || !a) return [i, j];
    if (this.tool === 'rect') {
      const d = Math.max(Math.abs(i - a[0]), Math.abs(j - a[1]));
      return [a[0] + Math.sign(i - a[0] || 1) * d, a[1] + Math.sign(j - a[1] || 1) * d];
    }
    return Math.abs(i - a[0]) >= Math.abs(j - a[1]) ? [i, a[1]] : [a[0], j];
  }

  _setMat(m) {
    this.mat = m;
    const sel = { wall: '#peWall', win: '#peWin', door: '#peDoor' };
    this.overlay?.querySelectorAll('#peWall,#peWin,#peDoor').forEach(b => b.classList.remove('active'));
    this.overlay?.querySelector(sel[m])?.classList.add('active');
  }

  _setTool(t) {
    this.tool = t;
    const m = { line: '#peLine', brush: '#peBrush', rect: '#peRect', erase: '#peErase' };
    this.overlay?.querySelectorAll('#peLine,#peBrush,#peRect,#peErase').forEach(b => b.classList.remove('active'));
    this.overlay?.querySelector(m[t])?.classList.add('active');
  }

  // 粗细=方章边长(2r+1格)换算米数（cellMeters 米/格）
  _updThk() { if (this.thkLabel) this.thkLabel.textContent = `≈${((this.brushSize * 2 + 1) * this.cellMeters).toFixed(1)}m`; }

  // 单格落墨：erase 清三场；win=透光墙(实心+玻璃)；wall=实心清玻璃/门；door=格标记不动 solid(嵌墙语义，凿洞归结构件)
  _stamp(i, j) {
    if (i < 0 || i >= this.gridW || j < 0 || j >= this.gridH) return;
    const c = (i + 1) + this.SW * (j + 1);
    if (this.tool === 'erase') { this.solid[c] = 0; if (this.glass) this.glass[c] = 0; if (this.door) this.door[c] = 0; }
    else if (this.mat === 'win') { this.solid[c] = 1; if (!this.glass) this.glass = new Uint8Array(this.SW * (this.gridH + 2)); this.glass[c] = 1; if (this.door) this.door[c] = 0; }
    else if (this.mat === 'door') { if (!this.door) this.door = new Uint8Array(this.SW * (this.gridH + 2)); this.door[c] = 1; if (this.glass) this.glass[c] = 0; }
    else { this.solid[c] = 1; if (this.glass) this.glass[c] = 0; if (this.door) this.door[c] = 0; }
  }

  // 笔刷方章：(2r+1)² 满格。原圆章 di²+dj²>r² 挖角——粗细1时退化为十字点阵、线末端缺角（2026-09-23 用户反馈）
  // 墙要连续不漏角（角缝漏风），方章也让标称厚度(2r+1格)与实际一致
  _paint([gi, gj]) {
    if (gi < 0 || gi >= this.gridW || gj < 0 || gj >= this.gridH) return;
    const r = this.brushSize;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) this._stamp(gi + di, gj + dj);
    this._render();
  }

  // 线段光栅化：半格步进防漏格，每步盖笔刷圆章（墙厚=2×粗细格）
  // 门/窗例外：直线/矩形走单格细线——圆章会把门窗画胖成多格厚块（窗成玻璃墙带、门与墙粘连吞墙）
  _paintLine(a, b) {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
    const thin = (this.mat === 'door' || this.mat === 'win') && this.tool !== 'brush';
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const p = [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t)];
      if (thin) this._stamp(p[0], p[1]);
      else this._paint(p);
    }
  }

  _paintRect(a, b) {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    this._paintLine([x0, y0], [x1, y0]); this._paintLine([x1, y0], [x1, y1]);
    this._paintLine([x1, y1], [x0, y1]); this._paintLine([x0, y1], [x0, y0]);
  }

  // 撤销：笔触/线/矩形 开始前快照入栈，撤销 pop 恢复
  _pushHistory() {
    if (!this.solid) return;
    this.history.push({ solid: new Uint8Array(this.solid), glass: this.glass ? new Uint8Array(this.glass) : null, door: this.door ? new Uint8Array(this.door) : null });
    if (this.history.length > 30) this.history.shift();   // 限 30 步
  }
  _undo() {
    if (!this.history.length) return;
    const s = this.history.pop();
    this.solid = s.solid;
    if (s.glass) this.glass = s.glass;
    if (s.door) this.door = s.door;
    this._render();
  }

  // 阶段切换：calib(校准，可重新旋转/换图) | edit(识别+编辑)。手绘模式只进 edit
  _setStage(s) {
    this.stage = s;
    const $ = (id) => this.overlay.querySelector(id);
    if (s === 'calib') {
      if (this.mode === 'draw') return;   // 手绘无校准阶段，防御性返回
      this.locked = false;
      this.rotInput.disabled = this.scaleInput.disabled = false;
      $('#peRecRow').style.display = 'none';
      $('#peEditRow').style.display = 'none';
      this.solid = null; this.glass = null; this.door = null; this.bin = null; this.gray = null;   // 清识别态，重新来
      this.history.length = 0;
      this.hint.innerHTML = '①旋转让<b style="color:#6cf">正北朝上</b> ②🔍自动识别';
      this._render();
    } else {  // edit
      this.locked = true;
      this.rotInput.disabled = this.scaleInput.disabled = true;
      $('#peRecRow').style.display = this.mode === 'draw' ? 'none' : '';
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
    this.hint.innerHTML = '✅ 已识别(<b style="color:#f88">红=墙</b> · 🪟蓝=窗 · 🚪琥珀=门)。调灵敏度/去噪/膨胀 → 选材质直线/矩形补画 → 确定。<b>上一步</b>=回校准';
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

  // 手绘参照底：格线(每10格)+标尺(米)+中心十字，离屏缓存
  _makeGridLayer() {
    const cv = document.createElement('canvas'); cv.width = this.cw; cv.height = this.ch;
    const c = cv.getContext('2d');
    c.fillStyle = '#0d0d11'; c.fillRect(0, 0, this.cw, this.ch);
    c.font = '9px sans-serif'; c.textBaseline = 'top';
    for (let i = 0; i <= this.gridW; i += 10) {
      c.strokeStyle = i % 50 ? 'rgba(120,140,180,.09)' : 'rgba(120,140,180,.2)';
      c.beginPath(); c.moveTo(i * this.cellPx + .5, 0); c.lineTo(i * this.cellPx + .5, this.ch); c.stroke();
      if (i > 0 && i < this.gridW) { c.fillStyle = 'rgba(150,160,190,.45)'; c.fillText((i * this.cellMeters) + 'm', i * this.cellPx + 3, 2); }
    }
    for (let j = 0; j <= this.gridH; j += 10) {
      c.strokeStyle = j % 50 ? 'rgba(120,140,180,.09)' : 'rgba(120,140,180,.2)';
      c.beginPath(); c.moveTo(0, j * this.cellPx + .5); c.lineTo(this.cw, j * this.cellPx + .5); c.stroke();
      if (j > 0 && j < this.gridH) { c.fillStyle = 'rgba(150,160,190,.45)'; c.fillText((j * this.cellMeters) + 'm', 2, j * this.cellPx + 3); }
    }
    c.strokeStyle = 'rgba(250,170,0,.14)';
    c.beginPath(); c.moveTo(this.cw / 2, 0); c.lineTo(this.cw / 2, this.ch); c.moveTo(0, this.ch / 2); c.lineTo(this.cw, this.ch / 2); c.stroke();
    return cv;
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
    } else if (this.gridLayer) {
      ctx.drawImage(this.gridLayer, 0, 0);   // 手绘模式：格线参照打底
    }
    if (this.solid) {
      for (let gj = 0; gj < this.gridH; gj++) for (let gi = 0; gi < this.gridW; gi++) {
        const c = (gi + 1) + this.SW * (gj + 1);
        if (this.door && this.door[c]) ctx.fillStyle = 'rgba(240,190,80,0.78)';        // 门=琥珀（墙上画门时盖红墙显示）
        else if (this.glass && this.glass[c]) ctx.fillStyle = 'rgba(80,170,255,0.6)';   // 窗户=蓝
        else if (this.solid[c]) ctx.fillStyle = 'rgba(255,70,70,0.55)';                 // 墙=红
        else continue;
        ctx.fillRect(gi * this.cellPx, gj * this.cellPx, this.cellPx, this.cellPx);
      }
    }
    if (this._drag) this._renderGhost(ctx);   // 直线/矩形拖动中的半透明预览
  }

  _renderGhost(ctx) {
    const { a, b } = this._drag;
    ctx.strokeStyle = this.tool === 'erase' ? 'rgba(190,190,200,.55)'
      : this.mat === 'win' ? 'rgba(80,170,255,.55)'
      : this.mat === 'door' ? 'rgba(240,190,80,.55)' : 'rgba(255,70,70,.55)';
    const thin = (this.mat === 'door' || this.mat === 'win') && this.tool !== 'brush';
    ctx.lineWidth = thin ? this.cellPx : (this.brushSize * 2 + 1) * this.cellPx * .85;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const px = (i, j) => [(i + .5) * this.cellPx, (j + .5) * this.cellPx];
    if (this.tool === 'line') {
      const [x0, y0] = px(a[0], a[1]), [x1, y1] = px(b[0], b[1]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    } else {
      const [x0, y0] = px(Math.min(a[0], b[0]), Math.min(a[1], b[1]));
      const [x1, y1] = px(Math.max(a[0], b[0]), Math.max(a[1], b[1]));
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  _confirm() {
    if (!this.solid) this.solid = new Uint8Array(this.SW * (this.gridH + 2));
    if (!this.glass) this.glass = new Uint8Array(this.SW * (this.gridH + 2));
    if (!this.door) this.door = new Uint8Array(this.SW * (this.gridH + 2));
    const result = { solid: this.solid, glass: this.glass, door: this.door, north: this.rotation };
    this._close();
    this.onConfirm?.(result);
  }

  _close() {
    if (this._onUp) window.removeEventListener('pointerup', this._onUp);
    this.overlay?.remove();
    this.overlay = null;
  }
}
