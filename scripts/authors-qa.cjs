const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ext = path.resolve(__dirname, '..');
const qaOut = process.env.SCHOLAR_QA_OUTPUT || path.join(require('node:os').tmpdir(), 'scholar-lens-qa');
fs.mkdirSync(qaOut, { recursive: true });
const fixture = require('../tests/fixtures/yinghui-he.json');
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base = fs.readFileSync(path.join(ext, 'tests/fixtures/scholar.html'), 'utf8');
const rows = fixture.papers.map(([title, authors, year, citations], i) => `<tr class="gsc_a_tr"><td class="gsc_a_t"><a class="gsc_a_at" href="/citations?citation_for_view=NAME_QA:${i}">${escape(title)}</a><div class="gs_gray">${escape(authors)}</div><div class="gs_gray">作者匹配回归样本 · 不评定场所</div></td><td class="gsc_a_c"><a class="gsc_a_ac">${citations}</a></td><td class="gsc_a_y">${year}</td></tr>`).join('');
const html = base.replace(/<script>[\s\S]*?<\/script>/, '').replaceAll('Lin Chen', escape(fixture.profile)).replace('>LC<','>YH<')
  .replace('<tbody id="gsc_a_b"></tbody>', `<tbody id="gsc_a_b">${rows}</tbody>`).replace('<button id="gsc_bpf_more">显示更多</button>','')
  .replace('离线测试 · 合成论文 · 指标来自内置公开快照','姓名回归测试 · 真实主页摘录 9 条 · 非完整主页')
  .replace('演示作者 · 用于插件功能验收','姓名匹配回归样本 · 2026-10-24 观察')
  .replace('所有论文标题与引用量均为合成测试数据，不代表真实作者记录。','摘录真实主页前 9 条作者记录；未模拟全部 73 篇，统计仅针对这 9 条。');
