'use strict';
let catalogPromise;
const read = name => fetch(chrome.runtime.getURL('data/' + name)).then(r => { if (!r.ok) throw Error('内置目录读取失败'); return r.json(); });
const catalog = () => catalogPromise ||= Promise.all([read('ccf.json'),read('journals.json'),read('venue-aliases.json')]).then(([ccf,journals,aliases]) => ({ccf,journals,aliases}));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'sl:catalog') {
    catalog().then(({ccf,journals,aliases}) => respond({ ok: true, data: ccf, journals, aliases })).catch(error => { catalogPromise = null; respond({ ok: false, error: error.message }); });
    return true;
  }
  if (message?.type === 'sl:options') { chrome.runtime.openOptionsPage(); respond({ ok: true }); }
});
