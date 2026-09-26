<template>
  <div ref="host" class="fishing-canvas" :style="{ height: height + 'px' }" />
</template>

<script setup>
  // 像素钓鱼场景: 灵鱼游动 + 鱼钩 + 重叠高亮 + 水面波光
  // 职责边界: 组件只管视觉与坐标, 计分/计时/结算仍在页面 (mapExploration)
  import { ref, watch, onMounted, onUnmounted } from 'vue'
  import { Container, Sprite, Graphics, Text } from 'pixi.js'
  import { createPixelApp, destroyPixelApp } from '@/game/engine'
  import { buildTextures, loadActorTextures, FISH_KINDS } from '@/game/textures'

  const props = defineProps({
    // 游戏进行中 (false 时鱼停游/钩隐藏)
    running: { type: Boolean, default: false },
    // 画布高度
    height: { type: Number, default: 400 }
  })

  const host = ref(null)
  let app = null
  let disposed = false
  // 场景引用
  let world = null
  let fish = null
  let hook = null
  let lineG = null // 钓线
  let bgG = null // 水面背景
  // 鱼游动状态 (对应原 moveParentContainer: 随机目标 + 约3秒缓动)
  let fishY = 80
  let fishTargetY = 80
  let fishTimer = 0
  let fishHold = 0 // 重叠高亮抖动相位
  // 本局鱼种 (每局随机, 结算弹窗同形象)
  let fishKind = null
  // 气泡粒子 [{ g, x, y, vy, sway, t }]
  let bubbles = []
  let bubbleAcc = 0
  // 开局操作提示 (显示 3 秒后渐隐)
  let tipText = null
  let tipHold = 0
  // 鱼钩位置 (画布 y, 顶端坐标)
  let hookY = 0
  let hookVisible = false
  // 可玩区垂直范围 (水面区域内)
  let areaTop = 0
  let areaBottom = 0
  const textures = () => buildTextures()
  // 鱼种真素材 (异步加载)
  let fishTexRef = null
  // 构建场景
  const buildScene = () => {
    world = new Container()
    app.stage.addChild(world)
    // 水面背景
    bgG = new Graphics()
    world.addChild(bgG)
    // 鱼钩 + 钓线 (鱼上层)
    hook = new Sprite(textures().hook[0])
    hook.anchor.set(0.5, 0)
    hook.scale.set(2.5)
    hook.alpha = 0 // 隐形, 仅作重叠判定盒; 钩的视觉由钓线 Graphics 一体绘制
    world.addChild(hook)
    lineG = new Graphics()
    world.addChild(lineG)
    // 灵鱼 (按本局鱼种贴图: 真素材优先, 程序化兜底; 摆尾缩放动画)
    fishKind = FISH_KINDS[Math.floor(Math.random() * FISH_KINDS.length)]
    const fishTex = fishTexRef?.fish?.[fishKind.key] || textures().fishKindsTex[fishKind.key]
    fish = new Sprite(fishTex)
    fish.anchor.set(0.5, 0.5)
    fish.__baseScale = fishTexRef?.fish?.[fishKind.key] ? 1 : 3
    fish.scale.set(fish.__baseScale)
    world.addChild(fish)
    // 开局操作提示 (常显大字, 3 秒后渐隐)
    tipText = new Text({
      text: '长按=上浮  松开=下潜',
      style: { fontFamily: 'sans-serif', fontSize: 18, fill: 0xffe9a0, fontWeight: 'bold' }
    })
    tipText.anchor.set(0.5)
    tipText.position.set(app.screen.width / 2, app.screen.height * 0.2)
    tipText.alpha = 0
    world.addChild(tipText)
    relayout()
    app.renderer.on('resize', relayout)
    app.ticker.add(tick)
  }
  // 布局与水面背景
  const relayout = () => {
    if (disposed || !app) return
    const W = app.screen.width
    const H = app.screen.height
    // 可玩区: 水面上下留边
    areaTop = H * 0.08
    areaBottom = H * 0.92
    hook.x = W * 0.62
    fish.x = W * 0.38
    const g = bgG
    g.clear()
    // 夜空余韵 (顶部窄条)
    g.rect(0, 0, W, areaTop).fill({ color: 0x1a1625 })
    // 水体分层 (上浅下深)
    g.rect(0, areaTop, W, areaBottom - areaTop).fill({ color: 0x2b5a8a })
    g.rect(0, areaTop + (areaBottom - areaTop) * 0.35, W, areaBottom - areaTop).fill({ color: 0x234c74 })
    g.rect(0, areaTop + (areaBottom - areaTop) * 0.7, W, areaBottom - areaTop).fill({ color: 0x1c3f60 })
    // 水面线高光
    g.rect(0, areaTop, W, 3).fill({ color: 0x4f83b5 })
    // 岸边阴影 (底部)
    g.rect(0, areaBottom, W, H - areaBottom).fill({ color: 0x45403a })
    g.rect(0, areaBottom, W, 3).fill({ color: 0x57514a })
  }
  // 鱼随机游动: 每 2.5~3.5 秒换目标, 约 3 秒缓动到达 (对应原 3s CSS transition)
  const pickFishTarget = () => {
    const range = areaBottom - areaTop - fish.height
    fishTargetY = areaTop + fish.height / 2 + Math.random() * Math.max(1, range)
    fishTimer = 2.5 + Math.random()
  }

  // 每帧: 摆尾/游动/重叠高亮/钓线/波光气泡
  const tick = ticker => {
    if (disposed) return
    const dt = Math.min(ticker.deltaMS, 50) / 1000
    const H = app.screen.height
    const W = app.screen.width
    // 摆尾 = 横向缩放微振 (单帧纹理)
    fish.scale.x = fish.__baseScale * (1 + Math.sin(performance.now() / 90) * 0.05)
    // 开局操作提示: 显示 3 秒后 1.5 秒渐隐
    if (tipText) {
      if (props.running) {
        tipHold += dt
        tipText.alpha = tipHold < 3 ? 0.95 : Math.max(0, 0.95 - (tipHold - 3) / 1.5)
      } else {
        tipHold = 0
        tipText.alpha = 0
      }
    }
    // 气泡: 游动中的鱼身后偶发冒泡
    if (props.running) {
      bubbleAcc += dt * 1.6
      if (bubbleAcc >= 1) {
        bubbleAcc -= 1
        const g = new Graphics()
        g.circle(0, 0, 2 + Math.random() * 1.5).stroke({ color: 0xbfe8f5, width: 1, alpha: 0.8 })
        g.position.set(fish.x + fish.width / 2 + 4, fishY)
        world.addChild(g)
        bubbles.push({ g, x: fish.x + fish.width / 2 + 4, y: fishY, vy: 26 + Math.random() * 18, sway: Math.random() * 6.28, t: 0 })
      }
    }
    // 气泡上浮摆动消散
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]
      b.t += dt
      b.y -= b.vy * dt
      b.x += Math.sin(b.sway + b.t * 4) * 12 * dt
      b.g.position.set(Math.round(b.x), Math.round(b.y))
      b.g.alpha = Math.max(0, 1 - b.t / 2.2)
      if (b.t > 2.2 || b.y < areaTop + 6) {
        world.removeChild(b.g)
        b.g.destroy()
        bubbles.splice(i, 1)
      }
    }
    if (props.running) {
      // 随机游动
      fishTimer -= dt
      if (fishTimer <= 0) pickFishTarget()
      const dy = fishTargetY - fishY
      fishY += dy * Math.min(1, dt * 1.1)
      // 重叠时高亮 + 抖动
      const over = overlap
      fish.tint = over ? 0xffd23e : 0xffffff
      fishHold += dt
      fish.x = W * 0.38 + (over ? Math.sin(fishHold * 30) * 2 : 0)
    } else {
      // 待机缓漂
      fishY += Math.sin(performance.now() / 900) * 0.2
      fishY = Math.max(areaTop + fish.height / 2, Math.min(areaBottom - fish.height / 2, fishY))
    }
    fish.y = Math.round(fishY)
    // 鱼钩 + 钓线 (running 时可见; 线与钩一体矢量绘制)
    hook.visible = hookVisible
    lineG.clear()
    if (hookVisible) {
      hook.y = Math.round(hookY)
      const hx = hook.x
      const hy = hook.y
      // 钓线 (细)
      lineG.moveTo(hx, 0).lineTo(hx, hy).stroke({ color: 0xd8d3c8, width: 1 })
      // 大弯 J 形钩 (粗): 下行 → 左弯 → 钩尖上翘
      lineG
        .moveTo(hx, hy)
        .lineTo(hx, hy + 16)
        .quadraticCurveTo(hx - 15, hy + 19, hx - 14, hy + 7)
        .stroke({ color: 0xe8ecf2, width: 3 })
      // 钩尖倒刺 + 红饵 (视觉焦点)
      lineG.moveTo(hx - 14, hy + 7).lineTo(hx - 9, hy + 9).stroke({ color: 0xe8ecf2, width: 2 })
      lineG.circle(hx - 14, hy + 4, 2.5).fill({ color: 0xe05548 })
      // 每帧重叠判定 (矩形相交, 供页面计分)
      const f = getFishRect()
      const h = getHookRect()
      overlap = !(f.bottom < h.top || f.top > h.bottom || f.right < h.left || f.left > h.right)
    } else {
      overlap = false
    }
    // 波光线条 (缓慢下移循环)
    // 气泡偶发上浮省略, 保持画面简洁
  }
  // ---------- 对外接口 ----------
  // 鱼钩画布 y (顶端坐标)
  const setHookY = y => {
    hookY = y
    hookVisible = props.running
  }
  // 鱼包围盒 {top,bottom,left,right} (画布坐标, 供页面矩形相交判定)
  const getFishRect = () => ({
    top: fish.y - fish.height / 2,
    bottom: fish.y + fish.height / 2,
    left: fish.x - fish.width / 2,
    right: fish.x + fish.width / 2
  })
  // 鱼钩包围盒
  const getHookRect = () => ({
    top: hook.y,
    bottom: hook.y + hook.height,
    left: hook.x - hook.width / 2,
    right: hook.x + hook.width / 2
  })
  // 当前重叠状态 (组件内每帧判定结果)
  const getOverlap = () => overlap

  defineExpose({
    setHookY,
    getFishRect,
    getHookRect,
    getOverlap,
    getAreaRange: () => ({ top: areaTop, bottom: areaBottom }),
    // 本局游动的鱼种 (结算与画布同形象)
    getCurrentKind: () => fishKind
  })

  // 重叠判定 (每帧, 页面通过 getOverlap 读取)
  let overlap = false

  // 游戏开始/结束时重置
  watch(
    () => props.running,
    nv => {
      hookVisible = nv
      if (nv) {
        fishY = fishTargetY = (areaTop + areaBottom) / 2
        pickFishTarget()
      }
    }
  )

  onMounted(async () => {
    // 先加载鱼种真素材再建场景
    fishTexRef = await loadActorTextures()
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
  .fishing-canvas {
    width: 100%;
    border: 2px solid var(--el-border-color);
    border-radius: 6px;
    overflow: hidden;
    background-color: #1a1625;
  }

  .fishing-canvas :deep(canvas) {
    display: block;
    image-rendering: pixelated;
  }
</style>
