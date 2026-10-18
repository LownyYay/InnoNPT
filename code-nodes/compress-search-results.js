// n8n Code node: Compress Search Results
// Сжимает результаты одного запроса Tavily в компактную группу evidence.
function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.answer?.results)) return value.answer.results;
  if (Array.isArray(value?.data?.results)) return value.data.results;
  return [];
}

function compactText(value, maxLen = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? `${text.slice(0, maxLen - 1).trim()}…` : text;
}

function compactResult(result) {
  return {
    title: compactText(firstDefined(result.title, result.name), 180),
    url: compactText(firstDefined(result.url, result.link), 500),
    snippet: compactText(
      firstDefined(result.snippet, result.content, result.description, result.summary),
      700
    )
  };
}

function requestFor(index) {
  try {
    return $('Build Search Requests').itemMatching(index).json || {};
  } catch (e) {
    try {
      return $('Build Search Requests').all()[index]?.json || {};
    } catch (fallbackError) {
      return {};
    }
  }
}

return $input.all().map((item, index) => {
  const searchJson = item.json || {};
  const req = requestFor(index);
  const results = asArray(searchJson)
    .map(compactResult)
    .filter((r) => r.title || r.url || r.snippet)
    .slice(0, 5);

  return {
    json: {
      id: req.id ?? null,
      frag: req.frag ?? '',
      ctx: req.ctx ?? '',
      lvl: req.lvl ?? 'B',
      source_start: req.source_start ?? null,
      source_end: req.source_end ?? null,
      domains: Array.isArray(req.domains) ? req.domains : [],
      skill_hotspots: Array.isArray(req.skill_hotspots) ? req.skill_hotspots : [],
      search_queries: Array.isArray(req.search_queries) ? req.search_queries : [],
      search_group_key: req.search_group_key,
      search_query: req.search_query,
      search_query_index: req.search_query_index ?? index,
      results
    },
    pairedItem: { item: index }
  };
});
