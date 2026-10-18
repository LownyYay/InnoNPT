// n8n Code node: Parse Precheck Output
// Разбирает и нормализует ответ предварительной проверки verifier.
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
    return $('Skill Lookup').itemMatching(index).json || {};
  } catch (e) {
    try {
      return $('Skill Lookup').all()[index]?.json || {};
    } catch (fallbackError) {
      return {};
    }
  }
}

function normalizeDomains(value, fallback = []) {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(fallback) ? fallback : [];
  const domains = [];

  for (const d of raw) {
    const clean = String(d || '').trim();
    if (ALLOWED_DOMAINS.includes(clean) && !domains.includes(clean)) {
      domains.push(clean);
    }
    if (domains.length >= 2) break;
  }

  return domains;
}

function normalizeHotspots(value, fallback = []) {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(fallback) ? fallback : [];
  const result = [];
  const seen = new Set();

  for (const h of raw) {
    const text = String(h || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= MAX_HOTSPOTS) break;
  }

  return result;
}

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

function normalizeSrc(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const text = value.replace(/\s+/g, ' ').trim();
    return text || null;
  }
  if (typeof value === 'object') {
    const title = String(value.title ?? '').replace(/\s+/g, ' ').trim();
    const url = String(value.url ?? '').replace(/\s+/g, ' ').trim();
    return title || url ? { title, url } : null;
  }
  return null;
}

return $input.all().map((item, index) => {
  const original = originalFor(index);
  const parsed = parsePayload(item.json);
  const data = parsed.data;

  const search_queries = normalizeQueries(data.search_queries);
  const needsSearch = search_queries.length > 0;
  const vv = ALLOWED_VV.includes(data.vv) ? data.vv : null;
  const issue = ALLOWED_ISSUE.includes(data.issue) ? data.issue : null;
  const arg = data.arg === undefined || data.arg === null
    ? null
    : String(data.arg).replace(/\s+/g, ' ').trim();

  const hasValidNoSearchDecision =
    !needsSearch &&
    vv !== null &&
    issue !== null &&
    arg !== null &&
    arg !== '';

  const verifier_error = parsed.parseError || (!needsSearch && !hasValidNoSearchDecision);

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
      search_queries,
      vv: hasValidNoSearchDecision ? vv : null,
      issue: hasValidNoSearchDecision ? issue : null,
      arg: hasValidNoSearchDecision ? arg : null,
      src: hasValidNoSearchDecision ? normalizeSrc(data.src) : null,
      verifier_error
    },
    pairedItem: { item: index }
  };
});