(async () => {
  const checks = [], errors = []; const log = s => { checks.push(s); console.log('PASS', s); };
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(qaOut,'authors-')), {
    executablePath: process.env.CHROME_EXECUTABLE || chromium.executablePath(), headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`], viewport: {width:1920,height:1100}, acceptDownloads:true
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const options = await context.newPage(); await options.goto(`chrome-extension://${id}/src/options.html`);
    await options.locator('#ccf-count').filter({hasText:'677'}).waitFor();
    await options.locator('#autoLoad').uncheck(); await options.locator('#save-settings').click();
    const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => {if(m.type()==='error') errors.push(m.text());});
    await p.route('https://scholar.google.com/**', r => r.fulfill({contentType:'text/html',body:html}));
    await p.goto('https://scholar.google.com/citations?user=NAME_QA');
    await p.locator('#sl-author-match').filter({hasText:'已识别 9 / 9'}).waitFor();
    assert.equal(await p.locator('.sl-author-hit').count(),4); assert.equal(await p.locator('mark.sl-name').count(),9);
    assert.deepEqual(await p.locator('#sl-all-count, #sl-all-citations, #sl-all-h, #sl-all-i10').allTextContents(), ['9','2,805','9','9']);
    assert.equal((await options.evaluate(async () => (await chrome.storage.local.get('profileAliases')).profileAliases)) ?? null, null);
    log('nine transcribed real author lists match bilingual profile with zero manual aliases');
    await p.locator('#sl-name-candidates summary').click();
    const initial = p.getByRole('checkbox',{name:'匹配姓名 Y He',exact:true});
    assert.equal(await initial.isChecked(),true); assert.equal(await p.getByRole('checkbox',{name:'匹配姓名 He Y',exact:true}).isChecked(),false);
    assert.match(await p.locator('#sl-name-choices').innerText(), /Y He \/ Y\. He[\s\S]*已出现于 9 篇/);
    assert.deepEqual(await p.locator('#sl-name-choices strong').allInnerTexts(), ['Yinghui He','Y He / Y. He','He Y / He Y.']);
    assert.equal(await p.locator('#sl-author-names').inputValue(), 'Yinghui He');
    log('candidate spellings and observed counts are visible; surname-first inference is opt-in');
    await p.locator('#sl-role-none').click(); await p.locator('#sl-role-first').check(); await p.locator('#sl-highlight-only').check();
    assert.deepEqual(await p.locator('#sl-hit-count, #sl-hit-citations, #sl-hit-h, #sl-hit-i10').allTextContents(), ['4','784','4','4']);
    assert.equal(await p.locator('.gsc_a_tr:visible').count(),4);
    const colors = await p.locator('.gsc_a_tr:visible').evaluateAll(rows => rows.map(r => [...r.cells].map(c => getComputedStyle(c).backgroundColor)));
    assert.ok(colors.every(cells => cells.every(c => c === 'rgb(254, 247, 224)')));
    const download = p.waitForEvent('download'); await p.locator('#sl-export').click();
    const csv = fs.readFileSync(await (await download).path(), 'utf8');
    for (const i of [3,4,6,8]) assert.ok(csv.includes(fixture.papers[i][0]));
    for (const i of [0,1,2,5,7]) assert.ok(!csv.includes(fixture.papers[i][0]));
    await p.screenshot({path:path.join(qaOut,'authors-first-only.png'),fullPage:true});
    log('first-author filter keeps four rows and 784 citations; all cells highlight and CSV agrees');
    const accents = rows => rows.map(r => [...r.cells].map(c => getComputedStyle(c).boxShadow.includes('inset')));
    const onEdge = cells => cells.every(row => row[0] && !row.slice(1).some(Boolean));
    assert.ok(onEdge(await p.locator('.gsc_a_tr:visible').evaluateAll(accents)));
    // Your own profile has a checkbox column before the title; the accent must stay on the row's left edge.
    await p.evaluate(() => { document.querySelector('#gsc_a_t thead tr').prepend(document.createElement('th')); document.querySelectorAll('.gsc_a_tr').forEach(r => { const td = document.createElement('td'); td.className = 'gsc_a_x'; td.innerHTML = '<input type="checkbox">'; r.prepend(td); }); });
    assert.ok(onEdge(await p.locator('.gsc_a_tr:visible').evaluateAll(accents)));
    await p.screenshot({path:path.join(qaOut,'authors-own-profile.png'),fullPage:true});
    await p.evaluate(() => document.querySelectorAll('.gsc_a_x, #gsc_a_t thead th:first-child').forEach(n => n.remove()));
    log('accent bar sits on the row edge, with or without the own-profile checkbox column');
    await p.locator('#sl-reset').click(); await p.locator('#sl-role-all').click();
    await initial.uncheck(); await p.locator('#sl-author-match').filter({hasText:'已识别 0 / 9'}).waitFor();
    await p.reload(); await p.locator('#sl-author-match').filter({hasText:'已识别 0 / 9'}).waitFor(); await p.locator('#sl-name-candidates summary').click();
    assert.equal(await initial.isChecked(),false); await initial.check(); await p.locator('#sl-author-match').filter({hasText:'已识别 9 / 9'}).waitFor();
    log('candidate opt-out persists on reload; re-enabling immediately restores whole-row highlights');
    // A newly loaded coauthor with a different full name must invalidate the old inference.
    await p.evaluate(() => { const row = document.querySelector('.gsc_a_tr').cloneNode(true); row.querySelector('.gsc_a_at').textContent='Synthetic name collision probe'; row.querySelector('.gsc_a_at').href='/citations?citation_for_view=NAME_QA:collision'; row.querySelector('.gs_gray').textContent='Yuhang He, G Yu'; row.querySelectorAll('.sl-annotations').forEach(n=>n.remove()); document.querySelector('#gsc_a_b').append(row); document.querySelector('header .label').textContent='姓名冲突测试 · 9 条真实摘录 + 1 条合成冲突'; document.querySelector('.foot').textContent='额外的 Yuhang He 记录是合成测试用例，用于验证缩写冲突。'; });
    await p.locator('.sl-name-conflict').first().waitFor();
    await p.locator('#sl-author-match').filter({hasText:'已识别 0 / 10'}).waitFor();
    assert.equal(await initial.isEnabled(),false); assert.match(await p.locator('#sl-name-choices').innerText(), /Yuhang He/);
    assert.equal(await p.locator('.sl-author-hit').count(),0);
    await p.locator('#sl-highlight-only').check(); assert.equal(await p.locator('.gsc_a_tr:visible').count(),0);
    assert.match(await p.locator('#sl-venues').innerText(), /姓名存在歧义/);
    await p.screenshot({path:path.join(qaOut,'authors-collision.png'),fullPage:true});
    log('newly loaded different full name sharing initials revokes inferred highlights and explains empty focus');
    await p.locator('#sl-highlight-only').uncheck(); await p.locator('.sl-edit-role').nth(3).click();
    await p.locator('.sl-role-dialog input[value="first"]').check(); await p.getByRole('button',{name:'保存标记',exact:true}).click();
    await p.locator('#sl-author-match').filter({hasText:'已识别 1 / 10'}).waitFor(); await p.locator('#sl-highlight-only').check();
    assert.equal(await p.locator('.gsc_a_tr:visible').count(),1); assert.match(await p.locator('.gsc_a_tr:visible').innerText(), /RIS-assisted/);
    log('manual paper-level role confirmation resolves only that paper, not all same-initial names');
    await p.reload(); await p.locator('#sl-author-match').filter({hasText:'已识别 9 / 9'}).waitFor();
    await p.evaluate(() => { document.querySelectorAll('.gsc_a_tr')[0].querySelector('.gs_gray').textContent='Y He, J Ren, Y. He'; document.querySelector('header .label').textContent='重名回归测试 · 首条作者名单是合成冲突'; });
    await p.locator('#sl-author-match').filter({hasText:'已识别 8 / 9'}).waitFor();
    assert.doesNotMatch(await p.locator('.gsc_a_tr').first().getAttribute('class'), /sl-author-hit/);
    assert.match(await p.locator('.gsc_a_tr').first().innerText(), /姓名有歧义/);
    log('duplicate initials within one author list withhold that row and show an ambiguity badge');
    await p.setViewportSize({width:390,height:844}); await p.locator('#sl-panel[data-placement="sidebar"]').waitFor(); await p.locator('#sl-name-candidates summary').click(); await p.locator('#sl-name-choices').waitFor({state:'visible'});
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth<=innerWidth));
    await p.screenshot({path:path.join(qaOut,'authors-mobile.png'),fullPage:true});
    assert.deepEqual(errors, []); log('candidate UI fits 390px; no page or console errors');
  } catch (error) { process.exitCode=1; errors.push(String(error)); console.error(error); }
  finally { fs.writeFileSync(path.join(qaOut,'authors-results.json'),JSON.stringify({checks,errors,scope:fixture.scope},null,2)); await context.close(); }
})();
