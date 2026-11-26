// QA-only gesture checks against the generated page; never exported to runtime.
import assert from 'node:assert/strict';
export async function pullGesture(page, options = {}) {
  await page.waitForFunction(()=>{const indicator=document.querySelector('#pull-indicator'), content=document.querySelector('.pull-refresh-content');return indicator.classList.contains('is-refreshing') || !content || content.style.transform==='' && (getComputedStyle(content).transform==='none' || Math.abs(new DOMMatrixReadOnly(getComputedStyle(content).transform).m42)<.1);});
  return page.evaluate(options => {
    const tab = window.StudioTabs.active();
    const selector = tab === 'home' ? '#summary-label' : `#${tab === 'devices' ? 'devices' : 'automation'}-content .directory-heading h2`;
    const origin = tab === 'home' ? '#home-panel .hero-card' : tab === 'devices' ? '.device-plugin-row .directory-copy strong' : '#scenes-directory .directory-copy strong';
    let target = document.querySelector(options.selector || origin); let temporary;
    if (options.temporary) {
      temporary = document.createElement('div'); temporary.innerHTML = options.temporary;
      document.querySelector(`#${tab}-panel`).appendChild(temporary); target = temporary.firstElementChild;
    }
    const rects = () => ['#app', '#topbar', '#studio-tabbar', selector].map(s => document.querySelector(s).getBoundingClientRect().toJSON());
    const before = rects(); const calls = window.__calls.length;
    const emit = (type, x, y, count = 1) => {
      const touch = { identifier: 7, clientX: x, clientY: y };
      const touches = type === 'touchend' || type === 'touchcancel' ? [] : count === 2 ? [touch, {identifier: 8, clientX: x + 10, clientY: y}] : [touch];
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: {value: touches}, changedTouches: {value: [touch]} });
      target.dispatchEvent(event); return event.defaultPrevented;
    };
    emit('touchstart', 100, 100);
    const prevented = (options.moves || [[100, 270]]).map(([x,y,count]) => emit('touchmove', x, y, count));
    const during = rects();
    const indicator = document.querySelector('#pull-indicator');
    const indicatorStyleTop = parseFloat(getComputedStyle(indicator).top);
    const indicatorTop = indicator.getBoundingClientRect().top;
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
    const visible = document.querySelector('#pull-indicator').classList.contains('is-visible');
    const ready = document.querySelector('#pull-indicator').classList.contains('is-ready');
    if (options.switchTab) document.querySelector(`#tab-${options.switchTab}`).click();
    emit(options.cancel ? 'touchcancel' : 'touchend', 100, 270);
    if (ready && !options.cancel && !options.switchTab) target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
    if (temporary) temporary.remove();
    return {before, during, visible, ready, prevented, indicatorStyleTop, indicatorTop, safeTop, calls, callsAfter: window.__calls.length, transform: document.querySelector('#app').style.transform, refreshing: document.querySelector('#pull-indicator').classList.contains('is-refreshing')};
  }, options);
}
export async function verifyPullRefresh(page) {
  const originalSafeTop = await page.evaluate(() => { const root=document.documentElement; const old=root.style.getPropertyValue('--safe-top'); root.style.setProperty('--safe-top','59px'); return old; });
  for (const tab of ['home', 'devices', 'automation']) {
    await page.locator(`#tab-${tab}`).click();
    if(tab==='automation')await page.locator('#smart-tab-scenes').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => !window.StudioHomeRefresh.busy() && !document.querySelector('.directory-loading'));
    const cases = [
      {moves: [[180,110],[100,280]]}, // Horizontal intent stays cancelled even if subsequently vertical.
      {moves: [[100,80],[100,280]]},
      {moves: [[100,130]]},
      {moves: [[100,270,2]]},
      {cancel: true},
      {selector: `#tab-${tab}`},
      ...(tab === 'home' ? [{selector:'#mine-button'}] : tab === 'automation' ? [{selector:'.automation-switch'}] : [{selector:'.directory-filter'}]),
      {temporary: '<input type="range">'},
      {temporary: '<input type="search">'},
      {temporary: '<div style="overflow-x:auto">Horizontal scroller</div>'},
      {temporary: '<div style="overflow-y:auto">Nested scroller</div>'},
      {temporary: '<div role="dialog" aria-modal="true">Modal</div>'}
    ];
    for (const options of cases) {
      const result = await pullGesture(page, options);
      assert.equal(result.refreshing, false, `${tab}: excluded/cancelled gesture cannot refresh ${JSON.stringify(options)}`);
      assert.equal(result.transform, ''); assert.deepEqual(result.during[0],result.before[0],`${tab}: shell geometry stable`); assert.deepEqual(result.during[2],result.before[2],`${tab}: navigation never follows a drag`);
      assert.ok(result.during[3].top-result.before[3].top>=0 && result.during[3].top-result.before[3].top<=60, `${tab}: content drag stays bounded`);
      assert.equal(result.callsAfter, result.calls, `${tab}: excluded drag makes no requests`);
      assert.equal(await page.locator('#pull-indicator').evaluate(n => n.classList.contains('is-visible')), false);
    }
    // Starting away from the top must remain normal page scrolling.
    await page.evaluate(() => { const spacer = document.createElement('div'); spacer.id = 'qa-scroll-spacer'; spacer.style.height = '1200px'; document.querySelector(`#${window.StudioTabs.active()}-panel`).appendChild(spacer); window.scrollTo(0,100); });
    const offTop = await pullGesture(page);
    assert.equal(offTop.visible, false, `${tab}: off-top start`); assert.equal(offTop.refreshing, false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.querySelector('#qa-scroll-spacer').remove());
    const filter = await page.locator('.directory-filter').getAttribute('aria-pressed').catch(() => null);
    await page.evaluate(() => { window.__holdPullReads = true; });
    const accepted = await pullGesture(page);
    assert.equal(accepted.ready, true); assert.equal(accepted.refreshing, true); assert.deepEqual(accepted.prevented, [true]);
    assert.ok(accepted.indicatorStyleTop >= accepted.safeTop + 8, `${tab}: indicator clears the 59px safe-area mask`);
    assert.ok(accepted.indicatorTop >= accepted.safeTop, `${tab}: even its entry animation stays below the mask`);
    assert.equal(accepted.indicatorStyleTop, 67, `${tab}: consistent safe-area placement rather than header-bottom placement`);
    assert.equal(accepted.transform, ''); assert.deepEqual(accepted.during[0],accepted.before[0]); assert.deepEqual(accepted.during[2],accepted.before[2]);
    assert.equal(accepted.during[3].top-accepted.before[3].top,60, `${tab}: content reveals the refresh area with bounded movement`);
    assert.equal(await page.locator('.pull-refresh-content').evaluate(n=>n.style.transform),'translateY(44px)',`${tab}: release holds a short refresh offset`);
    // Rapid second gesture while a request owns the indicator must not start another refresh.
    const duplicate = await pullGesture(page);
    assert.equal(duplicate.visible, true); assert.equal(duplicate.callsAfter, duplicate.calls);
    await page.evaluate(() => window.__releasePullReads());
    await page.waitForFunction(() => !document.querySelector('#pull-indicator').classList.contains('is-visible'));
    await page.waitForFunction(()=>{const n=document.querySelector('.pull-refresh-content');return n.style.transform==='' && (getComputedStyle(n).transform==='none'||new DOMMatrixReadOnly(getComputedStyle(n).transform).m42<.1);});
    const calls = await page.evaluate(start => window.__calls.slice(start), accepted.calls);
    assert.equal(calls.filter(c=>c.action==='openDevicePlugin').length,0,'owned drag cannot ghost-click a device plugin');
    assert.equal(await page.locator('.capability-sheet-layer').isVisible().catch(()=>false),false,'owned drag cannot open device details');
    assert.ok(calls.length > 0, `${tab}: intentional pull reads Studio`);
    const listPath = tab === 'home' ? '/spaces' : tab === 'automation' ? '/scenes' : '/devices';
    const reads = calls.filter(c => c.action === 'nativeHttpRequest' && new URL(c.data.url, "https://qa.invalid").pathname.endsWith(listPath) && ((c.data.params || {}).pageNum || 1) === 1);
    assert.equal(reads.length, 1, `${tab}: exactly one first-page list refresh`);
    if(tab==='automation')assert.equal(calls.filter(c=>c.action==='nativeHttpRequest'&&new URL(c.data.url,'https://qa.invalid').pathname.endsWith('/automations')).length,0,'Scenes pull does not refresh the inactive automation list');
    if (tab === 'devices') assert.equal(await page.locator('.directory-filter').getAttribute('aria-pressed'), filter, 'refresh preserves selected space');
    assert.equal(await page.evaluate(() => window.scrollY), 0, `${tab}: refresh stays at page top`);
  }
  // Hold a Smart refresh across a tab switch: old completion cannot move or reset the new page.
  await page.locator('#tab-automation').click(); await page.evaluate(() => { window.scrollTo(0,0); window.__holdPullReads=true; });
  await pullGesture(page);
  await page.waitForFunction(() => window.__heldPullReads.length > 0);
  await page.locator('#tab-devices').click(); await page.evaluate(() => window.scrollTo(0,0));
  const whilePending = await pullGesture(page);
  assert.equal(whilePending.visible, false); assert.equal(whilePending.refreshing, false);
  await page.evaluate(() => window.__releasePullReads());
  await page.waitForFunction(() => !document.querySelector('.directory-loading'));
  assert.equal(await page.evaluate(() => window.StudioTabs.active()), 'devices');
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.locator('#tab-devices').click(); await page.evaluate(() => window.scrollTo(0, 0));
  const cancelled = await pullGesture(page, {switchTab:'automation'});
  assert.equal(cancelled.refreshing, false, 'switch during drag cancels release');
  assert.equal(await page.locator('.pull-refresh-content').evaluate(n=>n.style.transform),'','switch cancels content offset synchronously');
  assert.equal(await page.locator('#pull-indicator').evaluate(n => n.classList.contains('is-visible')), false);
  await page.evaluate(old => {if(old)document.documentElement.style.setProperty('--safe-top',old);else document.documentElement.style.removeProperty('--safe-top');}, originalSafeTop);
}

