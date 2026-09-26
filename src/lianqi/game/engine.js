// 像素风 PixiJS 应用工厂
// 统一处理: 禁抗锯齿 / nearest 采样 / 分辨率对齐 / 生命周期销毁
// 所有游戏页面共用, 避免 WebGL 上下文泄漏 (浏览器上限约 16 个)
import { Application } from 'pixi.js'

// 创建统一配置的像素风应用并挂载到容器
// el: 挂载的 DOM 元素; opts: { width, height, background }
export const createPixelApp = async (el, opts = {}) => {
  const app = new Application()
  const init = {
    // 像素风必须禁用抗锯齿
    antialias: false,
    // 分辨率对齐设备像素比, 高分屏不糊
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    background: opts.background ?? 0x1c1a26,
    width: opts.width ?? el.clientWidth,
    height: opts.height ?? el.clientHeight,
    // 老设备优先走 WebGL (WebGPU 兼容性风险)
    preference: 'webgl'
  }
  // 传入 resizeTo 时画布跟随容器尺寸 (覆盖 width/height)
  if (opts.resizeTo) init.resizeTo = opts.resizeTo
  await app.init(init)
  el.appendChild(app.canvas)
  return app
}

// 销毁应用 (组件 onUnmounted 必须调用, 否则切换页面累积 WebGL 上下文)
// 注意: 不销毁纹理 (纹理由 textures.js 模块级缓存共享)
export const destroyPixelApp = app => {
  if (!app) return
  try {
    app.destroy(
      { removeView: true },
      { children: true, texture: false, textureSource: false }
    )
  } catch (e) {
    // 页面卸载途中销毁可能抛错, 忽略即可
  }
}
