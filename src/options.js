'use strict';
const C = ScholarLens;
const $ = id => document.getElementById(id);
const defaults = { enabled: true, showMissing: true, deduplicate: true, nativeAuthors: true, autoLoad: true, authors: '', aliases: '' };
let savedRecords = [], baseRecords = [], libraryRecords = [], pending = null;
function status(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function download(name, text, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function table(records, element) {
  element.replaceChildren();
  if (!records.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = '未找到匹配场所。试试完整名称、别名或 ISSN。'; element.append(p); return; }
  const t = document.createElement('table');
  const head = document.createElement('tr'); ['期刊 / 场所', '指标（最新年度）'].forEach(text => { const th = document.createElement('th'); th.textContent = text; head.append(th); }); t.append(head);
  records.slice(0, 60).forEach(r => { const tr = document.createElement('tr'); [r.title, C.metricLabels({ record: r }).map(m => m.text).join(' · ') || '仅名称与别名'].forEach(text => { const td = document.createElement('td'); td.textContent = text; tr.append(td); }); t.append(tr); }); element.append(t);
  if (records.length > 60) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = `显示前 60 / ${records.length} 条；可搜索缩小范围。`; element.append(p); }
}
function renderLibrary() {
  $('library-status').textContent = `内置数据已启用 · ${savedRecords.length} 个补充场所`; 
  const q = C.normalize($('data-search').value);
  table(libraryRecords.filter(r => C.normalize([r.title, r.issn, ...(r.issns || []), ...(r.aliases || [])].join(' ')).includes(q)), $('data-list'));
}
function resetPending() { pending = null; $('preview').hidden = true; $('import-actions').hidden = true; $('file').value = ''; }
async function init() {
  const [stored, catalog] = await Promise.all([chrome.storage.local.get(['settings', 'metrics']), chrome.runtime.sendMessage({ type: 'sl:catalog' })]);
  if (!catalog?.ok) throw Error(catalog?.error || '内置目录读取失败');
  baseRecords = ScholarLensCatalog.attachAliases(C.mergeRecords(catalog.data.records, ScholarLensCatalog.hydrateJournals(catalog.journals)), catalog.aliases, catalog.journals);
  savedRecords = stored.metrics || [];
  libraryRecords = C.mergeRecords(baseRecords, savedRecords);
  const settings = { ...defaults, ...stored.settings };
  Object.keys(defaults).forEach(k => { if (typeof defaults[k] === 'boolean') $(k).checked = settings[k]; else $(k).value = settings[k]; });
  $('ccf-count').textContent = catalog.data.records.length;
  $('import-count').textContent = catalog.journals.counts.journals.toLocaleString();
  if (catalog.journals.counts.excludedJournals) $('excluded-count').textContent = `另有 ${catalog.journals.counts.excludedJournals.toLocaleString()} 个医学 / 人文社科期刊仅保留名称`;
  $('metric-count').textContent = catalog.journals.counts.jcr.toLocaleString();
  renderLibrary();
}
$('file').addEventListener('change', async () => {
  const file = $('file').files[0]; resetPending(); if (!file) return;
  try {
    if (file.size > 8 * 1024 * 1024) throw Error('文件超过 8 MB，请拆分导入');
    pending = C.parseImport(await file.text(), file.name);
    table(pending, $('preview')); $('preview').hidden = false; $('import-actions').hidden = false;
    status('import-status', `校验通过：${pending.length} 个场所，尚未写入。请检查指标与年份，再确认导入。`);
  } catch (error) { status('import-status', error.message, true); }
});
$('commit-import').addEventListener('click', async () => {
  if (!pending) return;
  $('commit-import').disabled = true;
  try { const current = await chrome.storage.local.get('metrics'); const merged = C.mergeRecords(current.metrics || [], pending); C.mergeRecords(baseRecords, merged); await chrome.storage.local.set({ metrics: merged }); savedRecords = merged; libraryRecords = C.mergeRecords(baseRecords, savedRecords); resetPending(); renderLibrary(); status('import-status', '导入成功，已打开的 Scholar 页面将自动更新。'); }
  catch (error) { status('import-status', `保存失败，原数据保留：${error.message}`, true); }
  finally { $('commit-import').disabled = false; }
});
$('cancel-import').addEventListener('click', () => { resetPending(); status('import-status', '已取消，原数据未改动。'); });
$('data-search').addEventListener('input', renderLibrary);
$('export-data').addEventListener('click', () => download('scholar-lens-metrics.json', JSON.stringify({ version: 1, records: savedRecords }, null, 2)));
$('clear-data').addEventListener('click', async () => {
  if (!confirm('清空所有导入数据？内置 CCF 与期刊快照保留。建议先备份 JSON。')) return;
  try { await chrome.storage.local.set({ metrics: [] }); savedRecords = []; libraryRecords = baseRecords; resetPending(); renderLibrary(); status('library-status', '已清空导入数据。'); } catch (error) { status('library-status', error.message, true); }
});
$('save-settings').addEventListener('click', async () => {
  const settings = Object.fromEntries(Object.keys(defaults).map(k => [k, typeof defaults[k] === 'boolean' ? $(k).checked : $(k).value.trim()]));
  try { await chrome.storage.local.set({ settings }); status('settings-status', '已保存，即时应用到已打开的 Scholar 页面。'); } catch (error) { status('settings-status', error.message, true); }
});
$('csv-template').addEventListener('click', () => download('scholar-lens-template.csv', C.csv([
  ['title','aliases','type','issn','cas','casYear','casCategory','casScope','jcr','jcrYear','jcrCategory','impactFactor','ifYear','source'],
  ['请替换为真实期刊全名','别名一|别名二','journal','','','','','major','','','','','','请填写来源名称或链接']
]), 'text/csv;charset=utf-8'));
$('json-template').addEventListener('click', () => download('scholar-lens-template.json', JSON.stringify({ records: [{ title: '请替换为真实期刊全名', type: 'journal', aliases: [], cas: [], jcr: [], impactFactors: [] }] }, null, 2)));
init().catch(error => status('import-status', `初始化失败：${error.message}`, true));