// Trusted browser touch events, in addition to synthetic cancellation edge cases.
export async function verifyTrustedListPull(page) {
  await page.locator('#tab-devices').click();
  await page.evaluate(()=>{window.scrollTo(0,0);window.__holdPullReads=true;window.__trustedPullMoves=0;document.addEventListener('touchmove',e=>{if(e.isTrusted)window.__trustedPullMoves++;},{capture:true,passive:true});});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pull-refresh-content')).transform==='none');
  const origin=await page.locator('.device-plugin-row .directory-copy strong').first().evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
  assert.ok(origin.y+170<844,'trusted gesture stays inside the device viewport');
  const navBefore=await page.locator('#studio-tabbar').evaluate(n=>n.getBoundingClientRect().toJSON());
  const callsBefore=await page.evaluate(()=>window.__calls.length);
  const client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...origin,id:7}]});
  for(const dy of [16,40,80,130,160])await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:origin.x,y:origin.y+dy,id:7}]});
  assert.equal(await page.locator('#pull-indicator').evaluate(n=>n.classList.contains('is-ready')),true,'trusted list drag reaches the release threshold');
  assert.equal(await page.locator('.pull-refresh-content').evaluate(n=>n.style.transform),'translateY(60px)');
  assert.deepEqual(await page.locator('#studio-tabbar').evaluate(n=>n.getBoundingClientRect().toJSON()),navBefore);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>window.__heldPullReads.length>0);
  assert.equal(await page.locator('#pull-indicator').evaluate(n=>n.classList.contains('is-refreshing')),true);
  assert.ok(await page.evaluate(()=>window.__trustedPullMoves>0));
  await page.evaluate(()=>window.__releasePullReads());
  await page.waitForFunction(()=>!document.querySelector('#pull-indicator').classList.contains('is-visible')&&getComputedStyle(document.querySelector('.pull-refresh-content')).transform==='none');
  const calls=await page.evaluate(start=>window.__calls.slice(start),callsBefore);
  assert.equal(calls.filter(c=>c.action==='openDevicePlugin').length,0,'trusted drag cannot navigate');
  assert.equal(calls.filter(c=>c.action==='nativeHttpRequest'&&c.data.url.endsWith('/devices')).length,1,'trusted drag refreshes the list once');
  assert.equal(await page.evaluate(()=>scrollY),0,'trusted pull leaves document scroll at its origin');
  await client.detach();
  await page.locator('#tab-automation').click();
}
