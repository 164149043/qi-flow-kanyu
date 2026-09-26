// 像素纹理工厂: 程序化生成占位像素素材(角色字符画 + 地形程序绘制)
// 后续替换真素材时, 只需保证纹理 key 不变, 渲染层零改动
import { Texture } from 'pixi.js'

// tile 像素尺寸
export const TILE = 32
// 角色字符画网格 (16x16, 每字符 2px 颗粒)
const GRID = 16
const PX = TILE / GRID

// 修仙水墨夜色调色板
export const palette = {
  grassDark: '#2e3b28',
  grass: '#3a4a31',
  grassLight: '#47583a',
  grassTuft: '#556a44',
  rock: '#5b5450',
  rockLight: '#716a64',
  rockDark: '#453f3c',
  rockShadow: '#353030',
  water: '#33587f',
  waterLight: '#4f83b5',
  waterDeep: '#274566',
  sand: '#8a7a5b',
  hair: '#3b2d2d',
  face: '#f0d5b6',
  eye: '#2b2b2b',
  // 白袍剑客 (robe 系被 player/meditate 字符画引用)
  robe: '#ece7de',
  robeDark: '#b5aea1',
  belt: '#c9a227',
  shoe: '#2e2a28',
  sheath: '#4a4e5a',
  dress: '#d977a8',
  dressDark: '#b95e8e',
  // 妖兽 (软体)
  slime: '#6fae4e',
  slimeDark: '#54873a',
  // 妖狼 (走兽)
  beast: '#b5533c',
  beastDark: '#8f3f2e',
  // 妖鸟 (飞禽)
  bird: '#8b6bb5',
  birdDark: '#6f5394',
  // 魔尊 (世界BOSS)
  bossBody: '#3a3340',
  bossDark: '#2a2530',
  bossGold: '#d4a534',
  bossEye: '#ff5a3c',
  // 通用细节
  eyeWhite: '#ffffff',
  fang: '#f5f0e0',
  claw: '#e8d9b0',
  mouth: '#3d2f2f',
  beak: '#e0a83c',
  // 钓鱼
  fish: '#4f9e9b',
  fishDark: '#3a7a77',
  fishLight: '#6fc0bc',
  hook: '#c8cdd4',
  // 秘境探宝
  chest: '#8a5a2b',
  chestDark: '#5e3c1c',
  gold: '#e0b83c',
  mface: '#b5443c',
  mfaceDark: '#7e2e28',
  spike: '#9a948c',
  pit: '#26222e',
  mist: '#4a5268',
  mistLight: '#5a6480',
  tileDark: '#2c2836',
  tileLine: '#221f2b'
}

// 字符画色映射 (角色)
const colorMap = {
  H: palette.hair,
  F: palette.face,
  e: palette.eye,
  Y: palette.robe,
  y: palette.robeDark,
  B: palette.belt,
  S: palette.shoe,
  P: palette.dress,
  p: palette.dressDark,
  // 怪物
  G: palette.slime,
  g: palette.slimeDark,
  R: palette.beast,
  r: palette.beastDark,
  V: palette.bird,
  v: palette.birdDark,
  K: palette.bossBody,
  k: palette.bossDark,
  E: palette.bossEye,
  J: palette.bossGold,
  W: palette.eyeWhite,
  T: palette.fang,
  C: palette.claw,
  M: palette.mouth,
  O: palette.beak,
  N: palette.fish,
  n: palette.fishDark,
  L: palette.fishLight,
  X: palette.hook,
  // 秘境 (全部未占用的单字符, B=belt J=bossGold 已被角色占用)
  Q: palette.chest,
  q: palette.chestDark,
  I: palette.gold,
  U: palette.mface,
  u: palette.mfaceDark,
  A: palette.spike,
  D: palette.pit,
  m: palette.mist,
  l: palette.mistLight,
  Z: palette.tileDark,
  z: palette.tileLine,
  s: palette.sheath
}

