<template>
  <div>
    <div class="legend">
      <div class="legend-item">
        <img class="legend-icon" :src="icons.player" />
        玩家
      </div>
      <div class="legend-item">
        <img class="legend-icon" :src="icons.npc" />
        NPC
      </div>
      <div class="legend-item">
        <img class="legend-icon" :src="icons.fishing" />
        钓鱼点
      </div>
      <div class="legend-item">
        <img class="legend-icon" :src="icons.obstacle" />
        障碍物
      </div>
      <div class="legend-item">
        <img class="legend-icon" :src="icons.empty" />
        空地
      </div>
    </div>
    <div class="map">
      <div ref="mapEl" class="pixi-map" v-loading="!worldMap" element-loading-text="灵界加载中..." />
    </div>
    <div class="controls">
      <el-button class="home-button" @click="move('q')">
        回家
        <span class="shortcutKeys">(Q)</span>
      </el-button>
      <el-button class="up-button" @click="move('up')" :disabled="isTopObstacle || playerY == 0">
        往北
        <span class="shortcutKeys">(W)</span>
      </el-button>
      <el-button class="dialogue-button" @click="move('e')" :disabled="!isNpc && !isFishing">
        {{ isNpc || !isFishing ? '对话' : '钓鱼' }}
        <span class="shortcutKeys">(E)</span>
      </el-button>
      <el-button class="left-button" @click="move('left')" :disabled="isLeftObstacle || playerX === 0">
        往西
        <span class="shortcutKeys">(A)</span>
      </el-button>
      <el-button class="down-button" @click="move('down')" :disabled="isDownObstacle || playerY === gridSize - 1">
        往南
        <span class="shortcutKeys">(S)</span>
      </el-button>
      <el-button class="right-button" @click="move('right')" :disabled="isRightObstacle || playerX === gridSize - 1">
        往东
        <span class="shortcutKeys">(D)</span>
      </el-button>
    </div>
    <el-drawer v-model="fishingShow" @close="endGame" title="钓鱼" direction="rtl" class="strengthen">
      <div class="game-container">
        <div class="time">倒计时: {{ fishing.timeLeft }}秒</div>
        <div class="fishing-tips">长按按钮鱼钩上浮 · 松开自动下潜 —— 让钩贴住鱼, 攒满进度条即钓鱼成功!</div>
        <div class="outer-wrapper">
          <div class="progress-bar-container">
            <div class="progress-bar" ref="progressBar" :style="{ height: fishing.progressPercentage }" />
            <div class="progress-text">{{ fishing.progressText }}%</div>
          </div>
          <fishingCanvas ref="fishingCanvasRef" class="fishing-stage" :running="fishingShow" :height="400" />
        </div>
        <el-button
          @touchstart="startFishing"
          @touchend="stopFishing"
          @mousedown="startFishing"
          @mouseup="stopFishing"
          @mouseleave="stopFishing"
          @click="moveButton('click')"
          :disabled="fishing.disabled"
          class="button"
        >
          钓鱼
          <span class="diaoyu-shortcutKeys">({{ holdingId ? '松开' : '长按' }})</span>
        </el-button>
      </div>
    </el-drawer>
    <el-drawer v-model="npcShow" :title="npcInfo.name" direction="rtl" class="strengthen">
      <div class="wife-box">
        <div class="attributes">
          <div class="attribute-box">
            <div class="tag attribute">境界: {{ levelNames(npcInfo.lv) }} ({{ npcInfo.reincarnation }}转)</div>
            <div class="tag attribute">气血: 不详</div>
            <div class="tag attribute">攻击: 不详</div>
            <div class="tag attribute">防御: 不详</div>
            <div class="tag attribute">闪避: 不详</div>
            <div class="tag attribute">暴击: 不详</div>
            <div class="tag attribute">好感度: {{ npcInfo.favorability }}</div>
          </div>
        </div>
        <div class="click-box">
          <el-button type="primary" @click="giftShow = !giftShow">
            {{ giftShow ? '取消赠送' : '赠送礼物' }}
          </el-button>
          <el-button
            type="primary"
            :disabled="npcInfo.favorability < 1000 || isHaveWife(npcInfo.name)"
            @click="harvestNpc(npcInfo)"
          >
            {{ isHaveWife(npcInfo.name) ? '已结为道侣' : '结为道侣' }}
          </el-button>
        </div>
        <div class="gift-box" v-if="giftShow">
          <div class="gift-item" v-for="(item, index) in giftItems" :key="index" @click="giftInfo(item, index)">
            <tag :type="item.lv">{{ item.name }}</tag>
            <span class="gift-name">{{ item.price }}灵石</span>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
  // tag组件
  import tag from '@/components/tag.vue'
  // 组件名 (KeepAlive include 匹配)
  defineOptions({ name: 'MapExploration' })
  // npc
  import npc from '@/plugins/npc'
  // 怪物
  import monster from '@/plugins/monster'
  import { useRouter } from 'vue-router'
  import { ref, shallowRef, computed, triggerRef, onUnmounted, onMounted, onActivated, onDeactivated, nextTick } from 'vue'
  import { useMainStore } from '@/plugins/store'
  import { ElMessageBox } from 'element-plus'
  import { levelNames, gameNotifys } from '@/plugins/game'
  import MinHeap from '@/plugins/minheap'
  // 像素世界渲染器
  import { WorldMap } from '@/game/worldMap'
  import { legendIcons, assetUrl, FISH_KINDS, fishIcons } from '@/game/textures'
  // 像素钓鱼场景
  import fishingCanvas from '@/components/fishingCanvas.vue'

  const router = useRouter()
  const store = useMainStore()
  // 保存每个格子的数据 (shallowRef: 2500 格不做深层响应式代理, cell 变化处手动 triggerRef)
  const grid = shallowRef([])
  // 像素画布容器
  const mapEl = ref(null)
  // 像素世界实例
  const worldMap = ref(null)
  // 图例像素图标 (玩家/NPC 用真素材形象, 地形保持程序化)
  const icons = {
    ...legendIcons(),
    player: assetUrl('jianxiu', 'front'),
    npc: assetUrl('wife', 'qingyun')
  }
  // 玩家数据
  const player = ref(store.player)
  // 地图数据
  const mapData = ref(store.mapData)
  // 玩家在X轴的位置
  const playerX = ref(0)
  // 玩家在Y轴的位置
  const playerY = ref(0)
  const npcInfo = ref({})
  // 钓鱼相关
  const fishing = ref({
    // 分数
    score: 0,
    bottom: '0px',
    // 是否重叠
    overlap: false,
    // 存储定时
    timerIds: [],
    // 剩余时间
    timeLeft: 60,
    // 游戏结束
    gameOver: false,
    // 禁用按钮
    disabled: false,
    // 时间结束
    timeExpired: false,
    // 进度
    progressText: 0,
    // 内部容器位置
    innerPosition: 0,
    // 向上移动的动画ID
    moveUpAnimationId: '',
    // 进度条百分比
    progressPercentage: '0%',
    // 向下移动的动画ID
    moveDownAnimationId: '',
    // 父容器的动画ID
    moveParentContainerId: ''
  })
  const npcShow = ref(false)
  // 地图的大小
  const gridSize = ref(50)
  const giftShow = ref(false)
  // NPC的数量
  const npcCount = ref(10)
  // 是否正在长按
  const holdingId = ref(null)
  // 钓鱼点坐标
  const fishingMap = ref([])
  // 钓鱼弹窗
  const fishingShow = ref(false)
  // 障碍物的数量
  const obstacleCount = ref(0)
  // 像素钓鱼画布
  const fishingCanvasRef = ref(null)
  // 礼物列表
  const giftItems = computed(() => {
    const arr = []
    const num = {
      1: '一',
      2: '二',
      3: '三',
      4: '四',
      5: '五',
      6: '六'
    }
    const lv = {
      1: 'info',
      2: 'success',
      3: 'primary',
      4: 'purple',
      5: 'warning',
      6: 'danger'
    }
    const price = {
      1: 200,
      2: 400,
      3: 800,
      4: 1500,
      5: 2000,
      6: 3000
    }
    for (let i = 1; i < 7; i++) {
      arr.push({
        lv: lv[i],
        plus: price[i] / 100,
        name: `${num[i]}品驻颜丹`,
        price: price[i]
      })
    }
    return arr
  })

  const totalCells = computed(() => {
    return gridSize.value * gridSize.value
  })

  const nearbyIndices = computed(() => {
    return [
      (playerY.value - 1) * gridSize.value + playerX.value, // 上
      (playerY.value + 1) * gridSize.value + playerX.value, // 下
      playerY.value * gridSize.value + (playerX.value - 1), // 左
      playerY.value * gridSize.value + (playerX.value + 1) // 右
    ]
  })

  // 计算玩家附近是否有NPC
  const isNpc = computed(() => {
    return nearbyIndices.value.some(index => grid.value[index]?.type === 'npc')
  })

  // 计算玩家附近是否有钓鱼点
  const isFishing = computed(() => {
    return nearbyIndices.value.some(index => grid.value[index]?.type === 'fishing')
  })

  // 判断玩家上方有没有障碍物
  const isTopObstacle = computed(() => {
    return checkDirection('up')
  })

  // 判断玩家左方有没有障碍物
  const isLeftObstacle = computed(() => {
    return checkDirection('left')
  })

  // 判断玩家下方有没有障碍物
  const isDownObstacle = computed(() => {
    return checkDirection('down')
  })

  // 判断玩家右方有没有障碍物
  const isRightObstacle = computed(() => {
    return checkDirection('right')
  })

  // 回家
  const goHome = () => {
    router.push('/home')
    if (playerX.value !== 0 || playerY.value !== 0) {
      store.mapData = { y: 0, x: 0, map: [] }
      // 重置所有钓鱼数据
      resetFishingData(false)
      // 重置玩家所在行
      store.mapScroll = 0
    }
  }

  // 清空所有定时
  const clearAllTiming = () => {
    fishing.value.timerIds.forEach(id => clearInterval(id))
  }

  // 初始化地图
  const initializeGrid = () => {
    // 生成地图
    grid.value = Array(totalCells.value)
      .fill()
      .map(() => ({ his: '', type: 'empty' }))
    const safeZone = createSafeZone()
    // 障碍物的数量
    obstacleCount.value = Math.floor(totalCells.value * 0.1)
    // 生成障碍物
    generateItems('obstacle', obstacleCount.value, safeZone)
    // 确保障碍物生成不会堵塞路径
    ensurePathAvailability()
    // 生成钓鱼点
    generateItems('fishing', 10, safeZone)
    // 确保钓鱼点生成不会堵塞路径
    ensurePathAvailability()
    // 生成NPC
    generateNpcs(npcCount.value, safeZone)
    // 确保NPC生成不会堵塞路径
    ensurePathAvailability()
    // 更新玩家初始位置
    updatePlayerPosition()
    // shallowRef 手动触发 (cell 深层变化不被追踪)
    triggerRef(grid)
  }

  // 创建一个安全区域，该区域是围绕玩家当前位置的 5x5 网格
  const createSafeZone = () => {
    const safeZone = new Set()
    for (let y = playerY.value - 2; y <= playerY.value + 2; y++) {
      for (let x = playerX.value - 2; x <= playerX.value + 2; x++) {
        // 确保坐标在有效的网格范围内
        if (y >= 0 && y < gridSize.value && x >= 0 && x < gridSize.value) safeZone.add(y * gridSize.value + x) // 将坐标转换为一维索引并添加到安全区域集合中
      }
    }
    // 返回安全区域集合
    return safeZone
  }

  // 确保地图中有可用路径，如果没有则重新生成障碍物和 NPC
  const ensurePathAvailability = () => {
    while (!isPathAvailable()) {
      // 重新生成障碍物，排除在安全区域内的网格
      generateItems('obstacle', obstacleCount.value, createSafeZone())
      // 重新生成 NPC，排除在安全区域内的网格
      generateNpcs(npcCount.value, createSafeZone())
    }
  }

  // 使用 A* 算法检查从起点到终点的路径是否可用
  const isPathAvailable = () => {
    // 起点坐标
    const start = [playerY.value, playerX.value]
    // 终点坐标
    const end = [49, 49]
    // 四个方向的移动方式
    const directions = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0]
    ]
    // 计算启发式函数（曼哈顿距离加上一个小权重）
    const heuristic = (a, b) => {
      const d1 = Math.abs(a[0] - b[0])
      const d2 = Math.abs(a[1] - b[1])
      return d1 + d2 + 0.1 * Math.min(d1, d2)
    }
    // 初始化 A* 算法所需的数据结构
    const openSet = new MinHeap() // 用于存储待检查的节点
    const cameFrom = new Map() // 记录路径
    const gScore = new Map() // 记录从起点到当前节点的实际代价
    const fScore = new Map() // 记录从起点到终点的估算代价
    gScore.set(start.toString(), 0)
    fScore.set(start.toString(), heuristic(start, end))
    openSet.add(start, fScore.get(start.toString()))
    while (!openSet.isEmpty()) {
      // 获取具有最低 f 值的节点
      const current = openSet.poll()
      // 如果当前节点是终点，则路径可用
      if (current[0] === 49 && current[1] === 49) return true
      for (const [dy, dx] of directions) {
        const newY = current[0] + dy
        const newX = current[1] + dx
        const neighbor = [newY, newX]
        // 确保邻居节点在有效的网格范围内且为空
        if (
          newY >= 0 &&
          newY < gridSize.value &&
          newX >= 0 &&
          newX < gridSize.value &&
          grid.value[newY * gridSize.value + newX].type === 'empty'
        ) {
          const tentativeGScore = gScore.get(current.toString()) + 1
          // 如果找到更短的路径
          if (!gScore.has(neighbor.toString()) || tentativeGScore < gScore.get(neighbor.toString())) {
            cameFrom.set(neighbor.toString(), current)
            gScore.set(neighbor.toString(), tentativeGScore)
            const fScoreValue = tentativeGScore + heuristic(neighbor, end)
            fScore.set(neighbor.toString(), fScoreValue)
            openSet.add(neighbor, fScoreValue)
          }
        }
      }
    }
    // 如果没有找到路径，则返回 false
    return false
  }

  // 生成指定数量的障碍物，并确保生成后路径仍然可用
  const generateItems = (type, count, excludeSet) => {
    // 将所有现有的障碍物转换为空
    grid.value.forEach(cell => {
      if (cell.type === type) cell.type = 'empty'
    })
    let placed = 0
    const arr = []
    // 用来存储每个钓鱼点周围的5x5区域
    const restrictedZone = new Set()
    while (placed < count) {
      const index = Math.floor(Math.random() * totalCells.value)
      const arrIndex = Math.floor(Math.random() * 25)
      // 检查是否新生成的位置在安全区域或禁区内，并且该格子为空
      if (!excludeSet.has(index) && !restrictedZone.has(index) && grid.value[index].type === 'empty') {
        grid.value[index].type = type
        placed++
        // 如果是钓鱼点，存储钓鱼点坐标，并生成其周围的5x5禁区
        if (type === 'fishing') {
          arr.push(index)
          store.fishingMap = arr
          // 将钓鱼点周围的5x5区域添加到禁区
          addToRestrictedZone(index, restrictedZone)
        }
        // 生成障碍物后立即检查路径是否可行
        if (!isPathAvailable()) {
          // 如果阻塞路径，回溯这个障碍物的生成
          grid.value[index].type = 'empty'
          placed--
        }
      }
    }
  }

  // 生成指定数量的 NPC，并确保生成后路径仍然可用
  const generateNpcs = (count, excludeSet) => {
    // 将所有现有的 NPC 转换为空
    grid.value.forEach(cell => {
      if (cell.type === 'npc') cell.type = 'empty'
    })
    const npcs = player.value.npcs.length ? player.value.npcs : npc.npcNames()
    const isData = player.value.npcs.length
    let arr = []
    let placed = 0
    while (placed < count) {
      const index = Math.floor(Math.random() * totalCells.value)
      // 确保新生成的 NPC 不在安全区域内且为空
      if (!excludeSet.has(index) && grid.value[index].type === 'empty') {
        const favorability = isData ? npcs[placed].favorability : 0
        const lightness = calculateLightness(favorability)
        // 设置 NPC 的颜色
        grid.value[index].his = `hsl(340, 82%, ${lightness}%, 1)`
        grid.value[index].type = 'npc'
        const npcData = {
          lv: 144,
          name: isData ? npcs[placed].name : npcs[placed],
          position: index,
          favorability: favorability,
          reincarnation: 10
        }
        arr.push(npcData)
        player.value.npcs = arr
        placed++
        // 生成 NPC 后立即检查路径是否可行
        if (!isPathAvailable()) {
          // 如果阻塞路径，回溯这个 NPC 的生成
          grid.value[index].type = 'empty'
          placed--
        }
      }
    }
  }

  // 将目标的5x5范围改为禁区
  const addToRestrictedZone = (index, restrictedZone) => {
    const gridX = index % gridSize.value
    const gridY = Math.floor(index / gridSize.value)
    // 遍历钓鱼点周围的5x5区域
    for (let y = gridY - 2; y <= gridY + 2; y++) {
      for (let x = gridX - 2; x <= gridX + 2; x++) {
        if (y >= 0 && y < gridSize.value && x >= 0 && x < gridSize.value) {
          // 将坐标转换为一维索引并添加到禁区集合中
          restrictedZone.add(y * gridSize.value + x)
        }
      }
    }
  }

  // 根据亲密度计算颜色亮度
  const calculateLightness = favorability => {
    const maxFavorability = 1000
    const minLightness = 50 // 最暗
    const maxLightness = 76 // 最亮
    // 根据亲密度百分比计算亮度
    const percentage = favorability / maxFavorability
    return minLightness + (maxLightness - minLightness) * percentage
  }

  const harvestNpc = item => {
    ElMessageBox.confirm('与对方结为道侣有50%的概率失败, 失败后好感度会清空, 请问还想与对方结为道侣吗?', '结为道侣', {
      center: true,
      cancelButtonText: '取消',
      confirmButtonText: '确定'
    })
      .then(() => {
        const rand = isLucky(50)
        if (rand) {
          // 添加道侣
          player.value.wifes.push({
            name: item.name,
            level: 0,
            dodge: 0,
            attack: 10,
            health: 100,
            defense: 10,
            critical: 0,
            reincarnation: 0
          })
          gameNotifys({ title: '提示', message: '你成功邀请对方与你结为道侣', position: 'top-left' })
        } else {
          npcInfo.value.favorability = 0
          gameNotifys({ title: '提示', message: '对方拒绝了你的邀请, 好感度清空', position: 'top-left' })
        }
      })
      .catch(() => {})
  }

  // 礼物信息
  const giftInfo = (item, index) => {
    ElMessageBox.confirm('', '赠送礼物', {
      center: true,
      message: `<div class="monsterinfo">
      <div class="monsterinfo-box">
        <p>名称: ${item.name}</p>
        <p>价格: ${item.price}</p>
        <p>增加好感度: ${item.plus}</p>
      </div>
    </div>`,
      lockScroll: false,
      cancelButtonText: '取消赠送',
      confirmButtonText: '立即赠送',
      dangerouslyUseHTMLString: true
    })
      .then(() => {
        if (item.price > player.value.props.money) {
          gameNotifys({ title: '赠送提示', message: '灵石不足, 赠送失败', position: 'top-left' })
          return
        }
        // 扣除灵石数量
        player.value.props.money -= item.price
        // 增加好感度
        npcInfo.value.favorability += item.plus
        // 增加传送符
        player.value.props.flying += index + 1
        // 增加情缘点
        player.value.props.qingyuan += index + 1
        gameNotifys({
          title: '赠送提示',
          message: `赠送成功, ${npcInfo.value.name}对你的好感度增加了, 并赠与了你${index + 1}张传送符和${index + 1}点情缘`,
          position: 'top-left'
        })
      })
      .catch(() => {})
  }

  // 地图信息
  const gridInfo = (index, item) => {
    // 如果坐标不是空地
    if (item.type != 'empty') return
    const x = index % gridSize.value
    const y = Math.floor(index / gridSize.value)
    ElMessageBox.confirm('地图坐标信息', '地图坐标信息', {
      center: true,
      message: `<div class="monsterinfo">
      <div class="monsterinfo-box">
        <p>X轴: ${x}</p>
        <p>Y轴: ${y}</p>
      </div>
    </div>`,
      lockScroll: false,
      cancelButtonText: '取消传送',
      confirmButtonText: '立即传送',
      dangerouslyUseHTMLString: true
    })
      .then(() => {
        if (!player.value.props.flying) {
          gameNotifys({ title: '传送提示', message: '传送失败, 传送符不足', position: 'top-left' })
          return
        }
        // 扣除传送符
        player.value.props.flying -= 1
        playerY.value = y
        playerX.value = x
        updatePlayerPosition()
        // 像素世界直接就位
        worldMap.value?.teleport(x, y)
        gameNotifys({ title: '传送提示', message: '传送成功', position: 'top-left' })
      })
      .catch(() => {})
  }

  // 更新玩家在地图上的位置
  const updatePlayerPosition = () => {
    grid.value.forEach(cell => (cell.type === 'player' ? (cell.type = 'empty') : cell.type))
    const playerIndex = playerY.value * gridSize.value + playerX.value
    grid.value[playerIndex].type = 'player'
    // 更新地图数据
    store.mapData = {
      y: playerY.value,
      x: playerX.value,
      map: grid.value
    }
    // 20%概率遇怪
    const rand = isLucky(20)
    if (rand && playerIndex != 0) {
      // 玩家境界
      let level = player.value.level == 0 ? 1 : player.value.level
      // 怪物难度根据玩家最高境界 + 转生次数
      const monsterLv = level * player.value.reincarnation + level
      // 添加怪物数据
      store.monster = {
        // 名称
        name: monster.monster_Names(monsterLv),
        // 气血
        health: monster.monster_Health(monsterLv),
        // 攻击
        attack: monster.monster_Attack(monsterLv),
        // 防御
        defense: monster.monster_Defense(monsterLv),
        // 闪避率
        dodge: monster.monster_Criticalhitrate(monsterLv),
        // 暴击
        critical: monster.monster_Criticalhitrate(monsterLv)
      }
      // 像素转场后跳转对战 (黑幕淡入)
      if (worldMap.value) worldMap.value.flash(() => router.push('/explore'))
      else router.push('/explore')
    }
    // 每次更新玩家位置后同步像素世界
    worldMap.value?.setPlayer(playerX.value, playerY.value)
    // shallowRef 手动触发 (玩家格变化)
    triggerRef(grid)
  }

  // 计算玩家指定方向是否有NPC或障碍物
  const checkDirection = direction => {
    const directions = {
      up: (playerY.value - 1) * gridSize.value + playerX.value,
      down: (playerY.value + 1) * gridSize.value + playerX.value,
      left: playerY.value * gridSize.value + (playerX.value - 1),
      right: playerY.value * gridSize.value + (playerX.value + 1)
    }
    const index = directions[direction]
    return ['obstacle', 'fishing', 'npc'].includes(grid.value[index]?.type)
  }

  // 根据方向移动玩家
  const move = direction => {
    let newX = playerX.value
    let newY = playerY.value
    direction = typeof direction === 'string' ? direction : direction.key
    switch (direction) {
      case 'q':
        goHome()
        return
      case 'w':
      case 'up':
      case 'ArrowUp':
        if (newY > 0) {
          newY--
          goPlayerXY(newY, newX)
        }
        break
      case 's':
      case 'down':
      case 'ArrowDown':
        if (newY < gridSize.value - 1) {
          newY++
          goPlayerXY(newY, newX)
        }
        break
      case 'a':
      case 'left':
      case 'ArrowLeft':
        if (newX > 0) {
          newX--
          goPlayerXY(newY, newX)
        }
        break
      case 'd':
      case 'right':
      case 'ArrowRight':
        if (newX < gridSize.value - 1) {
          newX++
          goPlayerXY(newY, newX)
        }
        break
      case 'e':
        if (!isNpc.value && !isFishing.value) return
        if (isNpc.value) talkToNpc()
        else startGame()
        return
      default:
        return
    }
  }

  const goPlayerXY = (newY, newX) => {
    const newIndex = newY * gridSize.value + newX
    // 仅在目标位置为空地时移动玩家
    if (grid.value[newIndex].type === 'empty') {
      playerX.value = newX
      playerY.value = newY
    }
    updatePlayerPosition()
  }

  // 找到并与附近的NPC对话
  const talkToNpc = () => {
    npcShow.value = true
    npcInfo.value = player.value.npcs.find(npc => nearbyIndices.value.includes(npc.position))
  }

  // 概率计算
  const isLucky = probability => {
    // 生成一个0到100之间的随机数
    const randomValue = Math.random() * 100
    // 判断随机数是否小于等于传入的概率值
    return randomValue < probability
  }

  // 判断玩家是否已当前NPC结为道侣
  const isHaveWife = name => {
    if (name) return player.value.wifes.some(item => item.name === name)
  }

  // 钓鱼画布逻辑坐标换算 (组件 expose: 可玩区范围 + 钩显示高度)
  const canvasMetrics = () => {
    const m = fishingCanvasRef.value?.getAreaRange() || { top: 32, bottom: 368 }
    return { ...m, hookH: 40 }
  }

  // 钓鱼
  const moveButton = () => {
    // 平滑向上移动
    smoothMoveUp()
    // 检查碰撞
    checkCollision()
  }

  // 启动长按上浮逻辑
  const startFishing = () => {
    if (!holdingId.value) {
      moveButton()
      holdingId.value = setInterval(moveButton, 100)
    }
  }

  // 停止上浮并启动自动下滑
  const stopFishing = () => {
    if (holdingId.value) {
      clearInterval(holdingId.value)
      holdingId.value = null
    }
  }

  // 移动鱼的位置 (像素版: 鱼游动由 fishingCanvas 组件内部处理)
  const moveParentContainer = () => {}

  // 鱼钩自动向下移动
  const autoMoveDown = () => {
    const step = () => {
      // 检查钓鱼的容器是否触底
      if (fishing.value.innerPosition <= 0) {
        // 如果触底且没有重叠，则扣除分数和进度
        if (!fishing.value.overlap) {
          fishing.value.score = Math.max(fishing.value.score - 0.2, 0)
          updateProgressBar()
        }
      } else {
        // 向下移动
        fishing.value.innerPosition -= 1
        // 检查碰撞
        checkCollision()
      }
      // 每帧无条件同步钩位: 画布异步就绪后钩自动从开局的错误位置回正到底部
      syncHook()
      // 请求下一帧动画
      fishing.value.moveDownAnimationId = requestAnimationFrame(step)
    }
    // 启动自动向下移动
    fishing.value.moveDownAnimationId = requestAnimationFrame(step)
  }

  // 平滑向上移动鱼钩的位置
  const smoothMoveUp = () => {
    // 目标位置 (画布可玩高度 - 钩高)
    const { top, bottom, hookH } = canvasMetrics()
    const targetPosition = Math.min(fishing.value.innerPosition + 10, bottom - top - hookH)
    const step = () => {
      if (fishing.value.innerPosition < targetPosition) {
        // 向上移动
        fishing.value.innerPosition += 2
        syncHook()
        // 请求下一帧动画
        fishing.value.moveUpAnimationId = requestAnimationFrame(step)
      }
    }
    // 启动平滑向上移动
    fishing.value.moveUpAnimationId = requestAnimationFrame(step)
  }

  // 同步鱼钩到像素画布 (innerPosition: 0=贴底, 向上增加)
  const syncHook = () => {
    const { bottom, hookH } = canvasMetrics()
    // 画布异步初始化未就绪时 getAreaRange 返回 0 (truthy 不走兜底), 用标称底值防钩被钉到画面外顶端
    const safeBottom = bottom > 0 ? bottom : 368
    fishingCanvasRef.value?.setHookY(safeBottom - fishing.value.innerPosition - hookH)
  }

  // 检查碰撞 (像素版: 重叠判定由画布每帧计算, 页面读取结果计分)
  const checkCollision = () => {
    // 如果游戏结束或时间到，停止检查
    if (fishing.value.gameOver || fishing.value.timeExpired) return
    // 判断鱼钩是否触底
    const isTouchingBottom = fishing.value.innerPosition <= 0
    // 画布内的矩形相交判定结果
    const isOverlap = fishingCanvasRef.value?.getOverlap() || false
    // 根据鱼钩的触底和重叠状态更新分数
    fishing.value.score = isOverlap
      ? Math.min(fishing.value.score + 0.1, 100)
      : isTouchingBottom
      ? Math.max(fishing.value.score - 0.2, 0)
      : Math.max(fishing.value.score - 0.2, 0)
    // 更新分数后更新进度条
    updateProgressBar(fishing.value.score)
    // 更新重叠状态
    fishing.value.overlap = isOverlap
  }

  // 更新进度条
  const updateProgressBar = () => {
    // 最大分数
    const maxScore = 100
    // 计算进度百分比
    const progressPercentage = Math.min((fishing.value.score / maxScore) * 100, 100)
    if (fishing.value.score >= maxScore && !fishing.value.gameOver) {
      fishing.value.gameOver = true
      const fishInfo = getRandomFish()
      // 清空所有定时
      clearAllTiming()
      ElMessageBox.confirm(
        `<div class="fish-catch"><img class="fish-icon" src="${fishInfo.icon}" /><p>${fishInfo.description}</p></div>`,
        fishInfo.name,
        {
          center: true,
          showClose: false,
          lockScroll: false,
          showCancelButton: false,
          closeOnClickModal: false,
          dangerouslyUseHTMLString: true,
          confirmButtonText: '卖掉这条鱼'
        }
      )
        .then(() => {
          // 结束游戏
          endGame()
          // 增加灵石数量
          player.value.props.money += fishInfo.price
          gameNotifys({ title: '提示', message: `你获得了${fishInfo.price}灵石`, position: 'top-left' })
        })
        .catch(() => {})
    }
    // 更新进度条文字
    fishing.value.progressText = Math.round(progressPercentage)
    // 更新进度条高度
    fishing.value.progressPercentage = `${progressPercentage}%`
  }

  // 启动计时器
  const startTimer = () => {
    const timer = setInterval(() => {
      fishing.value.timeLeft--
      // 倒计时结束
      if (fishing.value.timeLeft == 0) {
        // 清空所有定时
        clearAllTiming()
        ElMessageBox.confirm('钓鱼失败，鱼溜走了！', '提示', {
          center: true,
          lockScroll: false,
          showCancelButton: false,
          confirmButtonText: '确定',
          dangerouslyUseHTMLString: true
        })
          .then(() => endGame())
          .catch(() => endGame())
      }
    }, 1000)
    fishing.value.timerIds.push(timer)
  }

  // 结束游戏
  const endGame = () => {
    fishingShow.value = false
    // 清空所有定时
    clearAllTiming()
    // 移除钓鱼点
    const index = store.fishingMap.find(index => nearbyIndices.value.includes(index))
    grid.value[index].type = 'empty'
    // shallowRef 手动触发
    triggerRef(grid)
    // 同步像素世界地形
    worldMap.value?.setCell(index)
    // 结束所有动画
    cancelAnimationFrame(fishing.value.moveUpAnimationId)
    cancelAnimationFrame(fishing.value.moveDownAnimationId)
    cancelAnimationFrame(fishing.value.moveParentContainerId)
    // 重置钓鱼数据
    resetFishingData(true)
  }

  // 开始游戏
  const startGame = () => {
    fishingShow.value = true
    resetFishingData(false)
    // 画布挂载后鱼钩落底
    nextTick(() => syncHook())
    autoMoveDown()
    startTimer()
  }

  // 重置所有钓鱼数据
  const resetFishingData = bool => {
    // 分数
    fishing.value.score = 0
    // 是否重叠
    fishing.value.overlap = false
    // 剩余时间
    fishing.value.timeLeft = 60
    // 游戏结束
    fishing.value.gameOver = bool
    // 禁用按钮
    fishing.value.disabled = bool
    // 时间结束
    fishing.value.timeExpired = bool
    // 内部容器位置
    fishing.value.innerPosition = 0
    if (!bool) {
      // 进度
      fishing.value.progressText = 0
      // 更新进度条高度
      fishing.value.progressPercentage = '0%'
    }
  }

  // 产出钓到鱼的信息 (与画布同形象: 抽中的鱼即本局游动的那条)
  const getRandomFish = () => {
    const current = fishingCanvasRef.value?.getCurrentKind()
    if (current) {
      return {
        name: current.name,
        price: current.price,
        description: current.desc,
        icon: assetUrl('fish', current.key)
      }
    }
    // 画布未就绪时按概率兜底抽取
    const random = Math.random()
    let cumulativeProbability = 0
    for (const fish of FISH_KINDS) {
      cumulativeProbability += fish.rarity
      if (random < cumulativeProbability) {
        return { name: fish.name, price: fish.price, description: fish.desc, icon: assetUrl('fish', fish.key) }
      }
    }
    return null
  }

  // 组件已卸载标记 (防止异步创建完成时组件已离开, 画布泄漏)
  let disposed = false

  onMounted(async () => {
    if (mapData.value.map.length) {
      // 恢复地图数据
      grid.value = mapData.value.map
      // 玩家所在Y轴
      playerY.value = mapData.value.y
      // 玩家所在X轴
      playerX.value = mapData.value.x
    } else {
      // 初始化地图数据
      initializeGrid()
    }
    // 创建像素世界 (相机自动跟随玩家, 无需滚动条恢复)
    const wm = await WorldMap.create(mapEl.value, {
      height: 500,
      grid: grid.value,
      gridSize: gridSize.value,
      npcs: player.value.npcs,
      onTileClick: index => gridInfo(index, grid.value[index])
    })
    // 异步创建期间组件已卸载: 立即销毁, 防止画布挂在已移除的 DOM 上泄漏
    if (disposed) {
      wm.destroy()
      return
    }
    worldMap.value = wm
    worldMap.value.teleport(playerX.value, playerY.value)
    // 添加键盘监听
    window.addEventListener('keydown', move)
  })

  // keep-alive 下离开页面: 暂停交互, 画布保留 (避免反复创建销毁累积内存)
  onDeactivated(() => {
    // 清空所有定时
    clearAllTiming()
    // 移除键盘监听
    window.removeEventListener('keydown', move)
  })

  // keep-alive 下回到页面: 恢复交互
  onActivated(() => {
    window.removeEventListener('keydown', move)
    window.addEventListener('keydown', move)
    // 画布位置与逻辑状态同步 (防离开期间数据变化)
    worldMap.value?.teleport(playerX.value, playerY.value)
  })

  onUnmounted(() => {
    // 标记卸载 (异步创建完成后自查)
    disposed = true
    // 清空所有定时
    clearAllTiming()
    // 销毁像素世界 (释放 WebGL 上下文; keep-alive 缓存被清除时才走到)
    worldMap.value?.destroy()
    worldMap.value = null
    // 移除键盘监听
    window.removeEventListener('keydown', move)
  })
