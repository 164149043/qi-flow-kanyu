<template>
  <div ref="host" class="battle-canvas" :style="{ height: height + 'px' }" />
</template>

<script setup>
  // 像素战斗画布: 野怪 / 世界BOSS / 无尽塔三页共用
  // 职责: 战斗场景渲染 + 攻防动画 + 血条 + 伤害飘字, 不参与任何数值结算
  import { ref, watch, onMounted, onUnmounted } from 'vue'
  import { Container, Sprite, AnimatedSprite, Graphics, Text } from 'pixi.js'
  import { createPixelApp, destroyPixelApp } from '@/game/engine'
  import { buildTextures, loadActorTextures, monsterSpriteKind, monsterTexKey, digitTexture } from '@/game/textures'

  const props = defineProps({
    // 玩家 (store.player 引用)
    player: { type: Object, required: true },
    // 敌方 (野怪/BOSS对象, 可为空)
    enemy: { type: Object, default: null },
    height: { type: Number, default: 260 }
  })

  const host = ref(null)
  let app = null
  let disposed = false

  // 场景引用
  let world = null // 随震屏抖动的世界容器
  let bgG = null // 背景 (夜空/山/地面)
  let playerSpr = null
  let enemySpr = null
  let playerName = null
  let enemyName = null
  let barG = null // 血条 (红条即时 / 白条延迟)

  // 布局
  let playerBaseX = 0
  let enemyBaseX = 0
  let groundY = 0

  // 动画状态
  let queue = [] // 待播放的攻防事件
  let activeAnim = null // { ev, t, hitDone }
  let floats = [] // 伤害飘字 [{ c, x, y, t, life }]
  let flashSpr = null // 受击白闪的精灵
  let flashT = 0
  let shake = 0 // 震屏强度
  let deadAnim = null // 倒地演出 { spr, t }

  // 血条状态
  let enemyMaxHealth = 1
  const bar = {
    // 玩家 (左对齐)
    pRed: 0, pLag: 0,
    // 敌方 (右对齐)
    eRed: 0, eLag: 0,
    w: 0
  }

  const textures = () => buildTextures()
  // 剑客立绘帧 (异步加载)
  let heroTex = null
  // 玩家战斗显示高度 (px)
  const PLAYER_H = 110
  // 暴击技能帧残留时间 (秒, 归零后回待机)
  let skillT = 0

  // 伤害数字压缩 (点阵只有数字和 K M B T)
  const formatDamage = n => {
    n = Math.max(0, Math.floor(n))
    if (n >= 1e12) return '999T+'
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K'
    return String(n)
  }

  // ---------- 场景构建 ----------
  const buildScene = () => {
    world = new Container()
    app.stage.addChild(world)
    bgG = new Graphics()
    world.addChild(bgG)
    // 玩家精灵 (战斗中使用攻击动作立绘 jianxiu/attack, 缺失时回退程序化小人)
    const idleTex = heroTex?.jianxiu?.attack || textures().player[0]
    const hasHero = !!heroTex?.jianxiu?.attack
    playerSpr = new Sprite(idleTex)
    playerSpr.anchor.set(0.5, 1)
    playerSpr.scale.set((hasHero ? PLAYER_H : 64) / playerSpr.height)
    world.addChild(playerSpr)
    // 敌方精灵 (按需重建)
    // 名字与血条不随震屏抖动
    playerName = new Text({ text: props.player?.name || '道友', style: nameStyle(0xe8e0d8) })
    enemyName = new Text({ text: '', style: nameStyle(0xf0a9a0) })
    app.stage.addChild(playerName, enemyName)
    barG = new Graphics()
    app.stage.addChild(barG)
    rebuildEnemy(props.enemy)
    relayout()
    app.renderer.on('resize', relayout)
    app.ticker.add(tick)
  }

  const nameStyle = fill => ({ fontFamily: 'sans-serif', fontSize: 12, fill })

  // 敌方更换 (新野怪/新BOSS/BOSS刷新)
  const rebuildEnemy = enemy => {
    if (disposed || !world) return
    if (enemySpr) {
      world.removeChild(enemySpr)
      enemySpr.destroy()
      enemySpr = null
    }
    deadAnim = null
    queue = []
    activeAnim = null
    enemyName.text = enemy?.name || ''
    if (!enemy) {
      enemyMaxHealth = 1
      return
    }
    // BOSS 带 desc 字段, 用魔尊形态放大
    const isBoss = !!enemy.desc
    // 真素材优先: 按名字映射 mon_<拼音>, BOSS 用 boss_idle; 缺失回退程序化形态
    const tex = isBoss ? heroTex?.boss?.idle : heroTex?.mon?.[monsterTexKey[enemy.name]]
    if (tex) {
      enemySpr = new Sprite(tex)
      enemySpr.anchor.set(0.5, 1)
      // 按显示高度等比缩放 (普通怪 96px, BOSS 150px)
      const h = isBoss ? 150 : 96
      enemySpr.scale.set(h / tex.height)
    } else {
      const frames = isBoss ? textures().boss : textures().monsters[monsterSpriteKind(enemy.name)]
      enemySpr = new AnimatedSprite(frames)
      enemySpr.animationSpeed = 0
      enemySpr.anchor.set(0.5, 1)
      enemySpr.scale.set(isBoss ? 3 : 2, isBoss ? 3 : 2)
    }
    // 面向左
    enemySpr.scale.x = -Math.abs(enemySpr.scale.x)
    world.addChild(enemySpr)
    enemyMaxHealth = Math.max(1, enemy.maxHealth || enemy.maxhealth || enemy.health || 1)
    if (app) {
      enemySpr.position.set(enemyBaseX, groundY)
      drawBars(true)
    }
  }

  // ---------- 布局与背景 ----------
  const relayout = () => {
    if (disposed || !app) return
    const W = app.screen.width
    const H = app.screen.height
    groundY = H * 0.84
    playerBaseX = W * 0.26
    enemyBaseX = W * 0.74
    bar.w = W * 0.36
    playerSpr?.position.set(playerBaseX, groundY)
    enemySpr?.position.set(enemyBaseX, groundY)
    drawBackground(W, H)
    // 名字与血条位置
    playerName.position.set(10, 8)
    enemyName.position.set(W - 10, 8)
    enemyName.anchor.set(1, 0)
    drawBars(true)
  }

  const drawBackground = (W, H) => {
    const g = bgG
    g.clear()
    // 夜空
    g.rect(0, 0, W, H).fill({ color: 0x1a1625 })
    g.rect(0, 0, W, H * 0.4).fill({ color: 0x211b31, alpha: 0.8 })
    // 星
    let seed = 7
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 26; i++) {
      g.rect(Math.floor(rand() * W), Math.floor(rand() * H * 0.5), 2, 2).fill({ color: 0xd8d3c8, alpha: 0.35 + rand() * 0.5 })
    }
    // 月
    g.circle(W * 0.84, H * 0.16, 13).fill({ color: 0xe8e0c8 })
    g.circle(W * 0.84 + 4, H * 0.16 - 2, 11).fill({ color: 0x1a1625, alpha: 0.85 })
    // 远山剪影 (两层)
    g.poly([0, groundY - 10, W * 0.12, H * 0.5, W * 0.3, groundY - 10, W * 0.5, H * 0.42, W * 0.72, groundY - 10, W * 0.86, H * 0.55, W, groundY - 10])
      .fill({ color: 0x2b2440 })
    g.poly([0, groundY, W * 0.18, H * 0.6, W * 0.38, groundY, W * 0.62, H * 0.55, W * 0.82, groundY, W, H * 0.65])
      .fill({ color: 0x241d33 })
    // 地面石板
    g.rect(0, groundY, W, H - groundY).fill({ color: 0x45403a })
    g.rect(0, groundY, W, 3).fill({ color: 0x57514a })
    // 石板缝
    for (let x = 0; x < W; x += 26) {
      g.rect(x, groundY + 3, 1, H - groundY).fill({ color: 0x38332e, alpha: 0.8 })
    }
    g.rect(0, groundY + (H - groundY) / 2, W, 1).fill({ color: 0x38332e, alpha: 0.6 })
    // 草点
    for (let i = 0; i < 18; i++) {
      g.rect(Math.floor(rand() * W), groundY + 4 + Math.floor(rand() * (H - groundY - 8)), 2, 2).fill({ color: 0x556a44, alpha: 0.7 })
    }
  }

  // ---------- 血条 ----------
  const healthRatio = (cur, max) => Math.max(0, Math.min(1, cur / max))

  const drawBars = force => {
    const W = app.screen.width
    const g = barG
    g.clear()
    const y = 26
    const h = 12
    const bw = bar.w
    const pMax = Math.max(1, props.player?.maxHealth || 1)
    const pR = bw * healthRatio(props.player?.health || 0, pMax)
    const eR = bw * healthRatio(props.enemy?.health ?? 0, enemyMaxHealth)
    bar.pRed = pR
    bar.eRed = eR
    if (force) {
      bar.pLag = pR
      bar.eLag = eR
    }
    // 玩家条 (左上, 左对齐)
    g.rect(9, y - 1, bw + 2, h + 2).fill({ color: 0xd8d3c8 })
    g.rect(10, y, bw, h).fill({ color: 0x2c1a18 })
    g.rect(10, y, bar.pLag, h).fill({ color: 0xefe8dd })
    g.rect(10, y, bar.pRed, h).fill({ color: 0xc94436 })
    // 敌方条 (右上, 右对齐)
    const ex = W - 10
    g.rect(ex - bw - 1, y - 1, bw + 2, h + 2).fill({ color: 0xd8d3c8 })
    g.rect(ex - bw, y, bw, h).fill({ color: 0x2c1a18 })
    g.rect(ex - bar.eLag, y, bar.eLag, h).fill({ color: 0xefe8dd })
    g.rect(ex - bar.eRed, y, bar.eRed, h).fill({ color: 0xc94436 })
  }

  // ---------- 飘字 ----------
  const spawnFloat = (text, x, y, color, scale) => {
    const c = new Container()
    let ox = 0
    String(text).split('').forEach(ch => {
      const t = digitTexture(ch, color)
      if (!t) return
      const s = new Sprite(t)
      s.position.set(ox, 0)
      s.scale.set(scale)
      c.addChild(s)
      ox += 4 * scale + scale
    })
    if (!c.children.length) {
      c.destroy()
      return
    }
    c.position.set(x - ox / 2, y)
    world.addChild(c)
    floats.push({ c, x, y, t: 0, life: 0.8 })
  }

  // ---------- 对外 API ----------
  // 播放一次攻防: { attacker: 'player'|'enemy', isHit, damage, isCritical }
  const playRound = ev => {
    queue.push(ev)
  }
  // 敌方倒地 (胜利)
  const victory = () => {
    if (enemySpr) deadAnim = { spr: enemySpr, t: 0, dir: -1 }
  }
  // 玩家倒地 (败北)
  const defeat = () => {
    if (playerSpr) deadAnim = { spr: playerSpr, t: 0, dir: 1 }
  }

  defineExpose({ playRound, victory, defeat })

  // ---------- 主循环 ----------
  const easeOutQuad = t => 1 - (1 - t) * (1 - t)
  const easeInQuad = t => t * t

  const tick = ticker => {
    if (disposed) return
    const dt = Math.min(ticker.deltaMS, 50) / 1000

    // 暴击技能帧展示倒计时, 归零回攻击立绘
    if (skillT > 0) {
      skillT -= dt
      if (skillT <= 0) playerSpr.texture = heroTex?.jianxiu?.attack || textures().player[0]
    }

    // 攻防动画
    if (!activeAnim && queue.length && !deadAnim) {
      activeAnim = { ev: queue.shift(), t: 0, hitDone: false }
      // 玩家起手切攻击帧
      if (activeAnim.ev.attacker === 'player') playerSpr.texture = heroTex?.jianxiu?.attack || textures().player[1]
    }
    if (activeAnim) {
      const a = activeAnim
      // 积压自适应倍速: 动画落后于数值结算时最多 7 倍速追赶
      a.t += dt * (1 + Math.min(queue.length, 6))
      const isPlayer = a.ev.attacker === 'player'
      const atk = isPlayer ? playerSpr : enemySpr
      const def = isPlayer ? enemySpr : playerSpr
      const base = isPlayer ? playerBaseX : enemyBaseX
      const dir = isPlayer ? 1 : -1
      // 冲刺 0.14s -> 命中 -> 回位 0.2s
      let off = 0
      if (a.t < 0.14) off = easeOutQuad(a.t / 0.14) * 40 * dir
      else off = (1 - easeInQuad(Math.min(1, (a.t - 0.14) / 0.2))) * 40 * dir
      atk.x = base + off
      if (!a.hitDone && a.t >= 0.14) {
        a.hitDone = true
        if (a.ev.isHit) {
          flashSpr = def
          flashT = 0.12
          shake = a.ev.isCritical ? 7 : 3
          // 玩家暴击: 切技能爆发帧 0.5 秒
          if (isPlayer && a.ev.isCritical) {
            skillT = 0.5
            // 暴击切技能爆发帧 (与待机同系列 jianxiu, 避免形象跳变)
            playerSpr.texture = heroTex?.jianxiu?.skill || heroTex?.jianxiu?.attack || textures().player[1]
          }
          spawnFloat(
            formatDamage(a.ev.damage) + (a.ev.isCritical ? '!' : ''),
            def.x,
            def.y - (def.height + 12),
            a.ev.isCritical ? '#ffd23e' : '#ffffff',
            a.ev.isCritical ? 3 : 2
          )
        } else {
          // 敌方攻击被闪避: 玩家切跳跃帧表现闪避
          if (!isPlayer) playerSpr.texture = heroTex?.jianxiu?.jump || textures().player[1]
          spawnFloat('MISS', def.x, def.y - (def.height + 12), '#9aa0a6', 2)
        }
      }
      if (a.t >= 0.34) {
        atk.x = base
        activeAnim = null
        // 动画结束回攻击立绘 (暴击技能帧展示期间不打断)
        if (skillT <= 0) playerSpr.texture = heroTex?.jianxiu?.attack || textures().player[0]
      }
    }

    // 受击白闪
    if (flashSpr && flashT > 0) {
      flashT -= dt
      flashSpr.alpha = flashT > 0 ? (Math.floor(flashT * 40) % 2 ? 0.35 : 1) : 1
      if (flashT <= 0) {
        flashSpr.alpha = 1
        flashSpr = null
      }
    }

    // 飘字
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]
      f.t += dt
      f.c.y = f.y - f.t * 55
      f.c.alpha = Math.max(0, 1 - f.t / f.life)
      if (f.t >= f.life) {
        world.removeChild(f.c)
        f.c.destroy({ children: true })
        floats.splice(i, 1)
      }
    }

    // 倒地演出
    if (deadAnim) {
      deadAnim.t += dt
      const s = deadAnim.spr
      s.rotation = deadAnim.dir * Math.min(Math.PI / 2, deadAnim.t * 3)
      s.alpha = Math.max(0.3, 1 - deadAnim.t)
    }

    // 震屏
    world.x = shake > 0.4 ? (Math.random() - 0.5) * shake : 0
    shake *= Math.exp(-6 * dt)

    // 白条追赶红条 (掉血延迟效果)
    const lagK = Math.min(1, dt * 4)
    bar.pLag += (bar.pRed - bar.pLag) * lagK
    bar.eLag += (bar.eRed - bar.eLag) * lagK
    if (Math.abs(bar.pLag - bar.pRed) > 0.5 || Math.abs(bar.eLag - bar.eRed) > 0.5) drawBars()
  }

  // ---------- 响应式同步 ----------
  watch(
    () => props.player?.health,
    () => {
      if (!disposed && app) drawBars()
    }
  )
  watch(
    () => props.enemy?.health,
    () => {
      if (!disposed && app) drawBars()
    }
  )
  watch(
    () => props.enemy,
    nv => rebuildEnemy(nv)
  )
  watch(
    () => props.player?.name,
    nv => {
      if (playerName) playerName.text = nv || '道友'
    }
  )

  onMounted(async () => {
    // 先加载剑客立绘再建场景
    heroTex = await loadActorTextures()
    const app_ = await createPixelApp(host.value, {
      height: props.height,
      resizeTo: host.value,
      background: 0x1a1625
    })
    if (disposed) {
      destroyPixelApp(app_)
      return
    }
    app = app_
    buildScene()
  })

  onUnmounted(() => {
    disposed = true
    if (app) {
      app.ticker.remove(tick)
      destroyPixelApp(app)
      app = null
    }
  })
</script>

<style scoped>
  .battle-canvas {
    width: 100%;
    border: 2px solid var(--el-border-color);
    border-radius: 6px;
    overflow: hidden;
    background-color: #1a1625;
  }

  .battle-canvas :deep(canvas) {
    display: block;
    image-rendering: pixelated;
  }
</style>
