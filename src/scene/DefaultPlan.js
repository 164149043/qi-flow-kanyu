// DefaultPlan.js —— 内置示例：四合院（坐北朝南·坎宅）
// 格局：北正房（堂屋+东西次间）· 东西厢房 · 南倒座 · 中央庭院（开阔可布源）· 东南巽位大门（传统门户讲究）
// 宅子占域中央 ~48×54 格，四周全域开阔空地可放置；域外无流体场不可放。
export function buildDefaultPlan(W, H) {
  const SW = W + 2;
  const solid = new Uint8Array(SW * (H + 2));
  const glass = new Uint8Array(SW * (H + 2));
  const IX = (i, j) => i + SW * j;
  const mark = (i, j) => { if (i >= 1 && i <= W && j >= 1 && j <= H) solid[IX(i, j)] = 1; };
  const hline = (x1, x2, y) => { for (let i = x1; i <= x2; i++) mark(i, y); };
  const vline = (x, y1, y2) => { for (let j = y1; j <= y2; j++) mark(x, j); };
  const open = (i, j) => { solid[IX(i, j)] = 0; glass[IX(i, j)] = 0; };
  const openRange = (i1, i2, j) => { for (let i = i1; i <= i2; i++) open(i, j); };

  // ===== 院界（域中央 48×54：随 W/H 居中——W=96/H=80 时 x 24..71，y 13..66）=====
  const midX = (W / 2) | 0;                        // 48
  const x0 = midX - 24, x1 = midX + 23;            // 院墙东西 24..71
  const midY = (H / 2) | 0;                        // 南北居中锚（改 H 不再钉死北端，2026-08-23）
  const y0 = midY - 27, y1 = midY + 26;            // 院墙南北（H=80 时 = 13..66 与原版一致）
  hline(x0, x1, y0);                               // 北院墙
  hline(x0, x1, y1);                               // 南院墙
  vline(x0, y0, y1);                               // 西院墙
  vline(x1, y0, y1);                               // 东院墙

  // ===== 北正房（三间：堂屋居中 + 东西次间），j y0+1..y0+15 =====
  hline(x0 + 1, x1 - 1, y0 + 15);                  // 正房南墙（前檐墙）
  const zhTangX0 = midX - 6, zhTangX1 = midX + 5;  // 堂屋 42..53（宽12格）
  vline(zhTangX0 - 1, y0 + 2, y0 + 14);            // 堂屋东隔墙（东侧次间分界）
  vline(zhTangX1 + 1, y0 + 2, y0 + 14);            // 堂屋西隔墙
  openRange(zhTangX0, zhTangX1, y0 + 15);          // 堂屋开门面庭（敞厅）
  open(x0 + 6, y0 + 15); open(x0 + 7, y0 + 15);    // 东次间门
  open(x1 - 7, y0 + 15); open(x1 - 6, y0 + 15);    // 西次间门

  // ===== 东西厢房（竖长条），j y0+19..y0+39 =====
  hline(x0 + 1, x0 + 8, y0 + 19); hline(x0 + 1, x0 + 8, y0 + 39);   // 西厢房南北墙
  vline(x0 + 8, y0 + 20, y0 + 38);
  hline(x1 - 8, x1 - 1, y0 + 19); hline(x1 - 8, x1 - 1, y0 + 39);   // 东厢房南北墙
  vline(x1 - 8, y0 + 20, y0 + 38);
  open(x0 + 4, y0 + 19); open(x0 + 4, y0 + 39);    // 西厢房南北门（穿堂）
  open(x1 - 4, y0 + 19); open(x1 - 4, y0 + 39);    // 东厢房南北门

  // ===== 南倒座（门房），j y0+43..y1，东南巽位留大门 =====
  hline(x0 + 1, x1 - 1, y0 + 43);                  // 倒座北墙
  vline(midX - 10, y0 + 44, y0 + 52);              // 倒座内隔（杂物/门房两区）
  openRange(x1 - 6, x1 - 2, y1);                   // 东南巽位大门（65..69 开五格）
  open(x1 - 6, y0 + 43); open(x1 - 5, y0 + 43);    // 门道通倒座北

  // 中央庭院 j 29..55 · x 33..65 全空（开阔布源场）
  return { solid, glass, north: 0 };
}
