/**
 * nav.js —— 堪舆页顶栏（品牌 + 返回门户）
 * 跨页三链切换器已按需求移除，功能页统一只留「返回」。
 */
export function renderNav() {
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.innerHTML =
    '<span class="brand">炁 流</span>' +
    '<div class="pager"><a href="index.html" title="返回门户">返回</a></div>';
  return nav;
}
