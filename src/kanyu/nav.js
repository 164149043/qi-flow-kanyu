/**
 * nav.js —— 跨页顶部导航（三页版：主页 ⇄ 炁流3D ⇄ 堪舆）
 * 自 xunqi 站 nav.js 改造：删寻炁/阴宅/人体死链；index.html 让位给星空门户后改相对路径三链。
 */
const LINKS = [
  { href: 'index.html', label: '主页', key: 'home' },
  { href: 'qiliu.html', label: '炁流 3D', key: 'main' },
  { href: 'kanyu.html', label: '堪舆', key: 'kanyu' },
];

export function renderNav(activeKey) {
  const nav = document.createElement('nav');
  nav.className = 'nav';
  // 分段切换器（与炁流页左上同款）：active 霁青填充——双页入口对称
  nav.innerHTML =
    '<span class="brand">炁 流</span>' +
    '<div class="pager">' +
    LINKS.map((l) => `<a href="${l.href}" class="${l.key === activeKey ? 'active' : ''}">${l.label}</a>`).join('') +
    '</div>';
  return nav;
}
