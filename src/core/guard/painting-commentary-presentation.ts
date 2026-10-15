// @ts-nocheck
// Pure presentation helpers mechanically extracted from the legacy SessionStore.
// Preserve their original untyped runtime contract until a separate typing change.
function textOrUndefined(value) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function hasCyrillic(value) {
  return /[А-Яа-яЁё]/.test(String(value ?? ''));
}
function sidecarLanguage(configuredLanguage, ...samples) {
  if (configuredLanguage === 'ru' || configuredLanguage === 'en') return configuredLanguage;
  return samples.some(hasCyrillic) ? 'ru' : 'en';
}
function commentaryText(value, fallback) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  // Localized scaffolding cannot translate source prose. Preserve it rather than
  // erase artistic evidence when the caller did not follow the language preference.
  return candidate || fallback;
}
function prePassCommentary(record, review = record?.verdict) {
  // Presentation correction is separate from the immutable technical goal/actions.
  return textOrUndefined(review?.artistic_commentary)
    ?? textOrUndefined(record?.artistic_commentary)
    ?? textOrUndefined(record?.args?.intent)
    ?? textOrUndefined(record?.summary);
}
export function commentaryLanguageNotice(record, presentation) {
  const intent = prePassCommentary(record);
  const language = presentation?.language;
  const mismatch = intent && (language === 'ru'
    ? /[A-Za-z]/.test(intent) && !hasCyrillic(intent)
    : language === 'en' && hasCyrillic(intent));
  if (!mismatch) return undefined;
  // Script mismatch is a presentation hint, never a painting/review admission gate.
  return {
    code: 'commentary_language_mismatch',
    expected_language: language,
    repair: language === 'ru'
      ? 'Комментарий должен быть на русском языке. Передай русское намерение в previous_observation.artistic_commentary вместе с обычным наблюдением после прохода. Для следующих проходов используй русский goal или artistic_commentary. Дополнительный Guard-цикл не нужен.'
      : 'Commentary must be in English. Supply the English pre-pass narration as previous_observation.artistic_commentary during ordinary review closure. For future passes use an English goal or artistic_commentary. No extra Guard cycle is needed.',
  };
}
function lowerInitial(value) {
  const text = String(value ?? '').trim();
  return text ? text.charAt(0).toLocaleLowerCase('ru-RU') + text.slice(1) : text;
}
function sentenceWithoutTerminalPunctuation(value) {
  return String(value ?? '').trim().replace(/[.!?]+\s*$/, '');
}
function artisticObservedResult(verdict) {
  return textOrUndefined(verdict?.observed_change)
    ?? (Array.isArray(verdict?.observations)
      ? textOrUndefined(verdict.observations.map(item => textOrUndefined(item?.visible)).filter(Boolean).join('\n\n'))
      : undefined);
}
function completedArtisticSentence(value, language) {
  const text = sentenceWithoutTerminalPunctuation(value);
  if (!text) return language === 'ru' ? 'Я сделал следующий художественный шаг.' : 'I completed the next artistic step.';
  if (language !== 'ru') return `I completed this step: ${lowerInitial(text)}.`;
  const replacements = [
    ['усилить', 'усилил'], ['создать', 'создал'], ['добавить', 'добавил'], ['сделать', 'сделал'],
    ['уточнить', 'уточнил'], ['отделить', 'отделил'], ['настроить', 'настроил'], ['построить', 'построил'],
    ['смягчить', 'смягчил'], ['затемнить', 'затемнил'], ['осветлить', 'осветлил'], ['исправить', 'исправил'],
    ['нарисовать', 'нарисовал'], ['наложить', 'наложил'], ['провести', 'провёл'], ['проработать', 'проработал'],
    ['сформировать', 'сформировал'], ['выстроить', 'выстроил'], ['доработать', 'доработал'], ['сохранить', 'сохранил'],
  ];
  const lower = text.toLocaleLowerCase('ru-RU');
  for (const [infinitive, past] of replacements) {
    if (lower.startsWith(`${infinitive} `) || lower === infinitive) {
      return `Я ${past}${text.slice(infinitive.length)}.`;
    }
  }
  if (/^я\s+/i.test(text)) return `${text}.`;
  return `Я сделал следующий шаг: ${lowerInitial(text)}.`;
}
function artisticToolDescription(record, language, detail = 'normal') {
  const steps = Array.isArray(record?.args?.steps)
    ? record.args.steps : [{ tool: record?.tool, args: record?.args }];
  const toolNames = [];
  const brushSettings = [];
  const parameters = [];
  const ru = language === 'ru';
  const add = (name) => { if (name && !toolNames.includes(name)) toolNames.push(name); };
  if (record?.args?.logical_layer?.layer_name) {
    parameters.push(`${ru ? 'Рабочий слой' : 'Working layer'}: ${record.args.logical_layer.layer_name}.`);
  }
  for (const step of steps) {
    const tool = String(step?.tool ?? '');
    const args = step?.args ?? {};
    if (tool === 'photoshop_set_brush') brushSettings.push(args);
    if (tool === 'photoshop_select_brush_preset' && args.name) {
      parameters.push(`${ru ? 'Кисть' : 'Brush preset'}: ${args.name}.`);
    }
    if (tool === 'photoshop_select_brush_preset') add(language === 'ru' ? 'кисть' : 'brush');
    if (tool === 'photoshop_paint_dabs') {
      add(language === 'ru' ? 'кисть' : 'brush');
      brushSettings.push(args, ...(Array.isArray(args.dabs) ? args.dabs : []));
    }
    if (tool === 'photoshop_paint_strokes') {
      brushSettings.push(args);
      const strokes = Array.isArray(step?.args?.strokes) ? step.args.strokes : [];
      for (const stroke of strokes) {
        brushSettings.push(stroke);
        const strokeTool = String(stroke?.tool ?? 'BRUSH').toUpperCase();
        if (strokeTool === 'PENCIL') add(language === 'ru' ? 'карандаш' : 'pencil');
        else if (strokeTool === 'SMUDGE') add(language === 'ru' ? 'палец / Smudge' : 'Smudge tool');
        else if (strokeTool === 'ERASER') add(language === 'ru' ? 'ластик' : 'eraser');
        else add(language === 'ru' ? 'кисть' : 'brush');
      }
    }
    const mappings = {
      photoshop_apply_gaussian_blur: ['размытие по Гауссу', 'Gaussian Blur'],
      photoshop_apply_smart_blur: ['Smart Blur', 'Smart Blur'],
      photoshop_paint_regions: ['заливку контуров', 'filled regions'],
      photoshop_fill_layer: ['заливку слоя', 'layer fill'],
      photoshop_select_rectangle: ['прямоугольное выделение', 'rectangular selection'],
      photoshop_select_ellipse: ['эллиптическое выделение', 'elliptical selection'],
      photoshop_create_layer_mask: ['маску слоя', 'layer mask'],
      photoshop_apply_gradient_mask: ['градиент на маске', 'gradient mask'],
      photoshop_paint_color_gradient: ['градиент', 'gradient'],
      photoshop_move_layer: ['перемещение слоя', 'layer move'],
      photoshop_scale_layer: ['масштабирование слоя', 'layer scaling'],
      photoshop_rotate_layer: ['поворот слоя', 'layer rotation'],
      photoshop_set_layer_blend_mode: ['режим наложения слоя', 'layer blend mode'],
      photoshop_set_layer_opacity: ['непрозрачность слоя', 'layer opacity'],
      photoshop_adjust_curves: ['Кривые', 'Curves'],
      photoshop_auto_levels: ['Уровни', 'Levels'],
      photoshop_content_aware_fill: ['заливку с учётом содержимого', 'Content-Aware Fill'],
    };
    if (mappings[tool]) add(mappings[tool][language === 'ru' ? 0 : 1]);
    if (tool === 'photoshop_apply_gaussian_blur' && Number.isFinite(args.radius)) {
      parameters.push(`${ru ? 'Размытие по Гауссу: радиус' : 'Gaussian Blur: radius'} ${args.radius} px.`);
    }
    if (tool === 'photoshop_set_layer_blend_mode' && args.blendMode) {
      parameters.push(`${ru ? 'Режим наложения' : 'Blend mode'}: ${args.blendMode}.`);
    }
    if (tool === 'photoshop_set_layer_opacity' && Number.isFinite(args.opacity)) {
      parameters.push(`${ru ? 'Непрозрачность слоя' : 'Layer opacity'}: ${args.opacity}%.`);
    }
    if (tool === 'photoshop_select_layer_by_name' && args.name) {
      parameters.push(`${ru ? 'Рабочий слой' : 'Working layer'}: ${args.name}.`);
    }
    if (tool === 'photoshop_paint_regions') {
      const regions = Array.isArray(args.regions) ? args.regions : [];
      if (detail !== 'detailed' && regions.length) {
        parameters.push(`${ru ? 'Контурных заливок' : 'Region fills'}: ${regions.length}.`);
      }
      for (const region of detail === 'detailed' ? regions : []) {
        const color = region.color;
        const parts = [];
        if (color && [color.red, color.green, color.blue].every(Number.isFinite)) {
          parts.push(`RGB(${color.red}, ${color.green}, ${color.blue})`);
        }
        if (Number.isFinite(region.opacity)) parts.push(`${ru ? 'непрозрачность' : 'opacity'} ${region.opacity}%`);
        if (parts.length) parameters.push(`${ru ? 'Контурная заливка' : 'Region fill'}: ${parts.join(', ')}.`);
      }
    }
    if (tool === 'photoshop_apply_gradient_mask') {
      const directions = { right_to_left: 'справа налево', left_to_right: 'слева направо',
        top_to_bottom: 'сверху вниз', bottom_to_top: 'снизу вверх' };
      if (args.direction) parameters.push(`${ru ? 'Направление градиента маски' : 'Mask gradient direction'}: ${ru ? directions[args.direction] ?? args.direction : args.direction}.`);
      if (Number.isFinite(args.start_pct) && Number.isFinite(args.end_pct)) {
        parameters.push(`${ru ? 'Границы градиента маски' : 'Mask gradient bounds'}: ${args.start_pct}% → ${args.end_pct}%.`);
      }
    }
    if (tool === 'photoshop_paint_color_gradient') {
      const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y)
        ? `(${value.x}, ${value.y})` : undefined;
      const from = point(args.from), to = point(args.to);
      if (from && to) parameters.push(`${ru ? 'Градиент' : 'Gradient'}: ${from} → ${to} px.`);
      const stops = (Array.isArray(args.stops) ? args.stops : [])
        .filter(stop => [stop.position, stop.red, stop.green, stop.blue].every(Number.isFinite))
        .map(stop => `${stop.position}: RGB(${stop.red}, ${stop.green}, ${stop.blue})`);
      if (detail === 'detailed' && stops.length) parameters.push(`${ru ? 'Цветовые точки' : 'Color stops'}: ${stops.join('; ')}.`);
    }
  }
  if (!toolNames.length && !parameters.length && !brushSettings.length) return undefined;
  if (language === 'ru') {
    const sentence = toolNames.length ? `В Photoshop я использую ${toolNames.join(', ')}.` : '';
    if (detail === 'short') return sentence || undefined;
    for (const settings of brushSettings) {
      const parts = [];
      if (Number.isFinite(settings.size)) parts.push(`размер ${settings.size} px`);
      for (const [key, label] of [['hardness', 'жёсткость'], ['opacity', 'непрозрачность'], ['flow', 'поток'], ['spacing', 'интервал'], ['smoothing', 'сглаживание']]) {
        if (Number.isFinite(settings[key])) parts.push(`${label} ${settings[key]}%`);
      }
      if (parts.length) parameters.push(`Для кисти ставлю ${parts.join(', ')}.`);
    }
    return [sentence, ...new Set(parameters)].filter(Boolean).join(detail === 'detailed' ? '\n' : ' ');
  }
  const sentence = toolNames.length ? `In Photoshop I use the ${toolNames.join(', ')}.` : '';
  if (detail === 'short') return sentence || undefined;
  for (const settings of brushSettings) {
    const parts = [];
    if (Number.isFinite(settings.size)) parts.push(`${settings.size} px size`);
    for (const key of ['hardness', 'opacity', 'flow', 'spacing', 'smoothing']) {
      if (Number.isFinite(settings[key])) parts.push(`${settings[key]}% ${key}`);
    }
    if (parts.length) parameters.push(`Brush settings: ${parts.join(', ')}.`);
  }
  return [sentence, ...new Set(parameters)].filter(Boolean).join(detail === 'detailed' ? '\n' : ' ');
}
export { sidecarLanguage, commentaryText, prePassCommentary, lowerInitial, sentenceWithoutTerminalPunctuation, artisticObservedResult, completedArtisticSentence, artisticToolDescription };
