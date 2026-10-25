const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ext = path.resolve(__dirname, '..');
const out = process.env.SCHOLAR_QA_OUTPUT || path.join(require('node:os').tmpdir(), 'scholar-lens-qa');
fs.mkdirSync(out, { recursive: true });
const fixture = fs.readFileSync(path.join(ext, 'tests/fixtures/scholar.html'), 'utf8');
(async () => {
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(out, 'loading-')), {
    executablePath: process.env.CHROME_EXECUTABLE || chromium.executablePath(), headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`], viewport: { width: 1440, height: 1000 }, acceptDownloads: true
  });
  const checks = [], errors = [], log = message => { checks.push(message); console.log('PASS', message); };
  const health = page => { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  const complete = page => page.waitForFunction(() => document.getElementById('sl-panel')?.dataset.loadState === 'complete', null, { timeout: 45000 });
  const openPanel = async page => { if (!await page.locator('#sl-panel').isVisible()) await page.locator('#sl-launcher').click(); };
  const makePage = async (mode, viewport) => {
    const page = await context.newPage(); health(page); if (viewport) await page.setViewportSize(viewport);
    const script = `<script>
      window.paginationCalls = 0; window.duplicateCalls = 0; window.paginationBusy = false;
      const mode = ${JSON.stringify(mode)}; const button = document.getElementById('gsc_bpf_more');
      button.onclick = function() {
        if (window.paginationBusy) { window.duplicateCalls++; return; }
        window.paginationCalls++; window.paginationBusy = true;
        const page = window.paginationCalls;
        if(mode === 'timeout') { this.disabled = true; return; }
        if(mode === 'removed') { setTimeout(()=>this.remove(),400); return; }
        // Delay disabled styling: concurrent clickers must still share one pending request.
        setTimeout(()=>this.disabled=true,100);
        const delay = mode === 'slow' ? 2200 : page === 1 ? 4200 : 600;
        setTimeout(()=>{
          for(let i=0;i<2;i++) addPaper(['Auto page '+page+' paper '+i, i ? 'Maya Patel, Lin Chen' : 'Lin Chen, Maya Patel', 'International Conference on Machine Learning (ICML)',2026,(page-1)*2+i+1],100+page*2+i);
          this.disabled = mode === 'slow' ? page >= 5 : page >= 3;
          window.paginationBusy = false;
        },delay);
      };
      if(mode === 'initial') { button.disabled=true; setTimeout(()=>{addPaper(['An initially pending paper','Lin Chen, Maya Patel','ICML',2026,1],99);button.disabled=false},5000); }
    </script>`;
    await page.route('https://scholar.google.com/**', r => r.fulfill({ contentType: 'text/html', body: fixture.replace('</body>', script + '</body>') }));
    await page.goto('https://scholar.google.com/citations?user=DEMO'); return page;
  };
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const options = await context.newPage(); health(options); await options.goto(`chrome-extension://${new URL(worker.url()).host}/src/options.html`);
    await options.locator('#ccf-count').filter({ hasText: '677' }).waitFor();
    assert.equal(await options.locator('#autoLoad').isChecked(), true);
    const page = await makePage('normal');
    await page.waitForFunction(() => window.paginationCalls === 1);
    assert.equal(await page.locator('#sl-panel').getAttribute('data-placement'), 'sidebar');
    assert.equal(await page.locator('#sl-panel').isVisible(), true);
    assert.equal(await page.locator('#sl-export').isDisabled(), true);
    await page.waitForTimeout(2800);
    assert.equal(await page.locator('#sl-panel').getAttribute('data-load-state'), 'loading');
    assert.match(await page.locator('#sl-scope').textContent(), /临时统计/);
    await complete(page);
    assert.equal(await page.locator('.gsc_a_tr').count(), 14);
    assert.equal(await page.evaluate(() => window.paginationCalls), 3);
    assert.equal(await page.evaluate(() => window.duplicateCalls), 0);
    assert.equal(await page.locator('#sl-all-count').textContent(), '13');
    assert.equal(await page.locator('#sl-all-citations').textContent(), '319');
    assert.match(await page.locator('#sl-scope').textContent(), /全量已加载/);
    assert.equal((await page.locator('main').boundingBox()).x, 160);
    log('default auto Show more loads all three pages while the panel sits under Cited by, waits through temporary disabled state and updates full statistics without moving Scholar');
    await openPanel(page);
    const dp = page.waitForEvent('download'); await page.locator('#sl-export').click(); const download = await dp;
    const csv = fs.readFileSync(await download.path(), 'utf8');
    assert.ok(csv.includes('Auto page 3 paper 1')); assert.ok(csv.includes('已加载全部论文中的当前列表'));
    log('export waits for loading, includes the final page and states its complete filtered scope');
    await page.setViewportSize({ width: 1920, height: 1100 }); await page.evaluate(() => scrollTo(0, 0));
    await page.locator('#sl-role-none').click();
    assert.equal(await page.locator('.sl-author-hit').count(), 0);
    await page.locator('#sl-role-first').check();
    const cellColors = index => page.locator('.gsc_a_tr').nth(index).evaluate(r => [...r.cells].map(c => getComputedStyle(c).backgroundColor));
    assert.deepEqual(await cellColors(0), ['rgb(254, 247, 224)', 'rgb(254, 247, 224)', 'rgb(254, 247, 224)']);
    assert.ok((await cellColors(1)).every(c => c !== 'rgb(254, 247, 224)'));
    await page.locator('#sl-role-second').check();
    assert.deepEqual(await cellColors(1), ['rgb(254, 239, 227)', 'rgb(254, 239, 227)', 'rgb(254, 239, 227)']);
    await page.locator('#sl-role-first').uncheck();
    assert.ok((await cellColors(0)).every(c => c !== 'rgb(254, 247, 224)'));
    await page.locator('#sl-role-first').check();
    assert.equal(await page.locator('.gsc_a_tr').first().locator('.sl-ccf-a').evaluate(n=>getComputedStyle(n).backgroundColor), 'rgb(197, 34, 31)');
    assert.equal(await page.locator('.sl-cas-one').first().evaluate(n=>getComputedStyle(n).backgroundColor), 'rgb(132, 48, 206)');
    await page.screenshot({ path: path.join(out, 'whole-row-preview.png'), fullPage: false });
    log('role multi-select paints every cell of matching papers, removes deselected row fills and preserves CCF / CAS badge colors');
    assert.equal(await page.locator('#sl-highlight-only').isChecked(), true);
    await page.locator('#sl-highlight-only').uncheck();
    const beforeFiltered = await page.locator('.gsc_a_tr:visible').count();
    await page.locator('#sl-highlight-only').check();
    assert.ok(await page.locator('.gsc_a_tr:visible').count() < beforeFiltered);
    assert.equal(await page.locator('.gsc_a_tr:visible').count(), Number(await page.locator('#sl-hit-count').textContent()));
    await page.locator('#sl-highlight-only').uncheck(); assert.equal(await page.locator('.gsc_a_tr:visible').count(), beforeFiltered);
    log('whole-row highlighting and Highlight only maintain matching visible rows and statistics');
    const slow = await makePage('slow', { width: 1920, height: 1000 });
    await slow.waitForFunction(() => window.paginationCalls === 1);
    await slow.locator('#sl-load').click();
    await slow.evaluate(() => { window.otherClicker = setInterval(() => document.getElementById('gsc_bpf_more')?.click(), 150); });
    await slow.waitForTimeout(4000);
    assert.equal(await slow.evaluate(() => window.paginationCalls), 1);
    assert.equal(await slow.locator('#sl-panel').getAttribute('data-load-state'), 'stopped');
    assert.match(await slow.locator('#sl-scope').textContent(), /部分统计/);
    await slow.locator('#sl-load').click();
    await complete(slow); await slow.evaluate(() => clearInterval(window.otherClicker));
    assert.equal(await slow.evaluate(() => window.paginationCalls), 5);
    assert.equal(await slow.evaluate(() => window.duplicateCalls), 0);
    assert.equal(await slow.locator('.gsc_a_tr').count(), 18);
    log('stop persists despite another clicker; resume finishes remaining pages without duplicate requests or stale-loop cancellation');
    const pending = await makePage('initial'); await complete(pending);
    assert.equal(await pending.locator('.gsc_a_tr').count(), 15);
    assert.equal(await pending.evaluate(() => window.paginationCalls), 3);
    log('an already-disabled button on page arrival is allowed to finish its in-flight request before more pages load');
    const removed = await makePage('removed'); await complete(removed);
    assert.equal(await removed.evaluate(() => window.paginationCalls), 1);
    log('a terminal response that removes Show more without adding rows completes cleanly');
    const timeout = await makePage('timeout');
    await timeout.waitForFunction(() => document.getElementById('sl-panel')?.dataset.loadState === 'error', null, { timeout: 45000 });
    assert.equal(await timeout.evaluate(() => window.paginationCalls), 1);
    assert.match(await timeout.locator('#sl-scope').textContent(), /部分统计/);
    assert.doesNotMatch(await timeout.locator('#sl-load-status').textContent(), /全部论文/);
    log('a stalled disabled request times out once and is reported as incomplete, never as fully loaded');
    await options.locator('#autoLoad').uncheck(); await options.locator('#save-settings').click();
    const manual = await makePage('removed', { width: 1920, height: 1000 }); await manual.locator('#sl-panel').waitFor(); await manual.waitForTimeout(1800);
    assert.equal(await manual.evaluate(() => window.paginationCalls), 0);
    await manual.locator('#sl-load').click(); await complete(manual); assert.equal(await manual.evaluate(() => window.paginationCalls), 1);
    log('optional auto-load preference is honored and manual load remains available');
    await options.locator('#enabled').uncheck(); await options.locator('#save-settings').click();
    await page.locator('#sl-panel').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.sl-author-hit').count(), 0); assert.equal(await page.locator('[data-sl-role]').count(), 0);
    assert.ok((await cellColors(1)).every(c => c !== 'rgb(254, 239, 227)'));
    log('disable removes all whole-row colors and role attributes');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'loading-results.json'), JSON.stringify({ checks, errors }, null, 2));
  } catch (error) {
    const pages = [];
    for (const page of context.pages().filter(p => p.url().includes('scholar.google.com'))) {
      pages.push(await page.evaluate(() => ({ url: location.href, calls: window.paginationCalls, rows: document.querySelectorAll('.gsc_a_tr').length, state: document.getElementById('sl-panel')?.dataset.loadState, scope: document.getElementById('sl-scope')?.textContent, status: document.getElementById('sl-load-status')?.textContent, button: document.getElementById('gsc_bpf_more')?.outerHTML })));
    }
    console.error(error, pages); fs.writeFileSync(path.join(out, 'loading-results.json'), JSON.stringify({ checks, errors, failure: String(error), pages }, null, 2)); process.exitCode = 1;
  } finally { await context.close(); }
})();
