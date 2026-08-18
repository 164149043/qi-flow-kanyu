// DataPanel.js —— 右侧堪舆数据侧栏（一面板五节，默认全展开可折叠）
// 把引擎层丢弃的场数据（浓度/速度/涡量）+ 纯函数风水算法（八宅/九星/采光）
// 可视化成实时读数，填 PRODUCT.md 标的"数值化解读"缺口。
// 浮层铁律：单一半透明面板 + 雾线分节，非 SaaS 卡片堆叠。
// 与罗盘视觉层解耦：五节恒全显，只响应数据变化，不受模式/八宅九星开关控制。
// 画法与 CompassInstrument 同源：骨架霁青 #2b6cb0、雾线 #c8ccd4、读数赭金 #c77800、bearing→(cx+r·sinb, cy−r·cosb)。

import { bazhaiCompute } from '../fengshui/Bazhai.js';
import { yearCenterStar, flyStars, JIUXING_STARS } from '../fengshui/Jiuxing.js';
import { sunAltitude } from '../fengshui/Solar.js';

// CFD 数据色带（仅数据填充，禁当品牌色）：炁流谱（energy/light）+ 气动谱（speed），随模式对齐热力图
const QI_STOPS = ['#0a5a24', '#3fae2a', '#a5d400', '#ffe600', '#ff8c00', '#ff1e00'];
const AERO_STOPS = ['#0a1450', '#143cb4', '#1ea0dc', '#78dce6', '#ffdc50', '#ff321e'];
// 环形仪表随模式换含义（表盘小标），与主界面 MODE_SUB 同词
const RING_CAP = { energy: '气流强度', speed: '风速涡量', light: '采光系数' };
const WIND8NAME = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const dirName = d => WIND8NAME[Math.round(d / 45) % 8];
// 环形档位文案（0-100 分四档，随模式切换语义）
const TIER = {
  energy: [['炁场微弱', 30], ['和缓', 60], ['良好', 85], ['充沛', 101]],
  speed: [['气流静止', 30], ['微动', 60], ['流通', 85], ['强盛', 101]],
  light: [['采光不足', 30], ['偏暗', 60], ['充足', 85], ['明亮', 101]],
};
const FONT = 'system-ui,"Microsoft YaHei",sans-serif';

export class DataPanel {
  constructor() {
    this.mode = 'energy';
    this.metricEMA = 0.0001;   // 环形自归一 EMA（照抄 HeatmapRenderer 包络写法，免魔数）
    this.lastFluid = null;
    this.lastSun = null;
    this.windDir = 180; this.windSpd = 0;
    this._buildDOM();
    this._setupCanvases();
    this._bindRadar();
  }

  _bindRadar() {
    this.cvs.radar.onclick = (e) => {
      if (!this._bz) return;
      const c = this.cvs.radar, rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left - c._cssW / 2;
      const y = e.clientY - rect.top - c._cssH * 0.50;
      let b = Math.atan2(x, -y) * 180 / Math.PI;   // 北0朝上
      b = ((b % 360) + 360) % 360;
      const idx = Math.round(b / 45) % 8;
      this._showBazhaiDetail(this._bz.sectors[idx], WIND8NAME[idx]);
    };
  }

