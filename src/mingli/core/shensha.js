/**
 * shensha.js —— 神煞规则与扫描（经典档）
 * ============================================================
 * 收录通行命书常见吉凶神煞（天乙/禄神/羊刃/文昌/桃花/驿马/华盖/将星/
 * 劫煞/亡神/天德/月德/魁罡/阴差阳错/孤辰寡宿/红艳/金舆/太极），
 * 规则依《渊海子平》《三命通会》《神峰通考》通行口诀自研实现，释义自写。
 *
 * 用法：scanShensha({ gans, zhis, dayGan, gender }) →
 *   { perPillar: [ [{id,name,luck,note,src}] ×4 ], all: [...] }
 * note 为本盘具体落点说明（非通用文案）。
 */
import { CANG_GAN, ZHI_CHONG } from './data.js';

/* ─── 以日干查地支 ─── */
const BY_DAYGAN = {
  'lushen': {
    name: '禄神', luck: '吉',
    map: { '甲': '寅', '丙': '巳', '戊': '巳', '庚': '申', '壬': '亥', '乙': '卯', '丁': '午', '己': '午', '辛': '酉', '癸': '子' },
    desc: '日干临官之支，如薪俸在身。主食禄温饱、勤勉得食，见之衣食有着。',
    src: '《三命通会》',
  },
  'yangren': {
    name: '羊刃', luck: '凶',
    map: { '甲': '卯', '丙': '午', '戊': '午', '庚': '酉', '壬': '子' },
    desc: '阳干帝旺之支，旺极成刃。主刚烈果决、胆识过人，亦主伤灾破财，喜七杀制之。',
    src: '《渊海子平》',
  },
  'wenchang': {
    name: '文昌', luck: '吉',
    map: { '甲': '巳', '乙': '午', '丙': '申', '丁': '酉', '戊': '申', '己': '酉', '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯' },
    desc: '食神临官之支，文星得位。主聪慧好学、利考试文途，气质清秀。',
    src: '通行整理本',
  },
  'hongyan': {
    name: '红艳', luck: '中',
    map: { '甲': '午', '乙': '申', '丙': '寅', '丁': '未', '戊': '辰', '己': '辰', '庚': '戌', '辛': '亥', '壬': '子', '癸': '申' },
    desc: '风流艳煞，主容貌出众、人缘魅力强，亦防感情纷扰。',
    src: '通行整理本',
  },
  'jinyu': {
    name: '金舆', luck: '吉',
    map: { '甲': '辰', '乙': '巳', '丙': '未', '丁': '申', '戊': '未', '己': '申', '庚': '戌', '辛': '亥', '壬': '丑', '癸': '寅' },
    desc: '禄前二位，如乘车戴金。主温和富贵、得配偶助力。',
    src: '《三命通会》',
  },
  'tianyi': {
    name: '天乙贵人', luck: '吉',
    map: { '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'], '乙': ['子', '申'], '己': ['子', '申'], '丙': ['亥', '酉'], '丁': ['亥', '酉'], '壬': ['卯', '巳'], '癸': ['卯', '巳'], '辛': ['午', '寅'] },
    desc: '众煞之首贵人。一生多逢凶化吉、得人提携，危难有救。口诀「甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，庚辛逢马虎」。',
    src: '《渊海子平》',
  },
  'taiji': {
    name: '太极贵人', luck: '吉',
    map: { '甲': ['子', '午'], '乙': ['子', '午'], '丙': ['卯', '酉'], '丁': ['卯', '酉'], '戊': ['辰', '戌', '丑', '未'], '己': ['辰', '戌', '丑', '未'], '庚': ['寅', '亥'], '辛': ['寅', '亥'], '壬': ['巳', '申'], '癸': ['巳', '申'] },
    desc: '五行始终之地。主聪慧好玄学五术、处事有始有终。',
    src: '《三命通会》',
  },
};

