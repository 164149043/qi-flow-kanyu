/** @type {import('tailwindcss').Config} */
// 夜空洞天主题（2026-10 M3 换肤）：与主站星空门户同血统——纯黑底 + 霁青 #6DCBF4 + 赭橙 #F87915。
// 策略：直接重定义原项目的 stone/ink/paper 色阶为夜空冷阶（组件里数百处 bg-stone-* 类名零改动全局变调），
// mystic.gold 由鎏金 #cba135 改霁青（全部引用点自动跟随）。五行功能色（金木水火土的黄绿蓝红棕）是语义色，不在 token 层。
export default {
  content: ['./index.html', './**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // 楷体系统栈（零下载），替代原 Noto Serif SC
        serif: ['KaiTi', 'STKaiti', '楷体', '"Noto Serif SC"', 'serif'],
      },
      colors: {
        // 夜空冷黑阶（覆盖原 ink 暖灰）
        ink: {
          900: '#05070d',
          800: '#0b111c',
          700: '#131c2c',
        },
        // 星幕冷阶（覆盖原 paper 宣纸暖米）
        paper: {
          100: '#eef3fa',
          200: '#dde6f2',
          800: '#1a2334',
          900: '#0d1420',
        },
        // astra 双色（主站同源：霁青+赭橙）
        astra: {
          cyan: '#6DCBF4',
          ember: '#F87915',
        },
        mystic: {
          gold: '#6DCBF4', // 鎏金→霁青：全部 mystic-gold 引用点全局变调
          jade: '#4aa8a0', // 玉绿冷化
          blood: '#8a2c2c', // 血色保留
        },
        // 夜空色阶覆盖默认 stone（数百处 stone-* 类名自动变冷阶，亮度关系对齐原版）
        stone: {
          50: '#f4f8fc',
          100: '#e8eef7',
          200: '#c9d6e8',
          300: '#9db0cf',
          400: '#6b7fa3',
          500: '#46587a',
          600: '#2c3c54',
          700: '#1f2c40',
          800: '#16202f',
          900: '#0d1420',
          950: '#05070d',
        },
      },
      animation: {
        shake: 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
        'float-up': 'floatUp 1s ease-out forwards',
        slash: 'slash 0.3s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        shake: {
          '10%, 90%': { transform: 'translate3d(-1px, 0, 0)' },
          '20%, 80%': { transform: 'translate3d(2px, 0, 0)' },
          '30%, 50%, 70%': { transform: 'translate3d(-4px, 0, 0)' },
          '40%, 60%': { transform: 'translate3d(4px, 0, 0)' },
        },
        floatUp: {
          '0%': {
            opacity: '1',
            transform: 'translate(-50%, -50%) scale(0.5)',
          },
          '20%': {
            opacity: '1',
            transform: 'translate(-50%, -150%) scale(1.2)',
          },
          '100%': {
            opacity: '0',
            transform: 'translate(-50%, -300%) scale(1)',
          },
        },
        slash: {
          '0%': {
            opacity: '0',
            transform: 'translate(-50%, -50%) rotate(45deg) scaleX(0)',
          },
          '50%': {
            opacity: '1',
            transform: 'translate(-50%, -50%) rotate(45deg) scaleX(1)',
          },
          '100%': {
            opacity: '0',
            transform: 'translate(-50%, -50%) rotate(45deg) scaleX(1.2)',
          },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': {
            opacity: '1',
            filter: 'drop-shadow(0 0 30px rgba(109, 203, 244, 0.5))',
          },
          '50%': {
            opacity: '0.9',
            filter: 'drop-shadow(0 0 50px rgba(109, 203, 244, 0.8))',
          },
        },
      },
    },
  },
  plugins: [],
};
