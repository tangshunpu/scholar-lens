"""Build a versioned local snapshot. Only Python's standard library is required."""
import csv,json,re,hashlib,unicodedata,sys,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
COMMIT='4687a8f608f20aaf004299992f5d347dba009361'
BASE=f'https://github.com/hitfyd/ShowJCR/blob/{COMMIT}/中科院分区表及JCR原始数据文件/'
CASFILE='FQBJCR2025-UTF8.csv';JCRFILE='JCR2025-UTF8.csv';XRFILE='XR2026-UTF8.csv';XRCONF='XR2026Conferences-UTF8.csv';XRYEAR=2026
def norm(s):
 s=unicodedata.normalize('NFKD',s).lower().replace('&',' and ')
 return ' '.join(re.sub(r'[^\w]+',' ',s).split())
def ids(*values):return sorted(set(x.upper() for v in values for x in re.findall(r'\b\d{4}-\d{3}[\dXx]\b',v or '')))
def read(name):
 with open(ROOT/'data/upstream'/name,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
records=[];by_issn={};by_title={};warnings=[];bridges=[]
# A later table (XR) may list ISSNs that JCR / CAS keep on two entries; attach it to the print-ISSN entry and record that.
def record(title,issns,bridge=False):
 targets={by_issn[i] for i in issns if i in by_issn}
 if len(targets)>1:
  if not bridge:raise ValueError(f'ISSN bridge conflict: {title}')
  keep=by_issn.get(issns[0],min(targets));bridges.append({'title':title,'issns':issns,'entries':[records[t]['title'] for t in sorted(targets)],'attachedTo':records[keep]['title']})
  return records[keep]
 if targets:r=records[next(iter(targets))]
 else:
  candidates=[n for n in by_title.get(norm(title),[]) if not records[n]['issns'] or not issns or set(records[n]['issns'])&set(issns)]
  if len(candidates)==1:r=records[candidates[0]]
  else:
   r={'title':title.strip(),'issns':issns,'aliases':[],'cas':[],'jcr':[],'xr':[],'if':None}
   records.append(r);by_title.setdefault(norm(title),[]).append(len(records)-1)
 index=next((by_issn[i] for i in r['issns'] if i in by_issn),None)
 if index is None:index=next(n for n in by_title[norm(r['title'])] if records[n] is r)
 if norm(title)!=norm(r['title']):r['aliases'].append(title.strip())
 r['issns']=sorted(set(r['issns']+issns))
 for i in issns:by_issn[i]=index
 return r
jcr=read(JCRFILE);cas=read(CASFILE)
missing_if=0;missing_jcr=0
for line,row in enumerate(jcr,2):
 r=record(row['Journal'],ids(row['ISSN'],row['EISSN']));r['jcrLine']=line
 value=row['IF(2025)'].strip()
 if re.fullmatch(r'\d+(?:\.\d+)?',value):r['if']=float(value)
 elif re.fullmatch(r'<\d+(?:\.\d+)?',value):r['if']=value
 else:missing_if+=1
 for n in range(1,7):
  category=row[f'Category_{n}'].strip();q=row[f'IF Quartile(2025)_{n}'].strip()
  if category and re.fullmatch('Q[1-4]',q):r['jcr'].append([category,q])
 if not r['jcr']:missing_jcr+=1
for line,row in enumerate(cas,2):
 assert row['年份']=='2025'
 r=record(row['Journal'],ids(row['ISSN/EISSN']));r['casLine']=line
 top=row['Top']=='是'
 m=re.match(r'([1-4])(?:\s|$)',row['大类分区'])
 if m:r['cas'].append([row['大类'].strip(),int(m[1]),'major',top])
 elif row['大类分区'].strip():warnings.append({'line':line,'field':'major','value':row['大类分区']})
 for n in range(1,7):
  value=row[f'小类{n}分区'].strip();m=re.match(r'([1-4])(?:\s|$)',value)
  if m:r['cas'].append([row[f'小类{n}'].strip(),int(m[1]),'minor',top])
  elif value:warnings.append({'line':line,'field':'minor','value':value})
# Ids are fixed before XR adds ISSNs, so saved user choices keep pointing at the same journal.
def assign_ids():
 for i,r in enumerate(records):
  if 'id' not in r:r['id']='journal-'+(r['issns'][0] if r['issns'] else hashlib.sha256((r['title']+str(i)).encode()).hexdigest()[:16])
assign_ids()
xr=read(XRFILE);xr_conferences=[];xr_categories=[]
# XR rows are stored compactly: [category index, division, 1 = major / 0 = minor, 1 = Top].
def category_index(name):
 if name not in xr_categories:xr_categories.append(name)
 return xr_categories.index(name)
for line,row in enumerate(xr,2):
 assert row['年份']==str(XRYEAR)
 r=record(row['Journal'] or row['刊名'],ids(row['ISSN'],row['EISSN']),bridge=True);r['xrLine']=line;r.setdefault('xr',[])
 groups=[(row['大类中文名'],row['大类新锐分区'],row['Top'],'major'),(row['大类2中文名'],row['大类2新锐分区'],row['大类2Top'],'major')]
 groups+=[(row[f'小类{n}中文名'] or row[f'小类{n}英文名'],row[f'小类{n}新锐分区'],'','minor') for n in range(1,7)]
 for category,value,top,scope in groups:
  m=re.match(r'([1-4])\s*区',value.strip())
  if m:r['xr'].append([category_index(category.strip()),int(m[1]),int(scope=='major'),int(top.strip()=='Top')])
  elif value.strip():warnings.append({'line':line,'field':'xr-'+scope,'value':value})
 if row['预警标记'].strip():r['xrWarning']=row['预警标记'].strip()
for line,row in enumerate(read(XRCONF),2):
 m=re.fullmatch(r'([1-4])',row['分区'].strip())
 if not m:warnings.append({'line':line,'field':'xr-conference','value':row['分区']});continue
 xr_conferences.append({'short':row['会议缩写'].strip(),'title':row['Journal'].strip(),'division':int(m[1]),'top':row['Top'].strip()=='Top','line':line})
assign_ids()
for r in records:
 r.setdefault('xr',[])
 r['aliases']=sorted(set(r['aliases']))
# Scope: the extension serves computing / engineering readers. Journals whose every discipline is medicine or
# humanities / social sciences keep only their name and ISSNs (so their papers are not mistaken for similarly
# named science journals). Kept anyway: any computing, engineering, mathematics, statistics, OR, telecom,
# automation, imaging, medical-informatics or information-science subject, and every CCF-listed journal.
# Run with --all to keep every journal in full.
SOFT={'社会学','文学','管理学','教育学','哲学','历史学','经济学','心理学','艺术学'};MED={'医学'}
STEM=re.compile(r'COMPUTER|计算机|ENGINEERING|工程|MATHEMAT|数学|STATISTIC|统计|OPERATIONS RESEARCH|运筹|TELECOMMUNICATION|电信|AUTOMATION|自动化|ROBOTICS|机器人|IMAGING SCIENCE|成像科学|MEDICAL INFORMATICS|医学：信息|医学信息|INFORMATION SCIENCE|信息科学|图书情报|INSTRUMENTS|仪器',re.I)
def loose(s):return ' '.join(w for w in norm(s).split() if w not in {'the','of','on','in','and','for','a','an'})
ccf_names=set()
for c in json.loads((ROOT/'data/ccf.json').read_text(encoding='utf-8'))['records']:
 if c['type']!='journal':continue
 for n in [c['title'],*(c.get('aliases') or [])]:
  if ' ' in n.strip() or n==c['title']:ccf_names.update({loose(n),loose(n.split(':')[0])})
category_major=collections.defaultdict(collections.Counter)
for r in records:
 major=[c[0] for c in r['cas'] if c[2]=='major']
 for c in r['cas']:
  if c[2]=='minor' and major:category_major[re.sub(r'\s+[\u4e00-\u9fff].*$','',c[0]).upper()][major[0]]+=1
def scope(r):
 categories=[c[0] for c in r['cas']]+[xr_categories[c[0]] for c in r['xr']]+[c[0] for c in r['jcr']]
 if any(STEM.search(c) for c in categories):return 'stem'
 if any(loose(n) in ccf_names for n in [r['title'],re.sub(r'-[A-Z][^-]*$','',r['title']),*r['aliases']]):return 'ccf'
 majors={c[0] for c in r['cas'] if c[2]=='major'}|{xr_categories[c[0]] for c in r['xr'] if c[2]==1}
 if not majors:majors={category_major[c.upper()].most_common(1)[0][0] for c,_ in r['jcr'] if category_major.get(c.upper())}
 if not majors:return 'unknown'
 if majors<=MED:return 'medicine'
 if majors<=SOFT|MED:return 'humanities-social'
 return 'science'
KEEP_ALL='--all' in sys.argv
scopes={id(r):scope(r) for r in records}
full=[r for r in records if KEEP_ALL or scopes[id(r)] not in ('medicine','humanities-social')]
excluded=[r for r in records if not KEEP_ALL and scopes[id(r)] in ('medicine','humanities-social')]
scope_counts=collections.Counter(scopes.values())
summary={'journals':len(full),'excludedJournals':len(excluded),'scope':dict(scope_counts),'cas':sum(bool(r['cas']) for r in full),'jcr':sum(bool(r['jcr']) for r in full),'xr':sum(bool(r['xr']) for r in full),'xrWarnings':sum(bool(r.get('xrWarning')) for r in full),'xrConferences':len(xr_conferences),'impactFactors':sum(r['if'] is not None for r in full),'missingIFSourceRows':missing_if,'missingQuartileSourceRows':missing_jcr,'sourceRows':{'cas':len(cas),'jcr':len(jcr),'xr':len(xr)}}
output={'schemaVersion':1,'version':'2026-10-23.'+COMMIT[:8],'retrieved':'2026-10-23','upstreamCommit':COMMIT,'year':2025,'xrYear':XRYEAR,'sourceLabel':'ShowJCR 公开数据快照','sources':{'cas':BASE+CASFILE,'jcr':BASE+JCRFILE,'xr':BASE+XRFILE,'xrConferences':BASE+XRCONF},'sha256':{file:hashlib.sha256((ROOT/'data/upstream'/file).read_bytes()).hexdigest() for file in [CASFILE,JCRFILE,XRFILE,XRCONF]},'scope':'all' if KEEP_ALL else 'computing-engineering-science','counts':summary,'xrCategories':xr_categories,'xrConferences':xr_conferences,'records':full,
 # Name-only entries: [title, ISSN…]. Their metrics are left out on purpose; see the scope note above.
 'excluded':[[r['title'],*r['issns']] for r in excluded]}
(ROOT/'data/journals.json').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
(ROOT/'data/journal-build-audit.json').write_text(json.dumps({'counts':summary,'unparsedQuartiles':warnings,'xrIssnBridges':bridges,'sameTitleDifferentISSN':{key:[records[n]['issns'] for n in val] for key,val in by_title.items() if len(val)>1}},ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False));print('Unparsed divisions:',len(warnings))
assert not warnings
assert len(set(r['id'] for r in records))==len(records)
assert not any(r['id']!='journal-'+r['issns'][0] for r in excluded if r['issns']),'excluded ids must be derivable from ISSN'
