// n8n Code node: Aggregate Search Evidence
// Объединяет результаты нескольких запросов в единый массив evidence для юнита.
function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function normalizeHotspots(value) {
  return Array.isArray(value)
    ? value.map((x) => cleanText(x)).filter(Boolean).slice(0, 4)
    : [];
}

const groups = new Map();

$input.all().forEach((item, inputIndex) => {
  const j = item.json || {};
  const key = j.search_group_key ?? `${j.id ?? 'unit'}::fallback`;

  if (!groups.has(key)) {
    groups.set(key, {
      id: j.id ?? null,
      frag: j.frag ?? '',
      ctx: j.ctx ?? '',
      lvl: j.lvl ?? 'B',
      source_start: j.source_start ?? null,
      source_end: j.source_end ?? null,
      domains: Array.isArray(j.domains) ? j.domains : [],
      skill_hotspots: normalizeHotspots(j.skill_hotspots),
      search_queries: Array.isArray(j.search_queries) ? j.search_queries : [],
      vv: null,
      issue: null,
      arg: null,
      src: null,
      evidence: [],
      pairedIndex: inputIndex
    });
  }

  const group = groups.get(key);
  group.evidence.push({
    query: cleanText(j.search_query),
    query_index: Number.isFinite(j.search_query_index)
      ? j.search_query_index
      : group.evidence.length,
    results: Array.isArray(j.results) ? j.results : []
  });
});

return Array.from(groups.values()).map((group) => {
  group.evidence.sort((a, b) => a.query_index - b.query_index);
  group.evidence = group.evidence
    .map(({ query, results }) => ({ query, results }))
    .filter((e) => e.query || e.results.length > 0)
    .slice(0, 2);

  const pairedIndex = group.pairedIndex;
  delete group.pairedIndex;

  return {
    json: group,
    pairedItem: { item: pairedIndex }
  };
});
