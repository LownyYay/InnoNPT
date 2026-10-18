// n8n Code node: Skill Lookup
// Формирует статические проверочные hotspots по доменам и типу проверки.
const SKILL_NOTES = {
  "Физика":
    "Физика: проверяй числа, формулы, единицы и порядок величин; различай массу/вес, силу/энергию/мощность, тепло/температуру, скорость/ускорение, ток/напряжение/заряд. Следи за условиями модели: среда, трение, сопротивление, давление, температура, масштаб, замкнутая система. Для механизмов проверяй цепочку причина -> физический процесс -> следствие; метафоры не должны становиться ложным буквальным утверждением.",

  "Химия":
    "Химия: проверяй вещества, состав, реакции, связи, pH, концентрации, дозировки, агрегатное состояние и условия реакции. Не смешивай элемент, атом, молекулу, ион, соединение и смесь; отделяй бытовые названия от химических. Для механизмов смотри реагенты, продукты, катализаторы, температуру, давление, растворитель и равновесие; метафоры не должны искажать химический смысл.",

  "Геология":
    "Геология: проверяй породы, минералы, слои, возраст, масштабы времени, тектонику, вулканизм, эрозию, осадки, карты и региональную привязку. Не смешивай минерал/породу, магму/лаву, погоду/климат, локальный пример/глобальное правило. Для механизмов смотри процесс, условия, временной масштаб и причинную цепочку; числа и датировки требуют осторожности.",

  "Биология":
    "Биология: проверяй организмы, клетки, органы, ткани, виды, популяции, гены, наследственность, эволюцию, адаптации, поведение, физиологию и экосистемы. Не смешивай бактерии/вирусы/грибы, вид/род/семейство, орган/ткань/клетку; не переноси факт об одном виде на всю группу. Для механизмов смотри цепочку признак/процесс -> биологический механизм -> результат; избегай целевых формулировок эволюции и чрезмерного очеловечивания."
};

const FOCUS_NOTES = {
  quantity:
    "Фокус проверки: если в unit есть число, дата, величина, процент, диапазон или единица измерения, проверяй точность значения, единицы, масштаб, порядок величины и условия, при которых это значение верно.",

  attribution:
    "Фокус проверки: если в unit есть имя, авторство, открытие, исторический приоритет или приписывание свойства объекту, проверяй, кому именно это относится, нет ли ложной атрибуции и не перепутан ли источник утверждения.",

  mechanism:
    "Фокус проверки: если unit объясняет «как» или «почему», проверяй всю причинную цепочку: исходное условие -> процесс -> следствие. Не принимай верный отдельный факт как подтверждение неверного механизма.",

  definition:
    "Фокус проверки: если unit даёт определение, классификацию или термин, проверяй границы понятия, родовое/видовое отношение и не смешаны ли похожие, но разные сущности.",

  comparison:
    "Фокус проверки: если unit сравнивает объекты или явления, проверяй основание сравнения, масштаб, условия, направление сравнения и не превращён ли частный пример в общее правило.",

  metaphor:
    "Фокус проверки: если unit использует метафору или образ, проверяй, не создаёт ли он ложное буквальное утверждение, неверную причинную связь или чрезмерное очеловечивание процесса.",

  mixed:
    "Фокус проверки: unit смешанный; отдельно проверь факты, механизм, условия применимости, масштаб, термины и возможные научпоп-упрощения."
};

const ALLOWED_DOMAINS = Object.keys(SKILL_NOTES);
const ALLOWED_FOCUS = Object.keys(FOCUS_NOTES);

const MAX_DOMAINS = 2;
const MAX_HOTSPOTS = 4;

function parsePayload(json) {
  let payload = json.output ?? json.text ?? json;

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload.replace(/```json|```/g, '').trim());
    } catch (e) {
      payload = {};
    }
  }

  return payload && typeof payload === 'object' ? payload : {};
}

function cleanDomain(value) {
  const s = String(value || '').trim();
  return ALLOWED_DOMAINS.includes(s) ? s : null;
}

function normalizeDomains(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? [value]
      : [];

  const domains = [];

  for (const d of raw) {
    const clean = cleanDomain(d);
    if (clean && !domains.includes(clean)) {
      domains.push(clean);
    }

    if (domains.length >= MAX_DOMAINS) break;
  }

  return domains;
}

function normalizeFocus(value) {
  const focus = String(value || '').trim();
  return ALLOWED_FOCUS.includes(focus) ? focus : 'mixed';
}

function pushUnique(arr, value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return;

  const key = text.toLowerCase();
  if (arr.some((x) => x.toLowerCase() === key)) return;

  arr.push(text);
}

return $input.all().map((item, index) => {
  const data = parsePayload(item.json);

  const domains = normalizeDomains(data.domains);
  const check_focus = normalizeFocus(data.check_focus ?? item.json.check_focus);

  const skill_hotspots = [];

  for (const domain of domains) {
    pushUnique(skill_hotspots, SKILL_NOTES[domain]);
    if (skill_hotspots.length >= MAX_HOTSPOTS) break;
  }

  if (skill_hotspots.length < MAX_HOTSPOTS) {
    pushUnique(skill_hotspots, FOCUS_NOTES[check_focus]);
  }

  if (skill_hotspots.length === 0) {
    pushUnique(skill_hotspots, FOCUS_NOTES[check_focus]);
  }

  return {
    json: {
      id: data.id ?? item.json.id ?? null,
      frag: data.frag ?? item.json.frag ?? '',
      ctx: data.ctx ?? item.json.ctx ?? '',
      lvl: data.lvl ?? item.json.lvl ?? 'B',
      source_start: data.source_start ?? item.json.source_start ?? null,
      source_end: data.source_end ?? item.json.source_end ?? null,
      domains,
      skill_hotspots
    },
    pairedItem: { item: index }
  };
});
