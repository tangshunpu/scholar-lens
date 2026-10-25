"""Curated community spellings + systematic bibliography variants. No fuzzy matching."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
records=json.loads((ROOT/'data/ccf.json').read_text())['records']
CCF='https://www.ccf.org.cn/Academic_Evaluation/By_category/'
# Each tuple is (display label, explicitly curated aliases, evidence URLs).
curated={
'ACM MM':('ACM MM',['ACMMM','ACM-MM','ACM Multimedia','ACM Multimedia Conference','ACM Conference on Multimedia','MM','International Conference on Multimedia'],['https://www.acm.org/binaries/content/assets/press-releases/2018/october/mm-2018.pdf','https://acmmm.hosting2.acm.org/']),
'MMAsia':('ACM MM Asia',['ACM MM Asia','ACM Multimedia Asia','ACMMM Asia','Multimedia Asia'],[CCF]),
'SIGKDD':('KDD',['KDD','ACM KDD','ACM SIGKDD','SIGKDD','ACM SIGKDD International Conference on Knowledge Discovery and Data Mining','Knowledge Discovery and Data Mining'],['https://www.kdd.org/conferences']),
'NeurIPS':('NeurIPS',['NIPS','NeurIPS','Advances in Neural Information Processing Systems','Neural Information Processing Systems','神经信息处理系统大会','国际神经信息处理系统大会'],['https://cncc2019.ccf.org.cn/cms/news/100000/0000000040/2019/10/11/6063546cfeff435fa8b3103b32b7a1bf.shtml','https://tc.ccf.org.cn/upload/resources/file/2020/12/28/146927.pdf']),
'WWW':('WWW / TheWebConf',['WWW','ACM WWW','TheWebConf','The Web Conference','ACM Web Conference','International World Wide Web Conference','World Wide Web Conference'],[CCF]),
'CCS':('ACM CCS',['ACM CCS','ACM SIGSAC Conference on Computer and Communications Security','Computer and Communications Security'],[CCF]),
'AsiaCCS':('AsiaCCS',['ASIACCS','ASIA CCS','Asia CCS','ACM ASIACCS','ACM AsiaCCS','ACM Asia Conference on Computer and Communications Security'],[CCF]),
'S&P':('IEEE S&P',['IEEE S&P','IEEE SP','IEEE S and P','IEEE Symposium on Security and Privacy','Oakland','Oakland S&P','Oakland Conference'],['https://www.ieee-security.org/TC/SP2026/cfdonors.html']),
'USENIX Security':('USENIX Security',['USENIX Security','USENIX Security Symposium','USENIX SEC','USENIX Security Symp'],['https://www.usenix.org/conferences/past']),
'ACM SIGOPS ATC':('ATC',['ATC','USENIX ATC','ACM ATC','ACM SIGOPS ATC','USENIX Annual Technical Conference','USENIX Annual Technical Conf','ACM SIGOPS Annual Technical Conference'],['https://atc.sigops.org/2026/cfp.html','https://www.usenix.org/conference/osdi24/call-for-papers']),
'NSDI':('NSDI',['USENIX NSDI','USENIX Symposium on Networked Systems Design and Implementation','Symposium on Networked Systems Design and Implementation','Networked Systems Design and Implementation'],[CCF]),
'OSDI':('OSDI',['USENIX OSDI','Operating Systems Design and Implementation'],['https://www.usenix.org/conference/osdi24/call-for-papers']),
'SOSP':('SOSP',['ACM SOSP','ACM SIGOPS Symposium on Operating Systems Principles','Symposium on Operating Systems Principles'],[CCF]),
'FAST':('FAST',['USENIX FAST','Conference on File and Storage Technologies'],[CCF]),
'EuroSys':('EuroSys',['ACM EuroSys','EuroSys','European Conference on Computer Systems','European Conference in Computer Systems'],[CCF]),
'CVPR':('CVPR',['IEEE CVPR','IEEE/CVF CVPR','IEEE/CVF Conference on Computer Vision and Pattern Recognition','IEEE Conference on Computer Vision and Pattern Recognition','Computer Vision and Pattern Recognition','国际计算机视觉与模式识别会议'],['https://dl.ccf.org.cn/albumList/getMeetingDetail5976848823011328?_ack=1',CCF]),
'ICCV':('ICCV',['IEEE ICCV','IEEE/CVF ICCV','IEEE/CVF International Conference on Computer Vision','IEEE International Conference on Computer Vision'],[CCF]),
'ICML':('ICML',['International Conference on Machine Learning','International Conf on Machine Learning','International Conference on Machine Learning ICML'],[CCF]),
'ICLR':('ICLR',['International Conference on Learning Representations'],[CCF]),
'AAAI':('AAAI',['AAAI Conference on Artificial Intelligence','National Conference on Artificial Intelligence'],[CCF]),
'IJCAI':('IJCAI',['IJCAI-ECAI','International Joint Conference on Artificial Intelligence','International Joint Conferences on Artificial Intelligence'],[CCF]),
'ACL':('ACL',['ACL-HLT','ACL HLT','Annual Meeting of the Association for Computational Linguistics','Annual Meeting of the Association for Computational Linguistics and the International Joint Conference on Natural Language Processing'],['https://aclanthology.org/venues/acl/']),
'EMNLP':('EMNLP',['EMNLP-IJCNLP','EMNLP IJCNLP','Empirical Methods in Natural Language Processing','Empirical Methods in Natural Language Processing and International Joint Conference on Natural Language Processing'],['https://aclanthology.org/volumes/D19-1/']),
'NAACL':('NAACL',['NAACL-HLT','NAACL HLT','Conference of the North American Chapter of the Association for Computational Linguistics','Human Language Technologies: The Annual Conference of the North American Chapter of the Association for Computational Linguistics'],['https://2025.naacl.org/program/accepted_papers/']),
'ECCV':('ECCV',['European Conference on Computer Vision','Computer Vision ECCV'],[CCF]),
'COLING':('COLING',['International Conference on Computational Linguistics','International Joint Conference on Computational Linguistics'],[CCF]),
'SIGMOD':('SIGMOD',['ACM SIGMOD','ACM SIGMOD International Conference on Management of Data','International Conference on Management of Data','SIGMOD Conference'],['https://sigmod.org/publication-list/','https://2026.sigmod.org/calls_papers_sigmod_research.shtml']),
'VLDB':('VLDB',['International Conference on Very Large Databases','Very Large Data Bases','Very Large Databases'],['https://www.vldb.org/conference.html']),
'SIGIR':('SIGIR',['ACM SIGIR','ACM SIGIR Conference on Research and Development in Information Retrieval','International ACM SIGIR Conference on Research and Development in Information Retrieval'],[CCF]),
'FSE':('FSE',['ESEC/FSE','ESEC-FSE','ACM SIGSOFT FSE','ACM Joint European Software Engineering Conference and Symposium on the Foundations of Software Engineering','ACM SIGSOFT International Symposium on Foundations of Software Engineering','Foundations of Software Engineering'],[CCF]),
'ICSE':('ICSE',['IEEE/ACM ICSE','ACM/IEEE ICSE','International Conference on Software Engineering'],[CCF]),
'ASE':('ASE',['IEEE/ACM ASE','ACM/IEEE ASE','IEEE ACM International Conference on Automated Software Engineering','International Conference on Automated Software Engineering'],[CCF]),
'OOPSLA':('OOPSLA',['ACM OOPSLA','Object-Oriented Programming Systems Languages and Applications','Object Oriented Programming Systems Languages and Applications'],['https://www.sigplan.org/Conferences/OOPSLA/']),
'POPL':('POPL',['ACM POPL','Principles of Programming Languages','ACM SIGPLAN Symposium on Principles of Programming Languages'],['https://www.sigplan.org/PACMPL/pacmpl_procedures.pdf']),
'PLDI':('PLDI',['ACM PLDI','Programming Language Design and Implementation'],['https://blog.sigplan.org/2022/08/08/pldi-will-join-pacmpl/']),
'ICFP':('ICFP',['ACM ICFP','International Conference on Functional Programming'],['https://icfp26.sigplan.org/track/icfp-2026-icfp-papers']),
'CHI':('CHI',['ACM CHI','ACM CHI Conference on Human Factors in Computing Systems','CHI Conference on Human Factors in Computing Systems','Human Factors in Computing Systems'],['https://sigchi.org/conferences/']),
'CSCW':('CSCW',['ACM CSCW','Computer Supported Cooperative Work','Computer-Supported Cooperative Work and Social Computing'],['https://archive.sigchi.org/conferences/conference-history/cscw/']),
'UbiComp':('UbiComp',['ACM UbiComp','UbiComp/ISWC','UbiComp ISWC','ACM International Joint Conference on Pervasive and Ubiquitous Computing'],['https://www.ubicomp.org/sc/']),
'UIST':('UIST',['ACM UIST','User Interface Software and Technology'],[CCF]),
'SIGGRAPH':('SIGGRAPH',['ACM SIGGRAPH','Computer Graphics and Interactive Techniques'],[CCF]),
'IEEE VIS':('IEEE VIS',['IEEE VIS','VIS','IEEE Visualization','IEEE Visualization Conference'],[CCF]),
'SC':('SC',['ACM IEEE SC','Supercomputing','IEEE ACM International Conference for High Performance Computing Networking Storage and Analysis','International Conference for High Performance Computing Networking Storage and Analysis','International Conference on High Performance Computing Networking Storage and Analysis'],[CCF]),
'ICDE':('ICDE',['IEEE ICDE','International Conference on Data Engineering'],[CCF]),
'INFOCOM':('INFOCOM',['IEEE INFOCOM','IEEE Conference on Computer Communications','Conference on Computer Communications'],[CCF]),
'MobiHoc':('MobiHoc',['ACM MobiHoc','ACM International Symposium on Mobile Ad Hoc Networking and Computing','International Symposium on Mobile Ad Hoc Networking and Computing','Mobile Ad Hoc Networking and Computing'],['https://dl.acm.org/conference/mobihoc']),
'MASS':('MASS',['IEEE MASS','IEEE International Conference on Mobile Ad-Hoc and Sensor Systems','IEEE International Conference on Mobile Ad-Hoc and Smart Systems','International Conference on Mobile Ad-Hoc and Smart Systems'],[CCF]),
'MobiCom':('MobiCom',['ACM MobiCom','MOBICOM','Annual International Conference on Mobile Computing and Networking'],[CCF]),
'IWQoS':('IWQoS',['IEEE/ACM International Symposium on Quality of Service','International Workshop on Quality of Service'],[CCF]),
'CSFW':('CSF',['CSF','IEEE CSF','IEEE Computer Security Foundations Symposium','Computer Security Foundations Symposium'],[CCF]),
'PACM PL':('PACMPL',['PACMPL','PACM PL','Proc ACM Program Lang','Proceedings of the ACM on Programming Languages','Proceedings of the ACM Programming Languages'],['https://www.sigplan.org/PACMPL/pacmpl_procedures.pdf']),
'PACMHCI':('PACMHCI',['PACMHCI','PACM HCI','Proc ACM Hum Comput Interact','Proceedings of the ACM on Human-Computer Interaction'],['https://sigchi.org/conferences/'])
}
venues=[]
for r in records:
 if r['type']!='conference' and r['short'] not in ['PACM PL','PACMHCI']:continue
 is_curated=r['short'] in curated and r['title']!='Fast Software Encryption'
 label,manual,sources=curated[r['short']] if is_curated else (r['short'],[],[CCF])
 if r['title']=='Fast Software Encryption':label='FSE (Cryptography)'
 if r['short']=='SEC':label='SEC (Edge Computing)' if 'Edge Computing' in r['title'] else 'SEC (IFIP Security)'
 # Pure formatting variants of official full titles, distinct from the researched list.
 full=r['title'];formats=[re.sub(r'^(?:The )?(?:IEEE/ACM |ACM/IEEE |IEEE |ACM |USENIX )','',full),full.replace('International','Int.').replace('Conference','Conf.').replace('Symposium','Symp.')]
 aliases=list(dict.fromkeys([r['short'],*manual,*formats]))
 venues.append({'id':r['id'],'short':r['short'],'displayName':label,'aliases':aliases,'sources':sources,'curated':is_curated})
relations=[
 {'aliases':['Proceedings of the VLDB Endowment','PVLDB','Proc VLDB Endow'],'target':'VLDB','source':'https://www.vldb.org/pvldb/vol17/FrontMatterVol17No13.pdf','scope':'conference-linked'},
 {'aliases':['Proceedings of the ACM on Management of Data','PACMMOD','Proc ACM Manag Data'],'target':'SIGMOD','source':'https://2026.sigmod.org/calls_papers_sigmod_research.shtml','scope':'conference-linked'},
 {'aliases':['Proceedings of the ACM on Interactive Mobile Wearable and Ubiquitous Technologies','IMWUT','Proc ACM Interact Mob Wearable Ubiquitous Technol'],'target':'UbiComp','source':'https://ubicomp.hosting.acm.org/ubicompiswc2026_wp/imwut-papers/','scope':'conference-linked'},
 {'aliases':['PACMPL','PACM PL','Proc ACM Program Lang','Proceedings of the ACM on Programming Languages','Proceedings of the ACM Programming Languages'],'tracks':{'OOPSLA':'OOPSLA','OOPSLA1':'OOPSLA','OOPSLA2':'OOPSLA','POPL':'POPL','PLDI':'PLDI','ICFP':'ICFP'},'source':'https://blog.sigplan.org/2022/08/08/pldi-will-join-pacmpl/','scope':'explicit-track'},
 {'aliases':['PACMHCI','PACM HCI','Proc ACM Hum Comput Interact','Proceedings of the ACM on Human-Computer Interaction'],'tracks':{'CSCW':'CSCW','CSCW1':'CSCW','CSCW2':'CSCW','GROUP':'GROUP','EICS':'EICS','ISS':'ISS'},'source':'https://sigchi.org/conferences/','scope':'explicit-track'}
]
byshort={r['short']:r['id'] for r in records if r['type']=='conference'}
for r in relations:
 if 'target'in r:r['targetId']=byshort[r.pop('target')]
 if 'tracks'in r:r['tracks']={token:byshort[short] for token,short in r['tracks'].items() if short in byshort}
# Short titles Scholar uses for journals whose JCR title is longer, attached by ISSN.
journal_aliases=[
 {'issn':'0027-8424','aliases':['Proceedings of the National Academy of Sciences','Proceedings of the National Academy of Sciences USA','PNAS','Proc. Natl. Acad. Sci. USA'],'source':'https://www.pnas.org/'}
]
# One journal listed under two ISSNs in the bundled snapshots (evidence: the bundled rows themselves).
same_journals=[{"issns": ["2212-473X", "0267-3649"], "evidence": "同名 Computer Law & Security Review：JCR2025-UTF8.csv 第 2876 行用 2212-473X，FQBJCR2025-UTF8.csv 第 4476 行（中科院）仍用旧 ISSN 0267-3649"}, {"issns": ["1386-4564", "2948-2984"], "evidence": "Springer 期刊 10791 于 2024 年由 Information Retrieval Journal 更名为 Discover Computing；JCR2025-UTF8.csv 第 6701、10282 行分列新旧名称", "source": "https://link.springer.com/journal/10791", "preferLater": True}]
output={'version':'2026-10-23','venues':venues,'relations':relations,'sameJournals':same_journals,'journalAliases':journal_aliases,'notes':['Official spelling variants remove publisher prefixes or abbreviate Conference/Symposium; curated names cite primary sources.','PMLR/LNCS/LNAI are multi-conference series and never mapped to a single conference.']}
(ROOT/'data/venue-aliases.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print('Venues',len(venues),'curated',sum(v['curated'] for v in venues),'alias spellings',sum(len(v['aliases']) for v in venues))
