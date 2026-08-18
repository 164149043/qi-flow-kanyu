// Wuxing.js —— 五行结构能量注入（对照原站 injectAll @2291）
// 金·凝聚 / 木·生发 / 水·流动 / 火·升散 / 土·承载，对气场(dye/velocity)不同作用

export const ELEMENT_PROPS = {
  metal: { color: 0xc8d0e0, label: '金·凝聚', desc: '气流减速沉淀，能量微汇聚' },
  wood:  { color: 0x6abf4b, label: '木·生发', desc: '持续生发能量（稳定辉光）' },
  water: { color: 0x4aa8ff, label: '水·流动', desc: '引导加速气场循环' },
  fire:  { color: 0xff5530, label: '火·升散', desc: '能量升散+向外辐散气流' },
  earth: { color: 0xc8a060, label: '土·承载', desc: '气场平稳安定（减速+托能）' }
};

// 对流体场注入五行作用。structs: [{i,j,element,r,strength}]
export function injectAll(field, structs, dt) {
  const { W, H, SW, u, v, dye, solid } = field;
  for (let si = 0; si < structs.length; si++) {
    const s = structs[si];
    if (!s || !ELEMENT_PROPS[s.element]) continue;
    const er = Math.max(3, Math.round(s.r));
    const st = s.strength ?? 1;
    for (let ej = -er; ej <= er; ej++) {
      for (let ex = -er; ex <= er; ex++) {
        const ii = s.i + ex, jj = s.j + ej;
        if (ii < 1 || jj < 1 || ii > W || jj > H) continue;
        const c = ii + SW * jj;
        if (solid[c]) continue;
        const dd = Math.sqrt(ex * ex + ej * ej);
        if (dd > er) continue;
        const wgt = 1 - dd / er;
        switch (s.element) {
          case 'metal': {                        // 金·凝聚：减速沉淀 + 微聚能
            const dmp = Math.pow(0.35, dt * st * 10 * wgt);
            u[c] *= dmp; v[c] *= dmp;
            dye[c] = Math.min(2, dye[c] + st * dt * 0.4 * wgt);
            break;
          }
          case 'wood':                           // 木·生发：持续生能量
            dye[c] = Math.min(2, dye[c] + st * dt * 1.8 * wgt);
            break;
          case 'water': {                        // 水·流动：加速循环
            const acc = 1 + st * dt * 4 * wgt;
            u[c] *= acc; v[c] *= acc;
            break;
          }
          case 'fire': {                         // 火·升散：能量升散 + 向外辐散气流
            dye[c] = Math.min(2, dye[c] + st * dt * 1.3 * wgt);
            const rl = Math.max(0.6, dd);
            u[c] += (ex / rl) * st * dt * 3.2 * wgt;
            v[c] += (ej / rl) * st * dt * 3.2 * wgt;
            break;
          }
          case 'earth': {                        // 土·承载：减速 + 托能
            const dmp2 = Math.pow(0.5, dt * st * 8 * wgt);
            u[c] *= dmp2; v[c] *= dmp2;
            dye[c] = Math.min(2, dye[c] + st * dt * 0.6 * wgt);
            break;
          }
        }
      }
    }
  }
}
