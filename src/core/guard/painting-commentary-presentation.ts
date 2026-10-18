// @ts-nocheck
import path from 'node:path';
import { deriveExecutionOutcome } from './artistic-contract.js';
import { effectiveReportLanguage, reportText } from '../report-locales.js';
// Pure presentation helpers mechanically extracted from the legacy SessionStore.
// Preserve their original untyped runtime contract until a separate typing change.
function textOrUndefined(value) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function hasCyrillic(value) {
  return /[А-Яа-яЁё]/.test(String(value ?? ''));
}
function sidecarLanguage(configuredLanguage, ...samples) {
  return effectiveReportLanguage(configuredLanguage, ...samples);
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
  if (!text) return reportText(language, 'defaultStep');
  if (language !== 'ru') return reportText(language, 'completedStep', { text: lowerInitial(text) });
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
  return reportText(language, 'completedStep', { text: lowerInitial(text) });
}
function artisticToolDescription(record, language, detail = 'normal') {
  const steps = Array.isArray(record?.args?.steps)
    ? record.args.steps : [{ tool: record?.tool, args: record?.args }];
  const toolNames = [];
  const brushSettings = [];
  const parameters = [];
  const label = key => reportText(language, key);
  const add = (name) => { if (name && !toolNames.includes(name)) toolNames.push(name); };
  if (record?.args?.logical_layer?.layer_name) {
    parameters.push(`${label('workingLayer')}: ${record.args.logical_layer.layer_name}.`);
  }
  for (const step of steps) {
    const tool = String(step?.tool ?? '');
    const args = step?.args ?? {};
    if (tool === 'photoshop_set_brush') brushSettings.push(args);
    if (tool === 'photoshop_select_brush_preset' && args.name) {
      parameters.push(`${label('brushPreset')}: ${args.name}.`);
    }
    if (tool === 'photoshop_select_brush_preset') add(label('toolBrush'));
    if (tool === 'photoshop_paint_dabs') {
      add(label('toolBrush'));
      brushSettings.push(args, ...(Array.isArray(args.dabs) ? args.dabs : []));
    }
    if (tool === 'photoshop_paint_strokes') {
      brushSettings.push(args);
      const strokes = Array.isArray(step?.args?.strokes) ? step.args.strokes : [];
      for (const stroke of strokes) {
        brushSettings.push(stroke);
        const strokeTool = String(stroke?.tool ?? 'BRUSH').toUpperCase();
        if (strokeTool === 'PENCIL') add(label('toolPencil'));
        else if (strokeTool === 'SMUDGE') add(label('toolSmudge'));
        else if (strokeTool === 'ERASER') add(label('toolEraser'));
        else add(label('toolBrush'));
      }
    }
    const mappings = {
      photoshop_apply_gaussian_blur: 'toolGaussian',
      photoshop_apply_smart_blur: 'toolSmartBlur',
      photoshop_paint_regions: 'toolRegions',
      photoshop_fill_layer: 'toolFillLayer',
      photoshop_select_rectangle: 'toolRectangle',
      photoshop_select_ellipse: 'toolEllipse',
      photoshop_create_layer_mask: 'toolMask',
      photoshop_apply_gradient_mask: 'toolGradientMask',
      photoshop_paint_color_gradient: 'toolColorGradient',
      photoshop_move_layer: 'toolMoveLayer',
      photoshop_scale_layer: 'toolScaleLayer',
      photoshop_rotate_layer: 'toolRotateLayer',
      photoshop_set_layer_blend_mode: 'toolBlend',
      photoshop_set_layer_opacity: 'toolOpacity',
      photoshop_adjust_curves: 'toolCurves',
      photoshop_auto_levels: 'toolLevels',
      photoshop_content_aware_fill: 'toolContentAware',
    };
    if (mappings[tool]) add(label(mappings[tool]));
    if (tool === 'photoshop_apply_gaussian_blur' && Number.isFinite(args.radius)) {
      parameters.push(`${label('gaussianRadius')} ${args.radius} px.`);
    }
    if (tool === 'photoshop_set_layer_blend_mode' && args.blendMode) {
      parameters.push(`${label('blendMode')}: ${args.blendMode}.`);
    }
    if (tool === 'photoshop_set_layer_opacity' && Number.isFinite(args.opacity)) {
      parameters.push(`${label('layerOpacity')}: ${args.opacity}%.`);
    }
    if (tool === 'photoshop_select_layer_by_name' && args.name) {
      parameters.push(`${label('workingLayer')}: ${args.name}.`);
    }
    if (tool === 'photoshop_paint_regions') {
      const regions = Array.isArray(args.regions) ? args.regions : [];
      if (detail !== 'detailed' && regions.length) {
        parameters.push(`${label('regionFills')}: ${regions.length}.`);
      }
      for (const region of detail === 'detailed' ? regions : []) {
        const color = region.color;
        const parts = [];
        if (color && [color.red, color.green, color.blue].every(Number.isFinite)) {
          parts.push(`RGB(${color.red}, ${color.green}, ${color.blue})`);
        }
        if (Number.isFinite(region.opacity)) parts.push(`${label('opacity')} ${region.opacity}%`);
        if (parts.length) parameters.push(`${label('regionFill')}: ${parts.join(', ')}.`);
      }
    }
    if (tool === 'photoshop_apply_gradient_mask') {
      const directions = { right_to_left: 'directionRightLeft', left_to_right: 'directionLeftRight',
        top_to_bottom: 'directionTopBottom', bottom_to_top: 'directionBottomTop' };
      if (args.direction) parameters.push(`${label('gradientDirection')}: ${directions[args.direction] && language !== 'en' ? label(directions[args.direction]) : args.direction}.`);
      if (Number.isFinite(args.start_pct) && Number.isFinite(args.end_pct)) {
        parameters.push(`${label('gradientBounds')}: ${args.start_pct}% → ${args.end_pct}%.`);
      }
    }
    if (tool === 'photoshop_paint_color_gradient') {
      const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y)
        ? `(${value.x}, ${value.y})` : undefined;
      const from = point(args.from), to = point(args.to);
      if (from && to) parameters.push(`${label('gradient')}: ${from} → ${to} px.`);
      const stops = (Array.isArray(args.stops) ? args.stops : [])
        .filter(stop => [stop.position, stop.red, stop.green, stop.blue].every(Number.isFinite))
        .map(stop => `${stop.position}: RGB(${stop.red}, ${stop.green}, ${stop.blue})`);
      if (detail === 'detailed' && stops.length) parameters.push(`${label('colorStops')}: ${stops.join('; ')}.`);
    }
  }
  if (!toolNames.length && !parameters.length && !brushSettings.length) return undefined;
  const sentence = toolNames.length ? reportText(language, 'toolIntro', { tools: toolNames.join(', ') }) : '';
  if (detail === 'short') return sentence || undefined;
  for (const settings of brushSettings) {
    const parts = [];
    if (Number.isFinite(settings.size)) parts.push(reportText(language, 'brushSize', { value: settings.size }));
    for (const [key, labelKey] of [['hardness', 'brushHardness'], ['opacity', 'brushOpacity'],
      ['flow', 'brushFlow'], ['spacing', 'brushSpacing'], ['smoothing', 'brushSmoothing']]) {
      if (Number.isFinite(settings[key])) parts.push(reportText(language, 'brushSetting', {
        key: language === 'en' ? key : label(labelKey), value: settings[key],
      }));
    }
    if (parts.length) parameters.push(reportText(language, 'brushSettings', { settings: parts.join(', ') }));
  }
  return [sentence, ...new Set(parameters)].filter(Boolean).join(detail === 'detailed' ? '\n' : ' ');
}
export function renderCommentarySidecar(record, presentation) {
  const preview = record?.preview;
  const language = sidecarLanguage(
    presentation.language,
    record.artistic_commentary,
    record.report?.did,
    record.report?.why,
    record.report?.result
  );
  const keys = ['frame', 'operation', 'stage', 'region', 'before', 'after', 'did', 'why', 'result', 'missing'];
  const copy = Object.fromEntries(keys.map(key => [key, reportText(language, key)]));
  const beforeCommentary = commentaryText(
    prePassCommentary(record),
    copy.missing
  );
  if (presentation.commentary_mode !== 'technical') {
    const lines = [beforeCommentary];
    const toolDescription = artisticToolDescription(record, language, presentation.commentary_detail);
    if (toolDescription) lines.push(toolDescription);
    if (record.report) {
      const did = commentaryText(record.report.did, reportText(language, 'unconfirmedPass'));
      const compact = record.report.source === 'guard_compact_closure';
      // Never turn a missing execution receipt into a first-person completion claim.
      const completed = compact || did === reportText(language, 'unconfirmedPass')
        ? did : completedArtisticSentence(did, language);
      const why = commentaryText(
        record.report.why,
        beforeCommentary
      );
      const result = commentaryText(
        artisticObservedResult(record.verdict) ?? record.report.result,
        reportText(language, 'unassessedVisual')
      );
      lines.push(
        '',
        ...(!compact || deriveExecutionOutcome(record) !== 'completed' ? [completed] : []),
        ...(!compact && why !== beforeCommentary ? [reportText(language, 'purpose', { text: lowerInitial(sentenceWithoutTerminalPunctuation(why)) })] : []),
        compact ? result : reportText(language, 'outcome', { text: lowerInitial(sentenceWithoutTerminalPunctuation(result)) })
      );
      if (record.verdict?.disposition === 'rollback') {
        lines.push(reportText(language, 'rollback'));
      }
    }
    if (presentation.commentary_mode === 'mixed') {
      lines.push('', reportText(language, 'technicalRecord'),
        `${copy.frame}: ${path.basename(preview.project_path ?? preview.materialized_path ?? '')}`,
        `${copy.operation}: ${record.id}`,
        ...(record.stage ? [`${copy.stage}: ${record.stage}`] : []),
        ...(record.region ? [`${copy.region}: ${record.region}`] : []));
    }
    return `${lines.join('\n')}\n`;
  }
  const lines = [
    `${copy.frame}: ${path.basename(preview.project_path ?? preview.materialized_path ?? '')}`,
    `${copy.operation}: ${record.id}`,
    ...(record.stage ? [`${copy.stage}: ${record.stage}`] : []),
    ...(record.region ? [`${copy.region}: ${record.region}`] : []),
    '',
    copy.before,
    beforeCommentary ?? copy.missing,
  ];
  if (record.report) {
    lines.push(
      '',
      copy.after,
      `${copy.did}: ${record.report.did}`,
      `${copy.why}: ${record.report.why}`,
      `${copy.result}: ${record.report.result}`
    );
  }
  return `${lines.join('\n')}\n`;
}

export { sidecarLanguage, commentaryText, prePassCommentary, lowerInitial, sentenceWithoutTerminalPunctuation, artisticObservedResult, completedArtisticSentence, artisticToolDescription };