  _buildDOM() {
    const el = document.createElement('div');
    el.className = 'dp-panel';
    el.innerHTML = `
      <div class="dp-head">堪舆数据</div>
      <details class="dp-sec" open><summary>气流仪表</summary>
        <div class="dp-inst-row">
          <div class="dp-inst"><canvas class="dp-cv" data-k="ring" style="width:92px;height:104px"></canvas><div class="dp-inst-cap" data-k="ringCap">${RING_CAP[this.mode]}</div></div>
          <div class="dp-inst"><canvas class="dp-cv" data-k="rose" style="width:92px;height:104px"></canvas><div class="dp-inst-cap" data-k="windCap">风向</div></div>
        </div>
        <div class="dp-sub" data-k="ringSub">--</div>
      </details>
      <details class="dp-sec" open><summary>采光曲线</summary>
        <canvas class="dp-cv" data-k="light" style="width:224px;height:84px"></canvas>
        <div class="dp-sub">相对采光系数（非 lux）</div>
      </details>
      <details class="dp-sec" open><summary>八宅能量</summary>
        <canvas class="dp-cv" data-k="radar" style="width:224px;height:126px"></canvas>
        <div class="dp-sub" data-k="radarSub">--</div>
        <div class="dp-detail" data-k="bzDetail">点雷达方位查看八宅吉凶</div>
      </details>
      <details class="dp-sec" open><summary>九宫飞星</summary>
        <div class="dp-grid" data-k="grid"></div>
        <div class="dp-detail" data-k="detail">点宫格查看宜忌</div>
      </details>`;
    document.body.appendChild(el);
    this.el = el;
    this.cvs = {};
    el.querySelectorAll('canvas.dp-cv').forEach(c => { this.cvs[c.dataset.k] = c; });
    this.sub = {
      ringSub: el.querySelector('[data-k="ringSub"]'),
      radarSub: el.querySelector('[data-k="radarSub"]'),
    };
    this.ringCap = el.querySelector('[data-k="ringCap"]');
    this.windCap = el.querySelector('[data-k="windCap"]');
    this.gridEl = el.querySelector('[data-k="grid"]');
    this.detailEl = el.querySelector('[data-k="detail"]');
    this.bzDetailEl = el.querySelector('[data-k="bzDetail"]');
  }