</script>

<style scoped>
  .map {
    max-width: 770px;
    margin: 0 auto;
  }

  /* 像素世界画布 */
  .pixi-map {
    width: 100%;
    height: 500px;
    border: 2px solid var(--el-border-color);
    border-radius: 6px;
    overflow: hidden;
    background-color: #14121c;
    touch-action: none;
  }

  .pixi-map :deep(canvas) {
    display: block;
    image-rendering: pixelated;
  }

  .legend-icon {
    width: 24px;
    height: 24px;
    image-rendering: pixelated;
    margin-right: 5px;
    border-radius: 4px;
  }

  .controls {
    text-align: center;
    margin-top: 20px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: auto auto auto;
    width: 200px;
    margin: 20px auto;
  }

  .center-buttons {
    display: flex;
    justify-content: space-between;
    grid-column: span 3;
  }

  .controls > button,
  .center-buttons > button {
    padding: 10px;
    margin: 5px;
    font-size: 16px;
  }

  .legend {
    display: flex;
    justify-content: center;
    margin-bottom: 10px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    margin: 0 10px;
  }

  @media only screen and (max-width: 768px) {
    .legend {
      flex-wrap: wrap;
    }

    .legend-item {
      width: 33.333%;
      margin: 10px 0 0 0;
      justify-content: center;
    }
  }

  .wife-box {
    padding: 0 5px;
  }

  .attribute-box {
    display: flex;
    flex-wrap: wrap;
  }

  .attribute {
    width: 100%;
    margin: 4px;
  }

  .click-box {
    padding: 0 5px;
    margin-top: 10px;
    display: flex;
  }

  .click-box button {
    margin-top: 10px;
    width: 100%;
  }

  .gift-box {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    margin-top: 20px;
  }

  .gift-item {
    width: calc(50% - 8px);
    margin-top: 10px;
    display: grid;
    padding: 0 4px;
  }

  /* 钓鱼 */
  .game-container {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .time {
    font-size: 15px;
    margin-bottom: 10px;
  }

  /* 钓鱼操作提示 */
  .fishing-tips {
    width: 100%;
    margin-bottom: 10px;
    padding: 6px 10px;
    font-size: 13px;
    color: var(--el-color-warning);
    border: 1px dashed var(--el-color-warning);
    border-radius: 4px;
    box-sizing: border-box;
  }

  /* 钓到鱼弹窗 */
  .fish-catch {
    text-align: center;
  }

  .fish-catch .fish-icon {
    width: 96px;
    height: 96px;
    image-rendering: pixelated;
  }

  .outer-wrapper {
    display: flex;
    align-items: center;
    width: 100%;
  }

  /* 像素钓鱼画布 (填满进度条以外宽度) */
  .fishing-stage {
    flex: 1;
    min-width: 0;
  }

  .progress-bar-container {
    width: 40px;
    height: 400px;
    margin-right: 10px;
    border: 2px solid var(--el-border-color);
    border-radius: 5px;
    position: relative;
    overflow: hidden;
  }

  .progress-bar {
    width: 100%;
    height: 0%;
    background-color: var(--el-color-success);
    position: absolute;
    bottom: 0;
    transition: height 0.3s ease;
    display: flex;
    justify-content: center;
    align-items: flex-end;
  }

  .progress-text {
    color: var(--el-text-color-primary);
    font-size: 13px;
    font-weight: bold;
    padding-bottom: 5px;
    position: relative;
    top: 50%;
    bottom: 0;
    text-align: center;
    transform: translateY(-50%);
  }

  .button {
    margin-top: 10px;
    padding: 10px 20px;
    font-size: 16px;
    width: 100%;
  }

  /* 移动按钮 */
  .shortcutKeys {
    color: rgba(169, 169, 169, 0.4);
    margin-left: 2px;
  }

  /* 钓鱼 */
  .diaoyu-shortcutKeys {
    display: block;
  }

  @media only screen and (max-width: 768px) {
    .shortcutKeys {
      display: block;
    }

    .diaoyu-shortcutKeys {
      color: rgba(169, 169, 169, 0.4);
      margin-left: 2px;
    }
  }
</style>

<style>
  /* 钓鱼动画 */
  @keyframes wobble {
    0% {
      transform: translateX(-50%) rotate(0);
    }

    25% {
      transform: translateX(-50%) rotate(-5deg);
    }

    50% {
      transform: translateX(-50%) rotate(0);
    }

    75% {
      transform: translateX(-50%) rotate(5deg);
    }

    100% {
      transform: translateX(-50%) rotate(0);
    }
  }
</style>
