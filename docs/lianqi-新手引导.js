/**
 * ============================================================
 *  炼炁 · 新手指引 v1.0
 * ============================================================
 *  用法：游戏内「游戏设置 → 导入脚本」选择本文件，确认后页面刷新即生效。
 *  原理：脚本随存档保存在浏览器里，每次打开游戏自动运行（设置里可随时删除）。
 *  功能：右下角悬浮球「引」——展开六步上手路线，每步可一键跳到对应页面
 *        并高亮目标按钮；新档自动弹出，完成情况本地记忆。
 * ============================================================
 */
;(() => {
  'use strict'

  // 已装过就不再装（存档导入可能触发多次求值）
  if (window.__LIANQI_GUIDE__) return
  window.__LIANQI_GUIDE__ = true

  const DONE_KEY = 'lq_guide_done_v1'

  // ---------- 六步路线 ----------
  const STEPS = [
    {
      title: '领新手礼包',
      route: '#/home',
      target: '领取新手礼包',
      tip: '开局第一件事：在主页「装备」页签里点「领取新手礼包」，白得一套起步神兵护甲。'
    },
    {
      title: '分解垃圾装备',
      route: '#/home',
      target: '一键分解神兵',
      tip: '打怪掉的重复装备别留着——品质低的「一键分解」成资源，好装备点开对比属性再穿。'
    },
    {
      title: '开始修炼',
      route: '#/home',
      target: '开始修炼',
      tip: '点「开始修炼」进入修炼页。修为会随时间自动增长，这就是「挂机」的核心：挂着就变强。'
    },
    {
      title: '转生突破',
      route: '#/cultivate',
      target: '转生突破',
      tip: '修为涨到 100% 后点「转生突破」：境界提升、全属性大涨，修为清零重新积累，周而复始。'
    },
    {
      title: '探索秘境',
      route: '#/explore',
      target: '发起战斗',
      tip: '主页「探索秘境」进图打怪掉装备。快捷键：Q 战斗 / E 收服灵宠 / R 撤退 / F 继续探索 / G 回家疗伤。打不过就撤，回家回血再来。'
    },
    {
      title: '存档无忧',
      route: '#/home',
      target: '游戏设置',
      tip: '进度自动存在本浏览器（localStorage）。换电脑 / 清浏览器前，记得「游戏设置 → 导出存档」，到新环境再「导入存档」。'
    }
  ]

  // ---------- 样式 ----------
  const CSS = `
.lqg-ball{position:fixed;right:22px;bottom:22px;z-index:3000;width:46px;height:46px;
  border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;
  font-family:KaiTi,STKaiti,serif;font-size:22px;color:#f5efe0;
  background:radial-gradient(circle at 34% 30%,#5a4a32,#2e2418 70%);
  border:1px solid rgba(220,200,160,.4);box-shadow:0 4px 14px rgba(0,0,0,.35);
  transition:transform .2s,box-shadow .2s;user-select:none}
.lqg-ball:hover{transform:scale(1.08);box-shadow:0 6px 18px rgba(0,0,0,.5)}
.lqg-ball .dot{position:absolute;top:2px;right:2px;width:9px;height:9px;border-radius:50%;
  background:#e6a23c;box-shadow:0 0 6px #e6a23c;animation:lqgPulse 1.6s infinite}
.lqg-panel{position:fixed;right:22px;bottom:78px;z-index:3000;width:min(330px,86vw);
  max-height:min(560px,72vh);overflow:auto;border-radius:12px;padding:14px 14px 8px;
  font-family:KaiTi,STKaiti,serif;color:#3a3226;
  background:rgba(250,246,236,.96);border:1px solid rgba(120,100,70,.35);
  box-shadow:0 10px 34px rgba(0,0,0,.28);backdrop-filter:blur(6px)}
html.dark .lqg-panel{color:#d8d2c4;background:rgba(28,26,22,.96);border-color:rgba(200,180,140,.22)}
.lqg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.lqg-title{font-size:17px;font-weight:700;letter-spacing:2px}
.lqg-close{cursor:pointer;font-size:15px;opacity:.55;padding:2px 6px}
.lqg-close:hover{opacity:1}
.lqg-step{padding:9px 10px;margin-bottom:8px;border-radius:9px;border:1px solid rgba(120,100,70,.18);
  background:rgba(255,255,255,.5)}
html.dark .lqg-step{background:rgba(255,255,255,.05);border-color:rgba(200,180,140,.14)}
.lqg-step.done{opacity:.55}
.lqg-step-top{display:flex;align-items:center;gap:8px}
.lqg-no{flex:none;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:12px;color:#f5efe0;background:#6b5a3e}
html.dark .lqg-no{background:#8a744e}
.lqg-step.done .lqg-no{background:#67c23a}
.lqg-st{flex:1;font-size:14.5px;font-weight:700;letter-spacing:1px}
.lqg-check{flex:none;cursor:pointer;font-size:13px;color:#67c23a;opacity:.85;padding:2px 4px}
.lqg-tip{font-size:12.5px;line-height:1.75;margin:6px 2px 0 30px;opacity:.88;font-family:inherit}
.lqg-go{margin:7px 0 2px 30px;cursor:pointer;font-size:12.5px;letter-spacing:1px;
  padding:3px 14px;border-radius:999px;color:#6b4e2e;
  background:rgba(220,195,150,.35);border:1px solid rgba(150,120,80,.4)}
.lqg-go:hover{background:rgba(220,195,150,.6)}
html.dark .lqg-go{color:#dcc896;background:rgba(160,135,90,.22);border-color:rgba(200,180,140,.35)}
.lqg-hl{outline:3px solid #e6a23c !important;outline-offset:3px;border-radius:6px;
  animation:lqgGlow 1s ease-in-out 3}
@keyframes lqgGlow{0%,100%{box-shadow:0 0 4px rgba(230,162,60,.35)}50%{box-shadow:0 0 20px rgba(230,162,60,.95)}}
@keyframes lqgPulse{0%,100%{opacity:.55}50%{opacity:1}}
`

  // ---------- 工具 ----------
  const loadDone = () => {
    try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')) } catch { return new Set() }
  }
  const saveDone = set => localStorage.setItem(DONE_KEY, JSON.stringify([...set]))

  const findBtn = txt => [...document.querySelectorAll('button, .el-tabs__item')]
    .find(b => (b.textContent || '').trim().replace(/\s+/g, ' ').startsWith(txt))

  // hash 跳转 + 轮询等待目标按钮出现后高亮
  const goStep = s => {
    if (location.hash !== s.route) location.hash = s.route
    let n = 0
    const t = setInterval(() => {
      const btn = findBtn(s.target)
      if (btn || ++n > 20) {
        clearInterval(t)
        if (btn) {
          btn.scrollIntoView({ block: 'center', behavior: 'smooth' })
          btn.classList.remove('lqg-hl')
          void btn.offsetWidth          // 重排重启动画
          btn.classList.add('lqg-hl')
          setTimeout(() => btn.classList.remove('lqg-hl'), 3200)
        }
      }
    }, 300)
  }

  // ---------- UI ----------
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const ball = document.createElement('div')
  ball.className = 'lqg-ball'
  ball.title = '新手指引'
  ball.innerHTML = '引<span class="dot"></span>'

  const panel = document.createElement('div')
  panel.className = 'lqg-panel'
  panel.style.display = 'none'

  const render = () => {
    const done = loadDone()
    panel.innerHTML =
      '<div class="lqg-head"><span class="lqg-title">炼炁 · 上手六步</span>' +
      '<span class="lqg-close">✕ 收起</span></div>' +
      STEPS.map((s, i) => {
        const isDone = done.has(i)
        return '<div class="lqg-step' + (isDone ? ' done' : '') + '">' +
          '<div class="lqg-step-top"><span class="lqg-no">' + (isDone ? '✓' : i + 1) + '</span>' +
          '<span class="lqg-st">' + s.title + '</span>' +
          '<span class="lqg-check" data-i="' + i + '">' + (isDone ? '撤销' : '完成✓') + '</span></div>' +
          '<div class="lqg-tip">' + s.tip + '</div>' +
          '<button class="lqg-go" data-i="' + i + '">带我去 →</button></div>'
      }).join('')
    ball.querySelector('.dot').style.display = done.size ? 'none' : 'block'
  }

  panel.addEventListener('click', e => {
    const i = e.target.dataset && e.target.dataset.i
    if (i === undefined) return
    if (e.target.classList.contains('lqg-check')) {
      const done = loadDone()
      done.has(+i) ? done.delete(+i) : done.add(+i)
      saveDone(done); render()
    } else if (e.target.classList.contains('lqg-go')) {
      goStep(STEPS[+i])
    }
  })
  // 关闭按钮（事件委托里没覆盖到 head 区，单独挂）
  panel.addEventListener('click', e => {
    if (e.target.classList.contains('lqg-close') || e.target.closest('.lqg-close')) hide()
  })

  const show = () => { render(); panel.style.display = 'block' }
  const hide = () => { panel.style.display = 'none' }
  ball.addEventListener('click', () => {
    panel.style.display === 'block' ? hide() : show()
  })

  document.body.appendChild(ball)
  document.body.appendChild(panel)

  // ---------- 新档自动弹出 ----------
  let isNew = false
  try {
    const raw = localStorage.getItem('vuex')
    isNew = !raw || !JSON.parse(raw)?.main?.player?.cultivation
  } catch { isNew = true }
  const doneCount = loadDone().size
  if (isNew && doneCount === 0) setTimeout(show, 800)
})()