// 玩家白衣剑客 2 帧行走 (背剑: 剑柄自左肩后露出, 剑鞘斜跨背后从右腰露出)
const playerFrames = [
  [
    '................',
    '.....HHHHHH.....',
    '..B.HHHHHHHH....',
    '..B.HFFFFFFH....',
    '..SHHeFFFeFH....',
    '..S.HFFFFFFH....',
    '..S..FFFFFF.....',
    '...YYYYYYYYYY.S.',
    '..FYYYYYYYYYYS..',
    '..FYYYYYYYYYYS..',
    '...YYBBBBBBYY...',
    '...yYYYYYYYYy...',
    '....YYYYYYYY....',
    '....YYYYYYYY....',
    '....SS....SS....',
    '................'
  ],
  [
    '................',
    '.....HHHHHH.....',
    '..B.HHHHHHHH....',
    '..B.HFFFFFFH....',
    '..SHHeFFFeFH....',
    '..S.HFFFFFFH....',
    '..S..FFFFFF.....',
    '...YYYYYYYYYY.S.',
    '..FYYYYYYYYYYS..',
    '..FYYYYYYYYYYS..',
    '...YYBBBBBBYY...',
    '...yYYYYYYYYy...',
    '....YYYYYYYY....',
    '....YYYYYYYY....',
    '...SS......SS...',
    '................'
  ]
]

// NPC 仙子 2 帧 (粉衣, 长发)
const npcFrames = [
  [
    '................',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HFFFFFFH....',
    '....HeFFFeFH....',
    '....HFFFFFFH....',
    '....HHFFFFHH....',
    '...HHPPPPPPHH...',
    '..FPPPPPPPPPPF..',
    '..FPPPPPPPPPPF..',
    '...PPBBBBBBPP...',
    '...pPPPPPPPPp...',
    '....PPPPPPPP....',
    '....PPPPPPPP....',
    '.....SS..SS.....',
    '................'
  ],
  [
    '................',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HFFFFFFH....',
    '....HeFFFeFH....',
    '....HFFFFFFH....',
    '....HHFFFFHH....',
    '...HHPPPPPPHH...',
    '..FPPPPPPPPPPF..',
    '..FPPPPPPPPPPF..',
    '...PPBBBBBBPP...',
    '...pPPPPPPPPp...',
    '....PPPPPPPP....',
    '....PPPPPPPP....',
    '....SS....SS....',
    '................'
  ]
]

// 妖兽 (软体系) 2 帧: 常态 / 压扁弹动
const slimeFrames = [
  [
    '................',
    '................',
    '................',
    '................',
    '.....GGGGGG.....',
    '....GGGGGGGG....',
    '...GGGGGGGGGG...',
    '..GGGGGGGGGGGG..',
    '..GWeGGGGGGeWG..',
    '..GWeGGGGGGeWG..',
    '..GGGGGGGGGGGG..',
    '..GGGGMMMMGGGG..',
    '..gGGGGGGGGGGg..',
    '...gGGGGGGGGg...',
    '...ggGGGGGGgg...',
    '....gggggggg....'
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....GGGGGGGG....',
    '...GGGGGGGGGG...',
    '..GGGGGGGGGGGG..',
    '.GWeGGGGGGeWGG..',
    '.GWeGGGGGGeWGG..',
    '.GGGGGGGGGGGGGG.',
    '.GGGGGMMMMGGGGG.',
    '.gGGGGGGGGGGGGg.',
    '..gGGGGGGGGGGg..',
    '..ggGGGGGGGGgg..',
    '...gggggggggg...'
  ]
]

// 妖狼 (走兽系, 面朝左) 2 帧: 站立 / 前扑
const beastFrames = [
  [
    '..R..........R..',
    '..RR........RR..',
    '..RRR......RRR..',
    '..RRRRRRRRRRRR..',
    '.RRRRRRRRRRRRRR.',
    '.RWeRRRRRRRRRRR.',
    '.RRRRRRRRRRRTTR.',
    '.RRRRRRRRRRRRRR.',
    '..RRRRRRRRRRRR..',
    '..rRRRRRRRRRRr..',
    '..rRRRRRRRRRRr..',
    '..RRRRRRRRRRRR..',
    '..RRRR....RRRR..',
    '..RRRR....RRRR..',
    '..CCCC....CCCC..',
    '................'
  ],
  [
    '..R..........R..',
    '..RR........RR..',
    '..RRR......RRR..',
    '..RRRRRRRRRRRR..',
    '.RRRRRRRRRRRRRR.',
    '.RWeRRRRRRRRRRR.',
    '.RRRRRRRRRRRTTR.',
    '.RRRRRRRRRRRRRR.',
    '..RRRRRRRRRRRR..',
    '..rRRRRRRRRRRr..',
    '..rRRRRRRRRRRr..',
    '..RRRRRRRRRRRR..',
    '.RRRR......RRRR.',
    '.RRRR......RRRR.',
    '.CCCC......CCCC.',
    '................'
  ]
]

