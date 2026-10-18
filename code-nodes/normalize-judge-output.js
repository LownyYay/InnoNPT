// n8n Code node: Normalize Judge Output
const ALLOWED_JUDGE = ['pass', 'medium', 'high', 'error'];
const ALLOWED_VV = [
  'low_risk',
  'medium_risk',
  'high_risk',
  'input_problem',
  'cannot_verify'
];

function normalizeJudgeVerdict(value) {
  const v = String(value || '').trim().toLowerCase();
  if (ALLOWED_JUDGE.includes(v)) return v;
  if (['ok', 'accepted', 'accept', 'passed', 'approve'].includes(v)) return 'pass';
  if (['medium_risk', 'warning', 'warn', 'needs_revision'].includes(v)) return 'medium';
  if (['high_risk', 'critical', 'severe'].includes(v)) return 'high';
  if ([
    'input_problem', 'cannot_verify', 'human', 'manual', 'needs_user',
    'needs_human', 'review', 'invalid', 'verifier_error', 'judge_error',
    'technical_error', 'failed', 'failure'
  ].includes(v)) return 'error';
  return null;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function cleanReason(value) {
  const text = cleanText(value);
  return text ? text.slice(0, 700) : '';
}

function cleanModelText(value) {
  return String(value ?? '')
    .replace(/^\s*```(?:json|text)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function tryParseJson(text) {
  const candidates = [text];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed !== null && typeof parsed === 'object') return parsed;
      if (typeof parsed === 'string') return parsed;
    } catch (e) {}
  }

  return null;
}

function extractProtocol(text) {
  const verdictMatch =
    text.match(/(?:^|\n)\s*(?:VERDICT|JUDGE_VERDICT|judge_verdict|ВЕРДИКТ|МАРШРУТ)\s*[:=]\s*["'`]?([a-z_]+)/i) ??
    text.match(/["']?(?:judge_verdict|verdict|route|decision|next_step|action|result)["']?\s*[:=]\s*["'`]?([a-z_]+)/i) ??
    text.match(/^\s*(pass|medium|high|error)\b/i);

  const reasonMatch =
    text.match(/(?:^|\n)\s*(?:REASON|JUDGE_REASON|judge_reason|ПРИЧИНА|ОБОСНОВАНИЕ)\s*[:=]\s*(.+)$/im) ??
    text.match(/["']?(?:judge_reason|reason|explanation|rationale)["']?\s*[:=]\s*["']?([^\n"}]+)/i);

  const judgeVerdict = normalizeJudgeVerdict(verdictMatch?.[1]);
  const judgeReason = cleanReason(reasonMatch?.[1]);

  return judgeVerdict || judgeReason
    ? { judge_verdict: judgeVerdict, judge_reason: judgeReason }
    : null;
}

function parsePayload(json) {
  let payload = json?.output ?? json?.text ?? json;

  for (let i = 0; i < 3; i++) {
    if (typeof payload !== 'string') break;
    const text = cleanModelText(payload);
    const parsed = tryParseJson(text);
    if (parsed !== null) {
      payload = parsed;
      continue;
    }
    return extractProtocol(text);
  }

  return payload && typeof payload === 'object' ? payload : null;
}

function verifierFor(index) {
  try {
    const raw = $('Normalize Verifier Output').itemMatching(index).json;
    return parsePayload(raw) || {};
  } catch (e) {
    try {
      const raw = $('Normalize Verifier Output').all()[index]?.json;
      return parsePayload(raw) || {};
    } catch (fallbackError) {
      return {};
    }
  }
}

function pickJudgeVerdict(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  return normalizeJudgeVerdict(
    parsed.judge_verdict ?? parsed.verdict ?? parsed.route ?? parsed.decision ??
    parsed.next_step ?? parsed.action ?? parsed.result
  );
}

function pickJudgeReason(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  return cleanReason(
    parsed.judge_reason ?? parsed.reason ?? parsed.explanation ??
    parsed.rationale ?? parsed.justification
  );
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

function routeForVv(vv) {
  if (vv === 'low_risk') return 'pass';
  if (vv === 'medium_risk') return 'medium';
  if (vv === 'high_risk') return 'high';
  return 'error';
}

return $input.all().map((item, index) => {
  const verifier = verifierFor(index);
  const parsedJudge = parsePayload(item.json);
  const vv = ALLOWED_VV.includes(verifier.vv) ? verifier.vv : 'cannot_verify';
  const expectedVerdict = routeForVv(vv);
  const pickedVerdict = pickJudgeVerdict(parsedJudge);
  const pickedReason = pickJudgeReason(parsedJudge);

  let judge_verdict = expectedVerdict;
  let judge_error = false;
  let judge_reason = pickedReason;
  const arg = verifier.arg ?? '';
  let src = normalizeSrc(verifier.src ?? null);

  if (pickedVerdict === null || !pickedReason) {
    judge_verdict = 'error';
    judge_error = true;
    judge_reason = pickedVerdict === null
      ? 'Judge не вернул распознаваемый verdict.'
      : 'Judge не вернул непустой reason для принятого verdict.';
    src = null;
  } else if (Boolean(verifier.verifier_error)) {
    judge_verdict = 'error';
    if (pickedVerdict !== 'error') {
      judge_error = true;
      judge_reason = `${pickedReason} Judge не направил технически ненадёжный ответ verifier в категорию error.`;
      src = null;
    }
  } else if (pickedVerdict !== expectedVerdict) {
    judge_verdict = 'error';
    judge_error = true;
    judge_reason = `${pickedReason} Категория Judge не согласуется с vv verifier: ожидалось ${expectedVerdict}, получено ${pickedVerdict}.`;
    src = null;
  } else {
    judge_verdict = pickedVerdict;
  }

  const normalized = {
    id: verifier.id ?? null,
    frag: verifier.frag ?? '',
    ctx: verifier.ctx ?? '',
    lvl: verifier.lvl ?? 'B',
    source_start: verifier.source_start ?? null,
    source_end: verifier.source_end ?? null,
    vv,
    issue: verifier.issue ?? 'none',
    arg,
    src,
    verifier_error: Boolean(verifier.verifier_error),
    judge_error,
    judge_verdict,
    judge_reason
  };

  return {
    json: { output: JSON.stringify(normalized) },
    pairedItem: { item: index }
  };
});
