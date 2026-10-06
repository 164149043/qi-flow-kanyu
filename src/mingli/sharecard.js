/**
 * sharecard.js —— 命盘分享卡（Canvas 2D 手绘，零依赖）
 * ============================================================
 * 为「保存 + 发给 AI 读图」双场景重新排版（非网页截图）：
 * 大字号四柱、结构化条目、口径行随卡。色板/字体与 mingli.css 一致。
 * 数据整理 cardModel() 是纯函数（可测）；buildShareCard() 需要 DOM canvas。
 *
 * 用法：const c = buildShareCard(chart); await cardBlob(c) → PNG Blob
 */
import { GAN_WUXING, ZHI_WUXING } from './core/data.js';

/* ---- 色板（复制自 mingli.css :root，改皮肤时两处同步） ---- */
const C = {
  paper: '#f7f4ec', card: '#fffdf7', line: '#d8d0bd',
  ink: '#26222c', inkDim: '#5d5a66', inkFaint: '#8a8794',
  zhu: '#a63a2e', jin: '#b0873f',
  wx: { '木': '#3f7d54', '火': '#b8433a', '土': '#a3762e', '金': '#a8862f', '水': '#3a6fa8' },
};
const KAI = "KaiTi, STKaiti, 'AR PL UKai CN', serif";
const SANS = "system-ui, -apple-system, 'Microsoft YaHei', 'PingFang SC', sans-serif";

const PN = ['年', '月', '日', '时'];

/* ---- 行模型（纯函数，供测试） ---- */
export function cardModel(chart) {
  const nowYear = new Date().getFullYear();
  const wx = chart.wuxing.scores;
  const lack = ['木', '火', '土', '金', '水'].filter((w) => wx[w] === 0);

  // 用神行（从势盘另写；中和盘忌神为空，写「中和流通」不留空档）
  const ys = chart.yongshen;
  const yongText = ys.congGe
    ? `从势之局 · 顺旺势（${(ys.tishiYong || []).join('、')}），不以扶抑论`
    : [`喜${ys.fuyi.yong.join('、')}${ys.fuyi.ji.length ? ' · 忌' + ys.fuyi.ji.join('、') : '（中和流通，无专忌）'}`,
      ys.bingyao ? `病药：病${ys.bingyao.bing}·药${ys.bingyao.yao}` : '',
      ys.tiaohou ? `调候：${ys.tiaohou.yong.join('、')}` : ''].filter(Boolean).join(' ｜ ');

  const rows = [
    ['日主', `${chart.dayGan}${chart.dayWuxing} · ${chart.strength.label}（同党占 ${chart.strength.pct}%）`],
    ['五行', `金${wx['金']} 木${wx['木']} 水${wx['水']} 火${wx['火']} 土${wx['土']}${lack.length ? ' · 缺' + lack.join('、') : ''}`],
    ['格局', `${chart.geju.main}`],
    ['用神', yongText],
  ];
  if (chart.relations?.length) {
    rows.push(['关系', chart.relations.map((r) => `${r.text}`).join(' · ')]);
  }
  const ss = chart.pillars.flatMap((p, i) => (p.shensha || []).map((s) => `${s.name}(${PN[i]}·${s.luck})`));
  if (ss.length) rows.push(['神煞', ss.join(' · ')]);

  // 大运：干支串全带，当前步标出
  const valid = chart.dayun.list.filter((d) => d.ganZhi);
  const cur = valid.find((d) => nowYear >= d.startYear && nowYear <= d.endYear);
  // 近年流年跨大运收集（±2 年可能落在上一步大运里，只扫当前步会漏跨界之年）
  const years = valid
    .flatMap((d) => d.liuNian || [])
    .filter((l) => Math.abs(l.year - nowYear) <= 2)
    .sort((a, b) => a.year - b.year)
    .map((l) => `${l.year}${l.ganZhi}${l.chongRi ? '⚡' : l.heRi ? '⊙' : ''}`)
    .join(' · ');

  return {
    title: '命 理 · 四柱排盘',
    gender: chart.input.gender === 1 ? '乾造' : '坤造',
    line1: `公历 ${chart.info.solarText}`,
    line2: `农历 ${chart.info.lunarText} · 属${chart.info.shengXiao}${chart.info.jieQi ? ' · ' + chart.info.jieQi : ''}`,
    pillars: chart.pillars.map((p, i) => ({
      name: p.name, shiShen: p.shiShen, gan: p.gan, zhi: p.zhi,
      hide: p.hideGans.map((h) => `${h.gan} ${h.shiShen}`),
      xingYun: p.name === '日柱' ? `自坐${p.ziZuo}` : p.xingYun,
      kong: p.kongDay ? '日空' : p.kongYear ? '年空' : '',
      pi: i,
    })),
    rows,
    dayunHead: `${chart.dayun.list[1]?.startAge ?? ''}岁 ${chart.dayun.startYear}年${chart.dayun.startMonth}月起运`,
    dayun: valid.map((d) => ({ gz: d.ganZhi, cur: d === cur })),
    years,
    koujing: `${chart.input.sect === 1 ? '子初换日' : '晚子换日'}${chart.input.tstOffsetMin ? ` · 真太阳时${chart.input.tstOffsetMin > 0 ? '+' : ''}${chart.input.tstOffsetMin}分` : ' · 未启用真太阳时'}`,
    foot: '传统命理文化 · 仅供研究参考',
  };
}