// 妖鸟 (飞禽系, 面朝左) 2 帧: 展翅上 / 振翅下
const birdFrames = [
  [
    '.V...........V..',
    '.VV.........VV..',
    '.VVV.......VVV..',
    '.VVVV.....VVVV..',
    '..VVVVV.VVVVV...',
    '...VVVVVVVVVV...',
    '....VVVVVVVV....',
    '...OVVeWVVVV....',
    '....VVVVVVVV....',
    '....vVVVVVVv....',
    '.....vVVVVv.....',
    '.....vVVVVv.....',
    '......vvvv......',
    '......vvvv......',
    '.....C....C.....',
    '................'
  ],
  [
    '................',
    '................',
    '.VVVV.....VVVV..',
    '.VVVVV...VVVVV..',
    '..VVVVV.VVVVV...',
    '..VVVVVVVVVVVV..',
    '...VVVVVVVVVV...',
    '...OVVeWVVVV....',
    '....VVVVVVVV....',
    '....vVVVVVVv....',
    '.....vVVVVv.....',
    '.....vVVVVv.....',
    '......vvvv......',
    '......vvvv......',
    '.....C....C.....',
    '................'
  ]
]

// 魔尊 (世界BOSS, 面朝左) 2 帧: 双角金翼
const bossFrames = [
  [
    '..K.........K...',
    '..KK.......KK...',
    '..KKK.....KKK...',
    '..KKKKKKKKKKK...',
    '.KKKKKKKKKKKKK..',
    '.KEEKKKKKKKEEK..',
    '.KKKKKKKKKKKKK..',
    'JKKJKKKKKKKJKKJ.',
    'JKKKKKKKKKKKKKJ.',
    '.KKKKKKKKKKKKK..',
    '.kKKKKKKKKKKKk..',
    '..KKKKKKKKKKK...',
    '..KKKKKKKKKKK...',
    '..KKKK....KKKK..',
    '..kkkk....kkkk..',
    '................'
  ],
  [
    '..K.........K...',
    '..KK.......KK...',
    '..KKK.....KKK...',
    '..KKKKKKKKKKK...',
    '.KKKKKKKKKKKKK..',
    '.KKKKKKKKKKKKK..',
    '.KEEKKKKKKKEEK..',
    '.JKKJKKKKJKKJJ..',
    '.KKKKKKKKKKKKK..',
    '.KKKKKKKKKKKKK..',
    '.kKKKKKKKKKKKk..',
    '..KKKKKKKKKKK...',
    '..KKKKKKKKKKK...',
    '..KKKK....KKKK..',
    '..kkkk....kkkk..',
    '................'
  ]
]

// 玩家白衣剑客盘坐 2 帧 (打坐修炼, 呼吸起伏, 剑仍负于背后)
const meditateFrames = [
  [
    '................',
    '.....HHHHHH.....',
    '..B.HHHHHHHH....',
    '..B.HFFFFFFH....',
    '..SHHeFFFeFH....',
    '..S.HFFFFFFH....',
    '..S..FFFFFF.....',
    '....YYYYYYYY....',
    '...YYYYYYYYYY...',
    '..FYYYYYYYYYYF..',
    '..FYYBBBBBBYYF..',
    '..YYYYYYYYYYYY..',
    '.YYYYyYYYYyYYYY.',
    '.YYYyyyyyyyyYYY.',
    '..yyyyyyyyyyyy..',
    '................'
  ],
  [
    '................',
    '................',
    '.....HHHHHH.....',
    '..B.HHHHHHHH....',
    '..B.HFFFFFFH....',
    '..SHHeFFFeFH....',
    '..S.HFFFFFFH....',
    '.....FFFFFF.....',
    '....YYYYYYYY....',
    '...YYYYYYYYYY...',
    '..FYYYYYYYYYYF..',
    '..FYYBBBBBBYYF..',
    '..YYYYYYYYYYYY..',
    '.YYYYyYYYYyYYYY.',
    '.YYYyyyyyyyyYYY.',
    '..yyyyyyyyyyyy..'
  ]
]

// 灵鱼 2 帧 (钓鱼玩法, 面朝左, 尾摆摆动)
const fishFrames = [
  [
    '................',
    '................',
    '................',
    '.....NNNNN......',
    '....NNNNNNN.N...',
    '...LWeNNNNNNn...',
    '..NNNNNNNNNNn.N.',
    '..NNNNNNNNNNNNN.',
    '..MnNNNNNNNNn.N.',
    '...NNNNNNNNNn.N.',
    '....NNNNNNN.N...',
    '.....NNNNN......',
    '................',
    '................',
    '................',
    '................'
  ],
  [
    '................',
    '................',
    '................',
    '.....NNNNN......',
    '....NNNNNNN.....',
    '...LWeNNNNNN....',
    '..NNNNNNNNNNn.N.',
    '..NNNNNNNNNNNNN.',
    '..MnNNNNNNNNn.N.',
    '...NNNNNNNNNNN..',
    '....NNNNNN.N....',
    '.....NNNN.N.....',
    '................',
    '................',
    '................',
    '................'
  ]
]

