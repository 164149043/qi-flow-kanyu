// 像素世界地图渲染器
// 职责: tilemap 渲染 / 玩家平滑移动 / 相机跟随 / NPC 好感度着色 / 遇怪转场
// 数据来源与游戏逻辑完全解耦, 只依赖 grid 数据结构 [{ his, type }]
import { Container, Sprite, AnimatedSprite, Graphics } from 'pixi.js'
import { createPixelApp, destroyPixelApp } from './engine'
import { TILE, buildTextures, loadActorTextures, wifeTexKey } from './textures'

// 剑客素材显示高度 (px, 约 1.6 格, 素材精细可略大于 tile 小人)
const HERO_H = 52

export class WorldMap {
  // 异步创建 (PixiJS v8 初始化是异步的)
  static async create(el, opts) {
    const app = await createPixelApp(el, {
      width: opts.width,
      height: opts.height,
      background: 0x14121c
    })
    opts.heroTex = await loadActorTextures()
    return new WorldMap(app, opts)
  }

  constructor(app, { grid, gridSize, npcs = [], onTileClick, heroTex }) {
    this.app = app
    this.grid = grid
    this.gridSize = gridSize
    this.npcs = npcs
    this.onTileClick = onTileClick
    this.heroTex = heroTex
    this.textures = buildTextures()
    // 玩家当前朝向
    this.facing = 'front'

    // 世界容器 (相机平移的就是它)
    this.world = new Container()
    app.stage.addChild(this.world)
    // 地形层
    this.terrain = new Container()
    this.world.addChild(this.terrain)
    // 角色层
    this.actors = new Container()
    this.world.addChild(this.actors)
    // 转场黑幕
    this.mask = new Graphics()
    this.mask.rect(0, 0, app.screen.width, app.screen.height)
    this.mask.fill({ color: 0x000000, alpha: 0 })
    app.stage.addChild(this.mask)

    // 每个格子的地形精灵
    this.cells = []
    // 灵泉精灵 (帧动画)
    this.waters = []
    // NPC 精灵 { sprite, index, baseY }
    this.npcSprites = []

    // 玩家渲染坐标 (格, 浮点) 与目标坐标
    this.playerX = 0
    this.playerY = 0
    this.targetX = 0
    this.targetY = 0
    this.walkTimer = 0

    // 相机坐标 (像素)
    this.camX = null
    this.camY = null

    this.build()
    this.bindClick()
    app.ticker.add(this.tick)
  }

  // 根据 type 取地形纹理 (玩家格画草, 玩家由独立精灵渲染)
  tileTexture(cell, index) {
    const textures = this.textures
    const variant = index % 3
    switch (cell.type) {
      case 'obstacle':
        return textures.rock[index % 2]
      case 'fishing':
        return textures.water[0]
      default:
        return textures.grass[variant]
    }
  }

  // 构建整张地图
  build() {
    const size = this.gridSize
    for (let index = 0; index < this.grid.length; index++) {
      const cell = this.grid[index]
      const x = (index % size) * TILE
      const y = Math.floor(index / size) * TILE
      if (cell.type === 'fishing') {
        // 灵泉: 双帧波光
        const water = new AnimatedSprite(this.textures.water)
        water.animationSpeed = 0.06
        water.gotoAndPlay(index % 2)
        water.position.set(x, y)
        this.terrain.addChild(water)
        this.waters.push(water)
        this.cells.push(water)
      } else {
        const sprite = new Sprite(this.tileTexture(cell, index))
        sprite.position.set(x, y)
        this.terrain.addChild(sprite)
        this.cells.push(sprite)
      }
    }

    // NPC 精灵 (道侣真素材按名字映射, 缺失回退程序化; 好感度映射亮度 tint)
    this.npcs.forEach((npc, i) => {
      const x = (npc.position % size) * TILE
      const y = Math.floor(npc.position / size) * TILE
      const tex = this.heroTex?.wife?.[wifeTexKey[npc.name]]
      let sprite
      let baseY
      if (tex) {
        sprite = new Sprite(tex)
        sprite.anchor.set(0.5, 1)
        // 显示高度 46px, 底部对齐格子底
        sprite.scale.set(46 / tex.height)
        sprite.position.set(x + TILE / 2, y + TILE)
        baseY = y + TILE
      } else {
        sprite = new AnimatedSprite(this.textures.npc)
        sprite.animationSpeed = 0.05
        sprite.gotoAndPlay(i % 2)
        sprite.position.set(x, y)
        baseY = y
      }
      // 好感度 0~1000 -> 0.72~1.0 亮度
      const favor = Math.min(npc.favorability || 0, 1000) / 1000
      const light = 184 + Math.round(71 * favor)
      sprite.tint = (light << 16) | (light << 8) | light
      this.actors.addChild(sprite)
      this.npcSprites.push({ sprite, index: npc.position, baseY, phase: i })
    })

    // 玩家精灵 (jianxiu 剑修真素材缺失时回退程序化小人)
    this.player = new Sprite(this.heroTex?.jianxiu?.[this.facing] || this.textures.player[0])
    this.player.anchor.set(0.5, 1)
    this.player.scale.set(HERO_H / this.player.height)
    this.player.position.set(0, 0)
    this.actors.addChild(this.player)

    // 初始位置对齐 + 相机直接就位
    this.snapCamera()
  }

  // 点击命中格子 (保留原版点击空地传送交互)
  bindClick() {
    this.app.canvas.addEventListener('pointerdown', e => {
      if (typeof this.onTileClick !== 'function') return
      const rect = this.app.canvas.getBoundingClientRect()
      const scale = this.app.screen.width / rect.width
      const x = ((e.clientX - rect.left) * scale + this.camX) / TILE
      const y = ((e.clientY - rect.top) * scale + this.camY) / TILE
      const gx = Math.floor(x)
      const gy = Math.floor(y)
      if (gx < 0 || gy < 0 || gx >= this.gridSize || gy >= this.gridSize) return
      this.onTileClick(gy * this.gridSize + gx)
    })
  }

