// SceneManager.js —— 老子的 Three.js 3D 场景总管
// 对照原站 3162-3210: WebGLRenderer + PerspectiveCamera(50) + 地板 + 热力图CanvasTexture贴Plane
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneManager {
  // container: DOM 容器；heatCanvas: HeatmapRenderer 的 canvas（作地板热力图纹理）
  constructor(container, W, H, cell, heatCanvas) {
    this.W = W; this.H = H; this.cell = cell;
    this.FW = W * cell; this.FD = H * cell;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeceef2);   // 浅灰白（对齐参考版）
    this.scene.fog = new THREE.Fog(0xeceef2, this.FW * 4.5, this.FW * 12);   // 雾随大灰地后退（灰地边缘才起雾）

    // 相机（原站 PerspectiveCamera(50,...)），斜俯视
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(this.FW * 1.2, this.FW * 1.35, this.FD * 1.6);   // 拉近：模拟域尽量占满取景，建筑外空地好点
    this.camera.lookAt(0, 0, 0);

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // 控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;  // 不让相机钻到地板下
    this.controls.minDistance = this.FW * 0.3;
    this.controls.maxDistance = this.FW * 8;

    // 灯光
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dir = new THREE.DirectionalLight(0xffffff, 0.75);
    dir.position.set(this.FW * 0.6, this.FW * 1.2, this.FD * 0.8);
    this.scene.add(dir);

    // 地板（浅灰，大画布——远超模拟域的开阔感；域外点击给"域外无流体场"提示）
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(this.FW * 4.2, this.FD * 4.2),
      new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.92 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    this.scene.add(floor);

    // 热力图 plane：把 HeatmapRenderer 的 canvas 当纹理贴地板（原站 heatPlane @3193）
    this.heatTex = new THREE.CanvasTexture(heatCanvas);
    this.heatTex.magFilter = THREE.LinearFilter;
    this.heatPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(this.FW, this.FD),
      new THREE.MeshBasicMaterial({ map: this.heatTex, transparent: true, opacity: 0.40, depthWrite: false })
    );
    this.heatPlane.rotation.x = -Math.PI / 2;
    this.heatPlane.position.y = 0.004;   // 略高于地板，避免 z-fighting
    this.scene.add(this.heatPlane);

    // 墙体容器（WallBuilder 往里塞 InstancedMesh）
    this.wallsGroup = new THREE.Group();
    this.scene.add(this.wallsGroup);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // 网格坐标 (i,j) [1..W, 1..H] → 世界坐标 (x,z)，与 WallBuilder 对齐
  gridToWorld(i, j) {
    return [(i - 0.5) * this.cell - this.FW / 2, (j - 0.5) * this.cell - this.FD / 2];
  }
  // 世界 (x,z) → 网格 (i,j)
  worldToGrid(x, z) {
    return [Math.round((x + this.FW / 2) / this.cell + 0.5), Math.round((z + this.FD / 2) / this.cell + 0.5)];
  }

  clearWalls() {
    while (this.wallsGroup.children.length) {
      const c = this.wallsGroup.children.pop();
      c.geometry?.dispose(); c.material?.dispose();
    }
  }

  updateHeatTexture() { this.heatTex.needsUpdate = true; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
