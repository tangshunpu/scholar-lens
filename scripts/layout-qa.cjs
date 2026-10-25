const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const extension = path.resolve(__dirname, '..');
const out = process.env.SCHOLAR_QA_OUTPUT || path.join(require('node:os').tmpdir(), 'scholar-lens-qa');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(out, 'layout-')), {
    executablePath: process.env.CHROME_EXECUTABLE || chromium.executablePath(), headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1920, height: 1100 }
  });
  const checks = [], errors = [], measurements = [];
  const log = message => { checks.push(message); console.log('PASS', message); };
  const geometry = page => page.evaluate(() => {
    const result = {};
    for (const selector of ['main', '#gsc_a_tw', '#gsc_rsb', 'body > header', '#gs_res_ccl_mid', '#gs_hdr']) {
      const node = document.querySelector(selector);
      if (node) { const r = node.getBoundingClientRect(); result[selector] = { left: r.left, width: r.width, center: r.left + r.width / 2 }; }
    }
    result.bodyPadding = getComputedStyle(document.body).padding;
    result.bodyMargin = getComputedStyle(document.body).margin;
    return result;
  });
  const settle = page => page.waitForTimeout(150);
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const options = await context.newPage();
    await options.goto(`chrome-extension://${new URL(worker.url()).host}/src/options.html`);
    await options.locator('#ccf-count').filter({ hasText: '677' }).waitFor();
    await options.locator('#autoLoad').uncheck(); await options.locator('#enabled').uncheck(); await options.locator('#save-settings').click();
    const fixture = fs.readFileSync(path.join(extension, 'tests/fixtures/scholar.html'), 'utf8')
      .replace('Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)', 'Proceedings of the 29th Annual International Conference on Mobile Computing and Networking …')
      .replaceAll('Efficient visual representations for open-world learning', 'Mobile sensing across heterogeneous networks');
    const page = await context.newPage(), baseline = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('https://scholar.google.com/**', r => r.fulfill({ contentType: 'text/html', body: fixture }));
    await baseline.route('https://example.org/**', r => r.fulfill({ contentType: 'text/html', body: fixture }));
    await page.goto('https://scholar.google.com/citations?user=DEMO');
    await baseline.goto('https://example.org/profile-fixture');
    await page.locator('.gsc_a_tr').nth(7).waitFor(); await settle(page);
    const original = await geometry(page);
    assert.deepEqual(original, await geometry(baseline));
    await page.screenshot({ path: path.join(out, 'center-before.png') });
    await options.locator('#enabled').check(); await options.locator('#save-settings').click();
    await page.locator('.sl-annotations').nth(7).waitFor(); await settle(page);
    assert.deepEqual(await geometry(page), original);
    assert.equal(await page.locator('#sl-panel').isVisible(), true);
    const boxes = () => page.evaluate(() => {
      const b = s => document.querySelector(s)?.getBoundingClientRect().toJSON();
      return { main: b('main'), panel: b('#sl-panel'), cit: b('#gsc_rsb_cit'), rsb: b('#gsc_rsb'), header: b('body > header'), launcher: b('#sl-launcher'), placement: document.getElementById('sl-panel').dataset.placement, width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
    });
    // Docked: fixed 16px beside the Scholar column, top-aligned with "Cited by", never covering content.
    const assertDocked = async () => {
      const box = await boxes();
      assert.equal(box.placement, 'dock');
      assert.equal(Math.round(box.panel.left), Math.round(box.main.right) + 16);
      assert.equal(Math.round(box.panel.top), Math.round(box.cit.top));
      assert.ok(box.panel.top >= box.header.bottom + 12);
      assert.ok(box.panel.right <= box.width); assert.ok(box.scroll <= box.width);
    };
    await assertDocked(); measurements.push({ width: 1920, before: original, after: await geometry(page) });
    log('1920px: panel docks 16px right of the Cited by column, top-aligned with it; native geometry unchanged');
    assert.equal(await page.locator('#sl-roles input:visible').count(), 6);
    assert.equal(await page.locator('.gsc_a_tr').first().locator('.sl-ccf-a').count(), 1);
    assert.equal(await page.getByRole('checkbox', { name: '只看 MobiCom', exact: true }).count(), 1);
    const palette = await page.evaluate(() => Object.fromEntries(['.sl-ccf-a', '.sl-cas-one'].map(s => {
      const style = getComputedStyle(document.querySelector(s)); return [s, { background: style.backgroundColor, color: style.color, weight: style.fontWeight }];
    })));
    assert.notEqual(palette['.sl-ccf-a'].background, palette['.sl-cas-one'].background);
    for (const color of Object.values(palette)) { assert.equal(color.color, 'rgb(255, 255, 255)'); assert.ok(+color.weight >= 700); }
    log('direct role choices, MobiCom recognition and distinct high-contrast CCF A / CAS 1 badges remain available');
    await page.screenshot({ path: path.join(out, 'center-after.png') });
    await page.evaluate(() => { document.body.style.paddingBottom = '2000px'; scrollTo(0, 400); }); await settle(page);
    assert.equal(Math.round((await boxes()).panel.top), 12);
    await page.evaluate(() => { scrollTo(0, 0); document.body.style.paddingBottom = ''; }); await settle(page);
    log('docked panel follows the column top, then sticks 12px from the viewport top while scrolling');
    await page.locator('#sl-collapse').click(); assert.deepEqual(await geometry(page), original);
    assert.equal(await page.locator('#sl-panel').isVisible(), false);
    const collapsed = await boxes(); assert.equal(Math.round(collapsed.launcher.left), Math.round(collapsed.main.right) + 16);
    await page.setViewportSize({ width: 2000, height: 1100 }); await settle(page);
    assert.equal(await page.locator('#sl-panel').isVisible(), false);
    await page.setViewportSize({ width: 1920, height: 1100 }); await settle(page);
    assert.equal(await page.locator('#sl-panel').isVisible(), false);
    await page.locator('#sl-launcher').click(); assert.deepEqual(await geometry(page), original); await assertDocked();
    log('collapse leaves a tab beside the column, never moves content; manual collapse survives resizing');
    for (const width of [1600, 1440, 1280]) {
      await page.setViewportSize({ width, height: 1000 }); await baseline.setViewportSize({ width, height: 1000 }); await settle(page);
      const before = await geometry(baseline), after = await geometry(page);
      assert.deepEqual(after, before); assert.equal(await page.locator('#sl-panel').isVisible(), true);
      const box = await boxes();
      assert.equal(box.placement, 'sidebar');
      assert.ok(box.panel.top >= box.cit.bottom); assert.ok(box.panel.left >= box.rsb.left); assert.ok(box.panel.right <= box.rsb.right + 0.5);
      assert.ok(box.scroll <= box.width);
      measurements.push({ width, before, after });
      log(`${width}px: no room beside Scholar, so the panel sits in the right column directly under Cited by without shifting Scholar`);
    }
    await page.screenshot({ path: path.join(out, 'center-sidebar.png'), fullPage: true });
    await page.locator('#sl-collapse').click(); assert.equal(await page.locator('#sl-body').isVisible(), false); assert.equal(await page.locator('.sl-header').isVisible(), true);
    await page.locator('#sl-collapse').click(); assert.equal(await page.locator('#sl-body').isVisible(), true);
    log('in the right column, collapse keeps the header as its own toggle');
    await page.setViewportSize({ width: 390, height: 844 }); await baseline.setViewportSize({ width: 390, height: 844 }); await settle(page);
    assert.deepEqual(await geometry(page), await geometry(baseline));
    assert.equal(await page.locator('#sl-panel').isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'center-mobile.png'), fullPage: true });
    log('390px: panel stays with the Cited by section, without overlay or horizontal overflow');
    await page.setViewportSize({ width: 1920, height: 1100 }); await baseline.setViewportSize({ width: 1920, height: 1100 });
    await page.evaluate(() => scrollTo(0, 0)); await settle(page); await assertDocked();
    await page.evaluate(() => document.querySelector('main').style.maxWidth = '1500px');
    await page.waitForFunction(() => document.getElementById('sl-panel').dataset.placement === 'sidebar');
    await page.evaluate(() => document.querySelector('main').style.maxWidth = '');
    await page.waitForFunction(() => document.getElementById('sl-panel').dataset.placement === 'dock'); await settle(page); await assertDocked();
    log('native container resizing is observed: panel moves between dock and column as whitespace changes without a window resize');
    await options.locator('#enabled').uncheck(); await options.locator('#save-settings').click();
    await page.locator('#sl-panel').waitFor({ state: 'detached' }); assert.equal(await page.locator('#sl-launcher').count(), 0);
    assert.deepEqual(await geometry(page), original);
    assert.equal(await page.locator('html').evaluate(n => n.classList.contains('sl-unified')), false);
    await options.locator('#enabled').check(); await options.locator('#save-settings').click();
    await page.locator('#sl-panel').waitFor(); assert.deepEqual(await geometry(page), original); await assertDocked();
    log('disable and re-enable clean up observers / controls and retain the original centered geometry');
    const search = await context.newPage();
    await search.route('https://scholar.google.com/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0}#gs_hdr{height:70px;background:#eee}#gs_res_ccl_mid{width:650px;margin:24px 0 0 160px}</style><header id="gs_hdr">Google Scholar</header><div id="gs_res_ccl_mid"><div class="gs_r gs_or gs_scl"><div class="gs_ri"><h3 class="gs_rt"><a>Sample paper</a></h3><div class="gs_a">Lin Chen - IEEE Transactions on Wireless Communications, 2025 - publisher</div></div></div></div>' }));
    await search.goto('https://scholar.google.com/scholar?q=sample'); await search.locator('.sl-annotations').waitFor();
    assert.equal(await search.locator('#sl-panel').isVisible(), true);
    assert.equal((await search.locator('#gs_res_ccl_mid').boundingBox()).x, 160);
    assert.equal((await search.locator('#gs_res_ccl_mid').boundingBox()).width, 650);
    assert.equal((await search.locator('#gs_hdr').boundingBox()).width, 1920);
    assert.ok((await search.locator('#sl-panel').boundingBox()).y >= 82);
    log('search results keep their native width and offset; full-width Scholar header is neither resized nor covered');
    await page.evaluate(() => { window.layoutChanges = 0; new MutationObserver(ms => window.layoutChanges += ms.length).observe(document.querySelector('#gsc_a_b'), { subtree: true, childList: true, attributes: true }); });
    await page.waitForTimeout(1500); assert.equal(await page.evaluate(() => window.layoutChanges), 0);
    assert.deepEqual(errors, []);
    log('settled layout has no mutation feedback loop or console / page errors');
    fs.writeFileSync(path.join(out, 'layout-results.json'), JSON.stringify({ checks, errors, palette, measurements }, null, 2));
  } catch (error) {
    console.error(error); fs.writeFileSync(path.join(out, 'layout-results.json'), JSON.stringify({ checks, errors, failure: String(error) }, null, 2)); process.exitCode = 1;
  } finally { await context.close(); }
})();