/* ─── 以年支/日支三合局查 ─── */
const SANHE_GROUP = { '申': 0, '子': 0, '辰': 0, '寅': 1, '午': 1, '戌': 1, '巳': 2, '酉': 2, '丑': 2, '亥': 3, '卯': 3, '未': 3 };
const BY_SANHE = {
  'taohua': {
    name: '桃花', luck: '中',
    at: ['酉', '卯', '午', '子'],
    desc: '咸池沐浴之地。主人缘魅力、才艺风流，亦主感情纠葛；「墙内」年月主早慧得宠，「墙外」日时主后天人缘。',
    src: '《渊海子平》',
  },
  'yima': {
    name: '驿马', luck: '中',
    at: ['寅', '申', '亥', '巳'],
    desc: '三合长生冲位，奔波之象。主出行、迁移、变动，逢冲发动，利交通贸易外务。',
    src: '《渊海子平》',
  },
  'huagai': {
    name: '华盖', luck: '中',
    at: ['辰', '戌', '丑', '未'],
    desc: '三合墓库之支，如帝王车盖。主孤高艺术、宗教玄学缘分，聪明不失厚道。',
    src: '《渊海子平》',
  },
  'jiangxing': {
    name: '将星', luck: '吉',
    at: ['子', '午', '酉', '卯'],
    desc: '三合旺支，统帅之位。主领导才能、掌权得势，文武两相宜。',
    src: '《三命通会》',
  },
  'jiesha': {
    name: '劫煞', luck: '凶',
    at: ['巳', '亥', '寅', '申'],
    desc: '三合绝位，劫夺之煞。主外缘破耗、刚强性急，得制反主武职权势。',
    src: '《三命通会》',
  },
  'wangshen': {
    name: '亡神', luck: '凶',
    at: ['亥', '巳', '申', '寅'],
    desc: '三合临官泄气之支。主心机深沉、城府暗耗，喜文案策略之职，忌官非。',
    src: '《三命通会》',
  },
};

/* ─── 以月支查天干（天德/月德） ─── */
const TIANGAN = '甲乙丙丁戊己庚辛壬癸';
const TIANDE_BY_MONTH = { '寅': '丁', '卯': '申', '辰': '壬', '巳': '辛', '午': '亥', '未': '甲', '申': '癸', '酉': '寅', '戌': '丙', '亥': '乙', '子': '巳', '丑': '庚' };
const YUEDE_BY_MONTH = { '寅': '丙', '午': '丙', '戌': '丙', '申': '壬', '子': '壬', '辰': '壬', '亥': '甲', '卯': '甲', '未': '甲', '巳': '庚', '酉': '庚', '丑': '庚' };

/* ─── 日柱固定神煞 ─── */
const DAYGZ_SET = {
  'kuigang': {
    name: '魁罡', luck: '中',
    set: ['庚辰', '庚戌', '壬辰', '戊戌'],
    desc: '日柱魁罡，性严有威、聪明果断。古谓「魁罡聚会，发福非常」，忌财官显露则破格。',
    src: '《渊海子平》',
  },
  'yinchayangcuo': {
    name: '阴差阳错', luck: '凶',
    set: ['丙子', '丁丑', '戊寅', '辛卯', '壬辰', '癸巳', '丙午', '丁未', '戊申', '辛酉', '壬戌', '癸亥'],
    desc: '阴阳驳杂之日。主处事多乖违、姻缘多波折，婚配宜迟不宜早。',
    src: '《三命通会》',
  },
};

/* ─── 以年支查（孤辰寡宿） ─── */
const GUCHEN = { '亥': '寅', '子': '寅', '丑': '寅', '寅': '巳', '卯': '巳', '辰': '巳', '巳': '申', '午': '申', '未': '申', '申': '亥', '酉': '亥', '戌': '亥' };
const GUASU = { '亥': '戌', '子': '戌', '丑': '戌', '寅': '丑', '卯': '丑', '辰': '丑', '巳': '辰', '午': '辰', '未': '辰', '申': '未', '酉': '未', '戌': '未' };

const PILLAR_SHORT = ['年', '月', '日', '时'];

/**
 * 扫描全盘神煞。返回 perPillar 四柱各自命中的条目列表。
 * 查法口径：以日干查者落所临之支的柱；三合局神煞以年支与日支分别起查（同支可双查），
 * 落其余三柱（不含起查支本身）；天德月德查年月时干；魁罡阴差错只看日柱。
 */
