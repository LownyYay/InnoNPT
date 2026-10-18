// n8n Code node: Parse Evidence Check Output
// Разбирает и нормализует решение verifier после проверки evidence.
const ALLOWED_DOMAINS = ['Физика', 'Химия', 'Геология', 'Биология'];
const ALLOWED_VV = [
  'low_risk',
  'medium_risk',
  'high_risk',
  'input_problem',
  'cannot_verify'
];
const ALLOWED_ISSUE = [
  'none',
  'fact',
  'idea',
  'precision',
  'metaphor'
];
const MAX_HOTSPOTS = 4;
const MAX_QUERIES = 2;
const MAX_EVIDENCE_GROUPS = 2;
const MAX_RESULTS_PER_GROUP = 5;

function parsePayload(json) {
  let payload = json.output ?? json.text ?? json;
  let parseError = false;

  for (let i = 0; i < 3; i++) {
    if (typeof payload !== 'string') break;
    const cleaned = payload.replace(/```json|```/g, '').trim();
    try {
      payload = JSON.parse(cleaned);
    } catch (e) {
      payload = {};
      parseError = true;
      break;
    }
  }

  return {
    data: payload && typeof payload === 'object' ? payload : {},
    parseError
  };
}

function originalFor(index) {
  try {
    return $('Aggregate Search Evidence').itemMatching(index).json || {};
  } catch (e) {
    try {
      return $('Aggregate Search Evidence').all()[index]?.json || {};
    } catch (fallbackError) {
      return {};
    }
  }
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeDomains(value) {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(raw.map(cleanText).filter((d) => ALLOWED_DOMAINS.includes(d)))].slice(0, 2);
}

function normalizeHotspots(value) {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(raw.map(cleanText).filter(Boolean))].slice(0, MAX_HOTSPOTS);
}

function normalizeQueries(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim() ? [value] : [];
  return [...new Set(raw.map(cleanText).filter(Boolean))].slice(0, MAX_QUERIES);
}

function normalizeResult(e) {
  return {
    title: cleanText(e?.title),
    url: cleanText(e?.url),
    snippet: cleanText(e?.snippet)
  };
}

function normalizeEvidence(value) {
  const raw = Array.isArray(value) ? value : [];
  const looksGrouped = raw.some((e) => e && typeof e === 'object' && Array.isArray(e.results));

  if (looksGrouped) {
    return raw
      .filter((group) => group && typeof group === 'object')
      .map((group) => ({
        query: cleanText(group.query),
        results: Array.isArray(group.results)
          ? group.results.map(normalizeResult)
              .filter((r) => r.title || r.url || r.snippet)
              .slice(0, MAX_RESULTS_PER_GROUP)
          : []
      }))
      .filter((group) => group.query || group.results.length > 0)
      .slice(0, MAX_EVIDENCE_GROUPS);
  }

  const flatResults = raw
    .filter((e) => e && typeof e === 'object')
    .map(normalizeResult)
    .filter((r) => r.title || r.url || r.snippet)
    .slice(0, MAX_RESULTS_PER_GROUP);

  return flatResults.length ? [{ query: '', results: flatResults }] : [];
}

function normalizeSrc(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const text = cleanText(value);
    return text || null;
  }
  if (typeof value === 'object') {
    const title = cleanText(value.title);
    const url = cleanText(value.url);
    return title || url ? { title, url } : null;
  }
  return null;
}

return $input.all().map((item, index) => {
  const original = originalFor(index);
  const parsed = parsePayload(item.json);
  const data = parsed.data;
  const vv = ALLOWED_VV.includes(data.vv) ? data.vv : null;
  const issue = ALLOWED_ISSUE.includes(data.issue) ? data.issue : null;
  const arg = data.arg === undefined || data.arg === null ? null : cleanText(data.arg);
  const hasValidDecision = vv !== null && issue !== null && arg !== null && arg !== '';

  return {
    json: {
      id: original.id ?? null,
      frag: original.frag ?? '',
      ctx: original.ctx ?? '',
      lvl: original.lvl ?? 'B',
      source_start: original.source_start ?? null,
      source_end: original.source_end ?? null,
      domains: normalizeDomains(original.domains ?? []),
      skill_hotspots: normalizeHotspots(original.skill_hotspots ?? []),
      search_queries: normalizeQueries(original.search_queries ?? []),
      evidence: normalizeEvidence(original.evidence ?? []),
      vv: hasValidDecision ? vv : 'cannot_verify',
      issue: hasValidDecision ? issue : 'none',
      arg: hasValidDecision
        ? arg
        : 'Проверка по источникам не вернула корректное решение; требуется проверка экспертом.',
      src: hasValidDecision ? normalizeSrc(data.src) : null,
      verifier_error: parsed.parseError || !hasValidDecision
    },
    pairedItem: { item: index }
  };
});