// 鱼钩 (钓鱼玩法, 竖钓线 + 大弯 J 形钩, 钩尖上翘带倒刺)
const hookFrames = [
  [
    '.......XX.......',
    '.......XX.......',
    '.......XX.......',
    '.......XX.......',
    '.......XX.......',
    '.......XX.......',
    '.......XX.......',
    '.......XX.......',
    '......XXX.......',
    '.....LXX........',
    '....LXX.........',
    '...LXX..........',
    '...XXX..........',
    '...XXXXX........',
    '.....XXXXXX.....',
    '.........XXX....'
  ]
]

// ---------- 秘境探宝图标 ----------
// 宝箱 (reward)
const chestSprite = [
  '................',
  '................',
  '................',
  '................',
  '...QQQQQQQQQQ...',
  '..QbbbbbbbbbbQ..',
  '..QQQQQQQQQQQQ..',
  '..QbbbbIQQIbbbQ.',
  '..QbbbbIQQIbbbQ.',
  '..QQQQQQQQQQQQ..',
  '..QbbbbbbbbbbQ..',
  '..QbbbbbbbbbbQ..',
  '..QQQQQQQQQQQQ..',
  '................',
  '................',
  '................'
]
// 怪物脸 (monster)
const monsterFaceSprite = [
  '................',
  '...UU......UU...',
  '...UUU....UUU...',
  '..UUUUUUUUUUUU..',
  '.UUUUUUUUUUUUUU.',
  '.UUWUUUUUUUUWUU.',
  '.UUeUUUUUUUUeUU.',
  '.UUUUUUUUUUUUUU.',
  '.UUUUuuuuuuUUUU.',
  '..UUUTUUUUTUUU..',
  '..UUUuUUUUuUUU..',
  '...UUUUUUUUUU...',
  '....uu.uu.uu....',
  '................',
  '................',
  '................'
]
// 尖刺陷阱 (trap)
const trapSprite = [
  '................',
  '................',
  '................',
  '..A....A....A...',
  '..A...AAA...A...',
  '.AAA..AAA..AAA..',
  '.AAA.AAAAA.AAA..',
  'AAAAAAAAAAAAAAA.',
  'AAaAAAAAAAAaAAA.',
  'DDDDDDDDDDDDDDD.',
  'DDDDDDDDDDDDDDD.',
  '.DDDDDDDDDDDDD..',
  '................',
  '................',
  '................',
  '................'
]
// 问号事件 (event)
const eventSprite = [
  '................',
  '................',
  '.....IIIIII.....',
  '....I......I....',
  '..........II....',
  '.........II.....',
  '........II......',
  '.......II.......',
  '......II........',
  '......II........',
  '................',
  '......II........',
  '......II........',
  '................',
  '................',
  '................'
]
// 迷雾 (未翻开格子)
const mistSprite = [
  'mmMmmlmmmMmmllmm',
  'MmmllmmmMmllmmmm',
  'mmMmmmlmmmMmmlmm',
  'mllmmmMmmllmmmMm',
  'mmmmMmmllmmmMmml',
  'MmmllmmmMmmllmmm',
  'mmMmmmlmmmMmmlmm',
  'mllmmmMmmllmmmMm',
  'mmmMmmllmmmMmmlm',
  'MmmllmmmMmmllmmm',
  'mmMmmmlmmmMmmllm',
  'mllmmmMmmllmmmMm',
  'mmmMmmllmmmMmmlm',
  'MmmllmmmMmmlmmmm',
  'mmMmmmlmmmMmllmm',
  'mllmmmMmmllmmmMm'
]
// 暗地砖 (已翻开的空地)
const floorTileSprite = [
  'ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZZZZZZZZZ',
  'zzzzzzzzzzzzzzzz',
  'ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZZZZZZZZZ',
  'ZZZZZZZZZZZZZZZZ',
  'ZZZZZzZZZZZZZZZZ',
  'ZZZZZzZZZZZZZZZZ',
  'ZZZZZzZZZZZZZZZZ',
  'ZZZZZzZZZZZZZZZZ',
  'zzzzzzzzzzzzzzzz'
]

