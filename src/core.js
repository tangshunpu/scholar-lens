(function (root) {
  'use strict';
  // "Ad Hoc" / "Ad-Hoc" / "Adhoc" and "Int'l" / "Nat'l" are the same words in venue names.
  const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
    .replace(/\bad hoc\b/g, 'adhoc').replace(/\bint l\b/g, 'international').replace(/\bnat l\b/g, 'national');
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const unique = values => [...new Set(values.filter(Boolean))];
  const latest = rows => { const year = Math.max(0, ...(rows || []).map(r => r.year)); return (rows || []).filter(r => r.year === year); };
  // NAACL's "Volume 1 (Long and Short Papers)" is the main conference.
  const excluded = value => /\b(workshops?|findings|companion|demonstrations?|demos?|(?<!long and )short papers?|technical briefs?|summar(?:y|ies)|posters?|extended abstracts?)\b/i.test(value);
  const venueText = value => normalize(String(value || '').replace(/([A-Za-z]{2,})((?:19|20)\d{2})\b/g, '$1 $2')).replace(/\b\d+(?:st|nd|rd|th)\b/g, ' ').replace(/\s+/g, ' ').trim();
  function isExcluded(value, record) {
    let text = venueText(value);
    // CCF explicitly lists a few standalone workshops (HotOS, IWQoS, etc.).
    for (const alias of [record.title, ...(record.aliases || [])]) {
      if (/\bworkshop\b/i.test(alias) && text.includes(venueText(alias))) text = text.replace(venueText(alias), ' ');
    }
    return excluded(text);
  }

  function mergeRecords(base, added) {
    const out = base.map(r => structuredClone(r));
    const byTitle = new Map(), byAlias = new Map(), byISSN = new Map(), byLoose = new Map();
    // "The Journal of Supercomputing" = "JOURNAL OF SUPERCOMPUTING"; "Systems, Man, and Cybernetics: Systems" = "Systems Man Cybernetics-Systems".
    const loose = title => normalize(title).split(' ').filter(w => !['the', 'of', 'on', 'in', 'and', 'for', 'a', 'an'].includes(w)).join(' ');
    const ids = r => unique([...(r.issns || []), ...(String(r.issn || '').match(/\d{4}-\d{3}[\dX]/gi) || [])].map(s => s.toUpperCase()));
    const add = (map, key, record) => { if (!key) return; if (!map.has(key)) map.set(key, new Set()); map.get(key).add(record); };
    const register = r => {
      add(byTitle, normalize(r.title), r); for (const a of r.aliases || []) add(byAlias, normalize(a), r); for (const id of ids(r)) add(byISSN, id, r);
      for (const name of [r.title, ...(r.aliases || [])]) if (normalize(name).includes(' ')) add(byLoose, loose(name), r);
      // CCF sometimes keeps a subtitle JCR drops: "Journal of Systems Architecture: Embedded Software Design".
      if (!ids(r).length && r.title.includes(':')) add(byLoose, loose(r.title.split(':')[0]), r);
    };
    out.forEach(register);
    for (const record of added) {
      const incomingIds = ids(record);
      let candidates = new Set(incomingIds.flatMap(id => [...(byISSN.get(id) || [])]));
      // A bundled journal titled "AI" must not merge into "Artificial Intelligence" through its acronym alias.
      const viaAlias = record.sourceKind !== 'bundled-public' || normalize(record.title).includes(' ');
      if (!candidates.size) candidates = byTitle.get(normalize(record.title)) || (viaAlias && byAlias.get(normalize(record.title))) || new Set();
      // Looser spelling only joins a catalogue entry that has no ISSN yet (the CCF list), never two ISSN-bearing journals.
      // JCR appends subtitles with a hyphen: "Future Generation Computer Systems-The International Journal of eScience".
      for (const name of [record.title, record.title.replace(/-[A-Z][^-]*$/, '')]) {
        if (candidates.size || !normalize(name).includes(' ')) continue;
        candidates = new Set([...(byLoose.get(loose(name)) || [])].filter(r => !ids(r).length));
      }
      const compatible = [...candidates].filter(r => (record.sourceKind !== 'bundled-public' || r.type === record.type) && (!incomingIds.length || !ids(r).length || ids(r).some(id => incomingIds.includes(id))));
      let target = compatible.length === 1 ? compatible[0] : null;
      if (!target) { target = structuredClone(record); out.push(target); register(target); continue; }
      if (target.type !== record.type) throw Error(`“${record.title}”的类型与现有目录冲突，请核对 journal/conference`);
      target.aliases = unique([...(target.aliases || []), ...(record.aliases || []), record.short, record.title]).filter(a => a !== target.title);
      for (const key of ['ccf', 'cas', 'jcr', 'impactFactors', 'xr']) {
        if (!record[key]?.length) continue;
        const values = new Map((target[key] || []).map(v => [JSON.stringify([v.year, v.category || '', v.scope || '']), v]));
        record[key].forEach(v => values.set(JSON.stringify([v.year, v.category || '', v.scope || '']), v));
        target[key] = [...values.values()];
      }
      if (record.issn) target.issn = record.issn;
      target.issns = unique([...ids(target), ...incomingIds]);
      if (record.sourceKind) target.sourceKind = record.sourceKind;
      if (record.sourceLinks) target.sourceLinks = unique([...(target.sourceLinks || []), ...record.sourceLinks]);
      register(target);
    }
    return out;
  }

  function buildIndex(records) {
    const aliases = [];
    records.forEach(record => unique([record.title, ...(record.aliases || [])]).forEach(alias => {
      const norm = normalize(alias);
      if (norm.length > 1) aliases.push({ norm, record });
    }));
    const frequency = new Map();
    aliases.forEach(a => unique(a.norm.split(' ')).forEach(t => frequency.set(t, (frequency.get(t) || 0) + 1)));
    const byToken = new Map();
    aliases.forEach(a => {
      const pivot = a.norm.split(' ').sort((x, y) => frequency.get(x) - frequency.get(y))[0];
      if (!byToken.has(pivot)) byToken.set(pivot, []);
      byToken.get(pivot).push(a);
    });
    aliases.byToken = byToken;
    // How many venues use each word; a one-word alias shared with other names is an ordinary word.
    const owners = new Map();
    aliases.forEach(a => unique(a.norm.split(' ')).forEach(t => { if (!owners.has(t)) owners.set(t, new Set()); owners.get(t).add(a.record.id); }));
    aliases.sharedWords = new Map([...owners].map(([token, ids]) => [token, ids.size]));
    return aliases;
  }
  // An acronym must be written like one where it appears: "MobiCom", "SIGCOMM", not "Design" or "SIGMOD-SIGACT".
  function acronymIn(raw, alias) {
    if (!/^[A-Za-z][A-Za-z\d&+-]{3,11}$/.test(alias || '') || (alias.match(/[A-Z]/g) || []).length < 2) return false;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}/-])${escaped}(?![\\p{L}/-])`, alias === alias.toUpperCase() ? 'u' : 'iu').test(raw);
  }

  // Older IEEE Xplore citations write names backwards: "Industrial Electronics, IEEE Transactions on 57 (12)",
  // "Communications Letters, IEEE 17 (4)", "Lightwave Technology, Journal of 32 (4)",
  // "Communications (ICC), 2012 IEEE International Conference on, 1-5" and
  // "Communications, 2009. ICC'09. IEEE International Conference on, 1-5". Returns normal order, or null.
  const publisher = String.raw`(?:IEEE|ACM)(?:\s*\/\s*(?:IEEE|ACM))?`;
  const invertedForms = [
    [new RegExp(String.raw`^(.+?),\s*(${publisher}(?:\s+(?:Transactions|Journal)(?:\s+(?:on|of|in)(?:\s+the)?)?)?)(?=$|[\s,])\s*,?\s*(.*)$`, 'i'), m => `${m[2]} ${m[1]} ${m[3]}`],
    [/^(.+?),\s*(Journal\s+(?:of|on)(?:\s+the)?)(?=$|[\s,])\s*,?\s*(.*)$/i, m => `${m[2]} ${m[1]} ${m[3]}`],
    [new RegExp(String.raw`^(.+?),\s*(?:19|20)\d{2}\.\s*(.+?)\.\s*((?:Proceedings\s+)?${publisher}\b[^,]*?)\s*(,.*)?$`, 'i'), m => `${m[3]} ${m[1]} (${m[2]})${m[4] || ''}`],
    [new RegExp(String.raw`^(.+?),\s*((?:19|20)\d{2})\s+((?:Proceedings\s+)?${publisher}\b[^,]*?)\s*(,.*)?$`, 'i'), m => `${m[2]} ${m[3]} ${m[1]}${m[4] || ''}`]
  ];
  function uninvert(raw) {
    const text = clean(raw);
    for (const [pattern, build] of invertedForms) {
      const m = text.match(pattern);
      if (m) return clean(build(m));
    }
    return null;
  }
  // Noise around a venue name: DOIs, links and publication-status notes.
  const venueNoise = [/\b(?:doi\s*:?\s*)?10\.\d{4,9}\/[^\s,;]+/gi, /\bhttps?:\/\/\S+/gi, /\(\s*(?:accepted|to appear|in press|early access|forthcoming)[^)]*\)/gi, /[,;]?\s*\b(?:to appear|accepted(?: for publication)?|in press|forthcoming)\b\.?/gi];
  const cleanVenue = raw => clean(venueNoise.reduce((text, pattern) => text.replace(pattern, ' '), String(raw)).replace(/(?:\s*[,;:])+\s*$/, ''));
  // IEEE DOIs carry the journal code: 10.1109/JIOT.2016.2560518 is the IEEE Internet of Things Journal.
  const ieeeDoiJournals = { TWC: 'IEEE Transactions on Wireless Communications', TCOMM: 'IEEE Transactions on Communications', TCOM: 'IEEE Transactions on Communications', JSAC: 'IEEE Journal on Selected Areas in Communications', LCOMM: 'IEEE Communications Letters', LWC: 'IEEE Wireless Communications Letters', COMST: 'IEEE Communications Surveys and Tutorials', MCOM: 'IEEE Communications Magazine', MWC: 'IEEE Wireless Communications', MNET: 'IEEE Network', TNET: 'IEEE/ACM Transactions on Networking', JIOT: 'IEEE Internet of Things Journal', TMC: 'IEEE Transactions on Mobile Computing', TVT: 'IEEE Transactions on Vehicular Technology', TSP: 'IEEE Transactions on Signal Processing', LSP: 'IEEE Signal Processing Letters', JSTSP: 'IEEE Journal of Selected Topics in Signal Processing', MSP: 'IEEE Signal Processing Magazine', TIT: 'IEEE Transactions on Information Theory', TIFS: 'IEEE Transactions on Information Forensics and Security', TDSC: 'IEEE Transactions on Dependable and Secure Computing', TPAMI: 'IEEE Transactions on Pattern Analysis and Machine Intelligence', TIP: 'IEEE Transactions on Image Processing', TNNLS: 'IEEE Transactions on Neural Networks and Learning Systems', TKDE: 'IEEE Transactions on Knowledge and Data Engineering', TPDS: 'IEEE Transactions on Parallel and Distributed Systems', TC: 'IEEE Transactions on Computers', TSE: 'IEEE Transactions on Software Engineering', TCC: 'IEEE Transactions on Cloud Computing', TSC: 'IEEE Transactions on Services Computing', TBDATA: 'IEEE Transactions on Big Data', TETC: 'IEEE Transactions on Emerging Topics in Computing', TII: 'IEEE Transactions on Industrial Informatics', TIE: 'IEEE Transactions on Industrial Electronics', TITS: 'IEEE Transactions on Intelligent Transportation Systems', TSG: 'IEEE Transactions on Smart Grid', TNSM: 'IEEE Transactions on Network and Service Management', TCCN: 'IEEE Transactions on Cognitive Communications and Networking', TGCN: 'IEEE Transactions on Green Communications and Networking', TMLCN: 'IEEE Transactions on Machine Learning in Communications and Networking', OJCOMS: 'IEEE Open Journal of the Communications Society', ACCESS: 'IEEE Access', JSEN: 'IEEE Sensors Journal', JSYST: 'IEEE Systems Journal', TCYB: 'IEEE Transactions on Cybernetics', TSMC: 'IEEE Transactions on Systems, Man, and Cybernetics: Systems', TFUZZ: 'IEEE Transactions on Fuzzy Systems', TEVC: 'IEEE Transactions on Evolutionary Computation', TMM: 'IEEE Transactions on Multimedia', TCSVT: 'IEEE Transactions on Circuits and Systems for Video Technology', TVCG: 'IEEE Transactions on Visualization and Computer Graphics', TAC: 'IEEE Transactions on Automatic Control', TAFFC: 'IEEE Transactions on Affective Computing', TCSI: 'IEEE Transactions on Circuits and Systems I: Regular Papers', TCSII: 'IEEE Transactions on Circuits and Systems II: Express Briefs', TAP: 'IEEE Transactions on Antennas and Propagation', LAWP: 'IEEE Antennas and Wireless Propagation Letters', TMTT: 'IEEE Transactions on Microwave Theory and Techniques', JLT: 'Journal of Lightwave Technology', TBC: 'IEEE Transactions on Broadcasting', TNSE: 'IEEE Transactions on Network Science and Engineering', TASLP: 'IEEE/ACM Transactions on Audio, Speech, and Language Processing', TMI: 'IEEE Transactions on Medical Imaging', JBHI: 'IEEE Journal of Biomedical and Health Informatics', TBME: 'IEEE Transactions on Biomedical Engineering', TGRS: 'IEEE Transactions on Geoscience and Remote Sensing', TAES: 'IEEE Transactions on Aerospace and Electronic Systems', TSIPN: 'IEEE Transactions on Signal and Information Processing over Networks', TQE: 'IEEE Transactions on Quantum Engineering', JSAIT: 'IEEE Journal on Selected Areas in Information Theory', MVT: 'IEEE Vehicular Technology Magazine', OJVT: 'IEEE Open Journal of Vehicular Technology', TCAD: 'IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems', TRO: 'IEEE Transactions on Robotics', LRA: 'IEEE Robotics and Automation Letters', TASE: 'IEEE Transactions on Automation Science and Engineering', TPEL: 'IEEE Transactions on Power Electronics', TPWRS: 'IEEE Transactions on Power Systems', TLT: 'IEEE Transactions on Learning Technologies', THMS: 'IEEE Transactions on Human-Machine Systems', TCSS: 'IEEE Transactions on Computational Social Systems', TETCI: 'IEEE Transactions on Emerging Topics in Computational Intelligence', TIV: 'IEEE Transactions on Intelligent Vehicles', JPROC: 'Proceedings of the IEEE', MIC: 'IEEE Internet Computing', MPRV: 'IEEE Pervasive Computing', MSEC: 'IEEE Security and Privacy', MS: 'IEEE Software' };
  // Fallbacks, tried in order only when the text as written does not resolve.
  const venueRewrites = [
    ['倒装写法', raw => uninvert(raw)],
    // "Findings of the Association for Computational Linguistics: EMNLP 2023" belongs to EMNLP, as Findings.
    ['Findings', raw => /^findings of the association for computational linguistics\b/i.test(raw) ? raw.replace(/^findings of the association for computational linguistics\s*:?\s*/i, 'Findings ') : null],
    ['DOI', (raw, original) => ieeeDoiJournals[(String(original).match(/\b10\.1109\/([A-Z][A-Z0-9]*)\.(?:19|20)\d{2}\./i) || [])[1]?.toUpperCase()] || null]
  ];
  function matchVenue(raw, index) {
    if (/\barxiv\b|\bpreprint\b|预印本/i.test(raw)) return matchVenueAsWritten(raw, index);
    const cleaned = cleanVenue(raw) || clean(raw);
    const match = matchVenueAsWritten(cleaned, index);
    if (match.record) return match;
    for (const [kind, rewrite] of venueRewrites) {
      const rewritten = rewrite(cleaned, raw);
      if (!rewritten || rewritten === cleaned) continue;
      const retry = matchVenueAsWritten(rewritten, index);
      if (retry.record) return { ...retry, inverted: rewritten, reason: `${retry.reason}（按${kind}识别为：${rewritten}）` };
    }
    // Say plainly when a clean conference name is simply not ranked by CCF or 新锐.
    if (match.reason === '未匹配目录' && conferenceWords.test(cleaned)) return { ...match, reason: '会议不在 CCF / 新锐目录中' };
    return match;
  }
  function matchVenueAsWritten(raw, index) {
    const text = venueText(raw);
    if (!text) return { record: null, reason: '未提供发表场所' };
    if (/\barxiv\b|\bpreprint\b|预印本/i.test(raw)) return { record: null, reason: '预印本不套用会议等级' };
    // Never guess a venue from a truncated prefix, title, or abstract.
    const candidates = [];
    const bracketed = new Set([...String(raw).matchAll(/\(([^()]{1,15})\)/g)].map(m => normalize(m[1])));
    const lookup = index.byToken ? [...new Set(text.split(' ').flatMap(t => index.byToken.get(t) || []))] : index;
    for (const item of lookup) {
      const { norm, record } = item;
      if (!(` ${text} `).includes(` ${norm} `)) continue;
      // Journal names embedded inside a different venue (e.g. "Conference on Machine
      // Learning") are not journal matches. Volume/page suffixes are allowed.
      // Scholar often writes "The journal of …"; the article is not part of the journal name.
      const head = text.startsWith('the ') && !norm.startsWith('the ') ? text.slice(4) : text;
      if (record.type === 'journal' && !(head === norm || head.startsWith(norm + ' '))) continue;
      if (record.type === 'journal') {
        let suffix = head.slice(norm.length).trim();
        const first = suffix.split(' ')[0];
        if (first && /[a-z]/.test(first) && bracketed.has(first)) suffix = suffix.slice(first.length).trim();
        if (suffix && !record.conferenceRelation && !/^(?:\d|vol\b|volume\b|pp\b|pages\b|early access\b|online first\b|in press\b)/.test(suffix)) continue;
        // "Big Data, 2012 IEEE International Conference on" is the conference, not the journal Big Data, volume 2012.
        if (conferenceWords.test(suffix)) continue;
      }
      const short = norm.split(' ').length === 1;
      const stripped = head.replace(/\b(?:19|20)\d{2}\b/g, '').replace(/\b\d+(?:st|nd|rd|th)?\b/g, '').trim();
      const context = stripped.replace(new RegExp(`\\b${norm}\\b`, 'g'), ' ').replace(/\b(?:proceedings|proc|of|the|acm|ieee|usenix|annual|international|conference|conf|symposium|symp|workshops?|findings|companion|short|long|papers?|volume|vol|pp|pages|[0-9]+)\b/g, '').trim();
      if (short && norm.length <= 3 && context) continue;
      if (record.short === 'SIGGRAPH' && /\bsiggraph\s*asia\b/.test(text)) continue;
      if (short && norm.length > 3 && !record.aliases?.some(a => normalize(a) === norm) && stripped !== norm) continue;
      if (short && stripped !== norm && (index.sharedWords?.get(norm) || 0) > 1 && ![record.short, ...(record.aliases || [])].some(a => a && normalize(a) === norm && acronymIn(raw, a))) continue;
      candidates.push({ ...item, score: norm.length });
    }
    const partial = /…|\.\.\./.test(raw);
    if (!candidates.length) return partial ? inferTruncated(raw, text, index) : variantMatch(raw, text, index);
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const tied = preferJournal(raw, unique(candidates.filter(c => c.score === best.score).map(c => c.record)));
    if (tied.length === 1 && tied[0] !== best.record) return resolveMatch(tied[0], text, raw, { alias: best.norm, partial, reason: '名称匹配（按卷期页码识别为期刊）' });
    if (tied.length > 1) return { record: null, ambiguous: true, reason: `名称存在歧义，可能是 ${tied.slice(0, 3).map(describeVenue).join(' / ')}，请选择场所确认` };
    if (partial) {
      // A full conference name counts only if the cut ends with it; "…Machine Learning and …" may be a longer venue.
      const beforeEllipsis = venueText(String(raw).split(/…|\.\.\./)[0]).replace(/(?: \d+)+$/, '');
      const completeConference = best.record.type === 'conference' && best.norm.split(' ').length >= 5 && best.norm.length >= 30 && (` ${beforeEllipsis}`).endsWith(` ${best.norm}`);
      if (!completeConference) {
        // The aligned name prefix is stronger evidence than an acronym found somewhere in the cut text.
        const inferred = inferTruncated(raw, text, index);
        if (inferred.record || ![best.record.short, ...(best.record.aliases || [])].some(a => acronymIn(raw, a))) return inferred;
      }
    }
    return resolveMatch(best.record, text, raw, { alias: best.norm, partial, reason: partial ? '明确场所名或缩写已匹配，其余字段被截断' : '名称匹配' });
  }
  function resolveMatch(found, text, raw, details) {
    let record = found;
    if (record.conferenceRelation) {
      const relation = record.conferenceRelation;
      const tracks = unique(text.split(' ').map(t => relation.tracks?.[t.toUpperCase()]).filter(Boolean));
      const target = tracks.length === 1 ? tracks[0] : !Object.keys(relation.tracks || {}).length ? relation.target : null;
      if (target) record = { ...record, ccf: target.ccf, displayName: target.displayName || target.short, ccfContext: relation.scope, conferenceSource: relation.source, conferenceTitle: target.title,
        ...(!record.xr?.length && target.xr?.length ? { xr: target.xr, xrContext: true } : {}) };
    }
    return { record, ...details, excluded: (record.type === 'conference' || !!record.ccfContext) && isExcluded(raw, record) };
  }

  // Scholar cuts long venue names at about 70 characters and appends "…". A cut name is
  // accepted only when its words begin exactly one catalogued venue name.
  const decorations = new Set(['annual', 'ann', 'international', 'intl', 'int', 'acm', 'ieee', 'usenix', 'cvf', 'ifip', 'siam', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'twenty', 'thirty', 'forty', 'fifty']);
  const generic = new Set(['and', 'of', 'on', 'in', 'for', 'the', 'a', 'an', 'to', 'with', 'at', 'conference', 'conf', 'symposium', 'symp', 'workshop', 'workshops', 'journal', 'transactions', 'trans', 'letters', 'magazine', 'review', 'proceedings', 'proc', 'congress', 'meeting', 'forum', 'colloquium']);
  const isDecoration = token => decorations.has(token) || /^sig[a-z]{2,}$/.test(token);
  function nameTokens(value) {
    const tokens = venueText(value).split(' ').filter(t => t && !/^\d+$/.test(t));
    while (/^(?:in|proceedings|proc|of|the)$/.test(tokens[0])) tokens.shift(); // "In Proceedings of the …" frames the name
    // "IEEE Computer Society Conference on …" (CVPR before 2006) names the sponsor, not the venue.
    for (let i = tokens.indexOf('ieee'); i >= 0 && tokens[i + 1] === 'computer' && tokens[i + 2] === 'society'; i = -1) tokens.splice(i + 1, 2);
    return tokens;
  }
  // Conference decorations (ACM, Annual, SIGSAC…) may be skipped on either side; every other word must
  // line up. Journals align word for word: "International Journal of X" is not "Journal of X".
  // Returns the number of distinctive words matched, or 0 when the cut text is not a prefix of name.
  function prefixScore(cut, name, partialLast, skipDecorations) {
    let i = 0, j = 0, distinctive = 0;
    while (i < cut.length) {
      const token = cut[i], last = i === cut.length - 1;
      if (j < name.length && (token === name[j] || (last && partialLast && token.length >= 3 && name[j].startsWith(token)))) {
        if (!isDecoration(token) && !generic.has(token)) distinctive++;
        i++; j++;
      } else if (j >= name.length) return 0; // the cut text runs past this venue's full name
      else if (skipDecorations && isDecoration(token)) i++;
      else if (skipDecorations && isDecoration(name[j])) j++;
      else return 0;
    }
    return distinctive;
  }
  // Complete names written differently from the catalog: "IEEE Communication Magazine" (singular),
  // "IEEE Commun. Mag." / "IEEE Trans Wirel Commun" (ISO 4 abbreviations), missing "on" / "of".
  // Every word of the catalogued name must be accounted for, so a longer venue never matches a shorter name.
  const connectives = new Set(['and', 'of', 'on', 'in', 'the', 'for', 'a', 'an', 'to', 'with', 'at']);
  const isoWords = new Set(['trans', 'commun', 'wirel', 'mag', 'lett', 'netw', 'comput', 'technol', 'syst', 'sel', 'veh', 'intell', 'mach', 'anal', 'inf', 'inform', 'sci', 'eng', 'electron', 'softw', 'distrib', 'multimed', 'cybern', 'autom', 'robot', 'proc', 'process', 'int', 'j', 'conf', 'symp', 'appl', 'res', 'rev', 'soc', 'manag', 'serv', 'secur', 'knowl', 'biomed', 'med', 'ind', 'telecommun', 'lang', 'cogn', 'mob', 'sens', 'geosci', 'aerosp', 'photon', 'circ', 'graph', 'vis', 'propag', 'microw', 'tech', 'opt', 'top', 'surv', 'tutor', 'affect', 'learn', 'evol', 'meas', 'adv', 'assoc', 'natl', 'intl', 'interact', 'pract', 'program', 'des', 'archit', 'math', 'theor', 'transp', 'environ', 'integr', 'reliab', 'stat', 'phys', 'chem', 'biol', 'mater', 'struct', 'mech', 'educ', 'manuf', 'oper', 'decis', 'simul', 'optim', 'numer', 'geom', 'artif', 'bioinform', 'collab', 'coop', 'ubiquitous', 'pervasive']);
  // ISO 4 gives very short abbreviations one meaning: "J." is Journal (not JAMA), "Med." Medical (not Media).
  const shortAbbreviations = { j: ['journal'], int: ['international'], eur: ['european', 'europe'], am: ['american'], med: ['medical', 'medicine'], soc: ['society', 'social'], inf: ['information'], sci: ['science', 'sciences', 'scientific'], res: ['research'], rev: ['review', 'reviews'], eng: ['engineering'], ind: ['industrial', 'industry'], opt: ['optical', 'optics'], top: ['topics'], vis: ['visualization', 'vision', 'visual'], des: ['design'], adv: ['advances', 'advanced'], mag: ['magazine'], mob: ['mobile'], sel: ['selected'], veh: ['vehicular'], ann: ['annals'], rep: ['reports'], nat: ['natural', 'nature'] };
  const abbreviationOf = (word, name) => name.length > word.length && (shortAbbreviations[word] ? shortAbbreviations[word].includes(name) : word.length >= 3 && name.startsWith(word));
  const plural = (word, name) => name === word + 's' || name === word + 'es' || (word.endsWith('y') && name === word.slice(0, -1) + 'ies');
  // Returns how many words needed a variant (plural or abbreviation), or -1 when the names do not align.
  function variantScore(cut, name, abbreviated, skipDecorations) {
    let i = 0, j = 0, inexact = 0, content = 0;
    while (i < cut.length || j < name.length) {
      const a = cut[i], b = name[j];
      if (a !== undefined && b !== undefined) {
        const exact = a === b, variant = !exact && (plural(a, b) || (abbreviated && abbreviationOf(a, b)));
        if (exact || variant) { if (variant) inexact++; if (!connectives.has(b)) content++; i++; j++; continue; }
      }
      // "International Conference on X" is not "Conference on X"; only publishers and "Annual" may be missing.
      if (b !== undefined && (connectives.has(b) || (skipDecorations && isDecoration(b) && !['international', 'intl', 'int'].includes(b)))) j++;
      // A small word left over after the whole name ("Econometrics, Journal of") means a different or backwards name.
      else if (a !== undefined && b !== undefined && (connectives.has(a) || (skipDecorations && isDecoration(a)))) i++;
      else if (a !== undefined && b === undefined && skipDecorations && isDecoration(a)) i++;
      else return -1;
    }
    return content >= 2 ? inexact : -1;
  }
  // Journals compare every word ("Proc. IEEE" = "Proceedings of the IEEE"); conferences drop the
  // "Proceedings of the 2024" framing. Names are bucketed by the initial of their first real word.
  const allTokens = value => venueText(value).split(' ').filter(t => t && !/^\d+$/.test(t));
  const initials = (full, framed) => unique([full.find(t => !connectives.has(t))?.[0], framed.find(t => !isDecoration(t) && !connectives.has(t))?.[0]]);
  function variantNames(index) {
    if (index.byInitial) return index.byInitial;
    const byInitial = new Map();
    for (const { norm, record } of index) {
      const name = { full: allTokens(norm), framed: nameTokens(norm), record };
      for (const key of initials(name.full, name.framed)) { if (!byInitial.has(key)) byInitial.set(key, []); byInitial.get(key).push(name); }
    }
    return index.byInitial = byInitial;
  }
  // A citation with volume / issue / pages is a journal article, not a same-named conference.
  const journalCitation = raw => /\b\d+\s*\(\s*\d+[^)]*\)|\b\d+\s*,\s*[A-Za-z]?\d+\s*[-–]\s*\d+|\bvol(?:ume)?\.?\s*\d+|[A-Za-z.]\s+\d{1,3}\s*$/i.test(raw);
  function preferJournal(raw, records) {
    if (!journalCitation(raw)) return records;
    const journals = records.filter(r => r.type === 'journal');
    return journals.length ? journals : records;
  }
  const conferenceWords = /\b(?:conference|symposium|workshops?|congress)\b/i;
  function variantCandidates(raw, index) {
    // Journals: the name ends where volume / issue / pages begin. Conferences: drop the numbers.
    const journalCut = allTokens(String(raw).split(/[\s,]+\(?\d/)[0]), whole = nameTokens(raw);
    const abbreviated = /[A-Za-z]\./.test(raw) || allTokens(raw).some(t => isoWords.has(t));
    const buckets = variantNames(index), best = new Map();
    for (const key of initials(journalCut, whole)) for (const { full, framed, record } of buckets.get(key) || []) {
      const conference = record.type === 'conference';
      if (!conference && conferenceWords.test(raw) && !conferenceWords.test(full.join(' '))) continue;
      const score = variantScore(conference ? whole : journalCut, conference ? framed : full, abbreviated, conference);
      if (score >= 0 && !(best.get(record.id)?.score <= score)) best.set(record.id, { record, score });
    }
    const kept = new Set(preferJournal(raw, [...best.values()].map(b => b.record)));
    return [...best.values()].filter(b => kept.has(b.record)).sort((a, b) => a.score - b.score);
  }
  function variantMatch(raw, text, index) {
    const ranked = variantCandidates(raw, index);
    if (!ranked.length) return { record: null, reason: '未匹配目录' };
    const tied = ranked.filter(r => r.score === ranked[0].score).map(r => r.record);
    if (tied.length > 1) return { record: null, ambiguous: true, reason: `名称写法与目录不完全一致，可能是 ${tied.slice(0, 3).map(describeVenue).join(' / ')}，请选择场所确认` };
    return resolveMatch(tied[0], text, raw, { alias: null, partial: false, variant: true, reason: `名称写法与目录略有不同（单复数、缩写或省略介词），识别为 ${tied[0].title}` });
  }
  function namesByLead(index) {
    if (index.byLead) return index.byLead;
    const byLead = new Map();
    for (const { norm, record } of index) {
      const tokens = nameTokens(norm), lead = tokens.find(t => !isDecoration(t));
      if (!lead) continue;
      if (!byLead.has(lead)) byLead.set(lead, []);
      byLead.get(lead).push({ tokens, record });
    }
    return index.byLead = byLead;
  }
  function truncatedCandidates(raw, index) {
    const before = String(raw).split(/…|\.\.\./)[0];
    const cut = nameTokens(before), lead = cut.find(t => !isDecoration(t));
    if (!lead) return [];
    const found = new Map();
    for (const { tokens, record } of namesByLead(index).get(lead) || []) {
      if (prefixScore(cut, tokens, !/\s$/.test(before), record.type === 'conference') >= 2) found.set(record.id, record);
    }
    return [...found.values()];
  }
  const describeVenue = r => {
    const name = r.short && r.short !== r.title ? r.short : r.title;
    return r.issns?.length ? `${name}（${r.issns[0]}）` : name;
  };
  function inferTruncated(raw, text, index) {
    const found = truncatedCandidates(raw, index);
    if (found.length > 1) return { record: null, ambiguous: true, reason: `场所名被截断，可能是 ${found.slice(0, 3).map(describeVenue).join(' / ')}${found.length > 3 ? ' 等' : ''}，未推测等级` };
    if (!found.length) return { record: null, reason: '场所名被截断，未推测等级' };
    return resolveMatch(found[0], text, raw, { alias: null, partial: true, inferred: true, reason: `场所名被截断，按唯一匹配的名称开头推测为 ${found[0].title}` });
  }

  // User confirmations are keyed by the venue name without volume, issue, page or year numbers,
  // so one choice covers every paper published there.
  const venueKey = raw => venueText(raw).replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim() + (/…|\.\.\./.test(raw) ? ' …' : '');
  function chosenMatch(raw, record) {
    if (!record) return { record: null, manual: true, reason: '已确认不在目录中，不赋级' };
    return resolveMatch(record, venueText(raw), raw, { alias: null, partial: false, manual: true, reason: `场所由用户确认为 ${record.title}` });
  }
  // Records worth offering when a venue needs confirmation: names found in the text, then name prefixes.
  function venueOptions(raw, index, limit = 8) {
    const text = venueText(raw), found = new Map(), bare = text.replace(/\b\d+(?:st|nd|rd|th)?\b/g, ' ').replace(/\s+/g, ' ').trim();
    const lookup = index.byToken ? [...new Set(text.split(' ').flatMap(t => index.byToken.get(t) || []))] : index;
    lookup.filter(({ norm, record }) => (` ${text} `).includes(` ${norm} `) && (norm.includes(' ') || bare === norm || [record.short, ...(record.aliases || [])].some(a => a && normalize(a) === norm && acronymIn(raw, a))))
      .sort((a, b) => b.norm.length - a.norm.length).forEach(({ record }) => found.set(record.id, record));
    if (/…|\.\.\./.test(raw)) truncatedCandidates(raw, index).forEach(record => found.set(record.id, record));
    return [...found.values()].slice(0, limit);
  }
  function groupVenue(raw, match, fallback) {
    const r = match.record;
    if (!r) return fallback;
    const label = r.displayName || (r.type === 'conference' ? r.short : fallback);
    if (!match.excluded) return label;
    if (/\bfindings\b/i.test(raw)) return label + ' Findings';
    if (/\bworkshops?\b/i.test(raw)) return label + ' Workshop';
    if (/\bshort papers?\b/i.test(raw)) return label + ' Short Papers';
    if (/\bdemos?|demonstrations?\b/i.test(raw)) return label + ' Demo';
    return label + ' Companion';
  }

  function metricLabels(match, missing = false) {
    const r = match.record;
    if (!r) return missing ? [{ text: match.reason, kind: 'muted', detail: match.reason }] : [];
    // Name-only entry (medicine / humanities / social sciences) unless the user imported metrics for it.
    if (r.outOfScope && !['ccf', 'cas', 'jcr', 'impactFactors', 'xr'].some(key => r[key]?.length)) return missing ? [{ text: '人文社科 / 医学期刊 · 未内置指标', kind: 'muted', detail: `${r.title}\n为减小扩展体积，内置快照只保留医学与人文社科期刊的名称，不含其中科院 / 新锐 / JCR / IF。需要时可在设置页“补充导入”中添加。` }] : [];
    const labels = [];
    const links = r.sourceLinks?.length ? '\n数据行来源：\n' + r.sourceLinks.join('\n') : '';
    const describe = values => values.map(v => `${v.year} · ${v.category || ''}${v.scope ? ' · ' + v.scope : ''} · ${v.source}`).join('\n');
    const ccf = latest(r.ccf);
    if (ccf.length && !match.excluded) labels.push({ text: `${r.ccfContext === 'conference-linked' ? '关联 ' : ''}CCF ${unique(ccf.map(v => v.rank)).join('/')} · ${ccf[0].year}`, kind: 'ccf-' + (ccf.some(v => v.rank === 'A') ? 'a' : ccf[0].rank.toLowerCase()), detail: `${r.title}\n${describe(ccf)}\n${r.ccfContext ? '会议关联：' + r.conferenceTitle + '\n' + r.conferenceSource + '\n仅适用于相应会议研究论文，须核对论文类型。' : '按场所匹配；论文类型需自行核实。'}` });
    if (match.excluded) labels.push({ text: '非主会长文 · 不计 CCF', kind: 'muted', detail: 'Workshop、Findings、短文等不套用主会推荐等级。' });
    const cas = latest(r.cas);
    const major = cas.filter(v => v.scope !== 'minor');
    const cshow = major.length ? major : cas;
    if (cshow.length) labels.push({ text: `中科院${major.length ? '大类' : '小类'} ${unique(cshow.map(v => v.division)).join('/')}区 · ${cshow[0].year}`, kind: 'cas', emphasis: cshow.some(v => v.division === 1) ? 'cas-one' : null, detail: cas.map(v => `${v.scope === 'minor' ? '小类' : '大类'} ${v.category || '未指定学科'} ${v.division}区${v.top ? ' Top' : ''} · ${v.year} · ${v.source}`).join('\n') });
    // 新锐期刊分区表: major categories first, like CAS; conference ratings never apply to workshops.
    const xr = match.excluded ? [] : latest(r.xr);
    const xmajor = xr.filter(v => v.scope !== 'minor'), xshow = xmajor.length ? xmajor : xr;
    if (xshow.length) labels.push({ text: `${r.xrContext ? '关联 ' : ''}新锐${xmajor.length ? '' : '小类'} ${unique(xshow.map(v => v.division)).join('/')}区${xshow.some(v => v.top) ? ' Top' : ''} · ${xshow[0].year}`, kind: 'xr', emphasis: xshow.some(v => v.division === 1) ? 'xr-one' : null, detail: xr.map(v => `${v.scope === 'minor' ? '小类' : '大类'} ${v.category || '未指定学科'} ${v.division}区${v.top ? ' Top' : ''} · ${v.year} · ${v.source}`).join('\n') + (r.xrContext ? `\n会议关联：${r.conferenceTitle}` : '') });
    if (r.xrWarning) labels.push({ text: `新锐预警 · ${r.xrWarning}`, kind: 'xr-warning', detail: `新锐期刊分区表对该刊标记“${r.xrWarning}”（预警）。新锐表不再单独发布预警名单，以此标记代替。` });
    const jcr = latest(r.jcr);
    if (jcr.length) labels.push({ text: `JCR ${unique(jcr.map(v => v.quartile)).join('/')} · ${jcr[0].year}`, kind: 'jcr', detail: jcr.map(v => `${v.category || '未指定学科'} ${v.quartile} · ${v.year} · ${v.source}`).join('\n') });
    const factors = latest(r.impactFactors);
    if (factors.length) labels.push({ text: `IF ${factors[0].value} · ${factors[0].year}`, kind: 'if', detail: `Journal Impact Factor（指标年度）\n${describe(factors)}` });
    if (missing && r.type === 'journal') {
      const absent = [!cas.length && '中科院', !xr.length && '新锐', !jcr.length && 'JCR', !factors.length && 'IF'].filter(Boolean);
      if (absent.length) labels.push({ text: `${absent.join(' / ')} 暂无数据`, kind: 'muted', detail: '当前公开数据源未提供这些指标；不会推测或用其他引文指标代替。' });
    }
    labels.forEach(label => { if (['cas','xr','jcr','if'].includes(label.kind)) label.detail += links; });
    if (match.inferred) labels.forEach(label => { label.detail += `\n\n${match.reason}。截断后无法区分附属 Workshop / Companion，请核对论文类型。`; });
    if (match.manual) labels.forEach(label => { label.detail += `\n\n${match.reason}（仅存本机，可在论文旁“场所 ✓”中修改）。`; });
    return labels;
  }
  // One tier per scheme, using the same rules as the badges: best CCF rank outside workshops,
  // best CAS / XR division (major categories first), IEEE Transactions by name.
  const ieeeTransactions = /\bIEEE(?:\s*\/\s*[A-Z]+)?\s+Trans(?:actions)?\b/i;
  function paperTiers(match, raw = '') {
    const r = match?.record;
    const ccf = r && !match.excluded ? unique(latest(r.ccf).map(v => v.rank)).sort()[0] || null : null;
    const cas = r ? latest(r.cas) : [];
    const major = cas.filter(v => v.scope !== 'minor');
    const divisions = (major.length ? major : cas).map(v => v.division);
    const preprint = /\barxiv\b|\bpreprint\b/i.test(raw);
    const ieee = !preprint && (ieeeTransactions.test(r?.type === 'journal' ? r.title : '') || ieeeTransactions.test(raw));
    const xr = r && !match.excluded ? latest(r.xr) : [];
    const xrMajor = xr.filter(v => v.scope !== 'minor'), xrDivisions = (xrMajor.length ? xrMajor : xr).map(v => v.division);
    return { ccf, cas: divisions.length ? Math.min(...divisions) : null, xr: xrDivisions.length ? Math.min(...xrDivisions) : null, ieee };
  }

  const cleanAuthor = value => clean(String(value || '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').replace(/[†‡§*＊#✉]/g, ''));
  function authorKey(value) {
    const parts = normalize(cleanAuthor(value)).split(' ');
    // Scholar uses both "GY Li" and "G. Y. Li". Keep full given names intact.
    if (parts.length > 2 && parts.slice(0, -1).every(p => /^[a-z]$/.test(p))) return parts.slice(0, -1).join('') + ' ' + parts.at(-1);
    if (parts.length > 2 && parts.slice(1).every(p => /^[a-z]$/.test(p))) return parts[0] + ' ' + parts.slice(1).join('');
    return parts.join(' ');
  }
  // Scholar names often add a native-script name: "Yinghui He (何映晖)", "何映晖 Yinghui He", "Yinghui He | 何映晖".
  // Only the Latin-script name is read, since that is how author lists spell it; a name with no Latin text is kept as is.
  const latinRun = /[\p{Script=Latin}\p{M}.'’\-]+(?:\s+[\p{Script=Latin}\p{M}.'’\-]+)*/gu;
  const honorific = /^(?:prof(?:essor)?|dr|mr|mrs|ms)\.?$/i, degree = /^(?:ph\.?d|m\.?d|d\.?phil)\.?$/i;
  function englishName(displayName) {
    const name = cleanAuthor(displayName).normalize('NFKC');
    const outside = name.replace(/[（(][^()（）]*[）)]/g, ' / ');
    const inside = [...name.matchAll(/[（(]([^()（）]+)[）)]/g)].map(m => m[1]).join(' / ');
    const runs = [outside, inside].flatMap(text => [...text.matchAll(latinRun)].map(m => {
      const words = m[0].split(/\s+/).map(w => w.replace(/^[.'’\-]+|['’\-]+$/g, '')).filter(w => /\p{L}/u.test(w));
      while (words.length > 1 && honorific.test(words[0])) words.shift();
      while (words.length > 1 && degree.test(words.at(-1))) words.pop();
      return words.join(' ');
    })).filter(Boolean);
    return runs.find(run => run.includes(' ')) || runs[0] || clean(name);
  }
  function profileAuthorAliases(displayName) {
    const full = englishName(displayName);
    const names = [full];
    if (/^[\p{Script=Latin}\p{M}.'’\-]+(?:\s+[\p{Script=Latin}\p{M}.'’\-]+)+$/u.test(full)) {
      const parts = full.split(/\s+/), surname = parts.pop();
      // Generate initial + full surname only, never surname-only or a different full name.
      const initials = parts.flatMap(p => p.split(/[-.]/)).filter(Boolean).map(p => /^[A-Z]{1,4}$/.test(p) ? p : p[0].toUpperCase()).join('');
      if (initials && surname.length > 1) names.push(`${initials} ${surname}`);
    }
    return unique(names);
  }
  function resolveProfileAuthor(displayName, authorLists, customAliases = [], choices = {}) {
    const automatic = profileAuthorAliases(displayName);
    const known = unique([...automatic, ...customAliases.map(cleanAuthor)]);
    const latinFull = name => /^[\p{Script=Latin}\p{M}.'’\-]+(?:\s+[\p{Script=Latin}\p{M}.'’\-]+)+$/u.test(name)
      && name.split(/\s+/).at(-1).length > 1
      && name.split(/\s+/).slice(0, -1).some(p => p.replace(/[.'’\-]/g, '').length > 1 && !/^[A-Z]{1,4}$/.test(p.replace(/[.\-]/g, '')));
    const fullKeys = new Set(known.filter(latinFull).map(authorKey));
    const lists = authorLists.map(text => text.split(/[,;，；]/).map(cleanAuthor).filter(Boolean));
    const seen = unique(lists.flat());
    const others = seen.filter(name => latinFull(name) && !fullKeys.has(authorKey(name)));
    const groups = new Map();
    function add(name, kind, defaultEnabled = true) {
      const key = authorKey(name);
      if (!key || /[()（）]/.test(name)) return;
      if (!groups.has(key)) groups.set(key, { key, label: name, kind, spellings: [], defaultEnabled });
      groups.get(key).spellings.push(name);
    }
    for (const name of known) {
      const kind = /^[A-Z]{1,6}\s+/.test(name) ? 'initials' : 'name';
      add(name, kind);
      if (kind === 'initials') {
        const [initials, ...rest] = name.split(/\s+/), surname = rest.join(' ');
        add(`${[...initials].map(c => c + '.').join(' ')} ${surname}`, kind);
        if (initials.length > 1) add(`${[...initials].join(' ')} ${surname}`, kind);
        // Surname-first forms are suggestions, not an automatic inversion of the name.
        add(`${surname} ${initials}`, 'reversed', false);
        add(`${surname} ${[...initials].map(c => c + '.').join(' ')}`, 'reversed', false);
      }
    }
    for (const alias of customAliases) {
      const candidate = groups.get(authorKey(alias));
      if (candidate) candidate.defaultEnabled = true;
    }
    const candidates = [...groups.values()].map(candidate => {
      const matches = name => authorKey(name) === candidate.key;
      const observed = seen.filter(matches);
      const count = lists.filter(list => list.some(matches)).length;
      const repeated = lists.filter(list => list.filter(matches).length > 1).length;
      const conflicts = candidate.kind === 'name' ? [] : others.filter(full => profileAuthorAliases(full).some(alias => {
        if (authorKey(alias) === candidate.key) return true;
        const parts = alias.split(/\s+/);
        return /^[A-Z]{1,6}$/.test(parts[0]) && authorKey(`${parts.slice(1).join(' ')} ${parts[0]}`) === candidate.key;
      }));
      return { ...candidate, spellings: unique(candidate.spellings), observed, count, repeated, conflicts,
        enabled: !conflicts.length && (Object.hasOwn(choices, candidate.key) ? choices[candidate.key] === true : candidate.defaultEnabled) };
    });
    // An explicit alias still cannot silently override a known initials collision.
    const active = candidates.filter(c => c.enabled).flatMap(c => c.spellings);
    return { candidates, aliases: unique(active), blockedAliases: candidates.filter(c => c.conflicts.length).flatMap(c => c.spellings) };
  }
  function authorRoles(authorText, aliases, manual, options = {}) {
    const truncated = /…|\.\.\.|et al\b/i.test(authorText);
    const names = authorText.split(/[,;，；]/).map(clean).filter(Boolean);
    const normAliases = new Set(aliases.map(authorKey).filter(Boolean));
    const indices = names.map((name, i) => normAliases.has(authorKey(name)) ? i : -1).filter(i => i >= 0);
    const matchedNames = indices.map(i => cleanAuthor(names[i]));
    if (manual?.length) return { roles: manual, indices, matchedNames, manual: true, truncated };
    // Repeated initials in one list do not identify which person owns the profile.
    const blocked = new Set((options.blockedAliases || []).map(authorKey));
    const ambiguous = new Set(matchedNames.map(authorKey)).size < indices.length || (options.singleTarget && indices.length > 1) || (!indices.length && names.some(n => blocked.has(authorKey(n))));
    if (ambiguous) return { roles: [], indices: [], matchedNames: [], ambiguous: true, truncated };
    const roles = [];
    if (indices.includes(0)) roles.push('first');
    if (indices.includes(1)) roles.push('second');
    if (!truncated && indices.includes(names.length - 1)) roles.push('last');
    if (indices.length && !roles.length) roles.push('middle');
    // "*" (or ✉) after the target's name marks the corresponding author; †, ‡, § and # stay for manual review.
    if (indices.some(i => /[*＊✉]/.test(names[i]))) roles.push('corresponding');
    return { roles, indices, matchedNames, truncated, symbol: indices.some(i => /[†‡§#]/.test(names[i])) };
  }

  function stats(papers) {
    const citations = papers.map(p => p.citations || 0).sort((a, b) => b - a);
    return { count: papers.length, citations: citations.reduce((a, b) => a + b, 0), h: citations.filter((c, i) => c >= i + 1).length, i10: citations.filter(c => c >= 10).length };
  }

  function parseCSV(input) {
    const text = input.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0];
    const delimiter = first.includes('\t') ? '\t' : ',';
    const rows = []; let row = [], field = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c; continue; }
      if (c === '"') { if (field || closed) throw Error('CSV 引号位置无效'); quoted = true; }
      else if (c === delimiter) { row.push(field); field = ''; closed = false; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ''; closed = false; }
      else { if (closed && c.trim()) throw Error('CSV 引号后包含意外字符'); if (!closed) field += c; }
    }
    if (quoted) throw Error('CSV 引号未闭合');
    row.push(field); if (row.some(v => v.trim())) rows.push(row);
    if (rows.length < 2) throw Error('CSV 至少需要表头和一行数据');
    const header = rows.shift().map(v => v.trim());
    if (new Set(header).size !== header.length) throw Error('CSV 表头重复');
    return rows.map((values, i) => { if (values.length !== header.length) throw Error(`第 ${i + 2} 行列数与表头不一致`); return Object.fromEntries(header.map((h, j) => [h, values[j]])); });
  }

  function parseImport(text, filename = '') {
    if (new TextEncoder().encode(text).length > 8 * 1024 * 1024) throw Error('文件超过 8 MB，请拆分导入');
    let rows;
    if (/\.json$/i.test(filename) || /^[\s\uFEFF]*[\[{]/.test(text)) { const json = JSON.parse(text.replace(/^\uFEFF/, '')); rows = Array.isArray(json) ? json : json.records; }
    else rows = parseCSV(text);
    if (!Array.isArray(rows) || !rows.length || rows.length > 40000) throw Error('数据必须为 1–40000 条记录的数组');
    const records = rows.map((input, i) => validateRecord(input, i + 1));
    return mergeRecords([], records);
  }

  function validateRecord(input, row) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error(`记录 ${row} 不是对象`);
    const get = (...keys) => { for (const k of keys) if (input[k] !== undefined && input[k] !== '') return input[k]; return ''; };
    const fail = message => { throw Error(`记录 ${row}：${message}`); };
    const title = clean(get('title', 'journal', 'name', '期刊名称', '刊名'));
    if (!title || title.length > 500) fail('title（期刊全名）必填，最多 500 字符');
    const year = value => { const n = Number(value); if (!Number.isInteger(n) || n < 1900 || n > 2100) fail('指标需填写有效年度（1900–2100）'); return n; };
    const source = value => { const s = clean(value); if (!s || s.length > 2000) fail('每项指标必须提供 source 来源（名称或链接）'); return s; };
    const list = value => Array.isArray(value) ? value : String(value || '').split('|');
    const aliases = list(get('aliases', '别名')).map(clean).filter(Boolean);
    if (aliases.length > 50 || aliases.some(a => a.length > 500)) fail('别名最多 50 个，每个最多 500 字符');
    const type = get('type', '类型') || 'journal';
    if (!['journal', 'conference'].includes(type)) fail('type 仅支持 journal 或 conference');
    const r = { id: 'user-' + normalize(title) + (get('issn','ISSN') ? '-' + normalize(get('issn','ISSN')) : ''), title, aliases, type, short: clean(get('short')) || title, issn: clean(get('issn', 'ISSN')), issns: Array.isArray(input.issns) ? input.issns.filter(s => /^\d{4}-\d{3}[\dX]$/i.test(s)) : [], ccf: [], cas: [], jcr: [], impactFactors: [] };
    const baseSource = get('source', '来源');
    function metric(key, values) {
      if (!Array.isArray(values) || values.length > 100) fail(`${key} 应为不超过 100 项的数组`);
      return values.map(v => {
        if (!v || typeof v !== 'object') fail(`${key} 指标格式无效`);
        const m = { year: year(v.year), source: source(v.source || baseSource), category: clean(v.category) };
        if (key === 'ccf') { m.rank = String(v.rank).toUpperCase(); if (!/^[ABC]$/.test(m.rank)) fail('CCF 仅支持 A/B/C'); }
        if (key === 'cas') { m.division = Number(v.division); if (![1, 2, 3, 4].includes(m.division)) fail('中科院分区仅支持 1–4'); m.scope = v.scope || 'major'; if (!['major', 'minor'].includes(m.scope)) fail('scope 仅支持 major/minor'); m.top = v.top === true || v.top === 'true'; }
        if (key === 'jcr') { m.quartile = String(v.quartile).toUpperCase(); if (!/^Q[1-4]$/.test(m.quartile)) fail('JCR 仅支持 Q1–Q4'); }
        if (key === 'impactFactors') { if (v.value === '' || v.value == null) fail('IF 不能为空'); m.value = String(v.value) === '<0.1' ? '<0.1' : Number(v.value); if (m.value !== '<0.1' && (!Number.isFinite(m.value) || m.value < 0 || m.value > 1000)) fail('IF 必须是 0–1000 的数字或 <0.1'); }
        return m;
      });
    }
    const ccf = get('ccf', 'CCF');
    if (ccf !== '') r.ccf = metric('ccf', Array.isArray(ccf) ? ccf : [{ rank: ccf, year: get('ccfYear'), source: get('ccfSource') || baseSource, category: get('ccfCategory') }]);
    const cas = get('cas', '中科院分区');
    if (cas !== '') r.cas = metric('cas', Array.isArray(cas) ? cas : [{ division: String(cas).replace('区', ''), year: get('casYear', '中科院年份'), category: get('casCategory'), scope: get('casScope') || 'major', top: get('casTop') }]);
    const jcr = get('jcr', 'JCR分区');
    if (jcr !== '') r.jcr = metric('jcr', Array.isArray(jcr) ? jcr : [{ quartile: jcr, year: get('jcrYear', 'JCR年份'), category: get('jcrCategory') }]);
    const factors = get('impactFactors'); const factor = get('impactFactor', 'IF', '影响因子');
    if (factors) r.impactFactors = metric('impactFactors', factors);
    else if (factor !== '') r.impactFactors = metric('impactFactors', [{ value: factor, year: get('ifYear', 'IF年份') }]);
    if (type === 'conference' && (r.cas.length || r.jcr.length || r.impactFactors.length)) fail('期刊指标不能赋给会议');
    return r;
  }

  function csv(rows) {
    const escape = value => { let s = String(value ?? ''); if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    return '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n');
  }
  const api = { normalize, clean, unique, latest, excluded, isExcluded, venueText, groupVenue, mergeRecords, buildIndex, matchVenue, uninvert, truncatedCandidates, variantCandidates, venueKey, chosenMatch, venueOptions, metricLabels, paperTiers, englishName, profileAuthorAliases, resolveProfileAuthor, authorRoles, stats, parseCSV, parseImport, validateRecord, csv };
  root.ScholarLens = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
