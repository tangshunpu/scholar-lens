const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../src/core.js');const K=require('../src/catalog.js');const ccf=require('../data/ccf.json');const journals=require('../data/journals.json');const aliases=require('../data/venue-aliases.json');
const before=performance.now();const records=K.attachAliases(C.mergeRecords(ccf.records,K.hydrateJournals(journals)),aliases,journals);const index=C.buildIndex(records);const buildMs=performance.now()-before;const match=s=>C.matchVenue(s,index);const group=s=>C.groupVenue(s,match(s),'?');
test('bundled snapshot provides accurate sample years, categories, IF and missing values',()=>{
assert.equal(journals.records.length,8765);assert.equal(journals.excluded.length,14296);assert.equal(journals.records.length+journals.excluded.length,23061);assert.equal(journals.counts.xr,8404);assert.equal(journals.counts.xrWarnings,24);assert.equal(journals.xrConferences.length,15);assert.equal(journals.records.filter(r=>r.if==='<0.1').length,44);assert.equal(journals.counts.cas,8154);assert.equal(journals.counts.jcr,8558);
for(const [title,value] of [['IEEE Transactions on Wireless Communications',10.3],['IEEE Transactions on Pattern Analysis and Machine Intelligence',20.4],['IEEE Transactions on Communications',8.4]]) {const m=match(title+' 24 (2), 2025');assert.ok(m.record,title);assert.equal(C.latest(m.record.impactFactors)[0].value,value,title);assert.equal(C.latest(m.record.impactFactors)[0].year,2025);assert.ok(m.record.sourceLinks[0].includes(journals.upstreamCommit));}
assert.ok(records.filter(r=>r.sourceKind==='bundled-public').length>22000);
});
test('CCF colloquial names map to identical canonical groups',()=>{
for(const names of [['NIPS','NeurIPS2025','Advances in Neural Information Processing Systems'],['ACMMM','ACM-MM 2025','ACM Multimedia','Proceedings of the 33rd ACM International Conference on Multimedia'],['KDD','SIGKDD','ACM KDD 2024'],['ACM WWW','TheWebConf','ACM Web Conference'],['Oakland','IEEE S&P','IEEE SP'],['USENIX ATC','ACM SIGOPS ATC','ATC2026'],['ESEC/FSE','ESEC-FSE','ACM SIGSOFT FSE'],['NAACL','NAACL-HLT'],['CSF','CSFW']]){const values=names.map(group);assert.notEqual(values[0],'?',names.join(','));assert.equal(new Set(values).size,1,JSON.stringify({names,values}));}
});
test('all curated conference canonical names are recognized; workshop conferences keep rank',()=>{
for(const a of aliases.venues){const r=ccf.records.find(r=>r.id===a.id);if(r.type!=='conference')continue;if(r.short==='CVM'){assert.equal(match(r.title).record,null);continue;}const m=match(r.title);assert.equal(m.record?.id,r.id,r.title);assert.equal(m.excluded,false,r.title);}
for(const short of ['HotOS','IWQoS','HotNets','PKC','PEPM']){const r=ccf.records.find(r=>r.short===short);assert.ok(C.metricLabels(match(r.title)).some(l=>l.kind.startsWith('ccf-')),short);assert.ok(!C.metricLabels(match(r.title+' Companion')).some(l=>l.kind.startsWith('ccf-')));}
});
test('subvenues and colliding acronyms do not inherit a main conference rank',()=>{
for(const s of ['CVPR Workshop 2025','Findings of ACL 2025','EMNLP short papers','SIGGRAPH Asia 2025','PMLR 2025','LNCS 12345','LNAI 12345','Journal of MM','Workshop on CCS Applications','WWW','ASE','FSE','Computational Visual Media'])assert.ok(!C.metricLabels(match(s)).some(l=>l.kind.startsWith('ccf-')),s);
assert.notEqual(group('AsiaCCS'),group('CCS'));assert.notEqual(group('ACM MM Asia'),group('ACM MM'));
assert.equal(group('CVPR Workshop 2025'),'CVPR Workshop');assert.equal(group('Findings of ACL 2025'),'ACL Findings');
});
test('journal conference containers preserve their metrics and require explicit issue tracks',()=>{
assert.equal(group('PACMPL 8 (OOPSLA2), 1-20'),'OOPSLA');assert.equal(group('Proc. ACM Program. Lang. 9 (POPL), 2025'),'POPL');assert.equal(group('PACMHCI 8 (CSCW1), 1-24'),'CSCW');
assert.equal(C.latest(match('PACMPL').record.ccf)[0].rank,'C');assert.equal(C.latest(match('PACMHCI').record.ccf)[0].rank,'C');assert.equal(C.latest(match('PACMPL 9 (OOPSLA2)').record.ccf)[0].rank,'A');
assert.equal(group('Proceedings of the VLDB Endowment 18 (4), 2025'),'VLDB');assert.equal(group('PACMMOD 3 (2), 2025'),'SIGMOD');assert.equal(group('IMWUT 8 (1), 2025'),'UbiComp');assert.ok(C.metricLabels(match('PVLDB 18 (1), 2025')).some(l=>l.text.startsWith('关联 CCF')));
assert.ok(match('Proceedings of the VLDB Endowment 18 (1)').record.impactFactors.length);
});
test('same-title different ISSNs stay ambiguous, and imported bound IF roundtrips',()=>{
const r=records.filter(r=>C.normalize(r.title)==='journal of computer science and technology');assert.equal(r.length,2);assert.equal(match('Journal of Computer Science and Technology').record,null);
const a=C.parseImport(JSON.stringify([{title:'Bound test',type:'journal',issn:'1234-567X',impactFactors:[{year:2025,value:'<0.1',source:'test'}]}]));assert.equal(a[0].impactFactors[0].value,'<0.1');assert.deepEqual(C.parseImport(JSON.stringify(a)),a);
});
test('token index handles full library within interactive latency',()=>{const t=performance.now();for(let i=0;i<100;i++)match('IEEE Transactions on Wireless Communications 24, 100-120');assert.ok(performance.now()-t<1000);assert.ok(buildMs<5000,`build ${buildMs}ms`);console.log(`Catalog build ${Math.round(buildMs)}ms`);});
test('every bundled metric is valid and raw sources match recorded SHA-256',()=>{
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
for(const [file,hash] of Object.entries(journals.sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../data/upstream',file))).digest('hex'),hash,file);
assert.equal(new Set(journals.records.map(r=>r.id)).size,journals.records.length);
for(const r of journals.records){assert.ok(r.title);assert.ok(r.issns.length||(r.xr.length&&!r.cas.length&&!r.jcr.length),r.title);for(const [c,d,major,top] of r.xr){assert.ok(journals.xrCategories[c]);assert.ok([1,2,3,4].includes(d));assert.ok([0,1].includes(major)&&[0,1].includes(top));}for(const [c,q,scope,top] of r.cas){assert.ok(c);assert.ok([1,2,3,4].includes(q));assert.ok(['major','minor'].includes(scope));assert.equal(typeof top,'boolean');}for(const [c,q] of r.jcr){assert.ok(c);assert.match(q,/^Q[1-4]$/);}assert.ok(r.if===null||r.if==='<0.1'||typeof r.if==='number'&&Number.isFinite(r.if)&&r.if>=0);}
});
test('user-reported MobiCom proceedings, editions and complete names before ellipses retain CCF A',()=>{
const venue='Proceedings of the 29th Annual International Conference on Mobile Computing and Networking';
for(const s of [venue,venue+' …',venue+' ...',venue+' 1-15, 2023',"ACM MobiCom '23",'Proceedings of the 30th Annual International Conference on Mobile Computing and Networking']){const m=match(s);assert.equal(m.record?.short,'MobiCom',s);assert.equal(group(s),'MobiCom',s);assert.equal(C.latest(m.record.ccf)[0].rank,'A');assert.ok(C.metricLabels(m).some(l=>l.kind==='ccf-a'));}
for(const s of ['Proceedings of the 29th Annual International Conference on Mobile …',venue+' Workshops …',venue+' Companion …'])assert.ok(!C.metricLabels(match(s)).some(l=>l.kind.startsWith('ccf-')),s);
});
test('CAS tier-one emphasis follows displayed major division, not an undisplayed minor division',()=>{
const mk=(major,minor)=>C.metricLabels({record:{type:'journal',title:'Test',cas:[{year:2025,scope:'major',division:major,source:'test'},{year:2025,scope:'minor',division:minor,source:'test'}]}}).find(l=>l.kind==='cas');
assert.equal(mk(1,2).emphasis,'cas-one');assert.equal(mk(2,1).emphasis,null);
});
test('paper tiers drive CCF-A / CAS division / IEEE Trans counts and filters',()=>{
const tier=s=>C.paperTiers(match(s),s);
assert.deepEqual(tier('IEEE Transactions on Pattern Analysis and Machine Intelligence 46 (1), 12-21'),{ccf:'A',cas:1,xr:1,ieee:true});
const twc=tier('IEEE Transactions on Wireless Communications');assert.deepEqual(tier('IEEE Trans. Wireless Commun. 24, 50-60'),{ccf:'B',cas:twc.cas,xr:twc.xr,ieee:true});
assert.equal(tier('IEEE/ACM Transactions on Networking 32, 50').ieee,true);
const cvpr=tier('Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition');assert.equal(cvpr.ccf,'A');assert.equal(cvpr.cas,null);assert.equal(cvpr.ieee,false);
assert.equal(tier('CVPR Workshops 2025').ccf,null);
assert.equal(tier('arXiv preprint arXiv:2501.12345').ieee,false);
assert.equal(tier('IEEE Journal on Selected Areas in Communications 42, 1-10').ieee,false);
for(const r of records.filter(r=>r.cas?.length).slice(0,400)){const t=C.paperTiers({record:r},r.title);const shown=C.metricLabels({record:r}).find(l=>l.kind==='cas');assert.equal(t.cas===1,shown.emphasis==='cas-one',r.title);}
});
test('Scholar-truncated venue names are inferred only from a unique name prefix',()=>{
const imwut=match('Proceedings of the ACM on Interactive, Mobile, Wearable and Ubiquitous …');assert.equal(imwut.inferred,true);assert.equal(imwut.record.displayName,'UbiComp');
const labels=C.metricLabels(imwut);assert.ok(labels.some(l=>l.text.startsWith('关联 CCF A')));assert.ok(labels.some(l=>l.kind==='cas'));assert.match(labels[0].detail,/截断/);
assert.equal(records.filter(r=>/interactive mobile wearable and ubiquitous/i.test(r.title)).length,1,'IMWUT relation attaches to the ShowJCR journal');
assert.ok(C.metricLabels(match('Proceedings of the ACM on Interactive, Mobile, Wearable and Ubiquitous Technologies 7 (1), 1-20')).some(l=>l.kind==='cas'));
for(const [raw,short] of [['Proceedings of the 29th Annual International Conference on Mobile Computing …','MobiCom'],['Proceedings of the 2024 USENIX Symposium on Operating Systems Design and …','OSDI'],['Proceedings of the 2024 ACM SIGMOD-SIGACT-SIGAI Symposium on Principles of Database …','PODS'],['Proceedings of the 2024 ACM SIGGRAPH/Eurographics Symposium on Computer …','SCA'],['Proceedings of the 61st Annual Meeting of the Association for Computational …','ACL'],['IEEE Transactions on Pattern Analysis and Machine …','TPAMI']])assert.equal(match(raw).record?.short,short,raw);
// Too little left, a name that runs past a known venue, or two possible venues: no guess.
for(const raw of ['International Conference on Machine Learning and …','Proceedings of the ACM on …','Proceedings of the 2024 IEEE International Conference on Computer …'])assert.equal(match(raw).record,null,raw);
assert.match(match('Proceedings of the 29th ACM SIGOPS Symposium on Operating Systems …').reason,/SOSP \/ OSDI/);
});
test('ordinary words among one-word aliases are not read as acronyms',()=>{
assert.equal(match('Proceedings of the Design Society').record,null);
for(const [raw,short] of [['Proc. MobiCom 2024','MobiCom'],['Mobicom','MobiCom'],['ACM SIGCOMM 2023 Conference','SIGCOMM'],['USENIX FAST 2024','FAST'],['IEEE INFOCOM 2020-IEEE Conference on Computer Communications','INFOCOM']])assert.equal(match(raw).record?.short,short,raw);
});
test('renamed journals listed twice by JCR fold into one venue; acronym-titled journals do not hijack CCF records',()=>{
for(const raw of ['IEEE Transactions on Networking 34, 5680-5695','IEEE/ACM Transactions on Networking 32 (1), 1-15']){const m=match(raw);assert.equal(m.record?.short,'TON',raw);assert.ok(C.metricLabels(m).some(l=>l.kind==='jcr'),raw);}
assert.equal(match('IEEE Transactions on Audio, Speech and Language Processing 33, 1-12').record?.short,'TASLP');
assert.ok(match('IEEE Transactions on Networking 34').record.issns.includes('2998-4157'));
const ai=match('Artificial Intelligence 300, 103560').record;assert.equal(ai.short,'AI');assert.ok(ai.issns.includes('0004-3702'));assert.ok(!ai.issns.includes('2673-2688'));
const bare=match('AI 5 (2), 100-120');assert.equal(bare.record,null);assert.equal(bare.ambiguous,true);
assert.deepEqual(C.venueOptions('AI 5 (2), 100-120',index).map(r=>r.issns[0]).sort(),['0004-3702','2673-2688']);
});
test('user venue confirmation applies to every paper of that venue name',()=>{
assert.equal(C.venueKey('Journal of Computer Science and Technology 39 (2), 1-20'),C.venueKey('Journal of Computer Science and Technology 40, 77'));
assert.notEqual(C.venueKey('Proceedings of the 2024 IEEE International Conference on Computer …'),C.venueKey('Proceedings of the 2024 IEEE International Conference on Computer'));
const jcst=records.find(r=>r.issns?.includes('1000-9000'));const chosen=C.chosenMatch('Journal of Computer Science and Technology 39 (2)',jcst);
assert.equal(chosen.manual,true);assert.ok(C.metricLabels(chosen).some(l=>l.text.startsWith('CCF B')));assert.match(C.metricLabels(chosen)[0].detail,/用户确认/);
const imwut=records.find(r=>r.issns?.includes('2474-9567'));assert.equal(C.chosenMatch('Proc. IMWUT …',imwut).record.displayName,'UbiComp');
assert.equal(C.chosenMatch('Some thesis',null).record,null);
assert.equal(C.paperTiers(chosen,'').ccf,'B');
});
test('a leading "The" does not hide a journal name',()=>{
for(const [raw,issn] of [['The journal of machine learning research 15 (1), 1929-1958',null],['The Lancet 400, 1-10','0140-6736'],['The Journal of Physical Chemistry C 128 (3)',null]]){const r=match(raw).record;assert.ok(r,raw);if(issn)assert.ok(r.issns.includes(issn),raw);}
assert.equal(match('The journal of machine learning research 15 (1), 1929-1958').record.short,'JMLR');
assert.equal(match('The Lancet Oncology 25 (1)').record.title.toUpperCase(),'LANCET ONCOLOGY');
});
test('ComSoc and computer journals match singular spellings and ISO 4 abbreviations',()=>{
const want=(raw,title)=>{const r=match(raw).record;assert.ok(r,raw);assert.equal(C.normalize(r.title),C.normalize(title),raw);};
for(const [raw,title] of [['IEEE Communication Magazine 61 (5), 120-126','IEEE Communications Magazine'],['IEEE Wireless Communication 30 (2), 1-8','IEEE Wireless Communications'],['IEEE Commun. Mag.','IEEE Communications Magazine'],['IEEE Wirel. Commun.','IEEE Wireless Communications'],['IEEE Trans Wirel Commun 22','IEEE Transactions on Wireless Communications'],['IEEE Commun. Surv. Tutor.','IEEE Communications Surveys and Tutorials'],['IEEE Commun. Lett.','IEEE Communications Letters'],['IEEE Wireless Communication Letters 12','IEEE Wireless Communications Letters'],['IEEE Trans. Netw.','IEEE Transactions on Networking'],['IEEE Open J. Commun. Soc.','IEEE Open Journal of the Communications Society'],['IEEE Internet Things J.','IEEE Internet of Things Journal'],['IEEE Transaction on Mobile Computing 23','IEEE Transactions on Mobile Computing'],['IEEE Trans. Veh. Technol.','IEEE Transactions on Vehicular Technology'],['IEEE J. Sel. Top. Signal Process.','IEEE Journal of Selected Topics in Signal Processing'],['J. ACM','Journal of the ACM'],['Proc. IEEE','Proceedings of the IEEE'],['ACM Comput. Surv.','ACM Computing Surveys'],['Briefings Bioinformatics 25 (1)','Briefings in Bioinformatics']])want(raw,title);
assert.equal(match('Proc. IEEE Int. Conf. Commun.').record.short,'ICC');assert.equal(match('IEEE Global Communication Conference').record.short,'GLOBECOM');
// No forced match: a different journal, a vaguer conference name, or ISO short forms that mean other words.
for(const raw of ['Journal of Communications 18 (2)','Proceedings of a Conference on Machine Learning'])assert.equal(match(raw).record,null,raw);
assert.notEqual(C.normalize(match('J. Neurology 12 (3)').record?.title||''),'jama neurology');
});
test('CCF journals keep their JCR / CAS data across subtitle, article and split-ISSN spellings',()=>{
const ccf=records.filter(r=>r.id.startsWith('ccf-')&&r.type==='journal');assert.ok(ccf.filter(r=>r.cas?.length||r.jcr?.length).length>=281);
for(const short of ['TJSC','VLDBJ','JSA','FGCS','C&G','WWW','TSMC','TQC','CLSR','IR'])assert.ok(ccf.find(r=>r.short===short)?.jcr?.length,short);
for(const raw of ['Computer Supported Cooperative Work 33 (2), 1-30','Computational Visual Media 10 (1)'])assert.equal(match(raw).record.type,'journal',raw);
assert.equal(match('Discover Computing 27 (1)').record.short,'IR');assert.ok(C.metricLabels(match('Computer Law & Security Review 52, 105')).some(l=>l.kind==='cas'));
});
test('新锐期刊分区表 2026: journals, conferences, warnings and tiers',()=>{
const tpami=match('IEEE Transactions on Pattern Analysis and Machine Intelligence 46 (6)');const label=C.metricLabels(tpami).find(l=>l.kind==='xr');assert.equal(label.text,'新锐 1区 Top · 2026');assert.equal(label.emphasis,'xr-one');assert.match(label.detail,/计算机：人工智能/);
assert.equal(C.metricLabels(match('IEEE Communications Magazine 61 (5)')).find(l=>l.kind==='xr').text,'新锐 2区 · 2026');
assert.deepEqual(records.xrMissing,[]);
for(const short of ['CVPR','ICML','NeurIPS','ACL','SIGCOMM','SIGMOD','OSDI','SOSP','ISCA','STOC','FOCS','ICSE','VLDB','S&P','SIGKDD'])assert.equal(records.find(r=>r.type==='conference'&&r.short===short)?.xr?.[0]?.division,1,short);
const cvpr=match('Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition');assert.equal(C.paperTiers(cvpr,'').xr,1);assert.ok(C.metricLabels(cvpr).some(l=>l.text==='新锐 1区 Top · 2026'));
assert.equal(C.paperTiers(match('CVPR Workshops 2025'),'CVPR Workshops 2025').xr,null);assert.ok(!C.metricLabels(match('CVPR Workshops 2025')).some(l=>l.kind==='xr'));
assert.ok(C.metricLabels(match('Applied Organometallic Chemistry 38')).some(l=>l.kind==='xr-warning'));
assert.equal(match('IEEE Transactions on Networking 34').record.short,'TON');
});
test('medicine and humanities / social-science journals ship as names only',()=>{
for(const raw of ['The Lancet 400, 1-10','Nature Medicine 30 (1)','Computers in Human Behavior 150','American Economic Review 114 (2)']){const m=match(raw);assert.ok(m.record?.outOfScope,raw);assert.deepEqual(C.metricLabels(m,true).map(l=>l.text),['人文社科 / 医学期刊 · 未内置指标'],raw);assert.equal(C.paperTiers(m,raw).cas,null);}
// Kept in full: computing / engineering / statistics subjects, and every CCF-listed journal.
for(const raw of ['IEEE Transactions on Medical Imaging 43 (1)','Medical Image Analysis 90','Computers & Education 200','MIS Quarterly 48','Cognition 240','Computer Law & Security Review 52','Journal of Biomedical Informatics 150'])assert.ok(C.metricLabels(match(raw)).some(l=>l.kind==='cas'||l.kind==='jcr'),raw);
assert.equal(records.filter(r=>r.id.startsWith('ccf-')&&r.type==='journal'&&(r.cas?.length||r.jcr?.length)).length,281);
// Importing metrics for a name-only journal shows them again.
const lancet=match('The Lancet 400').record;const imported=K.attachAliases(C.mergeRecords(C.mergeRecords(ccf.records,K.hydrateJournals(journals)),[{title:'LANCET',issns:lancet.issns,type:'journal',aliases:[],impactFactors:[{year:2025,value:88.5,source:'user test'}]}]),aliases,journals);
assert.ok(C.metricLabels(C.matchVenue('The Lancet 400',C.buildIndex(imported))).some(l=>l.text==='IF 88.5 · 2025'));
});
test('older IEEE Xplore citations with backwards names are recognized',()=>{
const want=(raw,short)=>{const m=match(raw);assert.ok(m.record,raw);assert.equal(m.record.short.toUpperCase(),short.toUpperCase(),raw);};
for(const [raw,short] of [['Industrial Electronics, IEEE Transactions on 57 (12), 4219-4230','IEEE Transactions on Industrial Electronics'],['Wireless Communications, IEEE Transactions on 12 (5), 2246-2258','TWC'],['Selected Areas in Communications, IEEE Journal on 31 (9), 1-10','JSAC'],['Communications Letters, IEEE 17 (4), 1-4','IEEE Communications Letters'],['Communications Magazine, IEEE 52 (2), 106-113','IEEE Communications Magazine'],['Networking, IEEE/ACM Transactions on 21 (3), 1-14','TON'],['Pattern Analysis and Machine Intelligence, IEEE Transactions on 35 (8), 1798-1828','TPAMI'],['Access, IEEE 3, 1206-1232','IEEE Access'],['Lightwave Technology, Journal of 32 (4), 1-10','Journal of Lightwave Technology'],['Communications (ICC), 2012 IEEE International Conference on, 1-5','ICC'],['Communications, 2009. ICC\'09. IEEE International Conference on, 1-5','ICC'],['Big Data, 2012 IEEE International Conference on, 1-5','IEEE BigData']])want(raw,short);
const workshop=match('Communications Workshops (ICC), 2013 IEEE International Conference on, 1-5');assert.equal(workshop.record.short,'ICC');assert.equal(workshop.excluded,true);
// A dangling small word or a conference suffix must not pull the text onto a different journal.
assert.notEqual(C.normalize(match('Econometrics, Journal of 12 (3), 45-67').record?.title||''),'econometrics journal');
assert.equal(match('Big Data, 2012 IEEE International Conference on, 1-5').record.type,'conference');
});
test('real-world Scholar venue strings (tests/fixtures/venue-corpus.json) resolve to the right venue',()=>{
for(const [raw,want,flag] of require('./fixtures/venue-corpus.json')){
  const m=match(raw);
  if(want===null){assert.equal(m.record,null,raw);continue;}
  assert.ok(m.record,raw);assert.equal((m.record.short||m.record.title).toUpperCase(),want.toUpperCase(),raw);
  assert.equal(!!m.excluded,flag==='excluded',raw);
}
assert.equal(match('2023 IEEE 98th Vehicular Technology Conference (VTC2023-Fall), 1-5').reason,'会议不在 CCF / 新锐目录中');
});
test('every IEEE DOI journal code points at a catalogued journal',()=>{
const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/core.js'),'utf8');
const codes=[...src.match(/const ieeeDoiJournals = \{([^;]+)\};/)[1].matchAll(/(\w+): '/g)].map(m=>m[1]);assert.ok(codes.length>80);
for(const code of codes)assert.ok(match(`Unknown name, DOI: 10.1109/${code}.2020.1234567`).record,code);
});
