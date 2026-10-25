(function(root) {
  'use strict';
  function hydrateJournals(snapshot) {
    if (snapshot.schemaVersion !== 1) throw Error('不支持的期刊数据版本');
    const source = `${snapshot.sourceLabel} · ${snapshot.year} · ${snapshot.upstreamCommit.slice(0, 8)}`;
    const xrSource = `新锐期刊分区表 ${snapshot.xrYear} · ${snapshot.sourceLabel} · ${snapshot.upstreamCommit.slice(0, 8)}`;
    // Medicine and humanities / social-science journals ship as names only, so their papers are not
    // matched to a similarly named science journal; their ids follow the same rule as full entries.
    const excluded = (snapshot.excluded || []).map(([title, ...issns]) => ({
      id: 'journal-' + (issns[0] || root.ScholarLens.normalize(title).replace(/ /g, '-')), title, short: title, aliases: [], type: 'journal',
      issn: issns[0] || '', issns, sourceKind: 'bundled-public', outOfScope: true, sourceLinks: [], cas: [], jcr: [], impactFactors: [], xr: []
    }));
    return snapshot.records.map(r => ({
      id: r.id, title: r.title, short: r.title, aliases: r.aliases || [], type: 'journal',
      issn: r.issns[0] || '', issns: r.issns, sourceKind: 'bundled-public',
      sourceLinks: [r.casLine && snapshot.sources.cas + '#L' + r.casLine, r.jcrLine && snapshot.sources.jcr + '#L' + r.jcrLine, r.xrLine && snapshot.sources.xr + '#L' + r.xrLine].filter(Boolean),
      cas: r.cas.map(([category, division, scope, top]) => ({ year: snapshot.year, category, division, scope, top, source })),
      jcr: r.jcr.map(([category, quartile]) => ({ year: snapshot.year, category, quartile, source })),
      impactFactors: r.if === null ? [] : [{ year: snapshot.year, value: r.if, source }],
      // XR rows: [category index, division, 1 = major / 0 = minor, 1 = Top].
      xr: (r.xr || []).map(([category, division, major, top]) => ({ year: snapshot.xrYear, category: snapshot.xrCategories[category], division, scope: major ? 'major' : 'minor', top: !!top, source: xrSource })),
      ...(r.xrWarning ? { xrWarning: r.xrWarning } : {})
    })).concat(excluded);
  }
  // XR also rates 15 computing conferences; attach each to the one CCF conference with that name or acronym.
  function attachXrConferences(records, snapshot) {
    const norm = root.ScholarLens.normalize, source = `新锐期刊分区表 ${snapshot.xrYear}（重要会议） · ${snapshot.sourceLabel} · ${snapshot.upstreamCommit.slice(0, 8)}`;
    const missing = [];
    for (const conference of snapshot.xrConferences || []) {
      const names = new Set([conference.title, conference.short, conference.short.replace(/^IEEE\s+/, '')].map(norm));
      const hits = records.filter(r => r.type === 'conference' && [r.title, r.short, ...(r.aliases || [])].some(name => names.has(norm(name))));
      if (hits.length !== 1) { missing.push(conference.short); continue; }
      hits[0].xr = [{ year: snapshot.xrYear, category: '计算机科学（重要会议）', division: conference.division, scope: 'major', top: conference.top, source }];
      hits[0].sourceLinks = [...(hits[0].sourceLinks || []), snapshot.sources.xrConferences + '#L' + conference.line];
    }
    return missing;
  }
  function attachAliases(records, database, journals) {
    const byId = new Map(records.map(r => [r.id, r]));
    for (const item of database.venues) {
      const target = byId.get(item.id); if (!target) throw Error('别名指向未知场所 ' + item.id);
      target.aliases = [...new Set([...(target.aliases || []), ...item.aliases])];
      target.displayName = item.displayName;
      target.aliasSources = item.sources;
    }
    // Journal containers retain their own metrics. Conference associations are
    // resolved separately, and multi-conference containers require an issue tag.
    for (const relation of database.relations || []) {
      const norm = root.ScholarLens.normalize;
      const names = new Set(relation.aliases.map(norm));
      // ShowJCR sometimes appends the acronym ("…Technologies-IMWUT"); strip it only when it is this relation's own.
      const bare = title => title.replace(/-([A-Z][A-Za-z0-9&]{1,12})$/, (suffix, acronym) => names.has(norm(acronym)) ? '' : suffix);
      let journal = records.find(r => r.type === 'journal' && [r.title, bare(r.title), ...(r.aliases || [])].some(name => names.has(norm(name))));
      if (!journal) {
        journal = { id: 'series-' + norm(relation.aliases[0]), title: relation.aliases[0], type: 'journal', short: relation.aliases[1], aliases: [], ccf: [] };
        records.push(journal);
      }
      journal.aliases = [...new Set([...(journal.aliases || []), ...relation.aliases])];
      journal.displayName ||= relation.aliases[1];
      journal.conferenceRelation = { ...relation, target: byId.get(relation.targetId), tracks: Object.fromEntries(Object.entries(relation.tracks || {}).map(([token,id]) => [token,byId.get(id)]).filter(([,r]) => r)) };
    }
    for (const item of database.journalAliases || []) {
      const target = records.find(r => r.type === 'journal' && r.issns?.includes(item.issn));
      if (target) target.aliases = [...new Set([...(target.aliases || []), ...item.aliases])];
    }
    if (journals) records.xrMissing = attachXrConferences(records, journals);
    const result = foldRenamedJournals(mergeSameJournals(records, database.sameJournals || []));
    result.xrMissing = records.xrMissing;
    return result;
  }
  // Curated: one journal under two ISSNs (an old ISSN kept by CAS, or a renamed title listed again by JCR).
  function mergeSameJournals(records, groups) {
    const removed = new Set();
    for (const group of groups) {
      const [target, ...others] = group.issns.map(issn => records.find(r => !removed.has(r) && r.issns?.includes(issn)));
      if (!target) continue;
      for (const source of others) {
        if (!source || source === target) continue;
        target.issns = [...new Set([...(target.issns || []), ...(source.issns || [])])];
        target.aliases = [...new Set([...(target.aliases || []), source.title, ...(source.aliases || [])])].filter(a => a !== target.title);
        for (const key of ['cas', 'jcr', 'impactFactors', 'xr']) {
          const rows = new Map((target[key] || []).map(v => [JSON.stringify([v.year, v.category || '', v.scope || '']), v]));
          for (const v of source[key] || []) { const id = JSON.stringify([v.year, v.category || '', v.scope || '']); if (group.preferLater || !rows.has(id)) rows.set(id, v); }
          target[key] = [...rows.values()];
        }
        target.sourceLinks = [...new Set([...(target.sourceLinks || []), ...(source.sourceLinks || [])])];
        target.sameJournal = group.evidence;
        removed.add(source);
      }
    }
    return removed.size ? records.filter(r => !removed.has(r)) : records;
  }
  // JCR 2025 lists a few renamed journals twice: the old entry with metrics, and the new name under
  // a new ISSN with none (IEEE Transactions on Networking 2998-4157). An empty entry whose name
  // belongs to exactly one other journal with metrics is folded into it instead of making that name ambiguous.
  function foldRenamedJournals(records) {
    const norm = root.ScholarLens.normalize;
    const hasMetrics = r => ['ccf', 'cas', 'jcr', 'impactFactors', 'xr'].some(key => r[key]?.length);
    const byName = new Map();
    for (const r of records) {
      if (r.type !== 'journal') continue;
      for (const name of new Set([r.title, ...(r.aliases || [])].map(norm))) { if (!byName.has(name)) byName.set(name, new Set()); byName.get(name).add(r); }
    }
    const folded = new Set();
    for (const r of records) {
      if (r.type !== 'journal' || r.sourceKind !== 'bundled-public' || r.outOfScope || hasMetrics(r)) continue;
      const others = [...byName.get(norm(r.title))].filter(other => other !== r && !folded.has(other));
      if (others.length !== 1 || !hasMetrics(others[0])) continue;
      const [target] = others;
      target.issns = [...new Set([...(target.issns || []), ...(r.issns || [])])];
      target.aliases = [...new Set([...(target.aliases || []), r.title])].filter(a => a !== target.title);
      target.renamedFrom = { id: r.id, issns: r.issns || [] };
      folded.add(r);
    }
    return folded.size ? records.filter(r => !folded.has(r)) : records;
  }
  const api = { hydrateJournals, attachAliases, attachXrConferences };
  root.ScholarLensCatalog = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
