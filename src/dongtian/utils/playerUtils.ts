import { PlayerStats, RealmType, SectRank } from '../types';
import { REALM_DATA, INITIAL_ITEMS, TALENTS, getRealmMaxExp } from '../constants/index';
import { clampSpiritualRoot } from './numberUtils';
import { combineTalentEffects } from './talentUtils';

/** 随机掷一套五行灵根：5% 天灵根（单根 30-40）/ 15% 地灵根（双主根 15-25）/ 80% 杂灵根（总值 25-45） */
export const rollSpiritualRoots = (): PlayerStats['spiritualRoots'] => {
  const roots = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
  const rootTypes = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
  const rand = Math.random();

  if (rand < 0.05) {
    // 5%概率：天灵根（单一灵根极高）
    const mainRoot = rootTypes[Math.floor(Math.random() * rootTypes.length)];
    roots[mainRoot] = 30 + Math.floor(Math.random() * 11); // 30-40
    const remaining = 25 + Math.floor(Math.random() * 16); // 25-40
    const otherRoots = rootTypes.filter(r => r !== mainRoot);
    for (let i = 0; i < remaining; i++) {
      const randomRoot = otherRoots[Math.floor(Math.random() * otherRoots.length)];
      if (roots[randomRoot] < 10) roots[randomRoot]++;
    }
  } else if (rand < 0.20) {
    // 15%概率：地灵根（双灵根较高）
    const shuffled = [...rootTypes].sort(() => Math.random() - 0.5);
    roots[shuffled[0]] = 15 + Math.floor(Math.random() * 11); // 15-25
    roots[shuffled[1]] = 15 + Math.floor(Math.random() * 11); // 15-25
    const remaining = 15 + Math.floor(Math.random() * 11); // 15-25
    const otherRoots = shuffled.slice(2);
    for (let i = 0; i < remaining; i++) {
      const randomRoot = otherRoots[Math.floor(Math.random() * otherRoots.length)];
      if (roots[randomRoot] < 8) roots[randomRoot]++;
    }
  } else {
    // 80%概率：杂灵根（均匀分布）
    const totalTarget = 25 + Math.floor(Math.random() * 21); // 25-45之间
    rootTypes.forEach(root => { roots[root] = Math.floor(Math.random() * 12); }); // 0-11
    const currentTotal = rootTypes.reduce((sum, r) => sum + roots[r], 0);
    const diff = totalTarget - currentTotal;
    if (diff > 0) {
      for (let i = 0; i < diff; i++) {
        const randomRoot = rootTypes[Math.floor(Math.random() * rootTypes.length)];
        if (roots[randomRoot] < 20) roots[randomRoot]++;
      }
    }
  }

  return {
    metal: clampSpiritualRoot(roots.metal),
    wood: clampSpiritualRoot(roots.wood),
    water: clampSpiritualRoot(roots.water),
    fire: clampSpiritualRoot(roots.fire),
    earth: clampSpiritualRoot(roots.earth),
  };
};

