// n8n Code node: Parse Extractor Output
// Нормализует ответ Extractor и вычисляет координаты каждого frag в исходном тексте.
let raw = $input.first().json;
let payload = raw.output ?? raw.text ?? raw.chatInput ?? raw;

if (typeof payload === 'string') {
  const cleaned = payload.replace(/```json|```/g, '').trim();
  try {
    payload = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Extractor вернул неполный или невалидный JSON: ${error.message}`);
  }
}

const units = Array.isArray(payload?.units)
  ? payload.units
  : (Array.isArray(payload) ? payload : []);

let sourceText = '';
try {
  const source = $('Prepare Interface Input').first().json || {};
  sourceText = String(source.sourceText ?? source.chatInput ?? source.text ?? '');
} catch (e) {}

function canonicalChar(value) {
  if (/[\s\u00A0\u2007\u202F]/u.test(value)) return ' ';
  if (/[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/u.test(value)) return '';
  if (/[«»„“”‟]/u.test(value)) return '"';
  if (/[‘’‚‛]/u.test(value)) return "'";
  if (/[‐‑‒–—―−]/u.test(value)) return '-';
  if (value === '…') return '...';
  return value;
}

function canonicalizeWithMap(value) {
  let canonical = '';
  const starts = [];
  const ends = [];
  let pendingSpace = null;

  for (let i = 0; i < value.length; i++) {
    let token = canonicalChar(value[i].normalize('NFKC'));
    if (token === ' ') {
      if (canonical) {
        if (pendingSpace) pendingSpace.end = i + 1;
        else pendingSpace = { start: i, end: i + 1 };
      }
      continue;
    }
    if (!token) continue;
    if (pendingSpace && canonical) {
      canonical += ' ';
      starts.push(pendingSpace.start);
      ends.push(pendingSpace.end);
      pendingSpace = null;
    }
    for (const outputChar of token) {
      canonical += outputChar;
      starts.push(i);
      ends.push(i + 1);
    }
  }

  return { canonical, starts, ends };
}

const sourceCanonical = canonicalizeWithMap(sourceText);
const usedRanges = new Set();
let cursor = 0;

function findSpan(frag) {
  const value = String(frag ?? '').trim();
  if (!value) return { source_start: null, source_end: null };

  const exactCandidates = [];
  let from = 0;
  while (from <= sourceText.length) {
    const index = sourceText.indexOf(value, from);
    if (index < 0) break;
    exactCandidates.push({ start: index, end: index + value.length, rank: 0 });
    from = index + 1;
  }

  const fragCanonical = canonicalizeWithMap(value).canonical;
  const canonicalCandidates = [];
  if (fragCanonical) {
    let canonicalFrom = 0;
    while (canonicalFrom <= sourceCanonical.canonical.length) {
      const index = sourceCanonical.canonical.indexOf(fragCanonical, canonicalFrom);
      if (index < 0) break;
      const last = index + fragCanonical.length - 1;
      canonicalCandidates.push({
        start: sourceCanonical.starts[index],
        end: sourceCanonical.ends[last],
        rank: 1
      });
      canonicalFrom = index + 1;
    }
  }

  const candidates = [...exactCandidates, ...canonicalCandidates]
    .filter((c) => Number.isInteger(c.start) && Number.isInteger(c.end) && c.end > c.start)
    .sort((a, b) => {
      const aUsed = usedRanges.has(`${a.start}:${a.end}`) ? 1 : 0;
      const bUsed = usedRanges.has(`${b.start}:${b.end}`) ? 1 : 0;
      if (aUsed !== bUsed) return aUsed - bUsed;
      const aAfter = a.start >= cursor ? 0 : 1;
      const bAfter = b.start >= cursor ? 0 : 1;
      if (aAfter !== bAfter) return aAfter - bAfter;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return Math.abs(a.start - cursor) - Math.abs(b.start - cursor);
    });

  const chosen = candidates[0];
  if (!chosen) return { source_start: null, source_end: null };

  usedRanges.add(`${chosen.start}:${chosen.end}`);
  cursor = chosen.start;
  return { source_start: chosen.start, source_end: chosen.end };
}

const normalized = units.map((u, i) => {
  const span = findSpan(u.frag);
  return {
    id: u.id || `u${String(i + 1).padStart(3, '0')}`,
    frag: u.frag ?? '',
    ctx: u.ctx ?? '',
    lvl: u.lvl ?? 'B',
    source_start: span.source_start,
    source_end: span.source_end
  };
});

return [{
  json: { units: normalized },
  pairedItem: { item: 0 }
}];