// ---------- 鱼种图鉴 (单帧, 摆尾用缩放振动画) ----------
// 银鳞小鱼 (最常见)
const silverFishSprite = [
  '................',
  '................',
  '................',
  '.....WWWWW......',
  '....WWWWWWW.....',
  '...WeWWWWWWN....',
  '..WWWWWWWWWWN.N.',
  '..WWWWWWWWWWWWW.',
  '..MWWWWWWWWWn.N.',
  '...WWWWWWWWN....',
  '....WWWWWN......',
  '.....NNN........',
  '................',
  '................',
  '................',
  '................'
]
// 赤尾鲤 (红尾)
const redCarpSprite = [
  '................',
  '................',
  '................',
  '.....RRRRR......',
  '....RRRRRRR.....',
  '...WeRRRRRRu....',
  '..RRRRRRRRRuu.U.',
  '..RRRRRRRRRuuUU.',
  '..MRRRRRRRRu.U..',
  '...RRRRRRRuu....',
  '....RRRRR.U.....',
  '.....RRR........',
  '................',
  '................',
  '................',
  '................'
]
// 幽蓝灯鱼 (额前发光点)
const blueLanternSprite = [
  '................',
  '......LLL.......',
  '.....L...L......',
  '....VBLBVV......',
  '....VBBBBVV.....',
  '...WeBBBBBBv....',
  '..VBBBBBBBBBv.V.',
  '..VBBBBBBBBBvvV.',
  '..MBVBBBBBBBv.V.',
  '...VBBBBBBBv....',
  '....VBBBBV......',
  '.....VVV........',
  '................',
  '................',
  '................',
  '................'
]
// 紫电鳗 (细长波浪身)
const purpleEelSprite = [
  '................',
  '................',
  '................',
  '....EE..........',
  '....EE.E........',
  '...WeEEE.E......',
  '...EEEEE.E.E....',
  '....EEEE.E.E.E..',
  '....MEE..EEE.E..',
  '.....EE....E....',
  '.....EE.........',
  '................',
  '................',
  '................',
  '................',
  '................'
]
// 河豚 (圆胖带刺)
const pufferSprite = [
  '................',
  '................',
  '....A...A...A...',
  '...AAAAAAAAA....',
  '...AWWAAAAAAAA..',
  '..AAWAAAAAAA.A..',
  '..AAAAAAAAAAA.A.',
  '..AAAAAMAAAAAAA.',
  '..AAAAAAAAAAA.A.',
  '..pAAAAAAAAA.A..',
  '...pAAAAAAA.....',
  '....AAAAA.......',
  '.....pp.........',
  '................',
  '................',
  '................'
]
// 金鳞龙鲤 (传说, 大而金红)
const goldKoiSprite = [
  '................',
  '................',
  '....JJJJJJ......',
  '...JJJJJJJJ.....',
  '..WeJJJJJJJJ....',
  '..JJUJJJJJJJ....',
  '.JJJJJUJJJJJJ.U.',
  '.JJJJJJJJJJJUUU.',
  '.MJUJJJUJJJJ.U..',
  '.JJJJJJJJJJUU...',
  '..JJJJJJJJ.U....',
  '...JJJJJJ.......',
  '....JJJJ........',
  '................',
  '................',
  '................'
]

