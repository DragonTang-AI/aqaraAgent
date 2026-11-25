/* Aqara 品牌注入 —— 在 dsh Web UI 加载后，把 DeepSeek 品牌元素替换为 Aqara。
 * 由 Electron 主进程读取本文件、填入 __LOGO_DATA_URL__（字标）与 __MARK_DATA_URL__（图标）后注入。
 *
 * ⚠️ 关键约束：dsh 是 React 应用。**绝不能删除/替换 React 管理的 DOM 节点**
 *    （早期用 svg.replaceWith(img) 会破坏 React 虚拟 DOM，导致点击侧栏按钮后整块渲染空白）。
 *    因此本脚本只做两件"无害"的事：注入一段 <style> + 在 <html> 上加一个主题类。
 */
(() => {
  const BRAND_NAME = 'Aqara 空间智能';
  const HERO_TEXT = '让空间自己思考';
  const PREVIEW_BADGE = '内测版';
  const LOGO = '__LOGO_DATA_URL__'; // 白色字标（Aqara wordmark）
  const MARK = '__MARK_DATA_URL__'; // App 图标（黑底白字）

  const setTitle = () => {
    if (document.title && /DeepSeek\s*Harness/i.test(document.title)) {
      document.title = document.title.replace(/DeepSeek\s*Harness/gi, BRAND_NAME);
    }
  };

  // 是否浅色主题（按页面背景亮度判断，兼容 dsh 主题变量）
  const isLight = () => {
    try {
      const bg = getComputedStyle(document.body).backgroundColor;
      const m = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return false;
      const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
      return lum > 0.5;
    } catch (_) { return false; }
  };

  // 用样式表把 logo 换成 Aqara：收起态用图标、展开态用字标；随主题自动换色
  const ensureStyle = () => {
    if (document.getElementById('aqara-brand-style')) return;
    const st = document.createElement('style');
    st.id = 'aqara-brand-style';
    st.textContent = [
      // 隐藏 DeepSeek 鲸鱼（收起态图标 / hero 图标）
      '[class*="railFish"]{display:none !important;}',
      '[class*="fishHitbox"]{display:none !important;}',
      // 收起态：把侧栏切换按钮的图标换成 Aqara 图标（作背景，不改 DOM）
      'button[class*="MbFrua_toggle"]{background-image:url("' + MARK + '");background-repeat:no-repeat;background-position:center;background-size:20px 20px;}',
      'html.aqara-light button[class*="MbFrua_toggle"]{filter:invert(1);}',
      // 展开态：把品牌字标换成 Aqara 字标（隐藏原 svg + 作背景）
      'button[class*="MbFrua_brand"] svg{display:none !important;}',
      'button[class*="MbFrua_brand"]{background-image:url("' + LOGO + '");background-repeat:no-repeat;background-position:left center;background-size:auto 22px;min-width:96px;min-height:26px;}',
      'html.aqara-light button[class*="MbFrua_brand"]{filter:brightness(0);}',
    ].join('\n');
    document.head.appendChild(st);
  };

  const applyThemeClass = () => {
    document.documentElement.classList.toggle('aqara-light', isLight());
  };

  // 文案：欢迎语 + 预览徽标（仅改文本内容，不增删节点）
  const swapTexts = () => {
    const walk = (el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          const t = n.textContent;
          if (t.includes('探索未至之境')) n.textContent = t.replace('探索未至之境', HERO_TEXT);
          else if (t.trim() === '预览版') n.textContent = t.replace('预览版', PREVIEW_BADGE);
        } else if (n.nodeType === 1 && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') {
          walk(n);
        }
      }
    };
    walk(document.body);
  };

  const apply = () => {
    try { setTitle(); ensureStyle(); applyThemeClass(); swapTexts(); } catch (_) {}
  };

  apply();
  setInterval(apply, 1200);
})();