  _setupCanvases() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._dpr = dpr;
    this.ctx = {};
    for (const k in this.cvs) {
      const c = this.cvs[k];
      const cssW = parseInt(c.style.width) || 200;
      const cssH = parseInt(c.style.height) || 120;
      c.width = cssW * dpr;
      c.height = cssH * dpr;
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx[k] = ctx;
      c._cssW = cssW;
      c._cssH = cssH;
    }
  }

  // ===== 模式切换：只切环形表盘含义与小标，其余节与模式无关全显 =====
  setMode(m) {
    this.mode = m;
    this.ringCap.textContent = RING_CAP[m];
    if (m === 'light') { if (this.lastSun) this.updateSun(this.lastSun); }
    else if (this.lastFluid) this.updateFluid(this.lastFluid);
  }

  // ===== 流体环形：8036 格单遍扫描 → 自归一 EMA → score 0-100 + 档位 =====
  updateFluid({ dye, u, v, curl, solid, SW, W, H }) {
    this.lastFluid = { dye, u, v, curl, solid, SW, W, H };
    if (this.mode === 'light') return;   // light 环形由 updateSun 管（采光系数）
    let sum = 0, cnt = 0, maxSpd = 0, maxCurl = 0;
    const energy = this.mode === 'energy';
    for (let j = 1; j <= H; j++) {
      for (let i = 1; i <= W; i++) {
        const c = i + SW * j;
        if (solid && solid[c]) continue;   // 跳墙格
        cnt++;
        if (energy) {
          sum += Math.abs(dye[c] || 0);
        } else {
          const s = Math.hypot(u[c] || 0, v[c] || 0);
          sum += s;
          if (s > maxSpd) maxSpd = s;
          const cr = Math.abs((curl && curl[c]) || 0);
          if (cr > maxCurl) maxCurl = cr;
        }
      }
    }
    const metric = cnt ? sum / cnt : 0;
    this.metricEMA = Math.max(Math.min(metric, this.metricEMA * 1.3), this.metricEMA * 0.92);
    if (this.metricEMA < 0.0001) this.metricEMA = 0.0001;
    const ratio = metric / (this.metricEMA * 1.1);   // 相对活跃度（弧长+档位）；中心显 metric 绝对值，放源可见变化
    this._drawRing(metric, ratio, energy ? null : { maxSpd, maxCurl });
  }

  _drawRing(metric, ratio, extra) {
    const ctx = this.ctx.ring, c = this.cvs.ring, W = c._cssW, H = c._cssH;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.44, R = Math.min(W, H) * 0.335;
    // track 雾线
    ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // 渐变弧（色带随模式对齐热力图：炁流谱/气动谱，弧长 = 相对活跃度 ratio）
    const r = Math.max(0, Math.min(1, ratio));
    if (r > 0.02) {
      const end = -Math.PI / 2 + r * Math.PI * 2;
      const stops = this.mode === 'speed' ? AERO_STOPS : QI_STOPS;
      const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      stops.forEach((col, i) => grad.addColorStop(i / (stops.length - 1), col));
      ctx.strokeStyle = grad; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, end); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // 空态：场未起（无源/无风）→ 邀请而非无意义的 0.00
    const idle = metric < 0.005;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (idle) {
      ctx.fillStyle = '#999'; ctx.font = '600 13px ' + FONT;
      ctx.fillText('静', cx, cy - 6);
      ctx.fillStyle = '#999'; ctx.font = '11px ' + FONT;
      ctx.fillText('未起炁', cx, cy + 11);
      this.sub.ringSub.textContent = '放置炁口 / 风口后开始计量';
      return;
    }
    // 中心 metric 绝对值（赭金 12/600）——放源后数值明显变化
    ctx.fillStyle = '#c77800'; ctx.font = '600 12px ' + FONT;
    ctx.fillText(metric.toFixed(2), cx, cy - 6);
    // 档位词（基于 ratio 相对活跃度）
    ctx.fillStyle = '#1a56c4'; ctx.font = '600 11px ' + FONT;
    ctx.fillText(this._tier(this.mode, r * 100), cx, cy + 11);
    // 说明走 DOM
    let s = '';
    if (this.mode === 'energy') s = '平均炁浓度（放炁口/五行可见变化）';
    else if (this.mode === 'speed') s = extra ? `平均风速 ${metric.toFixed(2)} · 最大 ${extra.maxSpd.toFixed(1)} · 涡量 ${extra.maxCurl.toFixed(1)}` : '平均风速';
    else s = '相对采光系数';
    this.sub.ringSub.textContent = s;
  }

  _tier(mode, score) { for (const [n, hi] of TIER[mode]) if (score < hi) return n; return '充沛'; }

  // ===== 风向玫瑰：8 径向轴 + 雾线双环 + 沧浪楔指针（楔长=风速，表盘才成仪器）=====
  updateWind({ dir, spd }) {
    this.windDir = dir; this.windSpd = spd;
    this._drawRose();
    this.windCap.textContent = `风向 · ${spd > 0 ? dirName(dir) + ' ' + spd.toFixed(1) + 'm/s' : '无风'}`;
  }

  _drawRose() {
    const ctx = this.ctx.rose, c = this.cvs.rose, W = c._cssW, H = c._cssH;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.48, R = Math.min(W, H) * 0.34;
    // 8 径向轴（四正霁青、四隅雾线）
    for (let i = 0; i < 8; i++) {
      const rad = (i * 45) * Math.PI / 180;
      ctx.strokeStyle = (i % 2 === 0) ? '#2b6cb0' : '#c8ccd4';
      ctx.lineWidth = (i % 2 === 0) ? 1.2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(rad), cy - R * Math.cos(rad));
      ctx.stroke();
    }
    // 双环
    ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke();
    // 四正方位标签
    ctx.fillStyle = '#2b6cb0'; ctx.font = '600 11px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lbls = ['北', '东', '南', '西'];
    for (let i = 0; i < 4; i++) {
      const rad = (i * 90) * Math.PI / 180;
      ctx.fillText(lbls[i], cx + (R + 9) * Math.sin(rad), cy - (R + 9) * Math.cos(rad));
    }
    // 风向楔指针（沧浪水色=流动语义）；楔尖半径随风速伸缩（0→中心点，15m/s→满环）
    const rad = this.windDir * Math.PI / 180;
    const rw = R * (0.3 + 0.6 * Math.min(this.windSpd / 15, 1));
    if (this.windSpd > 0.05) {
      ctx.fillStyle = 'rgba(74,168,255,.85)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + rw * Math.sin(rad - 0.13), cy - rw * Math.cos(rad - 0.13));
      ctx.lineTo(cx + rw * Math.sin(rad), cy - rw * Math.cos(rad));
      ctx.lineTo(cx + rw * Math.sin(rad + 0.13), cy - rw * Math.cos(rad + 0.13));
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#4aa8ff'; ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill();
  }

  // ===== 八宅能量雷达 + 九宫飞星（纯函数，门向/流年变化时调一次；与八宅九星开关解耦）=====
  updateFengshui({ doorFacing, year }) {
    const bz = bazhaiCompute(doorFacing);
    this._drawRadar(bz);
    this._drawGrid(year);
    const cs = JIUXING_STARS[yearCenterStar(year)];
    this.sub.radarSub.textContent = `${bz.zhaiName} · ${year} ${cs.name}入中`;
  }

  _drawRadar(bz) {
    this._bz = bz;
    const ctx = this.ctx.radar, c = this.cvs.radar, W = c._cssW, H = c._cssH;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.50, Rmax = Math.min(W, H) * 0.32;
    // 8 径向轴 + 2 参考环（雾线）
    ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 8; i++) {
      const rad = (i * 45) * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Rmax * Math.sin(rad), cy - Rmax * Math.cos(rad)); ctx.stroke();
    }
    ctx.strokeStyle = '#e6e9ee'; ctx.lineWidth = 1;
    for (const rr of [0.5, 1]) { ctx.beginPath(); ctx.arc(cx, cy, Rmax * rr, 0, Math.PI * 2); ctx.stroke(); }
    // 能量多边形（ji -4..4 连续分级 → r=(ji+4)/8*Rmax）
    ctx.beginPath();
    bz.sectors.forEach((sec, i) => {
      const rad = (i * 45) * Math.PI / 180, r = ((sec.ji + 4) / 8) * Rmax;
      const x = cx + r * Math.sin(rad), y = cy - r * Math.cos(rad);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(43,108,176,.18)'; ctx.fill();
    ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = 1.5; ctx.stroke();
    // 顶点小圆（八宅语义色，非 UI 强调色）
    bz.sectors.forEach((sec, i) => {
      const rad = (i * 45) * Math.PI / 180, r = ((sec.ji + 4) / 8) * Rmax;
      ctx.fillStyle = `rgb(${sec.col[0]},${sec.col[1]},${sec.col[2]})`;
      ctx.beginPath(); ctx.arc(cx + r * Math.sin(rad), cy - r * Math.cos(rad), 2.5, 0, Math.PI * 2); ctx.fill();
    });
    // 方位名
    ctx.fillStyle = '#2b6cb0'; ctx.font = '11px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    WIND8NAME.forEach((d, i) => {
      const rad = (i * 45) * Math.PI / 180;
      ctx.fillText(d, cx + (Rmax + 11) * Math.sin(rad), cy - (Rmax + 11) * Math.cos(rad));
    });
  }

  _showBazhaiDetail(sec, dir) {
    const jx = sec.ji > 0 ? '吉' : '凶';
    const jxC = sec.ji >= 0 ? '#2a8a3a' : '#c0392b';
    this.bzDetailEl.innerHTML = `
      <div class="dp-dt-head">${dir}方 · <b style="color:rgb(${sec.col[0]},${sec.col[1]},${sec.col[2]})">${sec.name}</b> · <b style="color:${jxC}">${jx}</b></div>
      <div class="dp-dt-row"><span class="dp-dt-v">${sec.desc}</span></div>
      <div class="dp-dt-src">据 ${sec.source}</div>`;
  }

  _drawGrid(year) {
    const center = yearCenterStar(year);
    const stars = flyStars(center);
    const layout = [['西北', '北', '东北'], ['西', '中', '东'], ['西南', '南', '东南']];
    this.gridEl.innerHTML = layout.flat().map(dir => {
      const star = JIUXING_STARS[stars[dir]];
      const colCss = `rgb(${star.col[0]},${star.col[1]},${star.col[2]})`;
      const bg = `rgba(${star.col[0]},${star.col[1]},${star.col[2]},${star.ji >= 0 ? 0.20 : 0.36})`;
      const cn = dir === '中' ? '中宫' : dir;
      return `<div class="dp-cell" data-star="${stars[dir]}" data-dir="${dir}" style="border-left-color:${colCss};background:${bg}"><div class="dp-cn">${cn}</div><div class="dp-sn">${star.name}</div></div>`;
    }).join('');
    this.gridEl.querySelectorAll('.dp-cell').forEach(cell => {
      cell.onclick = () => {
        this.gridEl.querySelectorAll('.dp-cell').forEach(c => c.classList.remove('dp-cell-sel'));
        cell.classList.add('dp-cell-sel');
        this._showStarDetail(+cell.dataset.star, cell.dataset.dir);
      };
    });
    const cc = this.gridEl.querySelector('.dp-cell[data-dir="中"]');
    if (cc) { cc.classList.add('dp-cell-sel'); this._showStarDetail(center, '中'); }
  }

  _showStarDetail(n, dir) {
    const star = JIUXING_STARS[n];
    const jx = star.ji > 0 ? '吉' : star.ji < 0 ? '凶' : '平';
    const jxC = star.ji >= 0 ? '#2a8a3a' : '#c0392b';
    this.detailEl.innerHTML = `
      <div class="dp-dt-head"><b style="color:rgb(${star.col[0]},${star.col[1]},${star.col[2]})">${star.name}</b> · ${dir} · ${star.wuxing} · <b style="color:${jxC}">${jx}</b></div>
      <div class="dp-dt-row"><span class="dp-dt-k">宜</span><span class="dp-dt-v">${star.yi}</span></div>
      <div class="dp-dt-row"><span class="dp-dt-k">忌</span><span class="dp-dt-v">${star.avoid}</span></div>
      <div class="dp-dt-row"><span class="dp-dt-k">解</span><span class="dp-dt-v">${star.solve}</span></div>
      <div class="dp-dt-src">据 ${star.source}</div>
      <div class="dp-dt-src">组合克应另参《玄空秘旨》</div>`;
  }

  // ===== 采光折线（sunAltitude 纯函数钟形，三模式全显；light 模式额外驱动环形）=====
  updateSun({ hour, inten, lights = 0 }) {
    this.lastSun = { hour, inten, lights };
    this._drawLight(hour, inten);
    if (this.mode === 'light') {
      const metric = sunAltitude(hour) * inten + lights;   // 采光系数 = 日光(时辰×强度) + 人工光(光源亮度和)
      this._drawRing(metric, metric / 3, null);   // 弧长 = metric/3（上界 ~3）
      this.sub.ringSub.textContent = `相对采光系数 ${metric.toFixed(2)}${lights > 0 ? '（人工光 ' + lights.toFixed(2) + '）' : ''}`;
    }
  }

  _drawLight(hour, inten) {
    const ctx = this.ctx.light, c = this.cvs.light, W = c._cssW, H = c._cssH;
    ctx.clearRect(0, 0, W, H);
    const padL = 16, padR = 8, padT = 8, padB = 16;
    const x0 = padL, x1 = W - padR, y1 = H - padB, plotW = x1 - x0, plotH = y1 - padT;
    const vmax = inten || 1;
    const px = h => x0 + ((h - 6) / 12) * plotW;
    const py = h => y1 - (sunAltitude(h) * inten / vmax) * plotH;
    // 填充区
    ctx.beginPath(); ctx.moveTo(px(6), y1);
    for (let h = 6; h <= 18; h += 1) ctx.lineTo(px(h), py(h));
    ctx.lineTo(px(18), y1); ctx.closePath();
    ctx.fillStyle = 'rgba(74,140,217,.16)'; ctx.fill();
    // 折线（霁青亮）
    ctx.beginPath(); ctx.moveTo(px(6), py(6));
    for (let h = 6; h <= 18; h += 1) ctx.lineTo(px(h), py(h));
    ctx.strokeStyle = '#4a80d9'; ctx.lineWidth = 1.5; ctx.stroke();
    // 基线
    ctx.strokeStyle = '#e6e9ee'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
    // x 刻度 6/12/18
    ctx.fillStyle = '#999'; ctx.font = '11px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [6, 12, 18].forEach(h => ctx.fillText(h, px(h), y1 + 2));
    // 当前 hour 高亮（赤金）
    if (hour >= 6 && hour <= 18) {
      ctx.fillStyle = '#d89000'; ctx.beginPath(); ctx.arc(px(hour), py(hour), 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // srcPanel 已收编进左侧操作台 details 节，不再与本面板抢位——无浮层联动需求
  show() { this.el.style.display = ''; }
  hide() { this.el.style.display = 'none'; }
}
