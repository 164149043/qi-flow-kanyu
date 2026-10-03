// Tailwind 4 经 postcss 接入，仅供 src/dongtian 的 index.css（@import 'tailwindcss'）消费；
// 主项目四入口的 css 不含 tailwind 指令，经此插件透传无变化。
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
