// n8n Code node: Normalize Verifier Output
// Проверяет итог verifier, сохраняя связь с исходным юнитом.
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

function parsePayload(json) {
  let payload = json.output ?? json.text ?? json;
  let parseError = false;

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload.replace(/```json|```/g, '').trim());
    } catch (e) {
      payload = {};
      parseError = true;
    }
  }

  return {
    data: payload && typeof payload === 'object' ? payload : {},
    parseError
  };
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

function originalFor(item) {
  return item && typeof item === 'object' ? item : {};
}


return $input.all().map((item, index) => {
  const original = originalFor(item.json);
  const parsed = parsePayload(item.json);
  const data = parsed.data;
  const vv = ALLOWED_VV.includes(data.vv) ? data.vv : null;
  const issue = ALLOWED_ISSUE.includes(data.issue) ? data.issue : null;
  const arg = data.arg === undefined || data.arg === null
    ? null
    : String(data.arg).replace(/\s+/g, ' ').trim();

  const hasValidDecision =
    vv !== null &&
    issue !== null &&
    arg !== null &&
    arg !== '';

  const verifier_error = Boolean(data.verifier_error) || parsed.parseError || !hasValidDecision;

  const normalized = {
    id: data.id ?? original.id ?? null,
    frag: data.frag ?? original.frag ?? '',
    ctx: data.ctx ?? original.ctx ?? '',
    lvl: data.lvl ?? original.lvl ?? 'B',
    source_start: data.source_start ?? original.source_start ?? null,
    source_end: data.source_end ?? original.source_end ?? null,
    vv: hasValidDecision ? vv : 'cannot_verify',
    issue: hasValidDecision ? issue : 'none',
    arg: hasValidDecision
      ? arg
      : 'Verifier не вернул корректное решение; требуется проверка экспертом.',
    src: hasValidDecision ? normalizeSrc(data.src) : null,
    verifier_error
  };

  return {
    json: { output: JSON.stringify(normalized) },
    pairedItem: { item: index }
  };
});
