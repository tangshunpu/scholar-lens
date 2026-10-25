const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const N = require('../src/venue-normalizer.js');
const catalog = require('../data/ccf.json');
const index = C.buildIndex(catalog.records);

test('official 2026 catalog matches full names, common aliases and years', () => {
  for (const raw of ['2024 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)', 'IEEE Transactions on Pattern Analysis and Machine Intelligence 46 (1), 12-21', 'ICLR 2025', 'Advances in Neural Information Processing Systems 36']) {
    assert.equal(C.matchVenue(raw,index).record.ccf[0].rank,'A', raw);
  }
  assert.equal(C.matchVenue('IEEE Trans. Wireless Commun. 24, 50-60',index).record.ccf[0].rank,'B');
  assert.equal(C.matchVenue('IEEE/ACM Transactions on Networking 32, 50',index).record.short,'TON');
});
test('do not assign main-conference grades to workshops, Findings or short papers', () => {
  for (const raw of ['CVPR Workshops 2025','Findings of the Association for Computational Linguistics: ACL 2025','Proceedings of the International Conference on Machine Learning: Short Papers']) {
    const match=C.matchVenue(raw,index);
    assert.ok(!C.metricLabels(match).some(l=>l.kind.startsWith('ccf')),raw);
  }
});
test('do not guess from truncation, preprints, short acronyms or nested journal names', () => {
  for (const raw of ['2025 IEEE/CVF …','IEEE Transactions on Communication…','arXiv preprint arXiv:2501.12345','AI for systems','Proceedings of a Conference on Machine Learning','Some Journal of Machine Learning Research Methods','Pattern Recognition and Deep Learning']) {
    assert.equal(C.matchVenue(raw,index).record,null,raw);
  }
  const journals=C.buildIndex([{id:'n',title:'Nature',type:'journal',aliases:[]}]);
  assert.equal(C.matchVenue('Nature Communications',journals).record,null);
});
test('ambiguous aliases produce no rank', () => {
  const ix=C.buildIndex([{id:'1',title:'Test Alpha',aliases:['TEST'],type:'conference'},{id:'2',title:'Test Beta',aliases:['TEST'],type:'conference'}]);
  assert.equal(C.matchVenue('TEST 2025',ix).record,null);
});
test('full authorship, truncated lists and symbols are distinguished', () => {
  assert.deepEqual(C.authorRoles('A Chen, B Li, K He',['K He']).roles,['last']);
  assert.deepEqual(C.authorRoles('A Chen, K He, ...',['K He']).roles,['second']);
  const p=C.authorRoles('K He*, B Li',['K He']); assert.equal(p.symbol,false); assert.deepEqual(p.roles,['first','corresponding']);
  const q=C.authorRoles('K He†, B Li',['K He']); assert.equal(q.symbol,true); assert.deepEqual(q.roles,['first']);
  assert.deepEqual(C.authorRoles('K He, B Li',['Kaiming He']).roles,[]);
  assert.deepEqual(C.authorRoles('K He, B Li',['K He'],['cofirst','corresponding']).roles,['cofirst','corresponding']);
  assert.deepEqual(C.authorRoles('K He, B Li',['K He'],['cofirst','corresponding']).indices,[0]);
  assert.deepEqual(C.authorRoles('H Kaiming, W He',['K He']).roles,[]);
});
test('h-index and i10 use only supplied papers including zero citations', () => {
  assert.deepEqual(C.stats([100,10,5,3,0].map(citations=>({citations}))),{count:5,citations:118,h:3,i10:2});
  assert.deepEqual(C.stats([]),{count:0,citations:0,h:0,i10:0});
});
test('bilingual profile headings match the real Yinghui He author lists without manual aliases', () => {
  const aliases = C.profileAuthorAliases('\u202aYinghui He (何映晖)\u202c');
  assert.deepEqual(aliases, ['Yinghui He','Y He']);
  for (const [names, role] of [
    ['J Ren, G Yu, Y He, GY Li','middle'],
    ['J Ren, G Yu, Y Cai, Y He','last'],
    ['J Ren, Y He, D Wen, G Yu, K Huang, D Guo','second'],
    ['Y He, Y Cai, H Mao, G Yu','first'],
    ['Y He, J Ren, G Yu, Y Cai','first'],
    ['J Ren, Y He, G Huang, G Yu, Y Cai, Z Zhang','second'],
    ['Y He, G Yu, Y Cai, H Luo','first'],
    ['J Ren, G Yu, Y Cai, Y He, F Qu','middle'],
    ['Y He, J Liu, M Li, G Yu, J Han, K Ren','first']
  ]) assert.deepEqual(C.authorRoles(names, aliases).roles, [role], names);
  assert.deepEqual(C.authorRoles('何映晖, 张三', aliases).roles, []);
  assert.deepEqual(C.authorRoles('Y. He*, J Ren, …', aliases).roles, ['first', 'corresponding']);
});
test('only the English part of a Scholar profile name is read', () => {
  for (const heading of ['Yinghui He (何映晖)','何映晖（Yinghui He）','Yinghui He（何映晖）','Yinghui He 何映晖','何映晖 Yinghui He','Yinghui He | 何映晖','Yinghui He / 何映晖','Yinghui He · 何映晖','Yinghui He - 何映晖','Yinghui He, 何映晖','Ｙｉｎｇｈｕｉ Ｈｅ 何映晖','Prof. Yinghui He','Dr Yinghui He (何映晖)','Yinghui He, Ph.D.','Yinghui He PhD']) {
    assert.equal(C.englishName(heading), 'Yinghui He', heading);
    assert.deepEqual(C.profileAuthorAliases(heading), ['Yinghui He','Y He'], heading);
  }
  assert.equal(C.englishName('Kevin (Yinghui He)'), 'Yinghui He');
  assert.equal(C.englishName('Jürgen Schmidhuber'), 'Jürgen Schmidhuber');
  assert.equal(C.englishName('Guang-Yi Li 李光义'), 'Guang-Yi Li');
  assert.equal(C.englishName('山田太郎 (Taro Yamada)'), 'Taro Yamada');
  assert.equal(C.englishName('何映晖'), '何映晖');
  assert.equal(C.englishName(''), '');
  const r = C.resolveProfileAuthor('Yinghui He 何映晖', ['Y He, J Ren','何映晖, 张三']);
  assert.ok(r.candidates.every(c => !/\p{Script=Han}/u.test(c.spellings.join(' '))));
  assert.ok(r.aliases.includes('Y He'));
});
test('author initials support punctuation, fullwidth parentheses and multiple given names', () => {
  for (const full of ['Guang Yi Li','Guang-Yi Li','GY Li']) {
    const aliases = C.profileAuthorAliases(full);
    for (const spelling of ['GY Li','G Y Li','G. Y. Li','G.Y. Li']) {
      const result = C.authorRoles(`${spelling}, Someone Else`, aliases);
      assert.deepEqual(result.roles, ['first'], `${full}: ${spelling}`);
      assert.deepEqual(result.matchedNames, [spelling]);
    }
  }
});
test('abbreviations do not match a different full name, surname-only or conflicting repeated initials', () => {
  const aliases = C.profileAuthorAliases('Yinghui He (何映晖)');
  for (const author of ['Yuhang He','Y Huang','HY He','He','Y Hernandez','何映辉']) {
    assert.deepEqual(C.authorRoles(`${author}, J Ren`, aliases).roles, [], author);
  }
  const repeated = C.authorRoles('Y He, J Ren, Y. He', aliases);
  assert.equal(repeated.ambiguous, true);
  assert.deepEqual(repeated.roles, []);
  assert.deepEqual(C.authorRoles('Y He, J Ren, Y. He', aliases, ['corresponding']).roles, ['corresponding']);
  assert.deepEqual(C.authorRoles('Y He, J Ren, G Yu', ['Y He','J Ren']).roles, ['first','second']);
  assert.deepEqual(C.profileAuthorAliases('何映晖'), ['何映晖']);
});
test('profile candidates list possible spellings, observed evidence, and optional surname-first forms', () => {
  const r = C.resolveProfileAuthor('Yinghui He (何映晖)', ['Y He, J Ren','J Ren, Y. He','Yinghui He, G Yu','He Y, A Li']);
  const initial = r.candidates.find(c => c.key === 'y he');
  assert.deepEqual(initial.spellings, ['Y He','Y. He']);
  assert.equal(initial.count, 2); assert.equal(initial.enabled, true);
  assert.deepEqual(initial.observed, ['Y He','Y. He']);
  const reverse = r.candidates.find(c => c.key === 'he y');
  assert.equal(reverse.count, 1); assert.equal(reverse.enabled, false);
  assert.equal(C.resolveProfileAuthor('Yinghui He', [], [], {'he y':true}).candidates.find(c => c.key === 'he y').enabled, true);
  assert.equal(C.resolveProfileAuthor('Yinghui He', [], ['He Y']).candidates.find(c => c.key === 'he y').enabled, true);
  assert.equal(C.resolveProfileAuthor('Yinghui He', [], [], {'y he':false}).candidates.find(c => c.key === 'y he').enabled, false);
});
test('a different full name sharing initials blocks abbreviation matching even if explicitly enabled', () => {
  const r = C.resolveProfileAuthor('Yinghui He (何映晖)', ['Y He, J Ren','Yuhang He, G Yu'], ['Y He'], {'y he':true});
  const initial = r.candidates.find(c => c.key === 'y he');
  assert.deepEqual(initial.conflicts, ['Yuhang He']); assert.equal(initial.enabled, false);
  const options = {singleTarget:true,blockedAliases:r.blockedAliases};
  assert.equal(C.authorRoles('Y He, J Ren', r.aliases, null, options).ambiguous, true);
  assert.deepEqual(C.authorRoles('Yuhang He, J Ren', r.aliases, null, options).roles, []);
  assert.deepEqual(C.authorRoles('Yinghui He, J Ren', r.aliases, null, options).roles, ['first']);
  assert.deepEqual(C.authorRoles('Y He, J Ren', r.aliases, ['first'], options).roles, ['first']);
});
test('multiple matching identities in a single profile paper are withheld but independent search targets remain supported', () => {
  const r = C.resolveProfileAuthor('Yinghui He', ['Y He, J Ren, Y. He','Y He, Yinghui He, G Yu']);
  assert.equal(r.candidates.find(c => c.key === 'y he').repeated, 1);
  assert.equal(C.authorRoles('Y He, Yinghui He, G Yu', r.aliases, null, {singleTarget:true}).ambiguous, true);
  assert.deepEqual(C.authorRoles('Y He, Yinghui He, G Yu', r.aliases).roles, ['first','second']);
});
test('UTF-8 CSV handles BOM, commas, escaped quotes, CRLF and multiline sources', () => {
  const text='\uFEFFtitle,aliases,impactFactor,ifYear,source\r\n"Journal, A","JA|J A",0,2024,"Institution ""report""\narchive"';
  const [r]=C.parseImport(text,'metrics.csv'); assert.equal(r.title,'Journal, A'); assert.equal(r.impactFactors[0].value,0); assert.equal(r.impactFactors[0].source,'Institution "report" archive');
});
test('import preserves categories and independent latest years', () => {
  const rows=[{title:'Journal A',source:'Test data',cas:'1',casYear:2025,casCategory:'CS',jcr:'Q1',jcrYear:2024,jcrCategory:'AI',impactFactor:5,ifYear:2024},{title:'Journal A',source:'Test data',jcr:'Q2',jcrYear:2024,jcrCategory:'Math'}];
  const r=C.parseImport(JSON.stringify(rows),'data.json');assert.equal(r.length,1);assert.equal(r[0].jcr.length,2);
  const labels=C.metricLabels({record:r[0]}); assert.ok(labels.some(l=>l.text==='JCR Q1/Q2 · 2024'));assert.ok(labels.some(l=>l.text==='中科院大类 1区 · 2025'));assert.ok(labels.some(l=>l.text==='IF 5 · 2024'));
  const round=C.parseImport(JSON.stringify({records:r}),'backup.json');assert.deepEqual(round,r);
});
test('invalid metrics fail atomically, including missing provenance and years', () => {
  for(const row of [{title:'A',jcr:'Q5',jcrYear:2024,source:'Source'},{title:'A',impactFactor:2,source:'Source'},{title:'A',cas:'1',casYear:2024},{title:'A',type:'conference',impactFactor:2,ifYear:2024,source:'Source'},{title:'A',impactFactor:-1,ifYear:2024,source:'Source'}])assert.throws(()=>C.parseImport(JSON.stringify([row])));
  assert.throws(()=>C.parseImport('title,jcr\n"unfinished,Q1','bad.csv'));
  assert.throws(()=>C.parseImport('title,jcr\nA,Q1,2024','bad.csv'));
  assert.throws(()=>C.parseImport('title,title\nA,A','bad.csv'));
});
test('merge updates same year/category and preserves historic metrics', () => {
  const make=(year,value)=>C.parseImport(JSON.stringify([{title:'A',source:'test',impactFactor:value,ifYear:year}]));
  const result=C.mergeRecords(C.mergeRecords(make(2023,2),make(2024,3)),make(2024,4));
  assert.equal(result[0].impactFactors.length,2);assert.equal(C.latest(result[0].impactFactors)[0].value,4);
});
test('historical full titles merge into the canonical venue without losing CCF', () => {
  const imported=C.parseImport(JSON.stringify([{title:'IEEE/ACM Transactions on Networking',jcr:'Q1',jcrYear:2024,source:'Test data'}]));
  const merged=C.mergeRecords(catalog.records,imported);assert.equal(merged.length,catalog.records.length);
  const match=C.matchVenue('IEEE/ACM Transactions on Networking 32',C.buildIndex(merged));assert.equal(match.record.short,'TON');assert.equal(match.record.jcr[0].quartile,'Q1');assert.equal(match.record.ccf[0].rank,'A');
  const invalid=C.parseImport(JSON.stringify([{title:'CVPR',impactFactor:3,ifYear:2024,source:'Test data'}]));assert.throws(()=>C.mergeRecords(catalog.records,invalid),/类型/);
});
test('CSV export guards spreadsheet formula injection and escapes quotes', () => { const text=C.csv([['=cmd','+cmd',' @cmd','A "B"',42]]); assert.ok(text.includes('"\'=cmd"'));assert.ok(text.includes('"\'+cmd"'));assert.ok(text.includes('"\' @cmd"'));assert.ok(text.includes('"A ""B"""')); });
test('legacy communication venues and conference-year grouping are retained', () => {
  assert.equal(N.normalizeVenue('IEEE Transactions on Communications 72 (1), 1-10',N.DEFAULT_ALIASES),'IEEE Trans. Commun.');
  assert.equal(N.normalizeVenue('2021 IEEE International Conference on Communications (ICC)',N.DEFAULT_ALIASES),N.normalizeVenue('2022 IEEE International Conference on Communications (ICC)',N.DEFAULT_ALIASES));
  assert.notEqual(N.normalizeVenue('IEEE Transactions on Wireless Communications',N.DEFAULT_ALIASES),N.normalizeVenue('Wireless Communications and Mobile Computing',N.DEFAULT_ALIASES));
});
test('catalog provenance and scope are complete', () => {
  assert.equal(catalog.records.length,677);assert.equal(new Set(catalog.records.map(r=>r.id)).size,677);
  assert.equal(new Set(catalog.records.flatMap(r=>r.ccf.map(c=>c.category))).size,10);
  for(const r of catalog.records){assert.ok(r.title);assert.ok(r.ccf.length);for(const c of r.ccf){assert.equal(c.year,2026);assert.ok(['A','B','C'].includes(c.rank));assert.ok(c.page>=2&&c.page<=72);assert.match(c.source,/ccf.org.cn/);}}
});
test('a star after the target author marks the corresponding author',()=>{
assert.deepEqual(C.authorRoles('Lin Chen*, Maya Patel',['Lin Chen']).roles,['first','corresponding']);
assert.deepEqual(C.authorRoles('Maya Patel, D Kim, Lin Chen＊',['Lin Chen']).roles,['last','corresponding']);
assert.deepEqual(C.authorRoles('Maya Patel*, Lin Chen',['Lin Chen']).roles,['second','last']);
const dagger=C.authorRoles('Lin Chen†, Maya Patel',['Lin Chen']);assert.deepEqual(dagger.roles,['first']);assert.equal(dagger.symbol,true);
});