/* ---- 排版工具：词级贪心换行（词条不拆断 + 行首禁则 + 超长词字符级兜底） ---- */
const LINE_HEAD_FORBID = '），。、；：｜·」』！？';
function wrapSmart(ctx, text, maxW) {
  const parts = text.split(/( · | ｜ )/g).filter((s) => s !== '');
  const lines = [];
  let line = '';
  const put = (s) => {
    if (line && ctx.measureText(line + s).width > maxW) { lines.push(line); line = s.replace(/^ /, ''); }
    else line += s;
  };
  for (const p of parts) {
    if (ctx.measureText(p).width > maxW) {
      // 单个词就超宽：字符级拆，行首禁则符并回上一行末
      for (const ch of p) {
        if (!line && lines.length && LINE_HEAD_FORBID.includes(ch)) { lines[lines.length - 1] += ch; continue; }
        if (line && ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
        else line += ch;
      }
    } else put(p);
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/* ---- 排版工具：大运 token 流式折行 ---- */
function layoutDayun(meas, m, maxW) {
  const lines = [[]];
  let x = 0;
  m.dayun.forEach((d, i) => {
    const tokens = [];
    if (i > 0) tokens.push({ t: '→', font: `26px ${SANS}`, color: C.line });
    tokens.push({ t: d.gz, font: `bold ${d.cur ? 34 : 30}px ${KAI}`, color: d.cur ? C.zhu : C.ink });
    if (d.cur) tokens.push({ t: '当前', font: `24px ${SANS}`, color: C.zhu });
    for (const tk of tokens) {
      meas.font = tk.font;
      const w = meas.measureText(tk.t).width + 10;
      if (x + w > maxW && x > 0) { lines.push([]); x = 0; }
      lines[lines.length - 1].push(tk);
      x += w;
    }
  });
  return lines;
}

/* ---- 绘制主体（流式 y 游标，返回最终高度；供两遍调用定准 canvas 高度） ---- */
function drawCard(ctx, m, W, pad) {
  const labelX = pad + 130, valW = W - pad - labelX;
  const maxHide = Math.max(...m.pillars.map((p) => p.hide.length), 1);
  const rowsWrapped = m.rows.map(([label, val]) => {
    ctx.font = `30px ${SANS}`;
    return { label, lines: wrapSmart(ctx, val, valW) };
  });
  const dayunLines = layoutDayun(ctx, m, W - pad * 2);

  let y = 118;
  // 站名 + 乾/坤造
  ctx.fillStyle = C.ink;
  ctx.font = `bold 52px ${KAI}`;
  ctx.fillText(m.title, pad, y);
  ctx.fillStyle = C.zhu;
  ctx.font = `bold 40px ${KAI}`;
  ctx.textAlign = 'right';
  ctx.fillText(m.gender, W - pad, y);
  ctx.textAlign = 'left';
  // 信息两行
  ctx.fillStyle = C.inkDim;
  ctx.font = `30px ${SANS}`;
  y += 56; ctx.fillText(m.line1, pad, y);
  y += 46; ctx.fillText(m.line2, pad, y);
  y += 34; hline(ctx, pad, y, W - pad * 2);

  /* ---- 四柱（星运统一基线：藏干少的列留白对齐） ---- */
  y += 66;
  const colW = (W - pad * 2 - 24 * 3) / 4;
  const xyBase = y + 316 + maxHide * 38 + 14;
  m.pillars.forEach((p, i) => {
    const cx = pad + i * (colW + 24);
    const mid = cx + colW / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.inkFaint;
    ctx.font = `28px ${SANS}`;
    ctx.fillText(p.name, mid, y);
    ctx.fillStyle = p.shiShen === '日主' ? C.jin : C.zhu;
    ctx.font = `bold ${p.shiShen === '日主' ? 34 : 30}px ${KAI}`;
    ctx.fillText(p.shiShen, mid, y + 48);
    const ganC = C.wx[GAN_WUXING[p.gan]], zhiC = C.wx[ZHI_WUXING[p.zhi]];
    ctx.font = `bold 96px ${KAI}`;
    ctx.fillStyle = ganC; ctx.fillText(p.gan, mid, y + 160);
    ctx.fillStyle = zhiC; ctx.fillText(p.zhi, mid, y + 262);
    if (p.kong) {
      ctx.fillStyle = C.zhu;
      ctx.font = `bold 24px ${SANS}`;
      ctx.textAlign = 'right';
      ctx.fillText('空', cx + colW - 2, y + 172);
      ctx.textAlign = 'center';
    }
    ctx.font = `24px ${SANS}`;
    let hy = y + 316;
    p.hide.forEach((h) => {
      ctx.fillStyle = C.inkDim;
      ctx.fillText(h, mid, hy);
      hy += 38;
    });
    ctx.fillStyle = C.inkFaint;
    ctx.font = `26px ${SANS}`;
    ctx.fillText(p.xingYun, mid, xyBase);
    ctx.textAlign = 'left';
  });
  y = xyBase + 44;
  hline(ctx, pad, y, W - pad * 2);
  y += 56;

  /* ---- 信息条目（词级换行） ---- */
  rowsWrapped.forEach((r) => {
    ctx.fillStyle = C.zhu;
    ctx.font = `bold 32px ${KAI}`;
    ctx.fillText(r.label, pad, y);
    ctx.fillStyle = C.ink;
    ctx.font = `30px ${SANS}`;
    r.lines.forEach((ln, li) => ctx.fillText(ln, labelX, y + li * 42));
    y += r.lines.length * 42 + 22;
  });
  y -= 8;

  hline(ctx, pad, y, W - pad * 2);
  y += 52;

  /* ---- 大运（token 流式折行） ---- */
  ctx.fillStyle = C.zhu;
  ctx.font = `bold 32px ${KAI}`;
  ctx.fillText('大运', pad, y);
  ctx.fillStyle = C.inkFaint;
  ctx.font = `26px ${SANS}`;
  ctx.fillText(m.dayunHead, labelX, y);
  y += 54;
  dayunLines.forEach((lineTokens) => {
    let dx = pad;
    lineTokens.forEach((tk) => {
      ctx.fillStyle = tk.color;
      ctx.font = tk.font;
      ctx.fillText(tk.t, dx, y);
      dx += ctx.measureText(tk.t).width + 10;
    });
    y += 56;
  });
  y -= 8;
  if (m.years) {
    ctx.font = `28px ${SANS}`;
    const yl = wrapSmart(ctx, `近年  ${m.years}（⚡冲日柱 · ⊙合日柱）`, W - pad * 2);
    ctx.fillStyle = C.inkDim;
    yl.forEach((ln, li) => ctx.fillText(ln, pad, y + li * 40));
    y += yl.length * 40 + 14;
  }

  /* ---- 尾部（流式定位：口径行 + 脚注 + 朱印同区，不再用绝对定位） ---- */
  y += 26;
  hline(ctx, pad, y, W - pad * 2, '#c6bda6');   // 尾部分隔线加深一档
  const tailTop = y;
  const koujingY = tailTop + 46;
  const sealTop = tailTop + 4;
  const footY = Math.max(koujingY + 52, sealTop + 76 + 34);
  ctx.fillStyle = C.inkFaint;
  ctx.font = `26px ${SANS}`;
  ctx.fillText(m.koujing, pad, koujingY);
  ctx.textAlign = 'center';
  ctx.fillText(m.foot, W / 2, footY);
  ctx.textAlign = 'left';

  // 朱印（尾部右侧，与口径行同区）
  const sx = W - pad - 76;
  ctx.fillStyle = C.zhu;
  roundRect(ctx, sx, sealTop, 76, 76, 8);
  ctx.fill();
  ctx.fillStyle = '#fffdf7';
  ctx.font = `bold 34px ${KAI}`;
  ctx.textAlign = 'center';
  ctx.fillText('命', sx + 38, sealTop + 32);
  ctx.fillText('理', sx + 38, sealTop + 66);
  ctx.textAlign = 'left';

  return footY + 44;   // 最终高度（含底边距）
}

/* ---- 合盘对照卡：行模型（纯函数，供测试） ---- */
export function hePanCardModel(hr) {
  const person = (tag, c) => ({
    tag,
    gender: c.input.gender === 1 ? '乾造（男）' : '坤造（女）',
    solar: `公历 ${c.info.solarText.slice(0, 16)}`,
    shengXiao: `属${c.info.shengXiao}`,
    sub: `日主${c.dayGan}${c.dayWuxing} · ${c.strength.label}`,
    xi: `喜 ${(c.yongshen.congGe ? c.yongshen.tishiYong : c.yongshen.fuyi.yong).join('、')}`,
    gzs: c.pillars.map((p) => ({ gz: p.gz, ss: p.shiShen, gan: p.gan, zhi: p.zhi })),
  });
  return {
    title: '命 理 · 合盘对照',
    score: hr.he.score,
    summary: hr.he.summary,
    persons: [person('甲方', hr.A), person('乙方', hr.B)],
    items: hr.he.items.map((it) => ({ cap: it.cap, main: it.main, note: it.note, luck: it.luck })),
    koujing: `${hr.A.input.sect === 1 ? '子初换日' : '晚子换日'}${hr.A.input.tstOffsetMin || hr.B.input.tstOffsetMin ? ' · 含真太阳时修正' : ' · 未启用真太阳时'}`,
    foot: '传统命理文化 · 仅供研究参考',
  };
}

/* ---- 合盘对照卡绘制（两遍法定高，同 drawCard 模式） ---- */
function drawHeCard(ctx, m, W, pad) {
  const panelW = (W - pad * 2 - 20) / 2;
  let y = 118;
  // 标题 + 参考分
  ctx.fillStyle = C.ink;
  ctx.font = `bold 52px ${KAI}`;
  ctx.fillText(m.title, pad, y);
  ctx.fillStyle = C.zhu;
  ctx.font = `bold 44px ${KAI}`;
  ctx.textAlign = 'right';
  ctx.fillText(`参考分 ${m.score}`, W - pad, y);
  ctx.textAlign = 'left';

  /* ---- 两人 panel ---- */
  y += 26;
  const panelH = 306;
  m.persons.forEach((p, pi) => {
    const px = pad + pi * (panelW + 20);
    // panel 底
    ctx.fillStyle = C.card;
    roundRect(ctx, px, y, panelW, panelH, 10);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    roundRect(ctx, px, y, panelW, panelH, 10);
    ctx.stroke();
    const cx0 = px + 22;
    ctx.fillStyle = C.zhu;
    ctx.font = `bold 30px ${KAI}`;
    ctx.fillText(`${p.tag} · ${p.gender}`, cx0, y + 46);
    ctx.fillStyle = C.inkDim;
    ctx.font = `24px ${SANS}`;
    ctx.fillText(`${p.solar} · ${p.shengXiao}`, cx0, y + 84);
    ctx.fillStyle = C.ink;
    ctx.fillText(`${p.sub}`, cx0, y + 118);
    ctx.fillStyle = C.inkFaint;
    ctx.fillText(p.xi, cx0, y + 150);
    // 四柱干支对（十神小字在上）
    const colW2 = (panelW - 44) / 4;
    p.gzs.forEach((g0, gi) => {
      const mid = px + 22 + colW2 * gi + colW2 / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = C.zhu;
      ctx.font = `20px ${SANS}`;
      ctx.fillText(g0.ss, mid, y + 196);
      ctx.font = `bold 46px ${KAI}`;
      ctx.fillStyle = C.wx[GAN_WUXING[g0.gan]];
      ctx.fillText(g0.gan, mid, y + 244);
      ctx.fillStyle = C.wx[ZHI_WUXING[g0.zhi]];
      ctx.fillText(g0.zhi, mid, y + 292);
      ctx.textAlign = 'left';
    });
    // 中缝 ⇄
    if (pi === 0) {
      ctx.fillStyle = C.zhu;
      ctx.font = `bold 40px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText('⇄', W / 2, y + panelH / 2 + 14);
      ctx.textAlign = 'left';
    }
  });
  y += panelH + 40;

  // 汇总句
  ctx.fillStyle = C.inkDim;
  ctx.font = `28px ${SANS}`;
  const sumLines = wrapSmart(ctx, m.summary, W - pad * 2);
  sumLines.forEach((ln, li) => ctx.fillText(ln, pad, y + li * 40));
  y += sumLines.length * 40 + 26;
  hline(ctx, pad, y, W - pad * 2);
  y += 52;

  /* ---- 对照明细（词级换行） ---- */
  ctx.fillStyle = C.zhu;
  ctx.font = `bold 32px ${KAI}`;
  ctx.fillText('对照明细', pad, y);
  y += 50;
  m.items.forEach((it) => {
    ctx.fillStyle = C.ink;
    ctx.font = `bold 30px ${KAI}`;
    ctx.fillText(`· ${it.cap}`, pad, y);
    ctx.fillStyle = C.ink;
    ctx.font = `28px ${SANS}`;
    const capW = ctx.measureText(`· ${it.cap}`).width + 18;
    ctx.fillText(it.main, pad + capW, y);
    ctx.font = `26px ${SANS}`;
    const noteLines = wrapSmart(ctx, it.note, W - pad * 2);
    ctx.fillStyle = C.inkDim;
    noteLines.forEach((ln, li) => ctx.fillText(ln, pad + 40, y + 38 + li * 36));
    y += 38 + noteLines.length * 36 + 16;
  });

  /* ---- 尾部 ---- */
  y += 12;
  hline(ctx, pad, y, W - pad * 2, '#c6bda6');
  const tailTop = y;
  const koujingY = tailTop + 46;
  const sealTop = tailTop + 4;
  const footY = Math.max(koujingY + 52, sealTop + 76 + 34);
  ctx.fillStyle = C.inkFaint;
  ctx.font = `26px ${SANS}`;
  ctx.fillText(m.koujing, pad, koujingY);
  ctx.textAlign = 'center';
  ctx.fillText(m.foot, W / 2, footY);
  ctx.textAlign = 'left';

  const sx = W - pad - 76;
  ctx.fillStyle = C.zhu;
  roundRect(ctx, sx, sealTop, 76, 76, 8);
  ctx.fill();
  ctx.fillStyle = '#fffdf7';
  ctx.font = `bold 34px ${KAI}`;
  ctx.textAlign = 'center';
  ctx.fillText('命', sx + 38, sealTop + 32);
  ctx.fillText('理', sx + 38, sealTop + 66);
  ctx.textAlign = 'left';

  return footY + 44;
}

export function buildHePanCard(hr) {
  const m = hePanCardModel(hr);
  const W = 1080, pad = 64;
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = 4000;
  const H = Math.ceil(drawHeCard(tmp.getContext('2d'), m, W, pad));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  drawHeCard(ctx, m, W, pad);
  return c;
}

/* ---- 对外：两遍绘制（第一遍量高，第二遍按精确高度落笔） ---- */
export function buildShareCard(chart) {
  const m = cardModel(chart);
  const W = 1080, pad = 64;
  // 第一遍：画在足够高的废 canvas 上，拿真实终点
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = 4000;
  const H = Math.ceil(drawCard(tmp.getContext('2d'), m, W, pad));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);
  drawCard(ctx, m, W, pad);
  return c;
}

/* ---- 工具 ---- */
function hline(ctx, x1, y, w, color) {
  ctx.strokeStyle = color || C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y); ctx.lineTo(x1 + w, y);
  ctx.stroke();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---- 导出 ---- */
export function cardBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
export function cardDataUrl(canvas) {
  return canvas.toDataURL('image/png');
}