export function scanShensha(ctx) {
  const { gans, zhis, dayGan } = ctx;
  const perPillar = [[], [], [], []];
  const seen = new Set();
  const push = (i, e) => {
    const key = e.id + '@' + i;
    if (seen.has(key)) return;
    seen.add(key);
    perPillar[i].push(e);
  };
  const zhiOf = (z) => zhis.indexOf(z);

  // 以日干查：落对应地支之柱
  for (const id in BY_DAYGAN) {
    const r = BY_DAYGAN[id];
    const target = r.map[dayGan];
    const targets = Array.isArray(target) ? target : [target];
    for (const t of targets) {
      const i = zhiOf(t);
      if (i >= 0) push(i, { id, name: r.name, luck: r.luck, src: r.src, desc: r.desc, note: `日干${dayGan}见${t}，落${PILLAR_SHORT[i]}支` });
    }
  }

  // 三合局神煞：年支、日支各起一次
  for (const id in BY_SANHE) {
    const r = BY_SANHE[id];
    for (const anchor of [0, 2]) {
      const g = SANHE_GROUP[zhis[anchor]];
      if (g === undefined) continue;
      const t = r.at[g];
      for (let i = 0; i < 4; i++) {
        if (i === anchor) continue;
        if (zhis[i] === t) push(i, { id, name: r.name, luck: r.luck, src: r.src, desc: r.desc, note: `${PILLAR_SHORT[anchor]}支${zhis[anchor]}起，见${t}，落${PILLAR_SHORT[i]}支` });
      }
    }
  }

  // 天德 / 月德：以月支查，落年月时干
  const monthZhi = zhis[1];
  const td = TIANDE_BY_MONTH[monthZhi], yd = YUEDE_BY_MONTH[monthZhi];
  for (let i = 0; i < 4; i++) {
    if (i === 2) continue;
    if (gans[i] === td) push(i, { id: 'tiande', name: '天德贵人', luck: '吉', src: '《渊海子平》', desc: '月令生气之德。主心地仁善、逢凶化吉，纵有灾殃亦得解救。', note: `${monthZhi}月生见${td}干，落${PILLAR_SHORT[i]}干` });
    if (gans[i] === yd) push(i, { id: 'yuede', name: '月德贵人', luck: '吉', src: '《渊海子平》', desc: '月令德秀之气。主福寿康宁、行事光明，凶险之处得护持。', note: `${monthZhi}月生见${yd}干，落${PILLAR_SHORT[i]}干` });
  }

  // 日柱固定神煞
  const dayGz = gans[2] + zhis[2];
  for (const id in DAYGZ_SET) {
    const r = DAYGZ_SET[id];
    if (r.set.includes(dayGz)) push(2, { id, name: r.name, luck: r.luck, src: r.src, desc: r.desc, note: `日柱${dayGz}` });
  }

  // 孤辰寡宿：以年支查，落其余三支
  const gc = GUCHEN[zhis[0]], gs = GUASU[zhis[0]];
  for (let i = 1; i < 4; i++) {
    if (zhis[i] === gc) push(i, { id: 'guchen', name: '孤辰', luck: '凶', src: '《三命通会》', desc: '年支前孤之气。主性孤独立、六亲缘淡，宜自立门户。', note: `${zhis[0]}年生见${gc}` });
    if (zhis[i] === gs) push(i, { id: 'guasu', name: '寡宿', luck: '凶', src: '《三命通会》', desc: '年支后寡之气。主心性沉默、婚缘易迟，晚岁宜静养。', note: `${zhis[0]}年生见${gs}` });
  }

  // 冲刑提纲提示（非神煞，但盘面常见关注点）：日支冲月支
  if (ZHI_CHONG[zhis[2]] === zhis[1]) {
    push(2, { id: 'chong-ti', name: '冲提纲', luck: '凶', src: '通行整理本', desc: '日支冲月支（提纲）。主根基动摇、中年多变动，逢流年再冲则应。', note: `日支${zhis[2]}冲月支${zhis[1]}` });
  }

  // 汇总（含 perPillar 索引）
  const all = [];
  perPillar.forEach((list, i) => list.forEach((e) => all.push({ ...e, pillar: i })));
  const ORDER = { '吉': 0, '中': 1, '凶': 2 };
  perPillar.forEach((l) => l.sort((a, b) => ORDER[a.luck] - ORDER[b.luck]));
  return { perPillar, all };
}

export { TIANGAN };
