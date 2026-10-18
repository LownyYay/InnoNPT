// n8n Code node: Parse Classify Output
// Присоединяет классификацию к тому же исходному юниту.
const ALLOWED_DOMAINS = ['Физика', 'Химия', 'Геология', 'Биология'];
const ALLOWED_FOCUS = [
  'quantity',
  'attribution',
  'mechanism',
  'definition',
  'comparison',
  'metaphor',
  'mixed'
];

function parsePayload(json) {
  let payload = json.output ?? json.text ?? json;

  for (let i = 0; i < 3; i++) {
    if (typeof payload !== 'string') break;

    try {
      payload = JSON.parse(payload.replace(/```json|```/g, '').trim());
    } catch (e) {
      return {};
    }
  }

  if (!payload || typeof payload !== 'object') return {};
  if (payload.classification && typeof payload.classification === 'object') {
    return payload.classification;
  }
  if (Array.isArray(payload.classifications)) {
    return payload.classifications[0] || {};
  }

  return payload;
}

function originalFor(index) {
  try {
    return $('Split Out Units').itemMatching(index).json || {};
  } catch (e) {
    try {
      return $('Split Out Units').all()[index]?.json || {};
    } catch (fallbackError) {
      return {};
    }
  }
}

function normalizeDomains(value) {
  const raw = Array.isArray(value) ? value : [];
  const domains = [];

  for (const domain of raw) {
    const clean = String(domain || '').trim();
    if (ALLOWED_DOMAINS.includes(clean) && !domains.includes(clean)) {
      domains.push(clean);
    }
    if (domains.length >= 2) break;
  }

  return domains;
}

function normalizeFocus(value) {
  const focus = String(value || '').trim();
  return ALLOWED_FOCUS.includes(focus) ? focus : 'mixed';
}

return $input.all().map((item, index) => {
  const classification = parsePayload(item.json || {});
  const original = originalFor(index);

  return {
    json: {
      id: original.id ?? `u${String(index + 1).padStart(3, '0')}`,
      frag: original.frag ?? '',
      ctx: original.ctx ?? '',
      lvl: original.lvl ?? 'B',
      source_start: original.source_start ?? null,
      source_end: original.source_end ?? null,
      domains: normalizeDomains(classification.domains),
      check_focus: normalizeFocus(classification.check_focus)
    },
    pairedItem: { item: index }
  };
});
