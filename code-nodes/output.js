// n8n Code node: output
let raw = $input.first().json;
const rawList = Array.isArray(raw.output)
  ? raw.output
  : [raw.output ?? raw.chatInput ?? raw.text ?? raw];

const ALLOWED_VERDICTS = ['pass', 'medium', 'high', 'error'];
const ALLOWED_VV = [
  'low_risk',
  'medium_risk',
  'high_risk',
  'input_problem',
  'cannot_verify'
];

function parseItem(item) {
  let payload = item;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload.replace(/```json|```/g, '').trim());
    } catch (e) {
      return {
        judge_verdict: 'error',
        vv: 'cannot_verify',
        issue: 'none',
        arg: 'Не удалось разобрать результат проверки.',
        verifier_error: true,
        judge_error: true,
        judge_reason: 'Не удалось разобрать ответ Judge или итоговый результат.'
      };
    }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

const items = rawList
  .map(parseItem)
  .flatMap((payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.u)) return payload.u;
    if (Array.isArray(payload.items)) return payload.items;
    return [payload];
  });

function cleanText(value) {
  return value === undefined || value === null ? null : String(value).trim();
}

function cleanSrc(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') {
    const title = cleanText(value.title) || '';
    const url = cleanText(value.url) || '';
    return title || url ? { title, url } : null;
  }
  return null;
}

function routeForVv(vv) {
  if (vv === 'low_risk') return 'pass';
  if (vv === 'medium_risk') return 'medium';
  if (vv === 'high_risk') return 'high';
  return 'error';
}

function buildOriginalMap() {
  try {
    const originals = $('Split Out Units').all().map((entry) => entry.json || {});
    return new Map(originals.map((unit) => [String(unit.id ?? ''), unit]));
  } catch (e) {
    return new Map();
  }
}

const originalMap = buildOriginalMap();

function base(item) {
  const id = cleanText(item.id);
  const original = originalMap.get(String(id ?? '')) || {};
  const originalStart = original.source_start !== null && original.source_start !== undefined && original.source_start !== '' && Number.isInteger(Number(original.source_start))
    ? Number(original.source_start)
    : null;
  const originalEnd = original.source_end !== null && original.source_end !== undefined && original.source_end !== '' && Number.isInteger(Number(original.source_end))
    ? Number(original.source_end)
    : null;
  const itemStart = item.source_start !== null && item.source_start !== undefined && item.source_start !== '' && Number.isInteger(Number(item.source_start))
    ? Number(item.source_start)
    : null;
  const itemEnd = item.source_end !== null && item.source_end !== undefined && item.source_end !== '' && Number.isInteger(Number(item.source_end))
    ? Number(item.source_end)
    : null;

  return {
    id,
    // Данные Extractor по id являются источником истины; ветки verifier/Judge не должны подменять frag и координаты.
    frag: cleanText(original.frag) || cleanText(item.frag) || '',
    ctx: cleanText(original.ctx) || cleanText(item.ctx) || '',
    source_start: originalStart ?? itemStart,
    source_end: originalEnd ?? itemEnd
  };
}

function asReview(item, fallbackVv) {
  return {
    ...base(item),
    vv: cleanText(item.vv) || fallbackVv,
    issue: cleanText(item.issue) || 'none',
    lvl: cleanText(item.lvl) || 'B',
    arg: cleanText(item.arg) || '',
    src: cleanSrc(item.src)
  };
}

function asPass(item) {
  return base(item);
}

function asError(item) {
  return {
    ...base(item),
    verification_message: 'Автоматическая проверка этого фрагмента не завершилась надёжно. Требуется проверка экспертом.'
  };
}

function normalizeRecord(item) {
  const verdictRaw = String(item.judge_verdict || '').trim().toLowerCase();
  const verdict = ALLOWED_VERDICTS.includes(verdictRaw) ? verdictRaw : 'error';
  const vvRaw = String(item.vv || '').trim().toLowerCase();
  const vv = ALLOWED_VV.includes(vvRaw) ? vvRaw : 'cannot_verify';
  const expected = routeForVv(vv);

  const hasVerifierProblem =
    Boolean(item.verifier_error) ||
    vv === 'input_problem' ||
    vv === 'cannot_verify';

  const hasJudgeProblem = Boolean(item.judge_error) || verdict === 'error';
  const categoryMismatch = !hasVerifierProblem && !hasJudgeProblem && verdict !== expected;

  if (hasVerifierProblem || hasJudgeProblem || categoryMismatch) {
    let reason = cleanText(item.arg);
    if (!reason) {
      reason = categoryMismatch
        ? `Конфликт итоговой категории: judge=${verdict}, verifier=${vv}.`
        : 'Проверка не завершилась надёжно; требуется проверка экспертом.';
    }

    return {
      ...item,
      judge_verdict: 'error',
      vv,
      issue: cleanText(item.issue) || 'none',
      arg: reason,
      src: cleanSrc(item.src)
    };
  }

  return {
    ...item,
    judge_verdict: verdict,
    vv
  };
}

function recordKey(item, index) {
  const id = cleanText(item.id);
  if (id) return `id:${id}`;
  const frag = cleanText(item.frag);
  const ctx = cleanText(item.ctx);
  return frag || ctx ? `content:${frag || ''}::${ctx || ''}` : `index:${index}`;
}

const unique = new Map();

items.forEach((rawItem, index) => {
  const item = normalizeRecord(rawItem);
  const key = recordKey(item, index);

  if (!unique.has(key)) {
    unique.set(key, item);
    return;
  }

  const first = unique.get(key);
  unique.set(key, {
    ...first,
    frag: cleanText(first.frag) || cleanText(item.frag) || '',
    ctx: cleanText(first.ctx) || cleanText(item.ctx) || '',
    judge_verdict: 'error',
    vv: ALLOWED_VV.includes(first.vv) ? first.vv : (ALLOWED_VV.includes(item.vv) ? item.vv : 'cannot_verify'),
    issue: 'none',
    arg: `Юнит ${cleanText(first.id) || ''} получен несколько раз или сразу в нескольких ветках. Требуется проверка workflow.`,
    src: null,
    verifier_error: true
  });
});

function compareUnits(a, b) {
  return String(a.id || '').localeCompare(
    String(b.id || ''),
    undefined,
    { numeric: true, sensitivity: 'base' }
  );
}

const medium_expert_list = [];
const high_expert_list = [];
const error_expert_list = [];
const pass_list = [];

for (const item of unique.values()) {
  const verdict = item.judge_verdict;

  // Ошибка verifier/Judge всегда имеет приоритет над vv и любой цветовой категорией.
  if (verdict === 'error') {
    error_expert_list.push(asError(item));
  } else if (verdict === 'pass' && item.vv === 'low_risk') {
    pass_list.push(asPass(item));
  } else if (verdict === 'medium' && item.vv === 'medium_risk') {
    medium_expert_list.push(asReview(item, 'medium_risk'));
  } else if (verdict === 'high' && item.vv === 'high_risk') {
    high_expert_list.push(asReview(item, 'high_risk'));
  } else {
    error_expert_list.push(asError(item));
  }
}

medium_expert_list.sort(compareUnits);
high_expert_list.sort(compareUnits);
error_expert_list.sort(compareUnits);
pass_list.sort(compareUnits);

return [{
  json: {
    medium_expert_list,
    high_expert_list,
    error_expert_list,
    pass_list
  }
}];
