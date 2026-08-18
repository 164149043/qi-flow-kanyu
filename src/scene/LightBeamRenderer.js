// LightBeamRenderer.js —— 采光体积光束（God Rays 丁达尔效应）
// 扫描 glass 掩码，分组相邻落地窗，生成半透明光束面 + additive blending
// 光束从窗向室内延伸，层叠形成体积光效果

import * as THREE from 'three';

export class LightBeamRenderer {
  constructor(scene, W, H, SW, CELL) {
    this.W = W; this.H = H; this.SW = SW; this.CELL = CELL;
    this.FW = W * CELL; this.FD = H * CELL;

    // 多层材质（不同透明度叠出体积感）
    this.matInner = new THREE.MeshBasicMaterial({
      color: 0xffeebb, transparent: true, opacity: 0.14,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.matOuter = new THREE.MeshBasicMaterial({
      color: 0xffcc88, transparent: true, opacity: 0.07,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
  }

  setVisible(v) { this.group.visible = v; }

  /** 扫描 glass → 分组相邻 → 生成光束 */
  rebuild(glass, solid) {
    this._clear();

    const { W, H, SW, CELL, FW, FD } = this;

    // 水平扫描：找连续玻璃段，且内侧是朝北/南的室内
    for (let j = 1; j <= H; j++) {
      let runStart = -1;
      for (let i = 1; i <= W + 1; i++) {
        const c = i <= W ? (i + SW * j) : -1;
        const isGlass = i <= W && glass[c] && !solid[c];
        const hasInterior = isGlass && this._hasInterior(i, j, solid, glass, 'h');

        if (hasInterior && runStart < 0) runStart = i;
        if ((!hasInterior || i > W) && runStart >= 0 && i - runStart >= 2) {
          this._addBeam(runStart, j, i - 1, j, 'h');
          runStart = -1;
        } else if (!hasInterior) {
          runStart = -1;
        }
      }
    }

    // 垂直扫描：找连续玻璃段，且内侧朝东/西
    for (let i = 1; i <= W; i++) {
      let runStart = -1;
      for (let j = 1; j <= H + 1; j++) {
        const c = j <= H ? (i + SW * j) : -1;
        const isGlass = j <= H && glass[c] && !solid[c];
        const hasInterior = isGlass && this._hasInterior(i, j, solid, glass, 'v');

        if (hasInterior && runStart < 0) runStart = j;
        if ((!hasInterior || j > H) && runStart >= 0 && j - runStart >= 2) {
          this._addBeam(i, runStart, i, j - 1, 'v');
          runStart = -1;
        } else if (!hasInterior) {
          runStart = -1;
        }
      }
    }

    // 如果没有找到窗（例如纯实墙户型），跳过
  }

  /** 判断窗格 (i,j) 的室内侧 */
  _hasInterior(i, j, solid, glass, scanDir) {
    const { W, H, SW } = this;
    if (scanDir === 'h') {
      const n = j > 1 ? (i + SW * (j - 1)) : -1;
      const s = j < H ? (i + SW * (j + 1)) : -1;
      return (n >= 0 && !solid[n] && !glass[n]) || (s >= 0 && !solid[s] && !glass[s]);
    } else {
      const w = i > 1 ? ((i - 1) + SW * j) : -1;
      const e = i < W ? ((i + 1) + SW * j) : -1;
      return (w >= 0 && !solid[w] && !glass[w]) || (e >= 0 && !solid[e] && !glass[e]);
    }
  }

  /** 创建一段光束：窗段 [i1..i2, j1..j2] */
  _addBeam(i1, j1, i2, j2, dir) {
    const { CELL, FW, FD } = this;
    const isH = dir === 'h';
    const span = isH ? (i2 - i1 + 1) : (j2 - j1 + 1);
    const beamLen = CELL * 7;  // 光束延伸深度

    // 计算窗段中心世界坐标
    const cx = ((i1 + i2) / 2 - 0.5) * CELL - FW / 2;
    const cz = ((j1 + j2) / 2 - 0.5) * CELL - FD / 2;

    // 内层光束（更亮更窄）
    const gInner = new THREE.PlaneGeometry(beamLen * 0.6, span * CELL * 1.0);
    const mInner = new THREE.Mesh(gInner, this.matInner);

    // 外层光晕（更宽更淡）
    const gOuter = new THREE.PlaneGeometry(beamLen, span * CELL * 1.6);
    const mOuter = new THREE.Mesh(gOuter, this.matOuter);

    // 位置与朝向
    if (isH) {
      mInner.rotation.x = 0; mOuter.rotation.x = 0;
      mInner.position.set(cx, CELL * 1.3, cz);
      mOuter.position.set(cx, CELL * 1.1, cz);
    } else {
      mInner.rotation.y = Math.PI / 2; mOuter.rotation.y = Math.PI / 2;
      mInner.position.set(cx, CELL * 1.3, cz);
      mOuter.position.set(cx, CELL * 1.1, cz);
    }

    this.group.add(mInner);
    this.group.add(mOuter);
  }

  _clear() {
    while (this.group.children.length) {
      const c = this.group.children[0];
      this.group.remove(c);
      c.geometry?.dispose();
    }
  }

  dispose() {
    this._clear();
    this.matInner.dispose();
    this.matOuter.dispose();
  }
}