// 创建初始玩家数据
export const createInitialPlayer = (
  name: string,
  talentIds: string[],
  presetSpiritualRoots?: PlayerStats['spiritualRoots']
): PlayerStats => {
  const talents = talentIds.map((id) => TALENTS.find((t) => t.id === id)).filter(Boolean);
  const combinedEffects = combineTalentEffects(talents);
  const talentAttack = combinedEffects.attack || 0;
  const talentDefense = combinedEffects.defense || 0;
  const talentHp = combinedEffects.hp || 0;
  const talentSpirit = combinedEffects.spirit || 0;
  const talentPhysique = combinedEffects.physique || 0;
  const talentSpeed = combinedEffects.speed || 0;
  const talentLuck = combinedEffects.luck || 0;

  const realmData = REALM_DATA[RealmType.QiRefining];

  const initialSpiritualRoots = presetSpiritualRoots ?? rollSpiritualRoots();

  const initialMaxLifespan = realmData.baseMaxLifespan;
  const initialLifespan = initialMaxLifespan; // 初始寿命等于最大寿命

  return {
    name,
    realm: RealmType.QiRefining,
    realmLevel: 1,
    exp: 0,
    maxExp: getRealmMaxExp(RealmType.QiRefining, 1),
    storedExp: 0,
    hp: realmData.baseMaxHp + talentHp,
    maxHp: realmData.baseMaxHp + talentHp,
    attack: realmData.baseAttack + talentAttack,
    defense: realmData.baseDefense + talentDefense,
    spirit: realmData.baseSpirit + talentSpirit,
    physique: realmData.basePhysique + talentPhysique,
    speed: realmData.baseSpeed + talentSpeed,
    spiritStones: 50,
    inventory: [...INITIAL_ITEMS],
    cultivationArts: ['art-basic-breath'], // 初始只有吐纳诀
    unlockedArts: ['art-basic-breath'], // 初始已解锁吐纳诀
    activeArtId: 'art-basic-breath', // 默认激活吐纳诀
    equippedItems: {},
    sectId: null,
    sectRank: SectRank.Outer,
    sectContribution: 0,
    betrayedSects: [], // 背叛过的宗门列表
    sectHuntEndTime: null, // 宗门追杀结束时间
    sectHuntLevel: 0, // 追杀强度等级
    sectHuntSectId: null, // 正在追杀玩家的宗门ID
    sectHuntSectName: null, // 正在追杀玩家的宗门名称
    talentIds: talentIds,
    titleId: 'title-novice', // 初始称号：初入仙途
    unlockedTitles: ['title-novice'], // 初始已解锁的称号
    attributePoints: 0,
    luck: 10 + talentLuck,
    achievements: [],
    pets: [],
    activePetId: null,
    lotteryTickets: 10, // 开局十连抽
    lotteryCount: 0,
    breakthroughFailCount: 0, // 突破失败积累初始为0
    inheritanceLevel: 0,
    dailyTaskCount: {},
    lastTaskResetDate: new Date().toISOString().split('T')[0],
    viewedAchievements: [],
    natalArtifactId: null,
    unlockedRecipes: [], // 已解锁的丹方名称列表
    alchemyLevel: 1, // 炼丹等级
    alchemyProficiency: 0, // 炼丹熟练度
    meditationHpRegenMultiplier: 1.0, // 打坐回血速度加成倍数（默认1.0）
    meditationBoostEndTime: null, // 打坐回血加成结束时间戳（毫秒）
    statistics: {
      killCount: 0,
      meditateCount: 0,
      adventureCount: 0,
      equipCount: 0,
      petCount: 0,
      recipeCount: 0,
      artCount: 0,
      breakthroughCount: 0,
      secretRealmCount: 0,
      alchemyCount: 0,
    },
    lifespan: initialLifespan,
    maxLifespan: initialMaxLifespan,
    spiritualRoots: initialSpiritualRoots,
    // 日常任务系统
    dailyQuests: [],
    dailyQuestProgress: {},
    dailyQuestCompleted: [],
    lastDailyQuestResetDate: '',
    lastDailyQuestResetTime: Date.now(), // 日常任务刷新时间戳（毫秒）
    gameDays: 1, // 游戏内天数，从第1天开始
    playTime: 0, // 游戏时长（毫秒），从0开始
    reputation: 0, // 声望值
    karma: 0, // 初始因果为0
    // 洞府系统
    grotto: {
      level: 0, // 未拥有洞府
      expRateBonus: 0, // 无加成
      autoHarvest: false, // 自动收获关闭
      growthSpeedBonus: 0, // 无生长速度加成
      plantedHerbs: [], // 无种植的灵草
      lastHarvestTime: null, // 无收获记录
      spiritArrayEnhancement: 0, // 聚灵阵改造加成
      herbarium: [], // 灵草图鉴（已收集的灵草名称列表）
      dailySpeedupCount: 0, // 今日已使用加速次数
      lastSpeedupResetDate: new Date().toISOString().split('T')[0], // 上次重置加速次数的日期
    },
    sectMasterId: null, // 当前宗门的宗主ID (如果玩家是宗主，则为玩家自己的ID)
    // 宗门宝库系统
    sectTreasureVault: undefined, // 初始时宝库为空，首次使用钥匙时生成
  };
};