// 3x5 点阵字形 (伤害飘字 / MISS)
const FONT_3X5 = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  K: ['101', '101', '110', '101', '101'],
  M: ['101', '111', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  S: ['111', '100', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
  '!': ['010', '010', '010', '000', '010']
}

// 点阵字符纹理 (带色缓存)
const digitCache = new Map()
export const digitTexture = (ch, color) => {
  const key = ch + color
  if (digitCache.has(key)) return digitCache.get(key)
  const glyph = FONT_3X5[ch]
  if (!glyph) return null
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 5
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  glyph.forEach((row, y) => {
    row.split('').forEach((c, x) => {
      if (c === '1') ctx.fillRect(x, y, 1, 1)
    })
  })
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  if (texture.source.style) texture.source.style.scaleMode = 'nearest'
  digitCache.set(key, texture)
  return texture
}

// 名字 hash (djb2), 同名怪形态稳定
const hashName = name => {
  let h = 5381
  const s = String(name || '')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// 按怪物名选形态
export const monsterSpriteKind = name => ['slime', 'beast', 'bird'][hashName(name) % 3]

// 离屏画布
const makeCanvas = (size = TILE) => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

// 字符画 -> 画布
const paintSprite = rows => {
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')
  rows.forEach((row, y) => {
    row.split('').forEach((ch, x) => {
      const color = colorMap[ch]
      if (!color) return
      ctx.fillStyle = color
      ctx.fillRect(x * PX, y * PX, PX, PX)
    })
  })
  return canvas
}

// 确定性伪随机 (mulberry32), 保证同一格子每次渲染结果一致
const seededRandom = seed => {
  let a = seed + 0x6d2b79f5
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 草地 tile (带变体噪声)
const paintGrass = variantSeed => {
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')
  const rand = seededRandom(variantSeed)
  // 底色
  ctx.fillStyle = palette.grass
  ctx.fillRect(0, 0, TILE, TILE)
  // 色斑
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rand() > 0.5 ? palette.grassDark : palette.grassLight
    ctx.fillRect(Math.floor(rand() * GRID) * PX, Math.floor(rand() * GRID) * PX, PX, PX)
  }
  // 草簇
  for (let i = 0; i < 4; i++) {
    const gx = Math.floor(rand() * (GRID - 1)) * PX
    const gy = Math.floor(rand() * (GRID - 2)) * PX
    ctx.fillStyle = palette.grassTuft
    ctx.fillRect(gx, gy, PX, PX)
    ctx.fillRect(gx + PX, gy + PX, PX, PX)
    ctx.fillRect(gx, gy + PX * 0, PX, PX)
  }
  return canvas
}

// 山石 tile
const paintRock = variantSeed => {
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')
  const rand = seededRandom(variantSeed)
  // 草底
  ctx.fillStyle = palette.grass
  ctx.fillRect(0, 0, TILE, TILE)
  ctx.fillStyle = palette.grassDark
  ctx.fillRect(0, TILE - PX, TILE, PX)
  // 两块石头
  const stone = (cx, cy, w, h) => {
    // 主体
    ctx.fillStyle = palette.rock
    ctx.fillRect(cx, cy, w, h)
    // 阴影
    ctx.fillStyle = palette.rockDark
    ctx.fillRect(cx, cy + h - PX, w, PX)
    ctx.fillRect(cx + w - PX, cy, PX, h)
    // 高光
    ctx.fillStyle = palette.rockLight
    ctx.fillRect(cx + PX, cy + PX, w - PX * 3, PX)
    ctx.fillRect(cx + PX, cy + PX, PX, h - PX * 3)
    // 底部落影
    ctx.fillStyle = palette.rockShadow
    ctx.fillRect(cx - PX, cy + h, w + PX * 2, PX)
  }
  const ox = Math.floor(rand() * 3) * 2
  stone(PX * 3 + ox, PX * 5, PX * 7, PX * 6)
  stone(PX * 11 + ox, PX * 7, PX * 4, PX * 4)
  return canvas
}

// 灵泉 tile (2 帧波光)
const paintWater = frame => {
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')
  const rand = seededRandom(frame === 0 ? 999 : 1337)
  // 草底
  ctx.fillStyle = palette.grass
  ctx.fillRect(0, 0, TILE, TILE)
  // 池塘 (圆形)
  const cx = TILE / 2
  const cy = TILE / 2
  const r = TILE / 2 - PX
  // 岸边沙
  ctx.fillStyle = palette.sand
  ctx.beginPath()
  ctx.arc(cx, cy, r + PX, 0, Math.PI * 2)
  ctx.fill()
  // 水面
  ctx.fillStyle = palette.water
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  // 深水
  ctx.fillStyle = palette.waterDeep
  ctx.beginPath()
  ctx.arc(cx + PX, cy + PX, r - PX * 2, 0, Math.PI * 2)
  ctx.fill()
  // 波光 (两帧位置不同)
  ctx.fillStyle = palette.waterLight
  const waves = frame === 0 ? [[3, 5], [6, 8]] : [[4, 7], [7, 5]]
  waves.forEach(([wx, wy]) => {
    ctx.fillRect(wx * PX, wy * PX, PX * 2, PX / 2)
  })
  // 边缘小石子
  ctx.fillStyle = palette.rockLight
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(Math.floor(rand() * GRID) * PX, Math.floor(rand() * GRID) * PX, PX, PX)
  }
  return canvas
}

// canvas -> nearest 采样纹理
const toTexture = canvas => {
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  if (texture.source.style) texture.source.style.scaleMode = 'nearest'
  return texture
}

// 模块级纹理缓存 (避免重复创建 / 组件销毁后失效)
let cache = null

// 构建全部纹理 (只构建一次)
export const buildTextures = () => {
  if (cache) return cache
  cache = {
    // 地形
    grass: [paintGrass(1), paintGrass(2), paintGrass(3)].map(toTexture),
    rock: [paintRock(11), paintRock(22)].map(toTexture),
    water: [paintWater(0), paintWater(1)].map(toTexture),
    // 角色
    player: playerFrames.map(paintSprite).map(toTexture),
    npc: npcFrames.map(paintSprite).map(toTexture),
    // 战斗 (怪物形态 + 世界BOSS)
    monsters: {
      slime: slimeFrames.map(paintSprite).map(toTexture),
      beast: beastFrames.map(paintSprite).map(toTexture),
      bird: birdFrames.map(paintSprite).map(toTexture)
    },
    boss: bossFrames.map(paintSprite).map(toTexture),
    // 修炼 (打坐)
    meditate: meditateFrames.map(paintSprite).map(toTexture),
    // 钓鱼 (灵鱼 2 帧 + 鱼钩 + 鱼种图鉴)
    fish: fishFrames.map(paintSprite).map(toTexture),
    hook: hookFrames.map(paintSprite).map(toTexture),
    fishKindsTex: {
      silver: toTexture(paintSprite(silverFishSprite)),
      qing: toTexture(paintSprite(fishFrames[0])),
      red: toTexture(paintSprite(redCarpSprite)),
      blue: toTexture(paintSprite(blueLanternSprite)),
      eel: toTexture(paintSprite(purpleEelSprite)),
      puffer: toTexture(paintSprite(pufferSprite)),
      koi: toTexture(paintSprite(goldKoiSprite))
    },
    // 秘境探宝图标
    realm: {
      reward: toTexture(paintSprite(chestSprite)),
      monster: toTexture(paintSprite(monsterFaceSprite)),
      trap: toTexture(paintSprite(trapSprite)),
      event: toTexture(paintSprite(eventSprite)),
      mist: toTexture(paintSprite(mistSprite)),
      floor: toTexture(paintSprite(floorTileSprite))
    },
    // 原始画布 (图例用)
    canvases: {
      grass: paintGrass(1),
      rock: paintRock(11),
      water: paintWater(0),
      player: paintSprite(playerFrames[0]),
      npc: paintSprite(npcFrames[0])
    }
  }
  return cache
}

// ---------- 素材名字映射 (中文名 -> assets 目录拼音 key) ----------
// 怪物名 -> mon_<拼音> (monster.js monster_Names 四档)
export const monsterTexKey = {
  影魅狸奴: 'yingmei', 幽谷灵蛇: 'yougu', 雾隐狐仙: 'wuyin', 松间灵猴: 'songjian',
  月影蝠妖: 'yueying', 山涧蛟童: 'shanjian', 林涧鹿灵: 'linjian', 岩隙石精: 'yanxi',
  风鸣鹤怪: 'fengming', 翠竹蛙仙: 'cuizhu',
  青龙啸天: 'qinglong', 白虎破晓: 'baihu', 朱雀焚翼: 'zhuque', 玄武镇海: 'xuanwu',
  麒麟踏瑞: 'qilin', 凤凰涅槃: 'fenghuang', 毕方炽焰: 'bifang', 貔貅吞金: 'pixiu',
  白泽知世: 'baize', 狻猊御火: 'suanni',
  伏羲天帝: 'fuxi', 女娲圣母: 'nvwa', 昊天玉皇: 'haotian', 太上老君: 'taishang',
  东华帝君: 'donghua', 西王母后: 'xiwangmu', 神农炎帝: 'shennong', 轩辕黄帝: 'xuanyuan',
  瑶姬仙子: 'yaoji', 真武大帝: 'zhenwu',
  混沌始元尊: 'hundun', 乾坤造物主: 'qiankun', 宇宙创生神: 'yuzhou', 万灵始祖皇: 'wanling',
  鸿蒙创世者: 'hongmeng', 无极造化君: 'wuji', 太虚衍化神: 'taixu', 元始天尊祖: 'yuanshi',
  虚空造物圣: 'xukong', 界域开辟者: 'jieyu'
}
// 道侣名 -> wife_<拼音> (npc.js npcNames)
export const wifeTexKey = {
  云渺仙子: 'yunmiao', 琉光幽姬: 'liuguang', 烟霞仙子: 'yanxia', 清韵灵姬: 'qingyun',
  碧落灵仙: 'biluo', 绮霞灵女: 'qixia', 瑶光雪姬: 'yaoguang', 琉璃雪姬: 'liuli',
  幽篁雪姬: 'youhuang', 雪舞灵姬: 'xuewu'
}

// ---------- 真素材角色帧 (AI生成素材切片, 每角色8帧) ----------
import { Assets } from 'pixi.js'

// Vite 收集全部帧图 URL
const frameUrls = import.meta.glob('./assets/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
})

