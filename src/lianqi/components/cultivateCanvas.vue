<template>
  <div ref="host" class="cultivate-canvas" :style="{ height: height + 'px' }" />
</template>

<script setup>
  // 像素修炼场景: 打坐修士 + 灵气粒子汇聚 + 突破/转生演出
  // 纯演出层, 不参与修为数值结算
  import { ref, watch, onMounted, onUnmounted } from 'vue'
  import { Container, Sprite, Graphics, Text } from 'pixi.js'
  import { createPixelApp, destroyPixelApp } from '@/game/engine'
  import { buildTextures, loadActorTextures } from '@/game/textures'
  import { levelNames } from '@/plugins/game'

  const props = defineProps({
    // 玩家数据引用 (读修为进度/境界)
    player: { type: Object, required: true },
    // 是否修炼中
    cultivating: { type: Boolean, default: false },
    // 画布高度
    height: { type: Number, default: 180 }
  })

  const host = ref(null)
  let app = null
  let disposed = false
  // 场景引用
  let world = null
  let bgG = null
  let flashG = null
  let sitSpr = null
  let realmText = null
  // 粒子/演出状态
  let particles = []
  let spawnAcc = 0
  let rings = []
  let flash = 0
  // 布局 (cx/cy 为丹田汇聚点)
  let cx = 0
  let cy = 0
  let groundY = 0
  const textures = () => buildTextures()
  // 打坐贴图 (异步加载) 与显示高度
  let meditateTex = null
  const SIT_H = 96
  // 修为进度 0~1
  const progress = () => {
    const p = props.player
    if (!p) return 0
    return Math.min(1, (p.cultivation || 0) / Math.max(1, p.maxCultivation || 1))
  }

  // 生成一个灵气粒子 (从画面边缘飘向丹田)
  const spawnParticle = () => {
    const W = app.screen.width
    const H = app.screen.height
    const side = Math.floor(Math.random() * 4)
    const x = side === 2 ? W : side === 3 ? 0 : Math.random() * W
    const y = side === 0 ? H : side === 1 ? 0 : Math.random() * H
    // 临近突破 (>=90%) 粒子转金色
    const color = progress() >= 0.9 ? 0xffd23e : 0x90e0d0
    const g = new Graphics()
    g.rect(0, 0, 2, 2).fill({ color })
    g.position.set(x, y)
    world.addChild(g)
    particles.push({ g, x, y })
  }
  // 构建场景
  const buildScene = () => {
    world = new Container()
    app.stage.addChild(world)
    bgG = new Graphics()
    world.addChild(bgG)
    // 打坐修士 (zimage 打坐形象, 场景主角)
    sitSpr = new Sprite(meditateTex)
    sitSpr.anchor.set(0.5, 1)
    sitSpr.scale.set(SIT_H / sitSpr.height)
    world.addChild(sitSpr)
    // 境界名 (画布左上角)
    realmText = new Text({
      text: levelNames(props.player?.level || 0),
      style: { fontFamily: 'sans-serif', fontSize: 12, fill: 0xd8d3c8 }
    })
    realmText.position.set(10, 8)
    app.stage.addChild(realmText)
    relayout()
    app.renderer.on('resize', relayout)
    app.ticker.add(tick)
  }
  // 布局与静态背景 (夜色山影, 与战斗画布同风格但更静谧)
  const relayout = () => {
    if (disposed || !app) return
    const W = app.screen.width
    const H = app.screen.height
    groundY = H * 0.82
    cx = W / 2
    cy = groundY - sitSpr.height * 0.45
    sitSpr.position.set(cx, groundY)
    realmText.text = levelNames(props.player?.level || 0)
    const g = bgG
    g.clear()
    g.rect(0, 0, W, H).fill({ color: 0x1a1625 })
    // 星
    let seed = 42
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 14; i++) {
      g.rect(Math.floor(rand() * W), Math.floor(rand() * H * 0.55), 2, 2).fill({ color: 0xd8d3c8, alpha: 0.25 + rand() * 0.4 })
    }
    // 月
    g.circle(W * 0.82, H * 0.2, 16).fill({ color: 0xe8e0c8 })
    g.circle(W * 0.82 + 5, H * 0.2 - 3, 13).fill({ color: 0x1a1625, alpha: 0.85 })
    // 远山
    g.poly([0, groundY, W * 0.15, H * 0.55, W * 0.4, groundY, W * 0.65, H * 0.5, W * 0.85, groundY, W, H * 0.6]).fill({ color: 0x241d33 })
    // 地面 + 蒲团
    g.rect(0, groundY, W, H - groundY).fill({ color: 0x45403a })
    g.rect(0, groundY, W, 3).fill({ color: 0x57514a })
    g.ellipse(cx, groundY + 2, 34, 8).fill({ color: 0x4a3a52 })
  }
  // 突破演出: 三圈光波扩散 + 粒子内爆 + 短白闪
  const breakthrough = () => {
    for (let i = 0; i < 3; i++) {
      const g = new Graphics()
      world.addChild(g)
      rings.push({ g, t: -i * 0.15, dur: 0.9 })
    }
    flash = 0.5
    particles.forEach(p => {
      p.x = cx + (p.x - cx) * 0.5
      p.y = cy + (p.y - cy) * 0.5
    })
  }

  // 转生演出: 五圈光波 + 强白闪
  const reincarnate = () => {
    for (let i = 0; i < 5; i++) {
      const g = new Graphics()
      world.addChild(g)
      rings.push({ g, t: -i * 0.12, dur: 1.3 })
    }
    flash = 0.9
  }

  defineExpose({ breakthrough, reincarnate })
  // 每帧: 灵气粒子生成与汇聚 / 光圈扩散 / 白闪 / 呼吸帧
  const tick = ticker => {
    if (disposed) return
    const dt = Math.min(ticker.deltaMS, 50) / 1000
    // 呼吸 = 纵向缩放微振
    sitSpr.scale.y = (SIT_H / meditateTex.height) * (1 + Math.sin(performance.now() / 700) * 0.02)
    // 粒子生成: 修炼中 ~22/s, 停修 ~1.5/s
    spawnAcc += dt * (props.cultivating ? 22 : 1.5)
    while (spawnAcc >= 1) {
      spawnParticle()
      spawnAcc--
    }
    // 粒子向丹田汇聚
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      const dx = cx - p.x
      const dy = cy - p.y
      const d = Math.hypot(dx, dy)
      if (d < 8) {
        world.removeChild(p.g)
        p.g.destroy()
        particles.splice(i, 1)
        continue
      }
      const v = 60 * dt
      p.x += (dx / d) * v
      p.y += (dy / d) * v
      p.g.position.set(Math.round(p.x), Math.round(p.y))
    }
    // 突破光圈扩散淡出
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      r.t += dt
      r.g.clear()
      if (r.t > 0) {
        const k = r.t / r.dur
        if (k >= 1) {
          world.removeChild(r.g)
          r.g.destroy()
          rings.splice(i, 1)
          continue
        }
        r.g.circle(cx, cy + 10, 10 + k * 90).stroke({ color: 0xffe9a0, width: 3 - k * 2.5, alpha: 1 - k })
      }
    }
    // 全屏白闪衰减
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 1.5)
      flashG.clear()
      flashG.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0xfff5dc, alpha: flash })
    }
  }
  // 生命周期
  onMounted(async () => {
    // 先加载打坐贴图再建场景 (缺失时回退程序化盘坐帧)
    const actorTex = await loadActorTextures()
    meditateTex = actorTex?.zimage?.meditate || textures().meditate[0]
    const app_ = await createPixelApp(host.value, {
      height: props.height ?? 180,
      resizeTo: host.value,
      background: 0x1a1625
    })
    if (disposed) {
      destroyPixelApp(app_)
      return
    }
    app = app_
    // 白闪层挂最顶层
    flashG = new Graphics()
    app.stage.addChild(flashG)
    buildScene()
  })

  // 境界变化时刷新名字
  watch(
    () => props.player?.level,
    () => {
      if (realmText && app) realmText.text = levelNames(props.player?.level || 0)
    }
  )

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
  .cultivate-canvas {
    width: 100%;
    border: 2px solid var(--el-border-color);
    border-radius: 6px;
    overflow: hidden;
    background-color: #1a1625;
  }

  .cultivate-canvas :deep(canvas) {
    display: block;
    image-rendering: pixelated;
  }
</style>
