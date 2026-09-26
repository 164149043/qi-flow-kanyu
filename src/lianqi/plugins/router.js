import map from '../views/mapExploration.vue'
import boss from '../views/bossPage.vue'
import home from '../views/homePage.vue'
import index from '../views/indexPage.vue'
import explore from '../views/explorePage.vue'
import cultivate from '../views/cultivatePage.vue'
import endlesstower from '../views/endlessPage.vue'
import game from '../views/game/game.vue'
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'index',
    meta: {
      keepAlive: false
    },
    component: index
  },
  {
    path: '/home',
    name: 'home',
    meta: {
      keepAlive: false
    },
    component: home
  },
  {
    path: '/cultivate',
    name: 'cultivate',
    meta: {
      keepAlive: false
    },
    component: cultivate
  },
  {
    path: '/map',
    name: 'map',
    meta: {
      // 地图画布常驻 (keep-alive): 避免反复创建/销毁 2500 精灵造成的内存累积
      keepAlive: true
    },
    component: map
  },
  {
    path: '/explore',
    name: 'explore',
    meta: {
      keepAlive: false
    },
    component: explore
  },
  {
    path: '/boss',
    name: 'boss',
    meta: {
      keepAlive: false
    },
    component: boss
  },
  {
    path: '/endlesstower',
    name: 'endlesstower',
    meta: {
      keepAlive: false
    },
    component: endlesstower
  },
  {
    path: '/game',
    name: 'game',
    meta: {
      keepAlive: false
    },
    component: game
  }
]
const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
