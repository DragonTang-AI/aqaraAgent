/* Aqara 品牌注入 —— 在 dsh Web UI 加载后，把 DeepSeek 品牌元素替换为 Aqara。
 * 由 Electron 主进程读取本文件、填入 __LOGO_DATA_URL__（字标）与 __MARK_DATA_URL__（图标）后注入。
 * 设计：不修改 dsh 源码；用 MutationObserver + 兜底定时适配 SPA 重渲染；随主题自动切换配色。 */
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

  // 当前是否浅色主题（按页面背景亮度判断，兼容 dsh 主题变量）
  const isLight = () => {
    try {
      const bg = getComputedStyle(document.body).backgroundColor;
      const m = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return false;
      const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
      return lum > 0.5;
    } catch (_) { return false; }
  };

  // 字标（白色）浅色下变黑；图标（黑底）深色下反相为白底，保证两种主题都清晰可见
  const applyLogoTheme = () => {
    const light = isLight();
    document.querySelectorAll('[data-aqara-logo="wordmark"]').forEach((el) => {
      el.style.filter = light ? 'brightness(0)' : 'none';
    });
    document.querySelectorAll('[data-aqara-logo="mark"]').forEach((el) => {
      el.style.filter = light ? 'none' : 'invert(1)';
    });
  };
  window.__aqaraApplyLogoTheme = applyLogoTheme;

  const makeImg = (src, kind, h) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = BRAND_NAME;
    img.draggable = false;
    img.setAttribute('data-aqara-logo', kind);
    if (h) img.style.height = h + 'px';
    img.style.width = 'auto';
    img.style.display = 'block';
    return img;
  };

  // 左上角品牌：展开态把字标 <svg> 换成 Aqara 字标；收起态把鲸鱼图标换成 Aqara 图标
  const swapLogo = () => {
    document.querySelectorAll('svg').forEach((svg) => {
      const vb = (svg.getAttribute('viewBox') || '').trim().split(/\s+/);
      const vbW = parseFloat(vb[2] || '0');
      const svgCls = String((svg.classList && svg.classList.value) || svg.className || '');
      const parentCls = svg.parentElement ? String(svg.parentElement.className || '') : '';

      // 收起态：鲸鱼（railFish）→ Aqara 图标
      if (/railFish/i.test(svgCls)) {
        svg.replaceWith(makeImg(MARK, 'mark', 20));
        return;
      }
      // 展开态：宽字标（parent 含 brand）→ Aqara 字标
      if (vbW > 100 && /brand/i.test(parentCls)) {
        svg.replaceWith(makeImg(LOGO, 'wordmark', 22));
      }
    });
  };

  // 文案：欢迎语 + 预览徽标
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

  // 隐藏 hero 标题前的 DeepSeek 鲸鱼图标
  const hideFish = () => {
    document.querySelectorAll('[class*="fishHitbox"]').forEach((el) => {
      if (el.style.display !== 'none') el.style.display = 'none';
    });
  };

  const apply = () => {
    try { setTitle(); swapLogo(); swapTexts(); hideFish(); applyLogoTheme(); } catch (_) {}
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  };

  apply();
  try {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
    });
  } catch (_) {}
  setInterval(apply, 1200);
})();
