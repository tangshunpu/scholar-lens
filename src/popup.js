'use strict';
const toggle = document.getElementById('enabled');
chrome.storage.local.get(['settings', 'metrics']).then(data => {
  toggle.checked = data.settings?.enabled !== false;
  document.getElementById('status').textContent = `${data.metrics?.length || 0} 个补充场所 · 内置期刊数据已启用`;
}).catch(error => { document.getElementById('status').textContent = error.message; });
toggle.addEventListener('change', async () => { try { const data = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...data.settings, enabled: toggle.checked } }); } catch (error) { document.getElementById('status').textContent = error.message; } });
document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
