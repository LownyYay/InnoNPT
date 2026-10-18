// n8n Code node: Prepare Interface Input
// Проверяет запрос интерфейса и передаёт исходный текст в Extractor без обрезания.
const body = $json.body && typeof $json.body === 'object' ? $json.body : {};
const rawText = body.text ?? body['текст'] ?? $json.text ?? $json['текст'] ?? '';
const sourceText = typeof rawText === 'string' ? rawText : '';

if (!sourceText.trim()) {
  throw new Error('Поле text обязательно и должно содержать непустой текст.');
}

if (sourceText.length > 120000) {
  throw new Error('Текст слишком большой. Максимальный размер — 120 000 символов.');
}

return [{ json: { chatInput: sourceText, sourceText } }];