// 取 './assets/jianxiu/front.png' -> { role: 'jianxiu', pose: 'front' }
const parseFrameKey = path => {
  const m = path.match(/assets\/(\w+)\/(\w+)\.png$/)
  return m ? { role: m[1], pose: m[2] } : null
}

// 角色帧缓存: { [role]: { [pose]: Texture } }
let actorCache = null

// 异步加载全部角色帧 (PixiJS v8 Assets API, 模块级缓存只加载一次)
export const loadActorTextures = async () => {
  if (actorCache) return actorCache
  const entries = Object.entries(frameUrls)
    .map(([path, url]) => ({ parsed: parseFrameKey(path), url: `${url}?v=3` }))
    .filter(e => e.parsed)
  const result = {}
  await Promise.all(
    entries.map(async ({ parsed, url }) => {
      const { role, pose } = parsed
      result[role] = result[role] || {}
      // 单张加载失败跳过 (文件被删/损坏时不拖垮整体)
      result[role][pose] = await Assets.load(url).catch(() => null)
    })
  )
  actorCache = result
  return result
}

// 按角色/姿势取素材 URL (供 template img 直接使用, 如地图图例)
export const assetUrl = (role, pose) => frameUrls[`./assets/${role}/${pose}.png`]

// 图例图标 (dataURL, 供 template 的 img 使用)
export const legendIcons = () => {
  const textures = buildTextures()
  const toURL = canvas => {
    // 放大一倍便于辨认
    const big = makeCanvas(TILE * 2)
    const ctx = big.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, 0, 0, TILE * 2, TILE * 2)
    return big.toDataURL()
  }
  return {
    player: toURL(textures.canvases.player),
    npc: toURL(textures.canvases.npc),
    fishing: toURL(textures.canvases.water),
    obstacle: toURL(textures.canvases.rock),
    empty: toURL(textures.canvases.grass)
  }
}