  // 更新玩家目标位置 (walking 动画自动处理)
  setPlayer(x, y) {
    this.targetX = x
    this.targetY = y
  }

  // 传送: 立即就位
  teleport(x, y) {
    this.targetX = this.playerX = x
    this.targetY = this.playerY = y
    this.snapCamera()
  }

  // 格子类型变化 (如钓鱼点被消耗变空地)
  setCell(index) {
    const sprite = this.cells[index]
    if (!sprite) return
    const cell = this.grid[index]
    if (cell.type === 'fishing') {
      const water = new AnimatedSprite(this.textures.water)
      water.animationSpeed = 0.06
      water.position.copyFrom(sprite.position)
      this.terrain.addChild(water)
      this.waters.push(water)
      sprite.destroy()
      this.cells[index] = water
    } else {
      // AnimatedSprite 换静态纹理: 用一个普通 Sprite 替换
      const next = new Sprite(this.tileTexture(cell, index))
      next.position.copyFrom(sprite.position)
      this.terrain.addChild(next)
      sprite.destroy()
      this.cells[index] = next
    }
  }

  // 相机直接对准玩家 (初始 / 传送时)
  snapCamera() {
    const px = this.playerX * TILE + TILE / 2
    const py = this.playerY * TILE + TILE / 2
    this.camX = this.clampCam(px - this.app.screen.width / 2, this.app.screen.width, this.gridSize * TILE)
    this.camY = this.clampCam(py - this.app.screen.height / 2, this.app.screen.height, this.gridSize * TILE)
    this.applyCamera()
  }

  clampCam(value, viewSize, worldSize) {
    if (worldSize <= viewSize) return (worldSize - viewSize) / 2
    return Math.max(0, Math.min(worldSize - viewSize, value))
  }

  applyCamera() {
    this.world.position.set(-Math.round(this.camX), -Math.round(this.camY))
  }

  // 遇怪转场: 黑幕淡入后回调
  flash(callback) {
    this.flashing = { t: 0, callback }
  }

  // 每帧更新: 玩家移动 / 走路帧 / NPC 浮动 / 相机跟随 / 转场
  tick = ticker => {
    const dt = Math.min(ticker.deltaMS, 50) / 1000
    const size = this.gridSize

    // ---- 转场 ----
    // 淡入完成执行回调后必须进入淡出并清空 flashing,
    // 否则 tick 永远停在转场分支 return, 精灵/相机/NPC 全部冻结 (遇怪一次后人物就不再移动)
    if (this.flashing) {
      this.flashing.t += dt
      if (!this.flashing.done) {
        const alpha = Math.min(this.flashing.t / 0.25, 1)
        this.mask.alpha = alpha
        if (alpha >= 1) {
          this.flashing.done = true
          this.flashing.callback && this.flashing.callback()
        }
      } else {
        this.mask.alpha = Math.max(0, this.mask.alpha - dt * 2)
        if (this.mask.alpha <= 0) this.flashing = null
      }
      return
    }

    // ---- 玩家向目标格移动 (10格/秒) ----
    const step = 10 * dt
    const dx = this.targetX - this.playerX
    const dy = this.targetY - this.playerY
    const dist = Math.abs(dx) + Math.abs(dy)
    if (dist > 0.0001) {
      this.playerX += Math.max(-step, Math.min(step, dx))
      this.playerY += Math.max(-step, Math.min(step, dy))
      // 主导轴判定朝向: 横向位移大取左右, 纵向位移大取前后
      const next =
        Math.abs(dx) >= Math.abs(dy)
          ? dx > 0 ? 'right' : 'left'
          : dy > 0 ? 'front' : 'back'
      if (next !== this.facing) {
        this.facing = next
        const tex = this.heroTex?.jianxiu?.[next]
        if (tex) this.player.texture = tex
      }
    } else {
      this.playerX = this.targetX
      this.playerY = this.targetY
    }
    // 底部中心对齐: x=格子中心, y=格子底
    this.player.position.set(
      Math.round(this.playerX * TILE) + TILE / 2,
      Math.round(this.playerY * TILE) + TILE
    )
    // 行走 bob (模拟步伐起伏)
    if (dist > 0.0001) {
      this.bobT = (this.bobT || 0) + ticker.deltaMS / 1000
      this.player.y -= Math.abs(Math.sin(this.bobT * 10)) * 3
    }

    // ---- NPC 原地浮动 (只向上飘, 避免沉入地面) ----
    const time = performance.now() / 1000
    this.npcSprites.forEach(({ sprite, baseY, phase }) => {
      sprite.y = Math.round(baseY - Math.abs(Math.sin(time * 2.2 + phase)) * 2)
    })

    // ---- 相机跟随 (lerp) ----
    if (this.camX === null) {
      this.snapCamera()
      return
    }
    const px = this.playerX * TILE + TILE / 2
    const py = this.playerY * TILE + TILE / 2
    const ease = 1 - Math.exp(-8 * dt)
    const targetCamX = this.clampCam(px - this.app.screen.width / 2, this.app.screen.width, size * TILE)
    const targetCamY = this.clampCam(py - this.app.screen.height / 2, this.app.screen.height, size * TILE)
    this.camX += (targetCamX - this.camX) * ease
    this.camY += (targetCamY - this.camY) * ease
    this.applyCamera()
  }

  destroy() {
    this.app.ticker.remove(this.tick)
    destroyPixelApp(this.app)
    this.app = null
  }
}
