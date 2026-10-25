(async function () {
  'use strict';
  if (document.getElementById('sl-panel')) return;
  const C = ScholarLens, N = ScholarVenueStatsNormalizer;
  const VERSION = 'v1.4.3';
  const defaults = { enabled: true, showMissing: true, deduplicate: true, nativeAuthors: true, autoLoad: true, authors: '', aliases: '' };
  const roleNames = { first: '第一作者', cofirst: '共同一作', second: '第二作者', corresponding: '通讯作者', last: '末位作者', middle: '中间作者' };
  const externalRoles = { first: 'first-author-filter', cofirst: 'co-first-author-filter', second: 'second-author-filter', corresponding: 'corresponding-author-filter', last: 'last-author-filter' };
  const tierGroups = [
    ['CCF', [['ccf-A', 'A类'], ['ccf-B', 'B类'], ['ccf-C', 'C类']]],
    ['中科院', [['cas-1', '一区'], ['cas-2', '二区'], ['cas-3', '三区'], ['cas-4', '四区']]],
    ['新锐', [['xr-1', '一区'], ['xr-2', '二区'], ['xr-3', '三区'], ['xr-4', '四区']]],
    ['其他', [['ieee', 'IEEE Trans'], ['none', '未分级']]]
  ];
  const tierNames = { 'ccf-A': 'CCF-A', 'ccf-B': 'CCF-B', 'ccf-C': 'CCF-C', 'cas-1': '中科院一区', 'cas-2': '中科院二区', 'cas-3': '中科院三区', 'cas-4': '中科院四区', 'xr-1': '新锐一区', 'xr-2': '新锐二区', 'xr-3': '新锐三区', 'xr-4': '新锐四区', ieee: 'IEEE Trans', none: '未分级' };
  const tierHints = { 'cas-1': '按中科院大类分区，多个大类取最高分区', 'xr-1': '按新锐期刊分区表 2026 大类分区，多个大类取最高；含新锐评定的 15 个计算机会议', ieee: '场所名为 IEEE Transactions / IEEE Trans.（含 IEEE/ACM Transactions）', none: '既无 CCF 等级，也无中科院与新锐分区' };
  // Roles are the default joint condition; every other group starts empty.
  const state = { settings: defaults, records: [], index: [], papers: [], visible: [], hits: [], selected: new Set(), tiers: new Set(), venueChoices: {}, recordsById: new Map(), highlightOnly: false, roles: new Set(['first']), collapsed: false, placement: null, from: '', to: '', query: '', aliases: {}, overrides: {}, loading: false, timer: null, refreshId: 0 };
  const DOCK_MIN = 300, DOCK_MAX = 340, GUTTER = 16;
  let panel, launcher, observer, dockObserver, dockFrame, catalogPromise, baseRecords, metricsKey, hadExternal = false;
  const dockTargets = new Set();
  const loading = { status: 'idle', started: false, run: 0, pending: null, lastClick: 0, paused: false, message: '' };
  const paperCount = () => document.querySelectorAll('.gsc_a_tr').length;
  const annotationCache = new WeakMap();
  let venueCache = new Map(), venueSearch = new WeakMap(), groupingAliases = N.DEFAULT_ALIASES;
  const profileId = new URLSearchParams(location.search).get('user') || 'search';
  const $ = id => panel?.querySelector('#sl-' + id);
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
  const profileName = () => C.englishName(document.querySelector('#gsc_prf_in')?.textContent || '');
  const externalAuthor = () => !!document.getElementById('author-highlighter-controls');
  const aliases = () => profileId === 'search' ? C.unique(state.settings.authors.split('\n').map(C.clean)) : state.authorResolution?.aliases || [];
  const schedule = () => { clearTimeout(state.timer); state.timer = setTimeout(render, 180); };
  const watch = () => observer?.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
  function listen() {
    observer = new MutationObserver(mutations => {
      if (mutations.some(m => {
        if (m.type === 'attributes') return m.target.matches('.gsc_a_tr') && /\bhighlighted-author\b/.test(m.oldValue || '') !== m.target.classList.contains('highlighted-author');
        if ((m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest('#sl-panel, #sl-launcher, #gsvs-panel, #author-highlighter-controls, .sl-annotations, .sl-role-dialog')) return false;
        return !(m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every(n => n.nodeType === 1 && n.matches?.('.sl-annotations, #sl-panel, #sl-launcher, .sl-role-dialog')));
      })) schedule();
    }); watch();
    window.addEventListener('resize', layoutDock);
    window.addEventListener('scroll', () => {
      if (!dockFrame) dockFrame = requestAnimationFrame(() => { dockFrame = null; layoutDock(); });
    }, { passive: true });
    document.addEventListener('change', e => { if (e.target.closest?.('#author-highlighter-controls')) schedule(); });
    // Native pagination and other extensions share this DOM event. One accepted
    // click owns the request until rows arrive, including before our catalog loads.
    document.addEventListener('click', e => {
      const button = e.target.closest?.('#gsc_bpf_more');
      if (!button || !state.settings.enabled || (!state.settings.autoLoad && !state.loading)) return;
      if (loading.pending && paperCount() > loading.pending.count) loading.pending = null;
      if (loading.pending || Date.now() - loading.lastClick < 1500 || (!e.isTrusted && loading.paused)) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
      if (!moreAvailable(button)) return;
      loading.pending = { count: paperCount(), at: Date.now() };
      loading.lastClick = Date.now();
    }, true);
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && ['settings', 'metrics', 'profileAliases', 'profileAliasChoices', 'roleOverrides', 'venueChoices'].some(k => changes[k])) refresh().catch(showError); });
  }
  async function refresh() {
    const id = ++state.refreshId;
    const [stored, catalog] = await Promise.all([chrome.storage.local.get(['settings', 'metrics', 'profileAliases', 'profileAliasChoices', 'roleOverrides', 'venueChoices']), catalogPromise ||= chrome.runtime.sendMessage({ type: 'sl:catalog' }).catch(e => { catalogPromise = null; throw e; })]);
    if (id !== state.refreshId) return;
    if (!catalog?.ok) throw Error(catalog?.error || '无法读取 CCF 目录');
    const previousAuto = state.settings.autoLoad;
    state.settings = { ...defaults, ...stored.settings };
    if (previousAuto && !state.settings.autoLoad && state.loading) stopLoading();
    if (!previousAuto && state.settings.autoLoad) { loading.started = false; loading.paused = false; }
    state.aliases = stored.profileAliases || {};
    state.aliasChoices = stored.profileAliasChoices?.[profileId] || {};
    state.overrides = stored.roleOverrides || {};
    state.venueChoices = stored.venueChoices || {};
    baseRecords ||= C.mergeRecords(catalog.data.records, ScholarLensCatalog.hydrateJournals(catalog.journals));
    const key = JSON.stringify(stored.metrics || []);
    if (key !== metricsKey) {
      state.records = ScholarLensCatalog.attachAliases(C.mergeRecords(baseRecords, stored.metrics || []), catalog.aliases, catalog.journals);
      state.index = C.buildIndex(state.records); metricsKey = key; venueCache = new Map(); venueSearch = new WeakMap();
      state.recordsById = new Map(state.records.map(r => [r.id, r]));
    }
    groupingAliases = [...N.parseAliasText(state.settings.aliases || ''), ...N.DEFAULT_ALIASES];
    if (!panel && state.settings.enabled) mount();
    render();
  }
  function showError(error) {
    console.warn('[Scholar Lens]', error.message);
    if (!panel) mount();
    if ($('scope')) $('scope').textContent = `读取失败：${error.message}。请刷新页面重试。`;
  }
  // Placement never changes native padding, width or centering:
  // dock = fixed beside the Scholar column; sidebar = under “Cited by”; below = after the page.
  function layoutDock() {
    if (!panel || !state.settings.enabled) return;
    const content = [...document.querySelectorAll('#gsc_bdy, #gsc_a_tw, #gsc_rsb, .gsc_rsb, #gsc_prf_w, #gs_res_ccl_mid, #gs_res_ccl_bot, #gs_res_lsb, #gs_res_ccl_rhs, #gs_res_ccl_ads, main')];
    const bounds = content.map(n => n.getBoundingClientRect()).filter(r => r.width && r.height);
    const viewport = document.documentElement.clientWidth;
    const right = bounds.length ? Math.max(...bounds.map(r => r.right)) : viewport;
    const width = Math.min(DOCK_MAX, Math.floor(viewport - right - 2 * GUTTER));
    const citation = document.getElementById('gsc_rsb_cit');
    const placement = width >= DOCK_MIN && innerHeight >= 420 ? 'dock' : citation?.parentElement && citation.offsetWidth >= 240 ? 'sidebar' : 'below';
    if (placement === 'sidebar') { if (citation.nextElementSibling !== panel) citation.after(panel); }
    else if (panel.parentElement !== document.body || (placement === 'below' && document.body.lastElementChild !== panel && document.body.lastElementChild !== launcher)) document.body.append(panel);
    state.placement = placement;
    const header = document.querySelector('#gs_hdr') || document.querySelector('body > header');
    const anchor = citation || document.querySelector('#gs_res_ccl_mid, #gsc_a_tw, main');
    const top = Math.max(12, Math.round((header?.getBoundingClientRect().bottom || 0) + 12), Math.round(anchor?.getBoundingClientRect().top || 0));
    const docked = placement === 'dock';
    document.documentElement.classList.add('sl-unified');
    panel.dataset.placement = placement;
    panel.hidden = docked && state.collapsed;
    $('body').hidden = !docked && state.collapsed;
    launcher.hidden = !(docked && state.collapsed);
    for (const node of [panel, launcher]) {
      node.style.setProperty('--sl-dock-top', `${top}px`);
      node.style.setProperty('--sl-dock-left', `${Math.round(right + GUTTER)}px`);
      node.style.setProperty('--sl-dock-width', `${Math.max(DOCK_MIN, width)}px`);
    }
    const label = state.collapsed ? '展开 Scholar Lens' : '收起 Scholar Lens';
    $('collapse').textContent = state.collapsed ? '+' : '−';
    $('collapse').title = label; $('collapse').setAttribute('aria-label', label);
    $('collapse').setAttribute('aria-expanded', String(!state.collapsed));
    launcher.setAttribute('aria-expanded', String(!state.collapsed));
    dockObserver ||= new ResizeObserver(layoutDock);
    for (const node of [...content, header].filter(Boolean)) {
      if (!dockTargets.has(node)) { dockTargets.add(node); dockObserver.observe(node); }
    }
    for (const node of dockTargets) {
      if (!node.isConnected) { dockObserver.unobserve(node); dockTargets.delete(node); }
    }
  }
  function toggleDock(open) {
    state.collapsed = !open; layoutDock();
    if (open || state.placement !== 'dock') $('collapse').focus({ preventScroll: true });
    else launcher.focus({ preventScroll: true });
  }
  function roleChoices() {
    const external = externalAuthor();
    for (const input of $('roles').querySelectorAll('input')) {
      const legacy = document.getElementById(externalRoles[input.value]);
      input.disabled = external && !legacy;
      input.checked = external ? !!legacy?.checked : state.roles.has(input.value);
      input.closest('label').hidden = external && input.value === 'middle';
    }
  }
  function chooseRoles(keys) {
    if (externalAuthor()) {
      for (const [role,id] of Object.entries(externalRoles)) {
        const input = document.getElementById(id);
        if (input && input.checked !== keys.has(role)) { input.checked = keys.has(role); input.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    } else state.roles = new Set(keys);
    focusOnMatches(); render();
  }
  function toggleTier(key, on = !state.tiers.has(key)) {
    on ? state.tiers.add(key) : state.tiers.delete(key);
    focusOnMatches(); render();
  }
  // Choosing a role, tier, venue, year or keyword means "show me these": switch to matches only.
  // The switch can still be turned off by hand; the next filter choice turns it on again.
  function focusOnMatches() { state.highlightOnly = conditionActive(); }
  function chip(kind, key, text, onChange) {
    const label = el('label', null, 'sl-chip'); label.dataset[kind] = key;
    const input = el('input'); input.type = 'checkbox'; input.value = key; input.id = `sl-${kind}-${key}`;
    input.addEventListener('change', onChange);
    label.append(input, el('span', text)); return label;
  }
  function mount() {
    const anchor = document.querySelector('#gsc_rsb_cit, #gsc_rsb, #gsc_a_tw, #gs_res_ccl_mid');
    if (!anchor) return;
    panel = el('section', null, 'sl-panel'); panel.id = 'sl-panel'; panel.setAttribute('aria-label', 'Scholar Lens 发表分析');
    panel.innerHTML = `<header class="sl-header"><h3 class="sl-title"><span class="sl-logo" aria-hidden="true">SL</span>Scholar Lens<small class="sl-version">${VERSION}</small></h3><div class="sl-header-actions"><button type="button" id="sl-settings" class="sl-icon" title="数据与设置" aria-label="数据与设置">⚙</button><button type="button" id="sl-collapse" class="sl-icon" aria-expanded="true" aria-label="收起 Scholar Lens" title="收起 Scholar Lens">−</button></div></header>
    <div id="sl-body">
    <section class="sl-section" aria-labelledby="sl-insights-title"><div class="sl-section-head"><h4 id="sl-insights-title" class="sl-kicker">Publication insights</h4></div>
    <table id="sl-summary" class="sl-stats"><thead><tr><th scope="col"><span class="sl-visually-hidden">指标</span></th><th scope="col">全部</th><th scope="col" class="sl-hit-col" title="同时满足下方全部筛选条件的论文">命中</th></tr></thead><tbody>
    <tr><th scope="row">论文</th><td id="sl-all-count"></td><td id="sl-hit-count" class="sl-hit-col"></td></tr>
    <tr><th scope="row">引用</th><td id="sl-all-citations"></td><td id="sl-hit-citations" class="sl-hit-col"></td></tr>
    <tr><th scope="row">h-index</th><td id="sl-all-h"></td><td id="sl-hit-h" class="sl-hit-col"></td></tr>
    <tr><th scope="row">i10-index</th><td id="sl-all-i10"></td><td id="sl-hit-i10" class="sl-hit-col"></td></tr>
    <tr class="sl-tier-stat sl-stat-sep"><th scope="row"><button type="button" data-tier="ccf-A" aria-pressed="false" title="点击按 CCF-A 筛选">CCF-A</button></th><td id="sl-all-ccfA"></td><td id="sl-hit-ccfA" class="sl-hit-col"></td></tr>
    <tr class="sl-tier-stat"><th scope="row"><button type="button" data-tier="cas-1" aria-pressed="false" title="点击按中科院一区筛选（大类分区，多个大类取最高）">中科院一区</button></th><td id="sl-all-cas1"></td><td id="sl-hit-cas1" class="sl-hit-col"></td></tr>
    <tr class="sl-tier-stat"><th scope="row"><button type="button" data-tier="xr-1" aria-pressed="false" title="点击按新锐一区筛选（新锐期刊分区表 2026 大类，含 15 个计算机会议）">新锐一区</button></th><td id="sl-all-xr1"></td><td id="sl-hit-xr1" class="sl-hit-col"></td></tr>
    <tr class="sl-tier-stat"><th scope="row"><button type="button" data-tier="ieee" aria-pressed="false" title="点击按 IEEE Transactions 筛选">IEEE Trans</button></th><td id="sl-all-ieee"></td><td id="sl-hit-ieee" class="sl-hit-col"></td></tr>
    </tbody></table><p id="sl-scope" class="sl-hint" aria-live="polite"></p></section>
    <section class="sl-section" aria-labelledby="sl-filter-title"><div class="sl-section-head"><h4 id="sl-filter-title" class="sl-kicker">筛选条件</h4><button id="sl-reset" class="sl-link" type="button">清除筛选</button></div>
    <p class="sl-rule">各组同时满足；同组内多选满足任一项即可。</p>
    <div id="sl-role-field" class="sl-group" role="group" aria-labelledby="sl-role-label"><div class="sl-group-head"><span id="sl-role-label">作者角色</span><span class="sl-group-actions"><button type="button" id="sl-role-all" class="sl-link">全选</button><button type="button" id="sl-role-none" class="sl-link">清空</button></span></div><div id="sl-roles" class="sl-chips sl-role-chips"></div><p id="sl-author-match" class="sl-hint" aria-live="polite"></p></div>
    <div class="sl-group" role="group" aria-labelledby="sl-tier-title"><div class="sl-group-head"><span id="sl-tier-title">论文等级</span></div><div id="sl-tiers" class="sl-tiers"></div></div>
    <div class="sl-group sl-range"><span class="sl-group-head" id="sl-year-label">发表年份</span><div class="sl-year" role="group" aria-labelledby="sl-year-label"><input id="sl-from" type="number" min="1900" max="2100" placeholder="起始" aria-label="起始年份"><span aria-hidden="true">–</span><input id="sl-to" type="number" min="1900" max="2100" placeholder="结束" aria-label="结束年份"></div></div>
    <input id="sl-query" class="sl-search" type="search" placeholder="筛选场所或论文标题…" aria-label="筛选场所或论文标题">
    <div class="sl-result"><p id="sl-condition" class="sl-condition" aria-live="polite"></p><label class="sl-switch"><input type="checkbox" id="sl-highlight-only"><span>只显示命中论文</span><small>选择角色、等级、场所等条件后自动开启；关闭则显示全部论文，命中论文整行高亮</small></label></div></section>
    <section class="sl-section" aria-labelledby="sl-venue-title"><div class="sl-section-head"><h4 id="sl-venue-title" class="sl-kicker">发表场所</h4><span id="sl-venue-note" class="sl-sub"></span></div><div id="sl-venues" class="sl-venues"></div></section>
    <section class="sl-section sl-more"><details id="sl-name-candidates" class="sl-details"><summary>姓名与可能缩写</summary><div id="sl-name-choices"></div><p class="sl-hint">次数来自已加载的作者名单，不代表身份确认；完全同名无法仅凭名单区分。反序缩写需自行勾选；发现冲突时暂停自动匹配，请用论文旁的“作者标记”逐篇确认。</p></details>
    <details class="sl-details sl-author-settings"><summary>作者姓名与识别规则</summary><p class="sl-hint">作者主页只读取英文姓名，并匹配其首字母缩写；其他写法可每行补充一个。相同缩写不能证明同一身份，名单内有重名时请手动核对。姓名后带 * 视为通讯作者；†、# 等其他符号需用“作者标记”确认。</p><p id="sl-auto-aliases" class="sl-hint"></p><textarea id="sl-author-names" aria-label="作者姓名与别名" rows="3" placeholder="例如：Kaiming He&#10;K He"></textarea><button id="sl-save-author" class="sl-button" type="button">保存姓名</button><p id="sl-author-status" class="sl-hint"></p></details>
    <p id="sl-compat" class="sl-hint"></p></section>
    <div class="sl-actions"><button id="sl-load" class="sl-button" type="button">加载全部</button><button id="sl-export" class="sl-button sl-primary" type="button">导出 CSV</button></div><p id="sl-load-status" class="sl-hint" role="status"></p><div class="sl-foot">CCF 2026 · 中科院 / JCR / IF 2025 · 新锐 2026 公开快照 · 悬停标签查看学科、年份与来源</div></div>`;
    document.body.append(panel);
    launcher = el('button', 'Scholar Lens', 'sl-launcher'); launcher.id = 'sl-launcher'; launcher.type = 'button'; launcher.hidden = true;
    launcher.title = '展开 Scholar Lens'; launcher.setAttribute('aria-label', '展开 Scholar Lens'); launcher.setAttribute('aria-controls', 'sl-panel');
    launcher.addEventListener('click', () => toggleDock(true)); document.body.append(launcher);
    for (const key of Object.keys(roleNames)) {
      const label = chip('role', key, roleNames[key], () => chooseRoles(new Set([...$('roles').querySelectorAll('input:checked')].map(i => i.value))));
      if (key === 'cofirst') label.title = '独立模式需先用论文旁的“作者标记”核实；兼容模式沿用原插件规则。';
      if (key === 'corresponding') label.title = '作者名单中目标作者姓名后带 * 时自动识别；其他情况用论文旁的“作者标记”确认。';
      if (key === 'last') label.title = '自动判断只适用于完整作者名单。';
      $('roles').append(label);
    }
    for (const [group, items] of tierGroups) {
      const row = el('div', null, 'sl-tier-row'); const chips = el('div', null, 'sl-chips');
      for (const [key, text] of items) {
        const label = chip('tier', key, text, e => toggleTier(key, e.target.checked));
        label.querySelector('input').setAttribute('aria-label', tierNames[key]);
        const hint = tierHints[key] || (key.startsWith('cas-') && tierHints['cas-1']) || (key.startsWith('xr-') && tierHints['xr-1']);
        if (hint) label.title = hint;
        chips.append(label);
      }
      row.append(el('span', group, 'sl-tier-label'), chips); $('tiers').append(row);
    }
    panel.querySelectorAll('.sl-tier-stat button').forEach(b => b.addEventListener('click', () => toggleTier(b.dataset.tier)));
    $('role-all').addEventListener('click', () => chooseRoles(new Set(Object.keys(roleNames))));
    $('role-none').addEventListener('click', () => chooseRoles(new Set()));
    layoutDock();
    $('settings').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'sl:options' }).catch(showError));
    $('collapse').addEventListener('click', () => toggleDock(state.collapsed));
    for (const key of ['from', 'to', 'query']) $(key).addEventListener('input', e => { state[key] = e.target.value; focusOnMatches(); schedule(); });
    $('highlight-only').addEventListener('change', e => { state.highlightOnly = e.target.checked; render(); });
    // Roles are a highlighting preference, so clearing filters keeps them.
    $('reset').addEventListener('click', () => { state.selected.clear(); state.tiers.clear(); state.highlightOnly = false; state.from = state.to = state.query = ''; ['from', 'to', 'query'].forEach(k => $(k).value = ''); render(); });
    $('save-author').addEventListener('click', async () => {
      try {
        const value = $('author-names').value.trim();
        if (profileId === 'search') { const s = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...s.settings, authors: value } }); }
        else { const s = await chrome.storage.local.get('profileAliases'); await chrome.storage.local.set({ profileAliases: { ...s.profileAliases, [profileId]: value } }); }
        $('author-status').textContent = '已保存。姓名相同不保证为同一人，请核对作者身份。';
      } catch (error) { $('author-status').textContent = error.message; }
    });
    $('load').addEventListener('click', loadAll);
    $('export').addEventListener('click', exportCSV);
  }

  function ownText(node) {
    if (!node) return '';
    const clone = node.cloneNode(true); clone.querySelectorAll('.sl-annotations').forEach(n => n.remove()); return C.clean(clone.textContent);
  }
  function collect() {
    const profileRows = [...document.querySelectorAll('.gsc_a_tr')];
    const rows = profileRows.length ? profileRows : [...document.querySelectorAll('.gs_r.gs_or.gs_scl')];
    const papers = rows.map((row, index) => {
      let title, authors, rawVenue, year, citations, authorNode, target, link;
      if (row.matches('.gsc_a_tr')) {
        const meta = row.querySelectorAll('.gsc_a_t > .gs_gray');
        const titleNode = row.querySelector('.gsc_a_at');
        title = ownText(titleNode); authorNode = meta[0]; authors = ownText(meta[0]); rawVenue = ownText(meta[1]);
        year = N.parseYear(ownText(row.querySelector('.gsc_a_y'))); citations = Number((ownText(row.querySelector('.gsc_a_ac')) || '0').replace(/\D/g, ''));
        target = row.querySelector('.gsc_a_t'); link = titleNode?.href || '';
      } else {
        const titleNode = row.querySelector('.gs_rt a') || row.querySelector('.gs_rt'); title = ownText(titleNode); link = titleNode?.href || '';
        authorNode = row.querySelector('.gs_a'); const meta = ownText(authorNode);
        const parts = meta.split(/\s+[\-–—]\s+/); authors = parts[0] || ''; const rest = parts[1] || '';
        year = N.parseYear(rest); rawVenue = rest.replace(/,?\s*(?:19|20)\d{2}\s*$/, '').trim();
        const cite = [...row.querySelectorAll('.gs_fl a')].find(a => /(?:[?&]cites=)/.test(a.href));
        citations = Number((cite?.textContent || '').replace(/\D/g, '')) || 0; target = row.querySelector('.gs_ri');
      }
      const id = link.includes('citation_for_view=') ? new URL(link).searchParams.get('citation_for_view') : C.normalize(title);
      const key = `${profileId}:${id}`;
      // A venue the user confirmed overrides automatic matching for every paper with that venue name.
      const choice = rawVenue && state.venueChoices[C.venueKey(rawVenue)];
      let match;
      if (choice && (choice.none || state.recordsById.has(choice.id))) match = C.chosenMatch(rawVenue, choice.none ? null : state.recordsById.get(choice.id));
      else {
        if (!venueCache.has(rawVenue)) venueCache.set(rawVenue, C.matchVenue(rawVenue, state.index));
        match = venueCache.get(rawVenue);
      }
      // The legacy normalizer controls grouping only; ranking always uses original venue text.
      // Group a backwards IEEE citation under the same name as the normal spelling.
      let venue = C.groupVenue(rawVenue, match, N.normalizeVenue(match.inverted || rawVenue, groupingAliases));
      const custom = N.parseAliasText(state.settings.aliases || '');
      if (custom.length) { const override = N.normalizeVenue(rawVenue, custom); if (override !== N.normalizeVenue(rawVenue, [])) venue = override; }
      if (!venue) venue = '未知发表场所';
      const tiers = C.paperTiers(match, rawVenue);
      const tierKeys = [tiers.ccf && 'ccf-' + tiers.ccf, tiers.cas && 'cas-' + tiers.cas, tiers.xr && 'xr-' + tiers.xr, tiers.ieee && 'ieee', !tiers.ccf && !tiers.cas && !tiers.xr && 'none'].filter(Boolean);
      return { row, index, key, title, authors, rawVenue, year, citations, target, authorNode, link, match, venue, tiers, tierKeys };
    }).filter(p => p.title && p.target);
    state.authorResolution = profileId === 'search' ? null : C.resolveProfileAuthor(profileName(), papers.map(p => p.authors), (state.aliases[profileId] || '').split('\n'), state.aliasChoices);
    const names = aliases();
    for (const p of papers) p.author = C.authorRoles(p.authors, names, state.overrides[p.key], { singleTarget: profileId !== 'search', blockedAliases: state.authorResolution?.blockedAliases });
    return papers;
  }

  function renderNameCandidates(external) {
    $('name-candidates').hidden = profileId === 'search' || external;
    if ($('name-candidates').hidden) return;
    const candidates = state.authorResolution?.candidates || [];
    const signature = JSON.stringify(candidates);
    if ($('name-choices').dataset.signature === signature) return;
    $('name-choices').dataset.signature = signature;
    $('name-choices').replaceChildren();
    for (const candidate of candidates) {
      const label = el('label', null, 'sl-name-choice');
      const input = el('input'); input.type = 'checkbox'; input.checked = candidate.enabled; input.disabled = !!candidate.conflicts.length;
      input.dataset.aliasKey = candidate.key; input.setAttribute('aria-label', `匹配姓名 ${candidate.label}`);
      const info = el('span'); info.append(el('strong', candidate.spellings.join(' / ')));
      info.append(el('small', candidate.count ? `已出现于 ${candidate.count} 篇${candidate.observed.length ? '：' + candidate.observed.join(' / ') : ''}` : '当前名单未出现'));
      if (candidate.kind === 'reversed') info.append(el('small', '反序写法 · 需手动选择'));
      if (candidate.repeated) info.append(el('small', `${candidate.repeated} 篇名单中重复出现 · 这些论文需逐篇确认`, 'sl-name-warning'));
      if (candidate.conflicts.length) {
        label.classList.add('sl-name-conflict');
        info.append(el('small', `缩写冲突：${candidate.conflicts.join(' / ')} 也可使用此缩写。已暂停自动匹配。`, 'sl-name-warning'));
      }
      input.addEventListener('change', async () => {
        const enabled = input.checked;
        try {
          const stored = await chrome.storage.local.get('profileAliasChoices');
          const all = stored.profileAliasChoices || {};
          await chrome.storage.local.set({ profileAliasChoices: { ...all, [profileId]: { ...all[profileId], [candidate.key]: enabled } } });
        } catch (error) { $('author-status').textContent = error.message; input.checked = !enabled; }
      });
      label.append(input, info); $('name-choices').append(label);
    }
  }

  function dedupe(papers) {
    if (!state.settings.deduplicate) return { papers, skipped: 0 };
    const formal = new Set(papers.filter(p => p.rawVenue && !/arxiv|preprint/i.test(p.rawVenue)).map(p => C.normalize(p.title)));
    const filtered = papers.filter(p => !(/arxiv|preprint/i.test(p.rawVenue) && formal.has(C.normalize(p.title))));
    return { papers: filtered, skipped: papers.length - filtered.length };
  }
  // Without a target author (search page, no names saved) roles cannot match anything.
  function roleActive() {
    if (externalAuthor()) return Object.values(externalRoles).some(id => document.getElementById(id)?.checked) || !!document.querySelector('.gsc_a_tr.highlighted-author');
    return state.roles.size > 0 && aliases().length > 0;
  }
  function roleHit(p) {
    if (externalAuthor()) return p.row.classList.contains('highlighted-author');
    return p.author.roles.some(role => state.roles.has(role));
  }
  function years() {
    return { from: /^\d{4}$/.test(state.from) ? Number(state.from) : null, to: /^\d{4}$/.test(state.to) ? Number(state.to) : null };
  }
  // All groups are joined with AND; choices inside one group are joined with OR.
  function conditionActive({ venue = true } = {}) {
    const { from, to } = years();
    return roleActive() || state.tiers.size > 0 || !!from || !!to || !!state.query.trim() || (venue && state.selected.size > 0);
  }
  function matches(p, { venue = true } = {}) {
    const { from, to } = years();
    if (roleActive() && !roleHit(p)) return false;
    if (state.tiers.size && !p.tierKeys.some(key => state.tiers.has(key))) return false;
    if ((from || to) && (!p.year || (from && p.year < from) || (to && p.year > to))) return false;
    if (state.query.trim() && !C.normalize([p.venue, p.title, p.rawVenue, ...(p.match.record?.aliases || [])].join(' ')).includes(C.normalize(state.query))) return false;
    if (venue && state.selected.size && !state.selected.has(p.venue)) return false;
    return true;
  }
  function highlightRow(p, hit) {
    const external = externalAuthor();
    const on = hit && (external || state.settings.nativeAuthors);
    p.row.classList.toggle('sl-author-hit', on);
    if (!on) { delete p.row.dataset.slRole; return; }
    const legacyClasses = { first: 'first-author', second: 'second-author', cofirst: 'co-first-author', corresponding: 'corresponding-author', last: 'last-author' };
    const role = !roleActive() ? 'match' : ['cofirst', 'corresponding', 'first', 'second', 'last', 'middle'].find(key => external
      ? legacyClasses[key] && (p.row.classList.contains(legacyClasses[key]) || p.row.querySelector('.' + legacyClasses[key]))
      : state.roles.has(key) && p.author.roles.includes(key));
    p.row.dataset.slRole = role || 'first';
  }
  function clearMarks(root = document) {
    root?.querySelectorAll('mark.sl-name').forEach(mark => { const parent = mark.parentNode; mark.replaceWith(document.createTextNode(mark.textContent)); parent.normalize(); });
  }
  function markName(p) {
    if (!p.authorNode || !p.author.indices.length) return;
    const needles = C.unique(p.author.matchedNames).sort((a,b) => b.length-a.length);
    if (!needles.length) return;
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${needles.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    const walker = document.createTreeWalker(p.authorNode, NodeFilter.SHOW_TEXT); const texts = []; while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(text => {
      if (text.parentElement.closest('mark')) return;
      const value = text.textContent, matches = [...value.matchAll(re)]; if (!matches.length) return;
      const fragment = document.createDocumentFragment(); let at = 0;
      matches.forEach(m => { fragment.append(document.createTextNode(value.slice(at, m.index))); fragment.append(el('mark', m[0], 'sl-name')); at = m.index + m[0].length; });
      fragment.append(document.createTextNode(value.slice(at))); text.replaceWith(fragment);
    });
  }
  function annotations(p) {
    const labels = C.metricLabels(p.match, state.settings.showMissing);
    const signature = JSON.stringify([labels, p.match.manual, p.match.inferred, p.authors, p.author, aliases(), state.settings.nativeAuthors, externalAuthor()]);
    if (annotationCache.get(p.row) === signature && p.row.querySelector('.sl-annotations')) return;
    annotationCache.set(p.row, signature);
    clearMarks(p.authorNode);
    p.row.querySelectorAll('.sl-annotations').forEach(n => n.remove());
    const box = el('div', null, 'sl-annotations');
    labels.forEach(m => { const b = el('span', m.text, 'sl-badge sl-' + m.kind); b.title = m.detail; if (m.emphasis) b.classList.add('sl-' + m.emphasis); box.append(b); });
    if (venueNeedsCheck(p)) {
      const b = el('button', p.match.manual ? '场所 ✓' : p.match.inferred ? '核对场所' : '选择场所', 'sl-edit-venue'); b.type = 'button'; b.classList.toggle('sl-venue-pending', !p.match.record && !p.match.manual);
      b.title = p.match.manual ? '已手动确认场所，点击修改或恢复自动识别' : p.match.inferred ? '场所名被截断后推测，点击核对或更正' : '无法自动确定场所，点击从候选或目录中选择';
      b.addEventListener('click', () => editVenue(p)); box.append(b);
    }
    if (state.settings.nativeAuthors && !externalAuthor()) {
      p.author.roles.forEach(role => { const badge = el('span', roleNames[role] + (p.author.manual ? ' ✓' : ''), 'sl-badge sl-author'); badge.dataset.role = role; badge.title = p.author.manual ? '由用户手动确认' : `按当前作者名单匹配：${p.author.matchedNames.join(' / ')}。首字母缩写仅用于此主页的姓名匹配，请核对同名情况。`; box.append(badge); });
      if (p.author.symbol) { const note = el('span', '符号待核实', 'sl-badge sl-muted'); note.title = '†、‡、§、# 等脚注符号不自动等同于共同一作；请核对论文原文后用“作者标记”确认。（* 已按通讯作者识别）'; box.append(note); }
      if (p.author.ambiguous) { const note = el('span', '姓名有歧义 · 待确认', 'sl-badge sl-name-warning'); note.title = '同一名单有多个姓名候选，或该缩写也对应其他完整姓名。请核对论文原文后使用“作者标记”。'; box.append(note); }
      markName(p);
    }
    if (profileId !== 'search' || aliases().length) { const edit = el('button', '作者标记', 'sl-edit-role'); edit.type = 'button'; edit.title = '手动确认此论文中目标作者的角色'; edit.addEventListener('click', () => editRole(p)); box.append(edit); }
    p.target.append(box);
  }
  function cleanup() {
    clearMarks();
    document.querySelectorAll('.sl-annotations').forEach(n => n.remove());
    document.documentElement.classList.remove('sl-unified');
    dockObserver?.disconnect(); dockObserver = null; dockTargets.clear(); state.placement = null;
    launcher?.remove(); launcher = null;
    document.querySelectorAll('.sl-managed, .sl-filtered, .sl-author-hit').forEach(n => { n.classList.remove('sl-managed', 'sl-filtered', 'sl-author-hit'); delete n.dataset.slRole; });
    hadExternal = false;
  }
  // Scholar's own “Cited by” table counts citations its own way; per-row sums can differ.
  function officialStats() {
    const rows = [...document.querySelectorAll('#gsc_rsb_st tbody tr')].map(tr => Number(tr.querySelector('td.gsc_rsb_std')?.textContent.replace(/\D/g, '') || NaN));
    return rows.length >= 3 && rows.slice(0, 3).every(Number.isFinite) ? { citations: rows[0], h: rows[1], i10: rows[2] } : null;
  }
  function summarize(list) {
    const s = C.stats(list);
    return { ...s, ccfA: list.filter(p => p.tiers.ccf === 'A').length, cas1: list.filter(p => p.tiers.cas === 1).length, xr1: list.filter(p => p.tiers.xr === 1).length, ieee: list.filter(p => p.tiers.ieee).length };
  }
  function describeConditions(external) {
    const { from, to } = years();
    const group = items => items.length > 1 ? `（${items.join(' 或 ')}）` : items[0];
    const parts = [];
    if (roleActive()) parts.push(external ? 'Author Highlighter 所选角色' : group(Object.keys(roleNames).filter(r => state.roles.has(r)).map(r => roleNames[r])));
    if (state.tiers.size) parts.push(group(Object.keys(tierNames).filter(k => state.tiers.has(k)).map(k => tierNames[k])));
    if (from || to) parts.push(`${from || '不限'}–${to || '不限'} 年`);
    if (state.query.trim()) parts.push(`含“${state.query.trim()}”`);
    if (state.selected.size) parts.push(state.selected.size === 1 ? [...state.selected][0] : `${state.selected.size} 个场所之一`);
    return parts.join(' 且 ');
  }
  function render() {
    observer?.disconnect();
    try {
      if (!state.settings.enabled) { if (state.loading) stopLoading(); loading.started = false; loading.paused = false; cleanup(); panel?.remove(); panel = null; return; }
      if (!baseRecords) return; // Wait for the catalog before creating searchable annotations.
      if (!panel?.isConnected) { panel = null; mount(); }
      if (!panel) return;
      document.documentElement.classList.add('sl-unified');
      const external = externalAuthor();
      if (external && !hadExternal) {
        state.highlightOnly = document.getElementById('visibility-toggle')?.checked || state.highlightOnly;
        state.from ||= document.getElementById('start-year-input')?.value || '';
        state.to ||= document.getElementById('end-year-input')?.value || '';
        $('from').value = state.from; $('to').value = state.to;
      }
      hadExternal = external;
      roleChoices();
      layoutDock();
      $('highlight-only').checked = state.highlightOnly;
      state.papers = collect();
      renderNameCandidates(external);
      const { papers, skipped } = dedupe(state.papers);
      const active = conditionActive();
      state.hits = active ? papers.filter(p => matches(p)) : [];
      const hitRows = new Set(state.hits.map(p => p.row));
      state.visible = state.highlightOnly && active ? state.hits : papers;
      const visibleRows = new Set(state.visible.map(p => p.row));
      state.papers.forEach(p => { p.row.classList.add('sl-managed'); p.row.classList.toggle('sl-filtered', !visibleRows.has(p.row)); highlightRow(p, hitRows.has(p.row)); annotations(p); });

      const recognized = papers.filter(p => p.author.roles.length).length;
      const roleHits = papers.filter(roleHit).length;
      const ambiguous = papers.filter(p => p.author.ambiguous).length;
      $('author-match').textContent = external ? `所选角色 ${roleHits} / ${papers.length} 篇（沿用 Author Highlighter）` : `已识别 ${recognized} / ${papers.length} 篇作者角色 · 所选角色 ${roleHits} 篇`;
      if (!external && ambiguous) $('author-match').textContent += ` · ${ambiguous} 篇姓名有歧义`;
      if (!external && !state.settings.nativeAuthors) $('author-match').textContent += ' · 整行着色已在设置中关闭';
      if (!external && !aliases().length) $('author-match').textContent = '尚未设置目标作者，角色条件暂不生效。请在下方“作者姓名与识别规则”填写姓名。';
      $('auto-aliases').textContent = profileId === 'search' ? '搜索结果页只使用下方填写的姓名与别名。' : `本主页当前启用：${aliases().join(' / ') || '尚未选择姓名候选'}`;

      const all = summarize(papers), hit = summarize(state.hits), official = profileId === 'search' ? null : officialStats();
      const fmt = n => Number(n).toLocaleString();
      const cells = { count: [all.count, hit.count], citations: [official?.citations ?? all.citations, hit.citations], h: [official?.h ?? all.h, hit.h], i10: [official?.i10 ?? all.i10, hit.i10], ccfA: [all.ccfA, hit.ccfA], cas1: [all.cas1, hit.cas1], xr1: [all.xr1, hit.xr1], ieee: [all.ieee, hit.ieee] };
      for (const [key, [a, h]] of Object.entries(cells)) { $('all-' + key).textContent = fmt(a); $('hit-' + key).textContent = active ? fmt(h) : '–'; }
      for (const key of ['citations', 'h', 'i10']) $('all-' + key).title = official ? `Scholar 主页统计，与右侧“引用”栏一致。已加载论文逐篇计算：${fmt(all[key])}` : '按已加载论文逐篇计算';
      $('all-count').title = `已加载并去重后的论文数${skipped ? `（隐藏 ${skipped} 篇 arXiv 同题副本）` : ''}`;
      $('summary').classList.toggle('sl-no-hits', !active);
      panel.querySelectorAll('.sl-tier-stat button').forEach(b => b.setAttribute('aria-pressed', String(state.tiers.has(b.dataset.tier))));
      $('tiers').querySelectorAll('input').forEach(i => { i.checked = state.tiers.has(i.value); });

      const coverage = state.loading ? '正在加载全部论文 · 临时统计' : loading.status === 'complete' ? '全量已加载' : ['stopped', 'error'].includes(loading.status) ? '尚未加载完整 · 部分统计' : '当前已加载';
      $('scope').textContent = `${coverage} · ${state.papers.length} 篇${skipped ? `，已隐藏 ${skipped} 篇 arXiv 同题副本` : ''}。` + (official ? '“全部”列的引用、h-index、i10 取自 Scholar 主页；其余按已加载论文逐篇计算。' : '指标按已加载论文逐篇计算。');
      const unresolved = papers.filter(p => venueNeedsCheck(p) && !p.match.record && !p.match.manual).length;
      if (unresolved) $('scope').textContent += ` ${unresolved} 篇场所未能自动确定，可点论文旁“选择场所”确认。`;

      const { from, to } = years();
      if (from && to && from > to) $('condition').textContent = '起始年份晚于结束年份，请调整。';
      else $('condition').textContent = active ? `命中 ${state.hits.length} / ${papers.length} 篇：${describeConditions(external)}` : '未设置条件。选择作者角色或论文等级后，命中论文会整行高亮。';
      $('condition').classList.toggle('sl-empty', !active);

      // Venue list: the visible papers, ignoring the venue choice itself so other venues stay selectable.
      const otherActive = conditionActive({ venue: false });
      const base = state.highlightOnly && otherActive ? papers.filter(p => matches(p, { venue: false })) : papers;
      const existing = new Set([...$('venues').querySelectorAll('details[open]')].map(d => d.dataset.venue));
      const groups = new Map(); base.forEach(p => { if (!groups.has(p.venue)) groups.set(p.venue, []); groups.get(p.venue).push(p); });
      const showRatio = otherActive && !state.highlightOnly;
      $('venue-note').textContent = showRatio ? '命中 / 全部' : groups.size ? `${groups.size} 个` : '';
      $('venues').replaceChildren();
      [...groups].sort((a,b) => b[1].length-a[1].length || a[0].localeCompare(b[0])).forEach(([venue, ps]) => {
        const d = el('details'); d.dataset.venue = venue; d.open = existing.has(venue);
        const summary = el('summary');
        const check = el('input'); check.type = 'checkbox'; check.checked = state.selected.has(venue); check.setAttribute('aria-label','只看 ' + venue);
        check.addEventListener('click', e => e.stopPropagation()); check.addEventListener('change', () => { check.checked ? state.selected.add(venue) : state.selected.delete(venue); focusOnMatches(); render(); });
        const hits = showRatio ? ps.filter(p => matches(p, { venue: false })).length : null;
        const label = el('span', venue, 'sl-venue-name'); const count = el('span', showRatio ? `${hits} / ${ps.length}` : String(ps.length), 'sl-venue-count');
        if (showRatio && hits) count.classList.add('sl-venue-hit');
        summary.append(check, label, count); d.append(summary);
        const list = el('ul'); ps.forEach(p => { const li = el('li'); if (hitRows.has(p.row)) li.classList.add('sl-li-hit'); const b = el('button', p.title); b.type = 'button'; b.addEventListener('click', () => { p.row.scrollIntoView({ behavior: 'smooth', block: 'center' }); p.row.animate([{ backgroundColor: '#e8f0fe' }, { backgroundColor: 'transparent' }], { duration: 1600 }); }); li.append(b, el('small', `${p.year || '年份未知'} · 引用 ${p.citations}`)); list.append(li); }); d.append(list); $('venues').append(d);
      });
      if (!groups.size || (active && !state.hits.length)) {
        let hint = '没有匹配的已加载论文。请调整年份、等级、场所或标题筛选。';
        if (roleActive() && !roleHits) hint = !external && !recognized ? ambiguous ? '姓名存在歧义，已暂停这些论文的自动高亮。可用论文旁的“作者标记”逐篇确认。' : '未识别到目标作者。请展开下方“姓名与可能缩写”检查候选，或在“作者姓名与识别规则”补充论文中显示的姓名。' : '当前角色没有匹配论文，请选择其他角色。共同一作需用“作者标记”确认；通讯作者按姓名后的 * 自动识别，也可手动标记。';
        $('venues').prepend(el('p', hint, 'sl-hint sl-empty-hint'));
      }
      if (document.activeElement !== $('author-names')) $('author-names').value = profileId === 'search' ? state.settings.authors : state.aliases[profileId] || profileName();
      $('compat').textContent = externalAuthor() ? '兼容模式：角色选项同步原 Author Highlighter，沿用其角色识别并统一整行高亮；已收起重复控件。' : profileId === 'search' ? '请在“作者姓名与识别规则”填写要高亮的作者及其缩写。' : '';
      if (document.getElementById('gsvs-panel')) $('compat').textContent += ' 已收起旧 Venue Stats 面板，发表归并与筛选由本面板统一处理。关闭 Scholar Lens 后恢复旧控件与筛选状态。';
      $('compat').hidden = !$('compat').textContent;
      updateLoadingUI();
      if (profileId !== 'search' && state.settings.autoLoad && !loading.started && document.querySelector('#gsc_a_tw')) loadAll();
    } catch (error) { showError(error); }
    finally { watch(); }
  }

  function venueNeedsCheck(p) {
    if (!p.rawVenue || /arxiv|preprint|预印本/i.test(p.rawVenue)) return false;
    return !p.match.record || p.match.inferred || p.match.manual;
  }
  function searchVenues(query, skip) {
    const q = C.normalize(query);
    if (q.length < 2) return [];
    const scored = [];
    for (const record of state.records) {
      if (skip.has(record.id)) continue;
      let text = venueSearch.get(record);
      if (!text) { text = ` ${C.normalize([record.title, record.short, ...(record.aliases || []), ...(record.issns || [])].join(' | '))} `; venueSearch.set(record, text); }
      const at = text.indexOf(q);
      if (at < 0) continue;
      const exact = [record.title, record.short, ...(record.aliases || [])].some(a => C.normalize(a) === q);
      scored.push([exact ? 0 : text.includes(` ${q} `) ? 1 : 2, record.ccf?.length ? 0 : 1, record.title.length, record]);
    }
    return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).slice(0, 20).map(s => s[3]);
  }
  function editVenue(p) {
    document.querySelector('.sl-role-dialog')?.remove();
    const key = C.venueKey(p.rawVenue), current = state.venueChoices[key];
    let selected = current ? (current.none ? 'none' : current.id) : p.match.record?.id || '';
    const d = el('dialog', null, 'sl-role-dialog sl-venue-dialog');
    d.append(el('h3', '确认发表场所'), el('p', p.rawVenue, 'sl-venue-raw'), el('p', p.match.reason || '', 'sl-hint'));
    const form = el('form'); form.method = 'dialog';
    const option = (value, title, meta, metrics) => {
      const label = el('label', null, 'sl-venue-option');
      const input = el('input'); input.type = 'radio'; input.name = 'sl-venue-choice'; input.value = value; input.checked = value === selected;
      input.addEventListener('change', () => { selected = value; save.disabled = false; });
      const info = el('span'); info.append(el('strong', title));
      if (meta) info.append(el('small', meta));
      if (metrics) info.append(el('small', metrics, 'sl-venue-metrics'));
      label.append(input, info); return label;
    };
    const recordOption = record => {
      const meta = [record.short && record.short !== record.title ? record.short : '', record.type === 'conference' ? '会议' : '期刊', record.issns?.length ? 'ISSN ' + record.issns.join(' / ') : ''].filter(Boolean).join(' · ');
      return option(record.id, record.title, meta, C.metricLabels({ record }).map(l => l.text).join(' · ') || '目录中无等级数据');
    };
    const suggested = C.venueOptions(p.rawVenue, state.index);
    const own = p.match.record && state.recordsById.get(p.match.record.id);
    if (own && !suggested.some(r => r.id === own.id)) suggested.unshift(own);
    const shown = new Set(suggested.map(r => r.id));
    const options = el('div', null, 'sl-venue-options'); options.setAttribute('role', 'radiogroup'); options.setAttribute('aria-label', '可能的场所');
    if (suggested.length) suggested.forEach(r => options.append(recordOption(r)));
    else options.append(el('p', '没有自动找到候选，请在下方搜索。', 'sl-hint'));
    const search = el('input', null, 'sl-venue-search'); search.type = 'search'; search.placeholder = '搜索期刊或会议：全称、缩写或 ISSN'; search.setAttribute('aria-label', '搜索期刊或会议');
    const results = el('div', null, 'sl-venue-options sl-venue-results'); results.setAttribute('role', 'radiogroup'); results.setAttribute('aria-label', '搜索结果');
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => {
      results.replaceChildren(...searchVenues(search.value, shown).map(recordOption));
      if (search.value.trim().length >= 2 && !results.children.length) results.append(el('p', '目录中没有匹配的场所。', 'sl-hint'));
    }, 150); });
    search.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    const none = option('none', '不在目录中，不赋级', '例如书籍、学位论文、未收录的期刊或会议');
    form.append(el('p', '可能的场所', 'sl-venue-heading'), options, el('p', '在目录中搜索', 'sl-venue-heading'), search, results, none,
      el('p', `选择将应用到所有场所名为“${p.rawVenue.replace(/[\s,]*\d[\d\s,()\-–]*$/, '')}”的论文，仅存本机。`, 'sl-hint'));
    const actions = el('div', null, 'sl-actions');
    const save = el('button', '保存', 'sl-button sl-primary'); save.type = 'button'; save.disabled = !selected || (!current && !!p.match.record && !p.match.inferred);
    const reset = el('button', '恢复自动识别', 'sl-button'); reset.type = 'button'; reset.hidden = !current;
    const cancel = el('button', '取消', 'sl-button'); cancel.type = 'submit';
    const errorText = el('p', '', 'sl-hint');
    async function persist(value) {
      try {
        const stored = await chrome.storage.local.get('venueChoices'); const all = { ...stored.venueChoices };
        if (value) all[key] = value; else delete all[key];
        await chrome.storage.local.set({ venueChoices: all }); d.close();
      } catch (error) { errorText.textContent = error.message; }
    }
    save.addEventListener('click', () => {
      if (!selected) { errorText.textContent = '请选择一个场所，或选择“不在目录中”。'; return; }
      persist(selected === 'none' ? { none: true, at: Date.now() } : { id: selected, title: state.recordsById.get(selected)?.title, at: Date.now() });
    });
    reset.addEventListener('click', () => persist(null));
    actions.append(save, reset, cancel); form.append(actions, errorText); d.append(form); document.body.append(d);
    d.addEventListener('close', () => d.remove()); d.showModal();
    (suggested.length ? d.querySelector('input[type=radio]') : search).focus();
  }
  function editRole(p) {
    document.querySelector('.sl-role-dialog')?.remove();
    const d = el('dialog', null, 'sl-role-dialog');
    d.append(el('h3', '确认作者角色'), el('p', p.title), el('p', `目标：${aliases().join(' / ') || profileName()}`));
    const form = el('form'); form.method = 'dialog';
    Object.entries(roleNames).forEach(([key, value]) => { const label = el('label'); const input = el('input'); input.type = 'checkbox'; input.value = key; input.checked = (state.overrides[p.key] || p.author.roles).includes(key); label.append(input, document.createTextNode(value)); form.append(label); });
    form.append(el('p', '请依据论文原文核实共同一作与通讯作者。标记仅存本机。', 'sl-hint'));
    const actions = el('div', null, 'sl-actions');
    const save = el('button','保存标记','sl-button sl-primary'); save.type = 'button';
    const reset = el('button','恢复自动','sl-button'); reset.type = 'button';
    const cancel = el('button','取消','sl-button'); cancel.type = 'submit';
    const errorText = el('p', '', 'sl-hint');
    async function persist(value) {
      try { const stored = await chrome.storage.local.get('roleOverrides'); const all = { ...stored.roleOverrides }; if (value) all[p.key] = value; else delete all[p.key]; await chrome.storage.local.set({ roleOverrides: all }); d.close(); }
      catch (error) { errorText.textContent = error.message; }
    }
    save.addEventListener('click', () => { const value = [...form.querySelectorAll('input:checked')].map(i => i.value); if (!value.length) { errorText.textContent = '请选择角色，或使用“恢复自动”。'; return; } persist(value); });
    reset.addEventListener('click', () => persist(null));
    actions.append(save,reset,cancel); form.append(actions,errorText); d.append(form); document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
  }
  function moreAvailable(button) {
    if (!button || button.disabled || button.hidden || button.classList.contains('gs_dis') || button.getAttribute('aria-disabled') === 'true') return false;
    const style = getComputedStyle(button);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function updateLoadingUI() {
    if (!panel) return;
    panel.dataset.loadState = loading.status;
    $('load').hidden = profileId === 'search';
    $('load').textContent = state.loading ? '停止加载' : loading.status === 'complete' ? '重新检查' : ['stopped', 'error'].includes(loading.status) ? '继续加载' : '加载全部';
    $('load-status').hidden = profileId === 'search' || !(state.loading || loading.message);
    $('load-status').textContent = state.loading ? `正在加载全部论文… 已加载 ${paperCount()} 篇。完成后自动更新统计。` : loading.message;
    $('summary').setAttribute('aria-busy', String(state.loading));
    $('export').disabled = state.loading;
    $('export').title = state.loading ? '正在加载全部论文，完成或停止后可导出' : `导出当前列表中显示的 ${state.visible.length} 篇论文`;
  }
  function stopLoading() {
    loading.run++; state.loading = false; loading.paused = true; loading.status = 'stopped';
    loading.message = '已停止加载，当前为部分统计。已发出的请求仍可能返回；点击“继续加载”可接着加载。';
    updateLoadingUI(); schedule();
  }
  async function loadAll() {
    if (state.loading) { stopLoading(); return; }
    if (!state.settings.enabled || profileId === 'search') return;
    const run = ++loading.run;
    loading.started = true; loading.paused = false; loading.status = 'loading'; state.loading = true;
    let count = paperCount(), changedAt = Date.now(), progressed = false, terminalSince = 0;
    // A disabled button on arrival may belong to another extension's pending
    // request. Give it the full request window before declaring a settled page.
    const initialUnavailable = !!document.querySelector('#gsc_bpf_more') && !moreAvailable(document.querySelector('#gsc_bpf_more')) && !loading.pending;
    updateLoadingUI(); schedule();
    const active = () => run === loading.run && state.loading && state.settings.enabled;
    const finish = (status, message) => { loading.status = status; loading.message = message; state.loading = false; };
    try {
      while (active()) {
        const now = Date.now(), nextCount = paperCount();
        if (nextCount !== count) { count = nextCount; changedAt = now; progressed = true; terminalSince = 0; updateLoadingUI(); }
        if (loading.pending && count > loading.pending.count) { loading.pending = null; loading.lastClick = now; }
        const button = document.querySelector('#gsc_bpf_more');
        const removed = !button || button.hidden || getComputedStyle(button).display === 'none';
        const available = moreAvailable(button);
        if (document.querySelector('#gs_captcha_ccl, #captcha-form, form[action*="/sorry/"]')) {
          finish('error', '页面需要验证，自动加载已停止。当前为部分统计；处理页面提示后可继续加载。'); break;
        }
        if (loading.pending) {
          // A disabled button while waiting for rows is not an end-of-list signal.
          if (removed) terminalSince ||= now; else terminalSince = 0;
          if (terminalSince && now - terminalSince >= 2500) {
            loading.pending = null; finish('complete', `已加载页面可提供的全部论文，共 ${count} 篇。统计已更新。`); break;
          }
          if (now - loading.pending.at >= 30000) {
            loading.pending = null;
            finish('error', '30 秒未收到新论文，已停止重试。当前为部分统计；请检查页面后点击“继续加载”。'); break;
          }
        } else if (available) {
          terminalSince = 0;
          if (now - loading.lastClick >= 1500 && now - changedAt >= 1200) {
            // Track our own request even when the optional automatic mode is off.
            button.click();
            if (!loading.pending) { loading.pending = { count, at: now }; loading.lastClick = now; }
          }
        } else if (now - changedAt >= (initialUnavailable && !progressed ? 30000 : 2500)) {
          finish('complete', `已加载页面可提供的全部论文，共 ${count} 篇。统计已更新。`); break;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    } catch (error) {
      if (run === loading.run) finish('error', `加载中断：${error.message}。当前为部分统计，可继续加载。`);
    } finally {
      if (run === loading.run) { state.loading = false; render(); }
    }
  }
  function exportCSV() {
    if (state.loading) return;
    const hits = new Set(state.hits.map(p => p.row));
    const rows = [['标题','作者','发表场所原文','归并场所','年份','引用','作者角色','CCF','中科院','新锐','JCR','IF','IEEE Trans','命中当前筛选','指标来源与年份','链接','统计范围']];
    state.visible.forEach(p => { const labels = C.metricLabels(p.match); const text = kind => labels.filter(l => l.kind.startsWith(kind)).map(l => l.text).join('; '); rows.push([p.title,p.authors,p.rawVenue,p.venue,p.year,p.citations,p.author.roles.map(r=>roleNames[r]).join('; '),text('ccf'),text('cas'),text('xr'),text('jcr'),text('if'),p.tiers.ieee ? '是' : '',hits.has(p.row) ? '是' : '',labels.map(l=>l.detail).join('\n'),p.link,loading.status === 'complete' ? '已加载全部论文中的当前列表' : '尚未确认全量：当前已加载论文中的列表']); });
    const url = URL.createObjectURL(new Blob([C.csv(rows)], { type: 'text/csv;charset=utf-8' })); const a = el('a'); a.href = url; a.download = `scholar-lens-${profileId}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Subscribe before loading the catalog so settings changed during startup aren't lost.
  try { listen(); await refresh(); } catch (error) { showError(error); }
})();
