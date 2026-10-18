// n8n Code node: Build Search Requests
// Преобразует поисковые запросы каждого юнита в отдельные элементы для Tavily.
const MAX_QUERIES = 2;

function normalizeQueries(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim() ? [value] : [];
  const result = [];
  const seen = new Set();

  for (const q of raw) {
    const text = String(q || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= MAX_QUERIES) break;
  }

  return result;
}

return $input.all().flatMap((item, unitIndex) => {
  const unit = item.json || {};
  const queries = normalizeQueries(unit.search_queries);
  const search_group_key = `${unit.id ?? 'unit'}::${unitIndex}`;

  return queries.map((query, queryIndex) => ({
    json: {
      ...unit,
      search_group_key,
      search_query: query,
      search_query_index: queryIndex
    },
    pairedItem: { item: unitIndex }
  }));
});