// 鱼种图鉴定义 (页面结算与画布形象共用, rarity 总和 = 1)
export const FISH_KINDS = [
  { key: 'silver', name: '银鳞小鱼', price: 80, rarity: 0.42, desc: '最常见的灵鱼, 银光闪闪, 是钓鱼入门的口粮。' },
  { key: 'qing', name: '青灵鲤', price: 150, rarity: 0.25, desc: '水泽灵气所化的青鲤, 传说食之明目。' },
  { key: 'red', name: '赤尾鲤', price: 250, rarity: 0.14, desc: '尾如火焰的赤鲤, 力大善游, 极难牵住。' },
  { key: 'blue', name: '幽蓝灯鱼', price: 400, rarity: 0.08, desc: '额前悬着一盏幽蓝灯, 深水引路的灵物。' },
  { key: 'eel', name: '紫电鳗', price: 600, rarity: 0.06, desc: '身缠紫电的鳗灵, 上钩时水面噼啪作响。' },
  { key: 'puffer', name: '云纹河豚', price: 800, rarity: 0.03, desc: '圆滚滚的云纹河豚, 气鼓鼓地守着灵泉。' },
  { key: 'koi', name: '金鳞龙鲤', price: 1500, rarity: 0.02, desc: '跃过龙门之鲤, 金鳞灼灼, 千载难逢。' }
]

// 鱼种图标 (dataURL, 供结算弹窗展示)
export const fishIcons = () => {
  const toURL = canvas => {
    const big = document.createElement('canvas')
    big.width = 64
    big.height = 64
    const ctx = big.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, 0, 0, 64, 64)
    return big.toDataURL()
  }
  return {
    silver: toURL(paintSprite(silverFishSprite)),
    qing: toURL(paintSprite(fishFrames[0])),
    red: toURL(paintSprite(redCarpSprite)),
    blue: toURL(paintSprite(blueLanternSprite)),
    eel: toURL(paintSprite(purpleEelSprite)),
    puffer: toURL(paintSprite(pufferSprite)),
    koi: toURL(paintSprite(goldKoiSprite))
  }
}

// 秘境格子图标 (dataURL, 供 SecretRealm 模板的 img/label 使用)
export const realmIcons = () => {
  const toURL = canvas => {
    const big = document.createElement('canvas')
    big.width = 64
    big.height = 64
    const ctx = big.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, 0, 0, 64, 64)
    return big.toDataURL()
  }
  return {
    reward: toURL(paintSprite(chestSprite)),
    monster: toURL(paintSprite(monsterFaceSprite)),
    trap: toURL(paintSprite(trapSprite)),
    event: toURL(paintSprite(eventSprite)),
    mist: toURL(paintSprite(mistSprite)),
    floor: toURL(paintSprite(floorTileSprite))
  }
}
