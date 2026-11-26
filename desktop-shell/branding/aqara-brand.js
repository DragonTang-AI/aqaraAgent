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

  // 左侧入口：视觉上是侧栏里的一行（对齐 dsh 侧栏、随折叠/展开自适应），
  // 但它是独立浮层（不动 React 管理的 DOM），放在「设置」上方空位，不遮挡任何图标。
  const NAV_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const LIB_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.2 1.5h5.2A1.5 1.5 0 0 1 14 6v6.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-8Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

  const ensureNavStyle = () => {
    if (document.getElementById('aqara-nav-style')) return;
    const st = document.createElement('style');
    st.id = 'aqara-nav-style';
    st.textContent = [
      '#aqara-nav{position:fixed;z-index:2147482000;display:flex;flex-direction:column;gap:2px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;}',
      '#aqara-nav button{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:10px 12px;border:none;background:transparent;border-radius:9px;cursor:pointer;font:inherit;font-size:14px;font-weight:700;text-align:left;color:#cfcfcf;}',
      '#aqara-nav button:hover{background:rgba(127,127,127,.2);}',
      '#aqara-nav .an-ic{width:20px;height:20px;flex:none;display:flex;align-items:center;justify-content:center;}',
      '#aqara-nav .an-lb{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.01em;}',
      '#aqara-nav.collapsed button{justify-content:center;padding:9px 0;}',
      '#aqara-nav.collapsed .an-lb{display:none;}',
      'html.aqara-light #aqara-nav button{color:#333;}',
    ].join('\n');
    document.head.appendChild(st);
  };

  const ensureNav = () => {
    ensureNavStyle();
    let box = document.getElementById('aqara-nav');
    if (!box) {
      box = document.createElement('div');
      box.id = 'aqara-nav';
      box.innerHTML =
        '<button type="button" data-tab="partners" title="搭子 · 技能 · 连接器"><span class="an-ic">' + NAV_ICON + '</span><span class="an-lb">搭子 · 技能 · 连接器</span></button>' +
        '<button type="button" data-tab="library" title="资料库"><span class="an-ic">' + LIB_ICON + '</span><span class="an-lb">资料库</span></button>';
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b && window.aqaraNav) window.aqaraNav.open(b.getAttribute('data-tab'));
      });
      document.body.appendChild(box);
    }
    // 对齐到 dsh 侧栏：宽度随折叠/展开变化，位置放在「设置」上方空位（两行）
    const col = document.querySelector('[class*="sidebarCol"]');
    if (!col) return;
    const cr = col.getBoundingClientRect();
    const collapsed = !!document.querySelector('[class*="MbFrua_collapsed"]');
    const sa = document.querySelector('[class*="MbFrua_settingsArea"]');
    const sr = sa ? sa.getBoundingClientRect() : null;
    const w = collapsed ? 40 : Math.max(120, cr.width - 16);
    const left = collapsed ? 8 : (cr.left + 8);
    const top = sr ? (sr.top - 92) : (window.innerHeight - 142);
    box.classList.toggle('collapsed', collapsed);
    box.style.left = left + 'px';
    box.style.top = Math.max(cr.top + 60, top) + 'px';
    box.style.width = w + 'px';
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
    try { setTitle(); ensureStyle(); applyThemeClass(); ensureNav(); swapTexts(); } catch (_) {}
  };

  apply();
  setInterval(apply, 1200);
})();
