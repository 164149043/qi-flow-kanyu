// Solar.js —— 采光模式（对照原站 castRay 光线投射版）
// 光线从光源/落地窗射出，遇墙镜面反射，穿玻璃透射，沿途累加 light
// castSunRays(太阳从落地窗射入) + castPointRays(点光源向四周发射) + 衰减

export const LIGHT_HALF_LIFE = 10;
const WALL_R = 0.62;   // 墙面反射率
const GLASS_T = 0.85;  // 玻璃透射率

// 太阳高度系数（6点日出0 → 12点最高1 → 18点日落0）
export function sunAltitude(hour) {
  if (hour < 6 || hour > 18) return 0;
  return Math.sin((hour - 6) / 12 * Math.PI);
}
// 太阳方位角（6点东90 → 12点南180 → 18点西270）
function sunBearing(hour) {
  if (hour < 6 || hour > 18) return 0;
  return 90 + (hour - 6) / 12 * 180;
}

// 光线投射：从(x,y)沿(dx,dz)步长0.5，遇墙反射，穿玻璃，沿途 light+=e*0.028
function castRay(field, x, y, dx, dz, e) {
  const { W, H, SW, light, solid, glass } = field;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  let bounces = 0;
  for (let s = 0; s < 560; s++) {
    const nx = x + dx * 0.5, ny = y + dz * 0.5;
    const ci = Math.round(nx), cj = Math.round(ny);
    if (ci < 1 || cj < 1 || ci > W || cj > H) return;
    const c = ci + SW * cj;
    if (solid[c] && !glass[c]) {
      // 镜面反射：判断撞的是水平面还是垂直面
      const ix1 = Math.round(x + dx * 0.5) + SW * Math.round(y);
      const iy1 = Math.round(x) + SW * Math.round(y + dz * 0.5);
      const hx = solid[ix1] && !glass[ix1];
      const hy = solid[iy1] && !glass[iy1];
      if (hx && !hy) dx = -dx;
      else if (hy && !hx) dz = -dz;
      else { dx = -dx; dz = -dz; }
      e *= WALL_R; bounces++;
      if (bounces > 5 || e < 0.04) return;
      continue;
    }
    x = nx; y = ny;
    if (glass[c]) { e *= GLASS_T; continue; }   // 穿过玻璃
    light[c] += e * 0.028;                        // 沿途累加光能
  }
}

// 太阳光线：从落地窗(glass)射入，方向=太阳方位反方向，能量=高度×强度
function castSunRays(field, glassList, hour, inten, count) {
  if (!glassList.length) return;
  const power = sunAltitude(hour) * inten;
  if (power < 0.02) return;
  const br = (sunBearing(hour) + 180) * Math.PI / 180;   // 光线行进方向
  const tdx = Math.sin(br), tdz = -Math.cos(br);
  const baseA = Math.atan2(tdz, tdx);
  for (let n = 0; n < count; n++) {
    const g = glassList[(Math.random() * glassList.length) | 0];
    const jit = (Math.random() - 0.5) * 0.22;
    const a = baseA + jit;
    castRay(field, g.i - tdx * 2.3, g.j - tdz * 2.3, Math.cos(a), Math.sin(a), power * (0.8 + 0.4 * Math.random()));
  }
}

// 点光源：随机光源向四周发射光线
function castPointRays(field, lightPts, count) {
  if (!lightPts.length) return;
  for (let n = 0; n < count; n++) {
    const lp = lightPts[(Math.random() * lightPts.length) | 0];
    const a = Math.random() * Math.PI * 2;
    castRay(field, lp.i, lp.j, Math.cos(a), Math.sin(a), lp.strength || 1.2);
  }
}

// 采光主步进（对照原站 lightFrame）：太阳光 + 点光源光线投射 + 墙清零 + 衰减
export function lightFrame(field, lightPts, hour, inten, dt) {
  const { W, H, SW, light, solid, glass } = field;
  // 收集落地窗格
  const glassList = [];
  for (let j = 1; j <= H; j++) for (let i = 1; i <= W; i++) if (glass[i + SW * j]) glassList.push({ i, j });
  castSunRays(field, glassList, hour, inten, 90);
  castPointRays(field, lightPts, lightPts.length ? 50 : 0);
  // 墙清零 + 半衰期衰减
  const decay = Math.pow(0.5, dt / LIGHT_HALF_LIFE);
  for (let j = 1; j <= H; j++) {
    for (let i = 1; i <= W; i++) {
      const c = i + SW * j;
      if (solid[c] && !glass[c]) light[c] = 0;
      else light[c] *= decay;
    }
  }
}
