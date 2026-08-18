// WallBuilder.js —— solid mask → 挤出连续墙体（ExtrudeGeometry）
// 升级自「体素方块墙」(每格 BoxGeometry)：从 solid 网格提取边界轮廓多边形环，
// 用 THREE.Shape(含 holes) + ExtrudeGeometry 挤出连续实心带状墙。告别格子拼接缝。
// solid: Uint8Array(SW*SH)，网格 i(1..W) j(1..H)，IX(i,j)=i+SW*j
import * as THREE from 'three';

// ===== 正交网格 solid → 边界轮廓多边形环组 =====
// 返回 [{ outer:[{x,y}...], holes:[[{x,y}...],...] }, ...]，坐标为网格角点(0..W, 0..H)
function _extractContours(solid, W, H, SW) {
  const isSolid = (i, j) => (i >= 1 && i <= W && j >= 1 && j <= H) && solid[i + SW * j] !== 0;

  // 1. 收集有向边界边（约定：solid 始终在边的左侧 → 外环自然 CCW、洞 CW）
  //    格子 (i,j) 的 4 角点(网格坐标)：(i-1,j-1)/(i,j-1)/(i-1,j)/(i,j)
  //    out: Map<startKey "x,y", [endKey,...]>
  const out = new Map();
  const addEdge = (x1, y1, x2, y2) => {
    const sk = x1 + ',' + y1;
    let arr = out.get(sk);
    if (!arr) { arr = []; out.set(sk, arr); }
    arr.push(x2 + ',' + y2);
  };
  for (let j = 1; j <= H; j++) {
    for (let i = 1; i <= W; i++) {
      if (!isSolid(i, j)) continue;
      if (!isSolid(i, j - 1)) addEdge(i - 1, j - 1, i, j - 1);   // 下邻空 → 下边
      if (!isSolid(i, j + 1)) addEdge(i, j, i - 1, j);           // 上邻空 → 上边
      if (!isSolid(i - 1, j)) addEdge(i - 1, j, i - 1, j - 1);   // 左邻空 → 左边
      if (!isSolid(i + 1, j)) addEdge(i, j - 1, i, j);           // 右邻空 → 右边
    }
  }

  // 2. 链接成环（pop 消费：实体墙边界每顶点入出平衡，简单拓扑无歧义）
  const loops = [];
  const guardMax = (W + 2) * (H + 2) * 8;
  while (true) {
    let startKey = null;
    for (const [k, arr] of out) { if (arr.length) { startKey = k; break; } }
    if (startKey === null) break;
    const loop = [startKey];
    let cur = startKey, guard = 0;
    while (guard++ < guardMax) {
      const arr = out.get(cur);
      if (!arr || !arr.length) break;
      const next = arr.pop();
      if (next === startKey) break;   // 回到起点 → 闭合
      loop.push(next);
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }

  // 3. key → {x,y} + 去共线冗余点
  const polys = loops.map(keys => _simplify(keys.map(k => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  })));

  // 4. shoelace 分外环(正面积)/洞(负面积)，配对洞 → 包含它且面积最小的外环
  const area = p => { let a = 0; const n = p.length; for (let i = 0; i < n; i++) { const q = p[(i + 1) % n]; a += p[i].x * q.y - q.x * p[i].y; } return a / 2; };
  const outers = [], holes = [];
  for (const p of polys) { if (p.length < 3) continue; (area(p) > 0 ? outers : holes).push(p); }

  const result = outers.map(o => ({ outer: o, holes: [] }));
  for (const h of holes) {
    let best = null, bestA = Infinity;
    for (const r of result) {
      if (_pointInPoly(h[0], r.outer)) {
        const a = Math.abs(area(r.outer));
        if (a < bestA) { bestA = a; best = r; }
      }
    }
    if (best) best.holes.push(h);
  }
  return result;
}

// 去共线冗余点（正交网格：连续三点同向 → 删中点）
function _simplify(pts) {
  const n = pts.length;
  if (n < 3) return pts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const dx1 = c.x - p.x, dy1 = c.y - p.y, dx2 = q.x - c.x, dy2 = q.y - c.y;
    // 共线(叉积0)且同向(点积≥0) → 删 c
    if (dx1 * dy2 === dy1 * dx2 && dx1 * dx2 + dy1 * dy2 >= 0) continue;
    out.push(c);
  }
  return out.length >= 3 ? out : pts;
}

// 射线法点在多边形内
function _pointInPoly(pt, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// solid: Uint8Array(SW*SH)；group: wallsGroup；opts: cell/wallH/color/opacity/edgeColor/edgeOpacity
export function buildWalls(solid, W, H, SW, group, opts = {}) {
  const cell = opts.cell ?? 0.20;
  const wallH = opts.wallH ?? 1.3;
  const color = opts.color ?? 0xe8ecf2;     // 浅灰白墙
  const opacity = opts.opacity ?? 1.0;        // 默认实色不透明（要半透明传 <1）
  const edgeColor = opts.edgeColor ?? 0x2b6cb0;
  const edgeOpacity = opts.edgeOpacity ?? 0.55;
  const FW = W * cell, FD = H * cell;

  const contours = _extractContours(solid, W, H, SW);
  if (!contours.length) return null;

  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.82, metalness: 0.05,
    transparent: opacity < 1, opacity,
    depthWrite: opacity >= 1,                 // 不透明写深度（正确遮挡气流/粒子），半透明不写
    side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.LineBasicMaterial({
    color: edgeColor, transparent: true, opacity: edgeOpacity, depthWrite: false,
  });

  let firstMesh = null;
  for (const { outer, holes } of contours) {
    if (outer.length < 3) continue;
    const shape = new THREE.Shape();
    shape.moveTo(outer[0].x, outer[0].y);
    for (let k = 1; k < outer.length; k++) shape.lineTo(outer[k].x, outer[k].y);
    shape.closePath();
    for (const h of holes) {   // 内洞（天井等）→ ExtrudeGeometry 原生挖洞
      if (h.length < 3) continue;
      const path = new THREE.Path();
      path.moveTo(h[0].x, h[0].y);
      for (let k = 1; k < h.length; k++) path.lineTo(h[k].x, h[k].y);
      path.closePath();
      shape.holes.push(path);
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: wallH, bevelEnabled: false, steps: 1 });
    geo.rotateX(-Math.PI / 2);   // xy 平面挤出 +z → 竖直墙(高度沿 +y)；Shape +y → 世界 -z

    // 网格角点(gx,gy) → 世界(gx*cell-FW/2, y, gy*cell-FD/2)，对齐 SceneManager.gridToWorld
    // rotateX(-π/2) 后 Shape 的 +y 映射到世界 -z，故 z 方向 scale=-1 翻回
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(cell, 1, -cell);
    mesh.position.set(-FW / 2, 0, -FD / 2);
    mesh.renderOrder = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
    if (!firstMesh) firstMesh = mesh;

    // 连续轮廓棱线（顶/底轮廓 + 竖直转角，比方块墙每格12棱干净）
    const edgeLines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), edgeMat);
    edgeLines.scale.set(cell, 1, -cell);
    edgeLines.position.set(-FW / 2, 0, -FD / 2);
    edgeLines.renderOrder = 0.5;
    edgeLines.frustumCulled = false;
    group.add(edgeLines);
  }
  return firstMesh;
}
