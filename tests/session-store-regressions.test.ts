import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commentaryLanguageNotice, paintingDevelopmentProvenance, paintingMethodUsage, SessionStore } from '../src/core/guard/session-store.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createJob, writeJobCompleted } from '../src/core/guard/async-job.js';
import { RUNTIME_STATE_VERSION } from '../src/core/guard/protocol-version.js';
import { transformGeometryBinding } from '../src/core/geometry-binding.js';
import { previewToCanvasAffine } from '../src/core/spatial-support.js';

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function store() {
  const dir = mkdtempSync(path.join(tmpdir(), 'session-store-regression-'));
  dirs.push(dir);
  return new SessionStore(path.join(dir, 'controller'), {
    visualBarrierDirectory: path.join(dir, 'barriers'),
    workspaceRoot: dir,
  });
}

describe('E.17 artistic frame commentary', () => {
  it.each(['ru', 'en'].flatMap(language => ['short', 'normal', 'detailed'].map(detail => ({ language, detail }))))(
    'uses the saved primary language=$language throughout $detail commentary independently of verbosity', ({ language, detail }) => {
      const s = store() as any;
      s.setUserConfig({ language, commentary_mode: 'artistic', commentary_detail: detail }, 42);
      expect(s.presentationContext(42)).toMatchObject({ language, commentary_mode: 'artistic', commentary_detail: detail });
      const intent = language === 'ru' ? 'Смягчить края проёма, сохранив глубину.' : 'Soften the recess edges while preserving depth.';
      const observed = language === 'ru' ? 'Края мягче, но глубина ещё недостаточна.' : 'Edges are softer, but depth is still insufficient.';
      const commentPath = path.join(dirs[dirs.length - 1], 'primary-language.txt');
      s.writeCommentarySidecar({ id: 'primary', phase: 'completed', visual: true,
        tool: 'photoshop_apply_gaussian_blur', artistic_commentary: intent, args: { document_id: 42, radius: 8 },
        preview: { commentary_path: commentPath }, verdict: { observed_change: observed },
        report: { source: 'guard_compact_closure', did: 'Recorded.', why: intent, result: observed } });
      const text = readFileSync(commentPath, 'utf8');
      expect(text.split('\n')[0]).toBe(intent);
      expect(text).toContain(observed);
      expect(text).toContain(language === 'ru' ? 'В Photoshop я использую' : 'In Photoshop I use');
      if (detail !== 'short') expect(text).toContain(language === 'ru' ? 'радиус 8 px' : 'radius 8 px');
      const nextLanguage = language === 'ru' ? 'en' : 'ru';
      s.setUserConfig({ language: nextLanguage }, 42);
      expect(s.presentationContext(42)).toMatchObject({ language: nextLanguage, commentary_mode: 'artistic', commentary_detail: detail });
      const notice = commentaryLanguageNotice({ artistic_commentary: intent }, s.presentationContext(42));
      expect(notice?.expected_language).toBe(nextLanguage);
      expect(notice?.repair).toContain(nextLanguage === 'ru' ? 'на русском языке' : 'in English');
    }
  );
  it.each(['ru', 'en'])('repairs localized pre-pass narration during ordinary closure without changing its goal in %s', async language => {
    const s = store() as any;
    s.presentationContext = () => ({ language, commentary_mode: 'artistic', commentary_detail: 'detailed' });
    const original = language === 'ru' ? 'Construct a worn stairwell.' : 'Построить обветшалую лестничную клетку.';
    const localized = language === 'ru' ? 'Построить обветшалую лестничную клетку.' : 'Construct a worn stairwell.';
    const observed = language === 'ru' ? 'Проём читается, но стены всё ещё слишком плоские.' : 'The recess reads, but the walls remain too flat.';
    const commentPath = path.join(dirs[dirs.length - 1], 'localized.txt');
    const record = { id: 'localize', tool: 'photoshop_paint_regions', phase: 'completed', visual: true,
      goal: original, summary: original, artistic_commentary: original, args: { document_id: 42 }, preview: { commentary_path: commentPath } };
    s.read = () => record;
    expect(commentaryLanguageNotice(record, s.presentationContext())?.expected_language).toBe(language);
    const compiled = await compileGuardCycle({ previous_operation_id: record.id,
      previous_observation: { observed, target: 'unresolved', artistic_commentary: localized } }, {
      collectClosePreviousErrors: () => [], collectPreflightErrors: () => [],
      compactClosureDefaults: (id, verdict) => s.compactClosureDefaults(id, verdict),
    }, new ToolRegistry());
    expect(compiled.rejection).toBeUndefined();
    expect(compiled.input.previous_visual_verdict).toMatchObject({ artistic_commentary: localized, observed_change: observed, target_resolved: 'no' });
    const corrected = { ...record, verdict: compiled.input.previous_visual_verdict,
      report: { ...(compiled.input.previous_report as object), source: 'guard_compact_closure' } };
    s.writeCommentarySidecar(corrected);
    const text = readFileSync(commentPath, 'utf8');
    expect(text.split('\n')[0]).toBe(localized);
    expect(text).toContain(observed);
    expect(text).not.toContain(original);
    expect(corrected.goal).toBe(original);
    expect(corrected.artistic_commentary).toBe(original);
    expect(commentaryLanguageNotice(corrected, s.presentationContext())).toBeUndefined();
  });

  it.each(['short', 'normal', 'detailed'])('honors %s detail while retaining intent and full observed limitations', detail => {
    const s = store() as any;
    s.presentationContext = () => ({ language: 'ru', commentary_mode: 'artistic', commentary_detail: detail });
    const commentPath = path.join(dirs[dirs.length - 1], 'detail.txt');
    const intent = 'Хочу мягко связать износ стен с тёмным проёмом.';
    const observed = 'Пятна стали разнообразнее, но всё ещё выглядят геометричными; объём стен не исправлен.';
    const record = { id: 'details', tool: 'photoshop_execute_visual_microplan', phase: 'completed', visual: true,
      artistic_commentary: intent, args: { document_id: 42, logical_layer: { layer_name: 'Стены' }, steps: [
        { tool: 'photoshop_paint_regions', args: { regions: [{ color: { red: 19, green: 20, blue: 17 }, opacity: 80 }] } },
        { tool: 'photoshop_select_brush_preset', args: { name: 'Soft Round' } },
        { tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'BRUSH', size: 47, opacity: 28, flow: 14 }] } },
      ] }, preview: { commentary_path: commentPath }, verdict: { observed_change: observed },
      report: { source: 'guard_compact_closure', did: 'Выполнено.', why: intent, result: observed } };
    s.writeCommentarySidecar(record);
    const text = readFileSync(commentPath, 'utf8');
    expect(text.split('\n')[0]).toBe(intent);
    expect(text).toContain(observed);
    expect(text).toContain('заливку контуров, кисть');
    if (detail === 'short') expect(text).not.toMatch(/Soft Round|Рабочий слой|размер 47/);
    else for (const value of ['Стены', 'Soft Round', 'размер 47 px', 'непрозрачность 28%', 'поток 14%']) expect(text).toContain(value);
    if (detail === 'detailed') expect(text).toContain('RGB(19, 20, 17), непрозрачность 80%');
    else expect(text).not.toContain('RGB(');
    if (detail === 'normal') expect(text).toContain('Контурных заливок: 1');
  });
  it.each(['artistic', 'mixed'])('preserves artistic intent, Photoshop craft and full observed limitations in %s frame comments', mode => {
    const s = store() as any;
    s.presentationContext = () => ({ language: 'ru', commentary_mode: mode, commentary_detail: 'detailed' });
    const dir = dirs[dirs.length - 1];
    const commentPath = path.join(dir, 'frame.txt');
    const intent = 'Отделить три слоя гор, сохранив силуэт и пространство для храмового комплекса.';
    const observed = 'Дальний план уже читается: три слоя гор дают глубину, но сейчас они ещё слишком геометричные. Я оставляю их как конструктивную основу и позже смягчу туманом и воздушной перспективой. Следующий проход — крупный силуэт храмового комплекса с воротами и дальней пагодой.';
    const record = {
      id: 'mountain-pass', tool: 'photoshop_execute_visual_microplan', visual: true, phase: 'completed',
      summary: intent, artistic_commentary: intent,
      args: { document_id: 42, steps: [
        { tool: 'photoshop_select_layer_by_name', args: { name: 'Дальние горы' } },
        { tool: 'photoshop_paint_regions', args: { regions: [{ color: { red: 126, green: 134, blue: 153 }, opacity: 100 }] } },
        { tool: 'photoshop_select_brush_preset', args: { name: 'Soft Round' } },
        { tool: 'photoshop_set_brush', args: { size: 150, hardness: 18, opacity: 48, flow: 24 } },
        { tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'BRUSH', points: [] }] } },
        { tool: 'photoshop_set_brush', args: { size: 40, spacing: 15, smoothing: 10 } },
        { tool: 'photoshop_apply_gaussian_blur', args: { radius: 8 } },
        { tool: 'photoshop_apply_gradient_mask', args: { direction: 'right_to_left', start_pct: 0, end_pct: 35 } },
        { tool: 'photoshop_set_layer_blend_mode', args: { blendMode: 'SCREEN' } },
        { tool: 'photoshop_paint_color_gradient', args: {
          from: { x: 0, y: 0 }, to: { x: 0, y: 100 },
          stops: [{ position: 0, red: 10, green: 20, blue: 30 }, { position: 1, red: 40, green: 50, blue: 60 }],
        } },
      ] },
      preview: { commentary_path: commentPath, project_path: path.join(dir, 'frame.jpg') },
    };
    s.read = () => record;
    const report = s.compactClosureDefaults(record.id, { observed_change: observed }).previous_report;
    expect(report.why).toBe(intent);
    expect(report.result).toBe(observed);
    expect(report.did).not.toContain(intent);
    s.writeCommentarySidecar({ ...record, report: { ...report, source: 'guard_compact_closure' } });
    const text = readFileSync(commentPath, 'utf8');
    for (const detail of [intent, observed, 'Дальние горы', 'заливку контуров',
      'Soft Round', 'размер 150 px', 'размер 40 px', 'жёсткость 18%', 'непрозрачность 48%', 'поток 24%',
      'интервал 15%', 'сглаживание 10%', 'радиус 8 px', 'SCREEN', '(0, 0) → (0, 100) px', 'RGB(10, 20, 30)',
      'RGB(126, 134, 153)', 'непрозрачность 100%', 'справа налево', '0% → 35%']) {
      expect(text).toContain(detail);
    }
    expect(text).not.toMatch(/Продвинуть текущую художественную задачу|результат прохода проверен и зафиксирован/);
    if (mode === 'mixed') expect(text.indexOf('Техническая запись:')).toBeGreaterThan(text.indexOf(observed));
    else expect(text).not.toMatch(/Операция:|photoshop_execute_visual_microplan/);
    s.read = () => ({ ...record, phase: 'uncertain' });
    const unobserved = s.compactClosureDefaults(record.id).previous_report;
    expect(unobserved.result).toContain('визуальный результат ещё не оценён');
    expect(unobserved.did).toContain('не подтверждено');
    s.writeCommentarySidecar({ ...record, report: { ...unobserved, source: 'guard_compact_closure' } });
    expect(readFileSync(commentPath, 'utf8')).not.toContain('Я сделал следующий шаг');
    const otherLanguage = 'The three mountain planes read clearly, but their contours are still too geometric.';
    expect(s.compactClosureDefaults(record.id, { observed_change: otherLanguage }).previous_report.result).toBe(otherLanguage);
    expect(s.compactClosureDefaults(record.id, { observations: [{ visible: observed }, { visible: otherLanguage }] }).previous_report.result)
      .toBe(`${observed}\n\n${otherLanguage}`);
  });

  it.each(['artistic', 'mixed'])('refreshes the frame and compact report from final review in %s mode', mode => {
    const s = store() as any;
    s.presentationContext = () => ({ language: 'ru', commentary_mode: mode, commentary_detail: 'detailed' });
    const dir = dirs[dirs.length - 1];
    const file = path.join(dir, 'frame.jpg');
    const commentPath = path.join(dir, 'frame.txt');
    const bytes = Buffer.from('materialized preview fixture');
    writeFileSync(file, bytes);
    writeFileSync(commentPath, 'Теперь я хочу художественный проход в области «right half of temple complex».');
    const sha = createHash('sha256').update(bytes).digest('hex');
    const intent = 'Хочу отделить дальний зал от главных ворот градиентом на маске, сохранив ворота и пагоду.';
    const observed = 'Маска скрыла почти весь храмовый комплекс, включая ворота и пагоду. Видны только небо и горы; нужен откат.';
    s.write({ id: 'temple-mask', tool: 'photoshop_apply_gradient_mask', visual: true, phase: 'completed',
      created_at: '2026-10-04T11:31:38.424Z', completed_at: '2026-10-04T11:32:30.000Z',
      summary: intent, artistic_commentary: intent,
      args: { document_id: 42, direction: 'right_to_left', start_pct: 0, end_pct: 35 },
      preview: { commentary_path: commentPath, materialized_path: file, sha256: sha, document_id: 42 },
      report: { source: 'guard_compact_closure', did: 'Выполнен запланированный художественный проход.',
        why: 'Продвинуть текущую художественную задачу запланированным проходом в Photoshop.',
        result: 'Визуальный результат прохода проверен и зафиксирован.' },
    });
    s.verdict({ id: 'temple-mask', preview_id: 'temple-mask', sha256: sha, verdict: 'neutral', disposition: 'rollback',
      observed_change: observed, observations: [{ region: 'whole frame', visible: observed }],
      primary_mismatch: 'Восстановить храмовый комплекс.', target_resolved: 'no', regressions: [],
      uncertainty: 'none observed', global_readability: 'unknown', primitive_footprint: 'unknown', trend_signals: [] });
    expect(s.read('temple-mask').report.result).toBe(observed);
    const text = readFileSync(commentPath, 'utf8');
    expect(text.split('\n')[0]).toBe(intent);
    for (const detail of [observed, 'градиент на маске', 'справа налево', '0% → 35%', 'выбран откат']) {
      expect(text).toContain(detail);
    }
    expect(text).not.toMatch(/художественный проход в области|Выполнен запланированный|Продвинуть текущую|проверен и зафиксирован/);
  });

});

describe('E.8b continuation checkpoint', () => {
  it('exports host-joinable Guard timing while leaving the inter-call gap unattributed', () => {
    const s = store() as any;
    s.currentDocumentIncarnationId = () => 'uxp:doc:42:incarnation-a';
    const record = {
      id: 'op-frame',
      args: { document_id: 42 },
      visual: true,
      latency: {
        protocol: 'photoshop.guard.cycle_latency.v1',
        response_ready_at: '2026-10-01T00:00:01.000Z',
        next_cycle_received_at: '2026-10-01T00:00:41.000Z',
        inter_call_unattributed_gap_ms: 40000,
        visual_evaluation_verdict_gap_ms: 40000,
        photoshop_dispatch_wall_ms: 1900,
      },
    };
    s.records = () => [record];
    s.currentDocumentRecords = () => [record];

    expect(s.continuationTimelineExport(42)).toMatchObject({
      protocol: 'photoshop.guard.continuation_timeline_export.v1',
      document_id: 42,
      document_incarnation: 'uxp:doc:42:incarnation-a',
      host_join_contract: {
        key: ['document_id', 'document_incarnation', 'operation_id'],
        inter_call_interval_semantics: 'unattributed_until_host_join',
      },
      operations: [{
        operation_id: 'op-frame',
        join_key: { document_id: 42, document_incarnation: 'uxp:doc:42:incarnation-a', operation_id: 'op-frame' },
        boundary_events: [
          { kind: 'guard_response_ready', at: '2026-10-01T00:00:01.000Z' },
          { kind: 'next_guard_continuation_received', at: '2026-10-01T00:00:41.000Z' },
        ],
        inter_call_interval: { duration_ms: 40000, classification: 'unattributed_until_host_join' },
        guard_latency: { photoshop_dispatch_wall_ms: 1900 },
      }],
    });
  });

  it('partitions one visual continuation with explicit review delivery and diagnostic phase markers', () => {
    const s = store() as any;
    s.currentDocumentIncarnationId = () => 'uxp:doc:42:incarnation-a';
    s.write({
      id: 'op-instrumented',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
      summary: 'Instrument one visual continuation',
      purpose: 'Measure review and planning boundaries without relabelling them as model reasoning',
      hash: 'op-instrumented-hash',
      sequence: 1,
      created_at: '2026-10-01T00:00:00.000Z',
      completed_at: '2026-10-01T00:00:01.000Z',
      phase: 'completed',
      visual: true,
      failed: false,
      preview: {
        document_id: 42,
        sha256: 'a'.repeat(64),
        materialized_path: 'frames/op-instrumented.jpg',
      },
    });
    s.recordLatency('op-instrumented', {
      cycle_received_at: '2026-10-01T00:00:00.000Z',
      response_ready_at: '2026-10-01T00:00:01.000Z',
    });
    s.recordVisualDeliveryReceipt('op-instrumented', {
      transport: 'mcp_image_content_explicit_review',
      expected_roles: ['after'],
      delivered: [{ role: 'after', sha256: 'a'.repeat(64), image_delivered_for_review: true }],
      timing: {
        request_received_at: '2026-10-01T00:00:05.000Z',
        result_ready_at: '2026-10-01T00:00:06.000Z',
      },
    });
    s.recordContinuationMarker('op-instrumented', 'review_finished', '2026-10-01T00:00:10.000Z');
    s.recordContinuationMarker('op-instrumented', 'next_pass_ready', '2026-10-01T00:00:20.000Z');
    s.closeLatency('op-instrumented', '2026-10-01T00:00:21.000Z', 7, 128);

    expect(s.read('op-instrumented').latency).toMatchObject({
      inter_call_unattributed_gap_ms: 20000,
      guard_response_to_review_request_ms: 4000,
      review_image_service_ms: 1000,
      review_delivery_to_review_finished_marker_ms: 4000,
      review_finished_to_next_pass_ready_marker_ms: 10000,
      next_pass_ready_marker_to_guard_ms: 1000,
      review_delivery_to_next_guard_ms: 15000,
    });
    expect(s.continuationTimelineExport(42)).toMatchObject({
      operations: [expect.objectContaining({
        operation_id: 'op-instrumented',
        boundary_events: [
          { kind: 'guard_response_ready', at: '2026-10-01T00:00:01.000Z' },
          { kind: 'review_image_request_received', at: '2026-10-01T00:00:05.000Z' },
          { kind: 'review_image_result_ready', at: '2026-10-01T00:00:06.000Z' },
          { kind: 'review_finished_marker_received', at: '2026-10-01T00:00:10.000Z' },
          { kind: 'next_pass_ready_marker_received', at: '2026-10-01T00:00:20.000Z' },
          { kind: 'next_guard_continuation_received', at: '2026-10-01T00:00:21.000Z' },
        ],
        diagnostic_partition: {
          marker_semantics: 'server_observed_diagnostic_boundaries_not_pure_model_reasoning_time',
          guard_response_to_review_request_ms: 4000,
          review_image_service_ms: 1000,
          review_delivery_to_review_finished_marker_ms: 4000,
          review_finished_to_next_pass_ready_marker_ms: 10000,
          next_pass_ready_marker_to_guard_ms: 1000,
          review_delivery_to_next_guard_ms: 15000,
        },
      })],
    });
  });

  it('rejects diagnostic next-pass-ready timing before review completion is marked', () => {
    const s = store() as any;
    s.write({
      id: 'op-marker-order',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
      summary: 'Reject out-of-order marker',
      purpose: 'Keep diagnostic partitions monotonic',
      hash: 'op-marker-order-hash',
      sequence: 1,
      created_at: '2026-10-01T00:00:00.000Z',
      completed_at: '2026-10-01T00:00:01.000Z',
      phase: 'completed',
      visual: true,
      failed: false,
      preview: { document_id: 42, sha256: 'b'.repeat(64), materialized_path: 'frames/op-marker-order.jpg' },
    });
    s.recordVisualDeliveryReceipt('op-marker-order', {
      transport: 'mcp_image_content_explicit_review',
      expected_roles: ['after'],
      delivered: [{ role: 'after', sha256: 'b'.repeat(64), image_delivered_for_review: true }],
      timing: {
        request_received_at: '2026-10-01T00:00:05.000Z',
        result_ready_at: '2026-10-01T00:00:06.000Z',
      },
    });

    expect(() => s.recordContinuationMarker(
      'op-marker-order',
      'next_pass_ready',
      '2026-10-01T00:00:07.000Z'
    )).toThrow(/requires an earlier review_finished marker/);
  });

  it('persists a compact exact-resume projection without copying journal history', () => {
    const s = store() as any;
    s.currentDocumentIncarnationId = () => 'uxp:doc:42:incarnation-a';
    s.resume = () => ({
      document_id: 42,
      document: {
        current_frame: { operation_id: 'op-frame', sha256: 'a'.repeat(64), path: 'frames/op-frame.png' },
        accepted_frame: { operation_id: 'op-accepted', sha256: 'b'.repeat(64), path: 'frames/op-accepted.png' },
        primary_artistic_anchor: { operation_id: 'op-anchor', sha256: 'c'.repeat(64), path: 'frames/op-anchor.png' },
        active_problem: 'primaryAssembly-perspective', current_stage: 'STRUCTURE', active_scale: 'object',
        largest_open_must_fix: { severity: 'high' }, process_dir: 'processes/rigidScene-process/study-01',
        art_director: { directive_id: 'directive-7', current_task_id: 'task-3' },
      },
      pending_visual_verdict: {
        operation_id: 'op-frame', sha256: 'a'.repeat(64), materialized_path: 'frames/op-frame.png',
        canvas: { width: 1200, height: 800 }, crop: null,
      },
      last_checkpoint: { path: 'checkpoints/accepted.psd', operation_id: 'op-accepted' },
      last_operation: { id: 'op-frame' },
      next_required_action: 'inspect pending delivered frame op-frame',
      canonical_next_command: 'photoshop_guard_cycle_auto',
    });

    const persisted = s.persistContinuationCheckpoint(42);
    const checkpoint = JSON.parse(readFileSync(persisted.file, 'utf8'));
    expect(checkpoint).toMatchObject({
      protocol: 'photoshop.guard.continuation-checkpoint.v1',
      document: { id: 42, incarnation: 'uxp:doc:42:incarnation-a' },
      current_operation_id: 'op-frame',
      visual_verdict_pending: true,
      delivered_preview: { operation_id: 'op-frame', sha256: 'a'.repeat(64), materialized_path: 'frames/op-frame.png' },
      active_problem: { id: 'primaryAssembly-perspective', stage: 'STRUCTURE', scale: 'object', severity: 'high' },
      accepted_anchor: { operation_id: 'op-anchor', sha256: 'c'.repeat(64) },
      art_run: 'processes/rigidScene-process/study-01',
      planner: { directive_id: 'directive-7', task_id: 'task-3' },
      next_required_action: 'inspect pending delivered frame op-frame',
    });
    expect(JSON.stringify(checkpoint)).not.toContain('journal');
  });

  it('verifies the persisted exact continuation against authoritative durable state', () => {
    const s = store() as any;
    s.currentDocumentIncarnationId = () => 'uxp:doc:42:incarnation-a';
    const resumed = {
      document_id: 42,
      document: {
        current_frame: { operation_id: 'op-frame', sha256: 'a'.repeat(64), path: 'frames/op-frame.png' },
        accepted_frame: { operation_id: 'op-old', sha256: 'b'.repeat(64), path: 'frames/op-old.png' },
        process_dir: 'processes/rigidScene-process/study-01',
      },
      pending_visual_verdict: {
        operation_id: 'op-frame', sha256: 'a'.repeat(64), materialized_path: 'frames/op-frame.png',
        canvas: { width: 1200, height: 800 }, crop: null,
      },
      next_required_action: 'inspect pending delivered frame op-frame',
      canonical_next_command: 'photoshop_guard_cycle_auto',
    };
    s.resume = () => resumed;
    s.persistContinuationCheckpoint(42);

    expect(s.loadAndVerifyContinuationCheckpoint()).toMatchObject({
      ok: true,
      protocol: 'photoshop.guard.continuation-verification.v1',
      document: { id: 42, incarnation: 'uxp:doc:42:incarnation-a' },
      operation_id: 'op-frame',
      visual_verdict_pending: true,
      next_required_action: 'inspect pending delivered frame op-frame',
      canonical_next_command: 'photoshop_guard_cycle_auto',
    });
  });

  it('fails closed when the durable document incarnation or pending operation moved on', () => {
    const s = store() as any;
    let incarnation = 'uxp:doc:42:incarnation-a';
    let operation = 'op-frame';
    s.currentDocumentIncarnationId = () => incarnation;
    s.resume = () => ({
      document_id: 42,
      document: {
        current_frame: { operation_id: operation, sha256: 'a'.repeat(64), path: `frames/${operation}.png` },
        process_dir: 'processes/rigidScene-process/study-01',
      },
      pending_visual_verdict: {
        operation_id: operation, sha256: 'a'.repeat(64), materialized_path: `frames/${operation}.png`,
      },
      next_required_action: 'inspect pending frame',
      canonical_next_command: 'photoshop_guard_cycle_auto',
    });
    const saved = s.persistContinuationCheckpoint(42).checkpoint;

    incarnation = 'uxp:doc:42:incarnation-b';
    expect(s.verifyContinuationCheckpoint(saved)).toMatchObject({
      ok: false,
      reason: 'continuation_checkpoint_stale',
      mismatch: { field: 'document.incarnation' },
    });

    incarnation = 'uxp:doc:42:incarnation-a';
    operation = 'op-new';
    expect(s.verifyContinuationCheckpoint(saved)).toMatchObject({
      ok: false,
      reason: 'continuation_checkpoint_stale',
      mismatch: { field: 'current_operation_id', expected: 'op-frame', actual: 'op-new' },
    });
  });
});

function request(id: string, tool: string, args: Record<string, unknown> = {}) {
  return {
    id,
    tool,
    args,
    summary: `Run ${tool} for regression coverage`,
    purpose: 'Exercise Guard recovery contract with durable evidence',
  };
}

function closeReportAndAck(s: SessionStore, id: string) {
  s.report({
    id,
    did: 'Recorded the operation outcome for regression coverage',
    why: 'Allow the following evidence operation to enter the Guard journal',
    result: 'The prior operation remains durably recorded for reconciliation',
  });
  const record = s.read(id)!;
  if (record.operation_receipt && !record.operation_ack) {
    s.ackOperation({ id, token: record.operation_receipt.token });
  }
}

function writeProjectionPaintingState(s: SessionStore, documentIds: number[]) {
  mkdirSync(path.dirname(s.paintingStateFile()), { recursive: true });
  writeFileSync(s.paintingStateFile(), JSON.stringify({
    schema_version: RUNTIME_STATE_VERSION,
    version: 2,
    revision: 1,
    documents: Object.fromEntries(documentIds.map(documentId => [String(documentId), {
      document_id: documentId,
      current_stage: 'ACCEPTANCE',
    }])),
  }, null, 2));
}

function createProjectionJob(s: SessionStore, id: string, documentId: number) {
  return createJob(s.directory, {
    next_operation: {
      id,
      tool: 'photoshop_get_state',
      args: { document_id: documentId },
      summary: `Projection job ${id}`,
      purpose: 'Exercise request-local active-job projection',
    },
  }, {
    progress_id: `projection:${id}`,
    operation_id: id,
    state: 'starting',
    now: 'projection test job',
    why: 'regression coverage',
    photoshop: 'not dispatched',
    next: 'poll',
    text: 'projection test job',
  });
}

function writeProjectionRecord(
  s: SessionStore,
  input: {
    id: string;
    documentId: number;
    sequence: number;
    phase?: string;
    visual?: boolean;
    report?: boolean;
    ack?: boolean;
    verdict?: boolean;
  }
) {
  const createdAt = new Date(Date.UTC(2026, 8, 20, 12, 0, input.sequence)).toISOString();
  const record: Record<string, any> = {
    id: input.id,
    tool: input.visual ? 'photoshop_set_layer_opacity' : 'photoshop_get_state',
    args: { document_id: input.documentId },
    summary: `Projection fixture ${input.id}`,
    purpose: 'Compare legacy nested projection semantics with request-local projection semantics',
    hash: `hash-${input.id}`,
    sequence: input.sequence,
    created_at: createdAt,
    completed_at: input.phase === 'started' ? undefined : createdAt,
    phase: input.phase ?? 'completed',
    visual: !!input.visual,
    guard_ack_required: true,
    execution: input.phase === 'started' ? 'uncertain' : 'completed',
    failed: false,
  };
  if (input.report) {
    record.report = {
      id: input.id,
      did: 'Fixture report',
      why: 'Fixture parity',
      result: 'Fixture result',
      recorded_at: createdAt,
    };
  }
  if (input.ack || input.visual) {
    record.operation_receipt = {
      protocol: 'photoshop.guard.operation_receipt.v1',
      operation_id: input.id,
      token: `token-${input.id}`,
      issued_at: createdAt,
      phase: 'completed',
      execution: 'completed',
    };
  }
  if (input.ack) {
    record.operation_ack = {
      protocol: 'photoshop.guard.operation_ack.v1',
      receipt_protocol: 'photoshop.guard.operation_receipt.v1',
      receipt_token: `token-${input.id}`,
      acknowledged_at: createdAt,
    };
  }
  if (input.visual) {
    record.problem_id = `problem-${input.id}`;
    record.preview = {
      sha256: 'a'.repeat(64),
      materialized_path: path.join(s.directory, `${input.id}.jpg`),
    };
    if (input.verdict) {
      record.verdict = {
        verdict: 'improvement',
        disposition: 'accept',
        target_resolved: 'yes',
        significance: {
          execution_effect: 'meaningful',
          decoded_comparison_available: true,
          global: { changed_ratio_delta_ge_6: 0.1 },
        },
        at: createdAt,
      };
    }
  }
  s.write(record);
}

function brushPreflight() {
  return {
    completed: true,
    inventory_observed: true,
    inventory_total: 123,
    roles: [{
      role_id: 'receiverSurface-flow',
      purpose: 'Broad directional receiverSurface and reflected-light strokes.',
      material_roles: ['receiverSurface'],
      visual_intents: ['surface-flow', 'directional-mass'],
      preferred_preset: 'ReceiverSurface Brush',
      alternative_presets: ['Dry Brush'],
      effective_settings: {
        size: 120, hardness: 35, roundness: 100, opacity: 75, flow: 45, spacing: 12,
        use_pressure_size: false, use_pressure_opacity: false, airbrush: false,
        smoothing_enabled: true, smoothing: 10,
      },
      working_scale: 'medium',
      pressure_policy: 'simulated-size-opacity',
      probe_status: 'pass',
    }],
  };
}

function exclusivePackBrushPreflight() {
  const preflight = brushPreflight() as any;
  preflight.brush_pack_id = 'brush-pack-sha256:test-pack';
  preflight.roles[0].profile_id = 'media-profile-sha256:receiverSurface-flow';
  return preflight;
}

describe('Guard session-store regressions', () => {
  it.each([
    { steps: 2, failed: false, retired: true },
    { steps: 1, failed: false, retired: false },
    { steps: 2, failed: true, retired: false },
  ])('retires owner authority only after the complete bounded undo: $steps/$failed', ({ steps, failed, retired }) => {
    const s = store();
    const ownerRecord = (id: string, sequence: number, layerId: number) => ({
      ...request(id, 'photoshop_execute_visual_microplan', { document_id: 42, problem_id: 'subject-form-problem' }),
      phase: 'completed', visual: true, failed: false, sequence,
      created_at: new Date(sequence * 1000).toISOString(),
      verdict: { verdict: sequence === 1 ? 'improvement' : 'neutral', disposition: sequence === 1 ? 'accept' : 'rollback',
        target_resolved: sequence === 1 ? 'yes' : 'no', significance: { execution_effect: 'material' } },
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, change_domains: ['local-shape'],
        continuation_layers: [{ layer_id: layerId, hypothesis_id: 'subject-owner', hypothesis: id,
          rollback_value: 'moderate', construction_tier: 'primary', decision: sequence === 1 ? 'create-new' : 'adjust' }],
      }) }] },
    });
    s.write(ownerRecord('retained-owner-pass', 1, 11));
    s.write(ownerRecord('rejected-owner-pass', 2, 12));
    s.updatePaintingState(42, current => ({ ...current, pending_rollback: {
      operation_id: 'rejected-owner-pass', required_undo_steps: 2, remaining_undo_steps: 2,
    } }));
    const undo = { ...request('bounded-owner-undo', 'photoshop_undo', { document_id: 42, steps }),
      phase: 'dispatched', visual: true, sequence: 3, created_at: new Date(3000).toISOString(),
    };
    s.write(undo);
    s.complete(undo, { ...(failed ? { isError: true } : {}), content: [{ type: 'text', text: JSON.stringify({ ok: !failed }) }] });
    const source = s.read('rejected-owner-pass');
    if (retired) {
      expect(source).toMatchObject({ rolled_back: true, current_frame_authority: false, rollback: { completed: true } });
      expect(s.semanticLayerOwners(42)).toEqual([expect.objectContaining({
        layer_id: 11, hypothesis: 'retained-owner-pass', construction_revision: 'retained-owner-pass',
      })]);
      expect(s.paintingState().documents['42'].pending_rollback).toBeUndefined();
    } else {
      expect(source.rollback).toBeUndefined();
      expect(source.rolled_back).not.toBe(true);
      expect(s.semanticLayerOwners(42)[0].layer_id).toBe(12);
      expect(s.paintingState().documents['42'].pending_rollback.operation_id).toBe('rejected-owner-pass');
    }
    expect(s.artisticRecoveryForProblem(42, 'subject-form-problem', undefined)).toMatchObject({ attempt_count: 1 });
    expect(s.read('rejected-owner-pass').verdict.target_resolved).toBe('no');
  });

  it('recovers semantic layer ownership from journal evidence after restart and preserves temporary debt across ordinary continuation', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'semantic-layer-owner-restart-'));
    dirs.push(dir);
    const controller = path.join(dir, 'controller');
    const options = { visualBarrierDirectory: path.join(dir, 'barriers'), workspaceRoot: dir };
    const first = new SessionStore(controller, options);
    first.write({
      id: 'temp-owner-create',
      tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42 },
      sequence: 1,
      created_at: new Date(1000).toISOString(),
      completed_at: new Date(1001).toISOString(),
      phase: 'uncertain',
      failed: true,
      result: {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: false,
            continuation_layers: [{
              step_id: 'temp-layer',
              layer_id: 12,
              layer_name: 'PrimaryOwner Temp',
              hypothesis_id: 'primaryOwner-temp',
              hypothesis: 'Temporary primaryOwner structure',
              rollback_value: 'moderate',
              temporary: true,
              decision: 'temporary-hypothesis',
            }],
          }),
        }],
      },
    });
    first.write({
      id: 'temp-owner-continue',
      tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42 },
      sequence: 2,
      created_at: new Date(2000).toISOString(),
      completed_at: new Date(2001).toISOString(),
      phase: 'completed',
      failed: false,
      result: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: true,
            continuation_layers: [{
              step_id: 'logical-layer-continuation',
              layer_id: 12,
              layer_name: 'PrimaryOwner Temp',
              hypothesis_id: 'primaryOwner-temp',
              hypothesis: 'Temporary primaryOwner structure',
              rollback_value: 'moderate',
              decision: 'continue-logical-layer',
            }],
          }),
        }],
      },
    });

    const restarted = new SessionStore(controller, options);
    expect(restarted.semanticLayerOwners(42)).toEqual([
      expect.objectContaining({
        hypothesis_id: 'primaryOwner-temp',
        layer_id: 12,
        temporary: true,
        source_operation_id: 'temp-owner-continue',
      }),
    ]);
    expect(restarted.statusCompact().documents['42'].logical_layer_owners).toEqual([
      expect.objectContaining({ hypothesis_id: 'primaryOwner-temp', layer_id: 12, temporary: true }),
    ]);
    expect(restarted.resume(42).document.logical_layer_owners).toEqual([
      expect.objectContaining({ hypothesis_id: 'primaryOwner-temp', layer_id: 12, temporary: true }),
    ]);

    const kept = restarted.keepSemanticLayerOwner({
      request_key: 'keep-primaryOwner-temp',
      document_id: 42,
      hypothesis_id: 'primaryOwner-temp',
      layer_id: 12,
      scene_ownership_plan: {
        plan_id: 'restart-scene-owners',
        units: [{
          semantic_id: 'primaryOwner',
          owner_id: 'primaryOwner-temp',
          role: 'Accepted independently editable character component',
          editability: 'independent',
          rationale: 'Promote the accepted temporary component into durable independently correctable scene ownership.',
        }],
        // A kept owner is one editable component, not a whole character
        // silently exempted from the current scene decomposition contract.
        objects: [{ object_id: 'primaryOwner-component', subject_kind: 'single-component',
          kind: 'single-part', component_semantic_ids: ['primaryOwner'] }],
      },
    });
    expect(kept.semantic_layer_lifecycle).toMatchObject({
      action: 'keep',
      hypothesis_id: 'primaryOwner-temp',
      layer_id: 12,
    });
    expect(kept.semantic_layer_lifecycle).not.toHaveProperty('rationale');
    expect(restarted.semanticLayerOwners(42)).toEqual([
      expect.objectContaining({ hypothesis_id: 'primaryOwner-temp', layer_id: 12, temporary: false, decision: 'keep' }),
    ]);
    expect(restarted.statusCompact().pending_reports).not.toContain('keep-primaryOwner-temp');
    expect(restarted.statusCompact().documents['42'].scene_ownership_plan).toMatchObject({
      protocol: 'photoshop.guard.scene_ownership_plan.v1',
      plan_id: 'restart-scene-owners',
      source_operation_id: 'keep-primaryOwner-temp',
    });
    expect(restarted.resume(42).document.scene_ownership_plan).toMatchObject({
      plan_id: 'restart-scene-owners',
      source_operation_id: 'keep-primaryOwner-temp',
    });

    restarted.write({
      id: 'discard-temp-owner',
      tool: 'photoshop_delete_layer',
      args: { document_id: 42, layer_id: 12 },
      sequence: 4,
      created_at: new Date(3000).toISOString(),
      completed_at: new Date(3001).toISOString(),
      phase: 'completed',
      failed: false,
      result: { content: [{ type: 'text', text: '{"ok":true}' }] },
    });
    expect(restarted.semanticLayerOwners(42)).toEqual([]);
  });

  it('projects a bounded physical layer stack for one semantic owner and reconciles deleted bindings', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'semantic-owner-stack-'));
    dirs.push(dir);
    const store = new SessionStore(path.join(dir, 'controller'), {
      visualBarrierDirectory: path.join(dir, 'barriers'), workspaceRoot: dir,
    });
    const ownerRecord = (id: string, sequence: number, layerId: number) => ({
      id,
      tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42 },
      sequence,
      created_at: new Date(sequence * 1000).toISOString(),
      completed_at: new Date(sequence * 1000 + 1).toISOString(),
      phase: 'completed',
      failed: false,
      result: { content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        continuation_layers: [{
          layer_id: layerId,
          layer_name: `PrimaryForm ${layerId}`,
          hypothesis_id: 'primaryForm-owner',
          hypothesis: 'PrimaryForm semantic owner',
          decision: sequence === 1 ? 'create-new' : 'continue-logical-layer',
        }],
      }) }] },
    });
    store.write(ownerRecord('primaryForm-base', 1, 12));
    store.write(ownerRecord('primaryForm-overlay-migration', 2, 13));

    expect(store.semanticLayerOwners(42)).toEqual([
      expect.objectContaining({
        hypothesis_id: 'primaryForm-owner',
        layer_id: 13,
        physical_layer_ids: [12, 13],
      }),
    ]);
    expect(store.compactPassContext(42).logical_layer_owners[0]).toEqual(expect.objectContaining({
      hypothesis_id: 'primaryForm-owner',
      physical_layer_ids: [12, 13],
    }));

    store.write({
      id: 'delete-primaryForm-overlay',
      tool: 'photoshop_delete_layer',
      args: { document_id: 42, layer_id: 13 },
      sequence: 3,
      created_at: new Date(3000).toISOString(),
      completed_at: new Date(3001).toISOString(),
      phase: 'completed',
      failed: false,
    });
    expect(store.semanticLayerOwners(42)).toEqual([
      expect.objectContaining({
        hypothesis_id: 'primaryForm-owner',
        layer_id: 12,
        physical_layer_ids: [12],
      }),
    ]);
  });

  it('reconciles stale semantic bindings from an authoritative layer inventory after external delete or undo', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'semantic-owner-external-layer-reconcile-'));
    dirs.push(dir);
    const store = new SessionStore(path.join(dir, 'controller'), {
      visualBarrierDirectory: path.join(dir, 'barriers'), workspaceRoot: dir,
    });
    const ownerRecord = (id: string, sequence: number, layerId: number) => ({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, sequence,
      created_at: new Date(sequence * 1000).toISOString(), completed_at: new Date(sequence * 1000 + 1).toISOString(),
      phase: 'completed', failed: false,
      result: { content: [{ type: 'text', text: JSON.stringify({
        ok: true, continuation_layers: [{ layer_id: layerId, hypothesis_id: 'primaryForm-owner', decision: 'continue-logical-layer' }],
      }) }] },
    });
    store.write(ownerRecord('primaryForm-old', 1, 12));
    store.write(ownerRecord('primaryForm-current', 2, 13));
    store.write({
      id: 'layers-after-external-delete', tool: 'photoshop_get_layers', args: { document_id: 42 }, sequence: 3,
      created_at: new Date(3000).toISOString(), completed_at: new Date(3001).toISOString(), phase: 'completed', failed: false,
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, layers: [{ id: 12, name: 'PrimaryForm base' }] }) }] },
    });
    expect(store.semanticLayerOwners(42)[0]).toEqual(expect.objectContaining({ layer_id: 12, physical_layer_ids: [12] }));

    store.write({
      id: 'layers-after-external-undo', tool: 'photoshop_get_layers', args: { document_id: 42 }, sequence: 4,
      created_at: new Date(4000).toISOString(), completed_at: new Date(4001).toISOString(), phase: 'completed', failed: false,
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, layers: [] }) }] },
    });
    expect(store.semanticLayerOwners(42)).toEqual([]);
  });

  it('reconciles the authoritative semantic binding after a successful explicit cross-layer migration', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'semantic-owner-migration-'));
    dirs.push(dir);
    const store = new SessionStore(path.join(dir, 'controller'), {
      visualBarrierDirectory: path.join(dir, 'barriers'), workspaceRoot: dir,
    });
    const ownerRecord = (id: string, sequence: number, layerId: number) => ({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, sequence,
      created_at: new Date(sequence * 1000).toISOString(),
      completed_at: new Date(sequence * 1000 + 1).toISOString(),
      phase: 'completed', failed: false,
      result: { content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        continuation_layers: [{ layer_id: layerId, hypothesis_id: 'primaryForm-owner', decision: 'continue-logical-layer' }],
      }) }] },
    });
    store.write(ownerRecord('primaryForm-old', 1, 12));
    store.write(ownerRecord('primaryForm-current', 2, 13));
    store.write({
      id: 'primaryForm-migrate-back', tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42 }, sequence: 3,
      created_at: new Date(3000).toISOString(), completed_at: new Date(3001).toISOString(),
      phase: 'completed', failed: false,
      correction_scope: { semantic_owner_ids: ['primaryForm-owner'] },
      cross_layer_correction: {
        mode: 'migration', current_layer_id: 13, target_layer_ids: [12],
        post_authoritative_layer_id: 12, reason: 'Restore the surviving structural primaryForm binding.',
      },
      result: { content: [{ type: 'text', text: '{"ok":true}' }] },
    });
    expect(store.semanticLayerOwners(42)).toEqual([
      expect.objectContaining({
        hypothesis_id: 'primaryForm-owner',
        layer_id: 12,
        physical_layer_ids: [12, 13],
        source_operation_id: 'primaryForm-migrate-back',
      }),
    ]);
  });

  it('preserves correction authority and ignores rolled-back cross-layer migration ownership', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'semantic-owner-correction-rollback-'));
    dirs.push(dir);
    const store = new SessionStore(path.join(dir, 'controller'), {
      visualBarrierDirectory: path.join(dir, 'barriers'), workspaceRoot: dir,
    });
    const ownerRecord = (id: string, sequence: number, layerId: number) => ({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, sequence,
      created_at: new Date(sequence * 1000).toISOString(), completed_at: new Date(sequence * 1000 + 1).toISOString(),
      phase: 'completed', failed: false,
      result: { content: [{ type: 'text', text: JSON.stringify({
        ok: true, continuation_layers: [{ layer_id: layerId, hypothesis_id: 'primaryForm-owner', decision: 'continue-logical-layer' }],
      }) }] },
    });
    store.write(ownerRecord('primaryForm-old', 1, 12));
    store.write(ownerRecord('primaryForm-current', 2, 13));
    store.write({
      id: 'primaryForm-historical-correction', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      sequence: 3, created_at: new Date(3000).toISOString(), completed_at: new Date(3001).toISOString(),
      phase: 'completed', failed: false, correction_scope: { semantic_owner_ids: ['primaryForm-owner'] },
      cross_layer_correction: { mode: 'correction', current_layer_id: 13, target_layer_ids: [12], post_authoritative_layer_id: 13, reason: 'Correct only the historical primaryForm underpaint.' },
      result: { content: [{ type: 'text', text: '{"ok":true}' }] },
    });
    expect(store.semanticLayerOwners(42)[0]).toEqual(expect.objectContaining({ layer_id: 13, physical_layer_ids: [12, 13] }));

    store.write({
      id: 'primaryForm-rolled-back-migration', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      sequence: 4, created_at: new Date(4000).toISOString(), completed_at: new Date(4001).toISOString(),
      phase: 'completed', failed: false, rolled_back: true, correction_scope: { semantic_owner_ids: ['primaryForm-owner'] },
      cross_layer_correction: { mode: 'migration', current_layer_id: 13, target_layer_ids: [12], post_authoritative_layer_id: 12, reason: 'Tentative migration that was subsequently rolled back.' },
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, continuation_layers: [{ layer_id: 12, hypothesis_id: 'primaryForm-owner' }] }) }] },
    });
    expect(store.semanticLayerOwners(42)[0]).toEqual(expect.objectContaining({ layer_id: 13, physical_layer_ids: [12, 13] }));
  });

  it('derives primitive-dominance provenance from successful visual history up to the exact current frame', () => {
    const records = [
      {
        id: 'block-1', sequence: 1, phase: 'completed', failed: false, visual: true,
        tool: 'photoshop_execute_visual_microplan',
        args: { document_id: 42, stage: 'GLOBAL_BLOCK_IN', steps: [{ tool: 'photoshop_paint_regions' }] },
        verdict: { disposition: 'accept', artistic_value: { execution_changed: true } },
      },
      {
        id: 'block-2', sequence: 2, phase: 'completed', failed: false, visual: true,
        tool: 'photoshop_execute_visual_microplan',
        args: { document_id: 42, stage: 'SHAPE', steps: [{ tool: 'photoshop_paint_regions' }] },
        verdict: { disposition: 'accept', artistic_value: { execution_changed: true } },
      },
      {
        id: 'late-replace', sequence: 3, phase: 'completed', failed: false, visual: true,
        tool: 'photoshop_execute_visual_microplan',
        args: {
          document_id: 42, stage: 'FORM', action_class: 'REPLACE',
          steps: [{ tool: 'photoshop_paint_regions' }],
        },
        verdict: { disposition: 'accept', artistic_value: { execution_changed: true } },
      },
      {
        id: 'noop-brush', sequence: 4, phase: 'completed', failed: false, visual: true,
        tool: 'photoshop_execute_visual_microplan',
        args: { document_id: 42, stage: 'FORM_AND_LIGHT', steps: [{ tool: 'photoshop_paint_strokes' }] },
        verdict: { disposition: 'accept', artistic_value: { execution_changed: false } },
      },
      {
        id: 'form-brush', sequence: 5, phase: 'completed', failed: false, visual: true,
        tool: 'photoshop_execute_visual_microplan',
        args: { document_id: 42, stage: 'FORM_AND_LIGHT', steps: [{ tool: 'photoshop_paint_strokes' }] },
        verdict: { disposition: 'accept', artistic_value: { execution_changed: true } },
      },
      {
        id: 'future', sequence: 6, phase: 'completed', failed: false, visual: true,
        tool: 'photoshop_execute_visual_microplan',
        args: { document_id: 42, stage: 'DETAIL', steps: [{ tool: 'photoshop_paint_dabs' }] },
        verdict: { disposition: 'accept', artistic_value: { execution_changed: true } },
      },
    ];

    expect(paintingDevelopmentProvenance(records, 42, 'block-2')).toEqual({
      region_construction_operations: 2,
      post_blockin_markmaking_operations: 0,
      post_blockin_markmaking_tools: [],
      blockin_primitive_dominance: true,
    });
    expect(paintingDevelopmentProvenance(records, 42, 'noop-brush')).toEqual({
      region_construction_operations: 2,
      post_blockin_markmaking_operations: 0,
      post_blockin_markmaking_tools: [],
      blockin_primitive_dominance: true,
    });
    expect(paintingDevelopmentProvenance(records, 42, 'form-brush')).toEqual({
      region_construction_operations: 2,
      post_blockin_markmaking_operations: 1,
      post_blockin_markmaking_tools: ['photoshop_paint_strokes'],
      blockin_primitive_dominance: false,
    });
  });
  it('summarizes effective tool, method and brush usage from durable visual operations', () => {
    const records = [
      { id: 'regions', phase: 'completed', visual: true, tool: 'photoshop_execute_visual_microplan', args: {
        document_id: 42, stage: 'GLOBAL_BLOCK_IN', method_class: 'region', problem_id: 'primaryForm-shape',
        steps: [{ tool: 'photoshop_paint_regions', method_id: 'region-block-in' }],
      }, verdict: { disposition: 'accept' } },
      { id: 'brush', phase: 'completed', visual: true, tool: 'photoshop_execute_visual_microplan', args: {
        document_id: 42, stage: 'MATERIAL', method_class: 'preset-brush', problem_id: 'primaryForm-shape',
        paint_strategy: { brush_role: 'organicInstances-breakup', preset_name: 'Bristle Scatter' },
        steps: [{ tool: 'photoshop_select_brush_preset' }, { tool: 'photoshop_paint_strokes', method_id: 'installed-brush-preset' }],
      }, verdict: { disposition: 'accept' } },
      { id: 'other-doc', phase: 'completed', visual: true, tool: 'photoshop_execute_visual_microplan', args: {
        document_id: 99, method_class: 'paint', steps: [{ tool: 'photoshop_paint_dabs' }],
      } },
    ];
    expect(paintingMethodUsage(records, 42)).toMatchObject({
      visual_microplan_operations: 2,
      mutation_operations: 2,
      distinct_tools_used: 3,
      distinct_method_classes_used: 2,
      distinct_method_ids_used: 2,
      distinct_brush_roles_used: 1,
      distinct_brush_presets_used: 1,
      tool_usage: { photoshop_paint_regions: 1, photoshop_select_brush_preset: 1, photoshop_paint_strokes: 1 },
      method_class_usage: { region: 1, 'preset-brush': 1 },
      brush_role_usage: { 'organicInstances-breakup': 1 },
      brush_preset_usage: { 'Bristle Scatter': 1 },
      problem_usage: { 'primaryForm-shape': 2 },
      outcome_usage: { accepted: 2 },
    });
  });
  it('uses mutation-risk checkpoint debt instead of planarForm-clock age or a fixed visual-pass count', () => {
    const s = store();
    for (let sequence = 1; sequence <= 7; sequence++) {
      const id = `checkpoint-low-${sequence}`;
      writeProjectionRecord(s, { id, documentId: 42, sequence, visual: true, report: true, ack: true, verdict: true });
      const record = s.read(id)!;
      record.tool = 'photoshop_execute_visual_microplan';
      record.args = {
        document_id: 42,
        risk: 'low',
        action_class: 'ADD',
        steps: [
          { id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 1, y: 1 }] } },
          { id: 'preview', tool: 'photoshop_get_preview', args: {} },
        ],
      };
      s.write(record);
    }
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 20, 12, 30, 0));
    const aged = s.checkpointState(42);
    expect(aged.age_seconds).toBeGreaterThan(5 * 60);
    expect(aged.uncheckpointed_visual_operations).toBe(7);
    expect(aged.debt_points).toBe(7);
    expect(aged.due).toBe(false);

    writeProjectionRecord(s, {
      id: 'checkpoint-high-risk', documentId: 42, sequence: 8,
      visual: true, report: true, ack: true, verdict: true,
    });
    const high = s.read('checkpoint-high-risk')!;
    high.tool = 'photoshop_execute_visual_microplan';
    high.args = {
      document_id: 42,
      risk: 'high',
      action_class: 'ERASE',
      steps: [
        { id: 'erase', tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'ERASER' }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    };
    s.write(high);
    const risky = s.checkpointState(42);
    expect(risky.debt_points).toBeGreaterThanOrEqual(risky.debt_limit);
    expect(risky.due).toBe(true);
    expect(risky.reason).toMatch(/checkpoint debt/);

    const compact = s.statusCompact() as any;
    expect(compact.documents['42'].checkpoint_due_before_next_visual_mutation).toBe(true);
    expect(compact.documents['42'].checkpoint_due_reason).toMatch(/checkpoint debt/);
    expect(compact.documents['42'].checkpoint_state).toMatchObject({
      due: true,
      debt_points: risky.debt_points,
      debt_limit: risky.debt_limit,
    });

    const resumed = s.resume(42) as any;
    expect(resumed.checkpoint_due_before_next_visual_mutation).toBe(true);
    expect(resumed.checkpoint_due_reason).toBe(compact.documents['42'].checkpoint_due_reason);
    expect(resumed.checkpoint_state).toEqual(compact.documents['42'].checkpoint_state);
  });

  it('does not allow legacy replan prose to bypass the stage-priority gate', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/priority-gate-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    s.updatePaintingState(42, (current: any) => ({
      ...current,
      visual_problems: {
        'global-shape': {
          problem_id: 'global-shape', scale: 'global', severity: 'must-fix', status: 'open',
        },
      },
      active_problem: {
        problem_id: 'global-shape', scale: 'global', severity: 'must-fix', status: 'open',
      },
    }));

    const errors = s.collectPreflightErrors({
      ...request('legacy-replan-override', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        stage: 'DETAIL',
        scale: 'small',
      }),
      problem_id: 'detail-pass',
      stage: 'DETAIL',
      scale: 'small',
      replan: 'override diagnostic probe test',
    });
    expect(errors.join('\n')).toMatch(/stage_priority_gate/);
  });

  it('prunes non-ancestral mixed trend evidence before the priority gate blocks finer work', () => {
    const s = store();
    const visual = (id: string, sequence: number, authority = true) => {
      writeProjectionRecord(s, { id, documentId: 42, sequence, visual: true, report: true, ack: true, verdict: true });
      const record = s.read(id)! as any;
      record.verdict.trend_signals = ['edge-noise'];
      record.args = { document_id: 42, region: 'primaryForm', scale: 'medium' };
      if (!authority) record.current_frame_authority = false;
      s.write(record);
    };
    visual('trend-live', 1, true);
    visual('trend-superseded', 2, false);
    s.updatePaintingState(42, (current: any) => ({
      ...current,
      visual_problems: {
        'cumulative-trend-edge-noise': {
          problem_id: 'cumulative-trend-edge-noise', trend_signal: 'edge-noise', scale: 'medium',
          severity: 'must-fix', status: 'open', promotion_reason: 'localized_repeated_evidence', trend_count: 2,
          source_operations: ['trend-live', 'trend-superseded'],
          supporting_evidence: [{ operation_id: 'trend-live' }, { operation_id: 'trend-superseded' }],
          supporting_regions: [{ operation_id: 'trend-live' }, { operation_id: 'trend-superseded' }],
        },
      },
    }));

    expect(s.cumulativeTrendState(42).triggered).toBe(false);
    const errors = s.collectPreflightErrors({
      ...request('fine-after-supersede', 'photoshop_execute_visual_microplan', { document_id: 42, stage: 'DETAIL', scale: 'small' }),
      problem_id: 'fine-after-supersede', stage: 'DETAIL', scale: 'small',
    });
    expect(errors.join('\n')).not.toMatch(/stage_priority_gate/);
    const reconciled = s.reconcileTrendEvidenceToCurrentFrame(s.paintingState().documents['42'], s.records()) as any;
    expect(reconciled.visual_problems['cumulative-trend-edge-noise']).toMatchObject({
      status: 'resolved', trend_count: 1, source_operations: ['trend-live'], resolution_reason: 'source_evidence_non_ancestral',
    });
  });

  it('retires a non-trend blocker whose only source no longer has current-frame authority', () => {
    const s = store();
    writeProjectionRecord(s, { id: 'stale-form-source', documentId: 42, sequence: 1, visual: true, report: true, ack: true, verdict: true });
    const stale = s.read('stale-form-source')! as any;
    stale.current_frame_authority = false;
    s.write(stale);
    s.updatePaintingState(42, (current: any) => ({
      ...current,
      visual_problems: {
        'form-blocker': {
          problem_id: 'form-blocker', scale: 'medium', severity: 'must-fix', status: 'open',
          source_operation_id: 'stale-form-source',
        },
      },
    }));

    const errors = s.collectPreflightErrors({
      ...request('fine-after-stale-form', 'photoshop_execute_visual_microplan', { document_id: 42, stage: 'DETAIL', scale: 'small' }),
      problem_id: 'fine-after-stale-form', stage: 'DETAIL', scale: 'small',
    });
    expect(errors.join('\n')).not.toMatch(/stage_priority_gate/);
    const reconciled = s.reconcileDerivedProblemEvidenceToCurrentFrame(s.paintingState().documents['42'], s.records()) as any;
    expect(reconciled.visual_problems['form-blocker']).toMatchObject({
      status: 'resolved', resolution_reason: 'source_evidence_non_ancestral',
    });
    const durable = JSON.parse(readFileSync(s.paintingStateFile(), 'utf8'));
    expect(durable.documents['42'].visual_problems['form-blocker']).toMatchObject({
      status: 'resolved', resolution_reason: 'source_evidence_non_ancestral',
    });
    expect(durable.documents['42'].visual_problems['form-blocker'].source_operation_id).toBeUndefined();
    expect(s.statusCompact().documents['42'].next_required_action).not.toContain('form-blocker');
  });

  it('retires evidence from a superseded branch after exact frame restoration while preserving ancestral support', () => {
    const s = store();
    const visual = (id: string, sequence: number, parent?: string) => {
      writeProjectionRecord(s, { id, documentId: 42, sequence, visual: true, report: true, ack: true, verdict: true });
      const record = s.read(id)! as any;
      if (parent) record.baseline_preview_source_operation_id = parent;
      s.write(record);
    };
    visual('branch-root', 1);
    visual('branch-live', 2, 'branch-root');
    visual('branch-abandoned', 3, 'branch-live');
    visual('branch-restore', 4, 'branch-abandoned');
    const restore = s.read('branch-restore')! as any;
    restore.verdict.recovery = { anchor_operation_id: 'branch-live' };
    s.write(restore);
    s.updatePaintingState(42, (current: any) => ({
      ...current,
      current_frame: { operation_id: 'branch-restore', sha256: 'restored' },
      visual_problems: {
        'branch-debt': {
          problem_id: 'branch-debt', scale: 'medium', severity: 'must-fix', status: 'open',
          source_operations: ['branch-live', 'branch-abandoned'],
          supporting_evidence: [{ operation_id: 'branch-live' }, { operation_id: 'branch-abandoned' }],
        },
      },
    }));

    const current = s.paintingState().documents['42'];
    expect(s.recordHasCurrentFrameAuthority(s.read('branch-live'), current, s.records())).toBe(true);
    expect(s.recordHasCurrentFrameAuthority(s.read('branch-abandoned'), current, s.records())).toBe(false);
    const reconciled = s.reconcileDerivedProblemEvidenceToCurrentFrame(current, s.records()) as any;
    expect(reconciled.visual_problems['branch-debt']).toMatchObject({
      status: 'open', source_operations: ['branch-live'],
      supporting_evidence: [{ operation_id: 'branch-live' }],
    });
  });

  it('rejects priority reclassification evidence from an abandoned frame branch', () => {
    const s = store();
    const visual = (id: string, sequence: number, parent?: string) => {
      writeProjectionRecord(s, { id, documentId: 42, sequence, visual: true, report: true, ack: true, verdict: true });
      const record = s.read(id)! as any;
      if (parent) record.baseline_preview_source_operation_id = parent;
      s.write(record);
    };
    visual('priority-root', 1);
    visual('priority-live', 2, 'priority-root');
    visual('priority-abandoned', 3, 'priority-live');
    visual('priority-restore', 4, 'priority-abandoned');
    const restore = s.read('priority-restore')! as any;
    restore.verdict.recovery = { anchor_operation_id: 'priority-live' };
    s.write(restore);
    s.updatePaintingState(42, (current: any) => ({
      ...current,
      current_frame: { operation_id: 'priority-restore', sha256: 'restored' },
      visual_problems: {
        'shape-debt': { problem_id: 'shape-debt', scale: 'medium', severity: 'must-fix', status: 'open' },
      },
    }));

    expect(() => s.setPriorityState({
      document_id: 42,
      evidence_operation_id: 'priority-abandoned',
      problems: [{ problem_id: 'shape-debt', scale: 'medium', severity: 'should-fix', status: 'open' }],
    })).toThrow(/priority_reclassification_evidence_stale/);

    expect(() => s.setPriorityState({
      document_id: 42,
      evidence_operation_id: 'priority-restore',
      problems: [{ problem_id: 'shape-debt', scale: 'medium', severity: 'should-fix', status: 'open' }],
    })).not.toThrow();
  });

  it('keeps physical semantic-owner bindings across a non-pixel branch restore', () => {
    const s = store();
    writeProjectionRecord(s, { id: 'owner-root', documentId: 42, sequence: 1, visual: true, report: true, ack: true, verdict: true });
    const root = s.read('owner-root')! as any;
    root.result = { content: [{ type: 'text', text: JSON.stringify({
      ok: true,
      continuation_layers: [{ layer_id: 12, hypothesis_id: 'primaryForm-owner', decision: 'continue-logical-layer' }],
    }) }] };
    s.write(root);
    writeProjectionRecord(s, { id: 'owner-branch', documentId: 42, sequence: 2, visual: true, report: true, ack: true, verdict: true });
    const branch = s.read('owner-branch')! as any;
    branch.baseline_preview_source_operation_id = 'owner-root';
    s.write(branch);
    writeProjectionRecord(s, { id: 'owner-restore', documentId: 42, sequence: 3, visual: true, report: true, ack: true, verdict: true });
    const restore = s.read('owner-restore')! as any;
    restore.baseline_preview_source_operation_id = 'owner-branch';
    restore.verdict.recovery = { anchor_operation_id: 'owner-root' };
    s.write(restore);
    s.updatePaintingState(42, (current: any) => ({
      ...current,
      current_frame: { operation_id: 'owner-restore', sha256: 'restored' },
    }));

    expect(s.recordHasCurrentFrameAuthority(s.read('owner-branch'), s.paintingState().documents['42'], s.records())).toBe(false);
    expect(s.semanticLayerOwners(42)).toEqual([
      expect.objectContaining({ hypothesis_id: 'primaryForm-owner', layer_id: 12, physical_layer_ids: [12] }),
    ]);
  });

  it('allows one bounded same-strategy retry, then requires a structural executable strategy change', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/strategy-change-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    writeProjectionRecord(s, {
      id: 'insufficient-pass', documentId: 42, sequence: 1,
      visual: true, report: true, ack: true, verdict: true,
    });
    const prior = s.read('insufficient-pass')!;
    prior.tool = 'photoshop_execute_visual_microplan';
    prior.problem_id = 'form-problem';
    prior.stage = 'FORM';
    prior.scale = 'medium';
    prior.args = {
      document_id: 42,
      problem_id: 'form-problem',
      region: 'form',
      stage: 'FORM',
      scale: 'medium',
      method_class: 'paint',
      action_class: 'ADD',
      risk: 'low',
      steps: [
        { id: 'paint', tool: 'photoshop_paint_dabs', args: { layer_id: 7, dabs: [{ x: 10, y: 10 }] } },
        { id: 'preview', tool: 'photoshop_get_preview', args: {} },
      ],
    };
    prior.verdict.verdict = 'neutral';
    prior.verdict.target_resolved = 'no';
    prior.verdict.significance.execution_effect = 'insufficient';
    s.write(prior);

    const same = s.collectPreflightErrors({
      ...request('same-strategy', 'photoshop_execute_visual_microplan', structuredClone(prior.args)),
      problem_id: 'form-problem',
      stage: 'FORM',
      scale: 'medium',
      replan: 'different words only',
    });
    expect(same.join('\n')).not.toMatch(/artistic_recovery/);

    writeProjectionRecord(s, {
      id: 'insufficient-retry', documentId: 42, sequence: 2,
      visual: true, report: true, ack: true, verdict: true,
    });
    const retry = s.read('insufficient-retry')!;
    retry.tool = 'photoshop_execute_visual_microplan';
    retry.problem_id = 'form-problem';
    retry.stage = 'FORM';
    retry.scale = 'medium';
    retry.args = structuredClone(prior.args);
    retry.verdict.verdict = 'neutral';
    retry.verdict.target_resolved = 'no';
    retry.verdict.significance.execution_effect = 'insufficient';
    s.write(retry);

    const exhaustedSame = s.collectPreflightErrors({
      ...request('same-strategy-after-retry', 'photoshop_execute_visual_microplan', structuredClone(prior.args)),
      problem_id: 'form-problem',
      stage: 'FORM',
      scale: 'medium',
      replan: 'parameter or wording changes still do not make a distinct strategy',
    });
    expect(exhaustedSame.join('\n')).toMatch(/artistic_recovery:.*distinct structural strategy/);

    const changedArgs = structuredClone(prior.args);
    changedArgs.method_class = 'region';
    changedArgs.steps = [
      { id: 'block', tool: 'photoshop_paint_regions', args: { regions: [{ layer_id: 7 }] } },
      { id: 'preview', tool: 'photoshop_get_preview', args: {} },
    ];
    const changed = s.collectPreflightErrors({
      ...request('changed-strategy', 'photoshop_execute_visual_microplan', changedArgs),
      problem_id: 'form-problem',
      stage: 'FORM',
      scale: 'medium',
    });
    expect(changed.join('\n')).not.toMatch(/artistic_recovery/);
  });

  it('recovers a completed document bootstrap from an exact command receipt and preserves the returned document id', () => {
    const s = store();
    const record = s.begin(request('bootstrap-completed', 'photoshop_create_document', {
      width: 1000,
      height: 700,
      resolution: 72,
      colorMode: 'RGB',
    })).record;
    s.markDispatched(record);
    const publicResult = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          summary: 'Document created',
          details: {
            transport: 'uxp',
            command_id: 'bootstrap-completed',
            document: { id: 731, name: 'Untitled-1', width: 1000, height: 700, resolution: 72, colorMode: 'RGB' },
          },
        }),
      }],
    };
    const recovered = s.recoverDocumentBootstrap('bootstrap-completed', {
      command_id: 'bootstrap-completed',
      state: 'completed',
      result: { id: 'bootstrap-completed', ok: true },
    }, publicResult);

    expect(recovered).toMatchObject({
      phase: 'completed',
      failed: false,
      execution: 'completed',
      visual: false,
      bootstrap_outcome: { document_id: 731, command_id: 'bootstrap-completed' },
      resolved: { outcome: 'completed', evidence_mode: 'uxp_command_receipt' },
    });
    expect(recovered.operation_receipt?.token).toEqual(expect.any(String));
  });

  it('terminalizes an exact failed bootstrap without report, acknowledgement, preview, or visual debt', () => {
    const s = store();
    const record = s.begin(request('bootstrap-failed', 'photoshop_create_document', {
      width: 1000,
      height: 700,
    })).record;
    s.markDispatched(record);
    const recovered = s.recoverDocumentBootstrap('bootstrap-failed', {
      command_id: 'bootstrap-failed',
      state: 'failed',
      result: { id: 'bootstrap-failed', ok: false, error: 'photoshop_create_failed' },
    });
    const status = s.status();

    expect(recovered).toMatchObject({
      phase: 'completed', failed: true, execution: 'failed', visual: false, guard_ack_required: false,
      resolved: { outcome: 'failed', evidence_mode: 'uxp_command_receipt' },
    });
    expect(recovered.operation_receipt).toBeUndefined();
    expect(recovered.operation_ack).toBeUndefined();
    expect(recovered.preview).toBeUndefined();
    expect(status.pending_reports).not.toContain('bootstrap-failed');
    expect(status.pending_operation_acks).not.toContain('bootstrap-failed');
    expect(status.pending_visual_verdicts).not.toContain('bootstrap-failed');
    expect(status.uncertain).not.toContain('bootstrap-failed');
  });

  it('terminalizes a durable not-claimed bootstrap as not-executed with no closure debt', () => {
    const s = store();
    const record = s.begin(request('bootstrap-not-claimed', 'photoshop_create_document', {
      width: 1000,
      height: 700,
    })).record;
    s.markDispatched(record);
    const recovered = s.recoverDocumentBootstrap('bootstrap-not-claimed', {
      command_id: 'bootstrap-not-claimed',
      state: 'not-claimed',
      result: { id: 'bootstrap-not-claimed', ok: false, error: 'uxp_bridge_timeout' },
    });
    const status = s.status();

    expect(recovered).toMatchObject({
      phase: 'completed', failed: true, execution: 'not-executed', visual: false, guard_ack_required: false,
      resolved: { outcome: 'not-executed', evidence_mode: 'uxp_command_receipt' },
    });
    expect(s.hasDurableNotExecutedProof(recovered)).toBe(true);
    expect(status.pending_reports).not.toContain('bootstrap-not-claimed');
    expect(status.pending_operation_acks).not.toContain('bootstrap-not-claimed');
    expect(status.pending_visual_verdicts).not.toContain('bootstrap-not-claimed');
    expect(status.uncertain).not.toContain('bootstrap-not-claimed');
  });

  it('restores closure snapshot paths that were absent back to absent', () => {
    const s = store();
    const root = path.dirname(s.directory);
    const commentaryPath = path.join(root, 'processes', 'snapshot-absent-process', 'run-01', 'frames', 'frame-001.txt');
    const record = s.begin(request('snapshot-absent', 'photoshop_get_state', { document_id: 42 })).record;
    record.preview = { commentary_path: commentaryPath };
    s.write(record);

    const snapshot = s.snapshotClosureState(record.id);
    const barrier = s.visualBarrierFile(42);
    expect(snapshot.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: barrier, existed: false }),
      expect.objectContaining({ file: commentaryPath, existed: false }),
    ]));

    mkdirSync(path.dirname(barrier), { recursive: true });
    mkdirSync(path.dirname(commentaryPath), { recursive: true });
    writeFileSync(barrier, '{"planId":"created","requiresExternalPreview":true}');
    writeFileSync(commentaryPath, 'created during closure');
    expect(s.restoreClosureState(snapshot)).toBe(true);

    expect(existsSync(barrier)).toBe(false);
    expect(existsSync(commentaryPath)).toBe(false);
  });

  it('restores exact bytes for existing controller, barrier, commentary, and project-local painting state', () => {
    const s = store();
    const root = path.dirname(s.directory);
    const processDir = 'processes/snapshot-exact-process/run-01';
    s.setArtRunState({
      document_id: 42,
      process_dir: processDir,
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const projectState = path.join(root, ...processDir.split('/'), 'painting-state.json');
    const commentaryPath = path.join(root, ...processDir.split('/'), 'frames', 'frame-002.txt');
    const record = s.begin(request('snapshot-exact', 'photoshop_get_state', { document_id: 42 })).record;
    record.preview = { commentary_path: commentaryPath };
    s.write(record);

    const controllerBytes = Buffer.from(JSON.stringify({
      schema_version: RUNTIME_STATE_VERSION,
      version: 2,
      revision: 7,
      documents: { '42': { document_id: 42, process_dir: 'processes/snapshot-exact-process/run-01', painting_profile: 'simple_graphic', commentary_mode: 'technical', commentary_detail: 'normal' } },
    }, null, 2) + '\n');
    const barrierBytes = Buffer.from('{\n  "planId": "before",\n  "operationId": "snapshot-exact",\n  "requiresExternalPreview": true\n}\n');
    const commentaryBytes = Buffer.from('before closure\r\nsecond line\n');
    const projectBytes = Buffer.from([0x7b, 0x22, 0x70, 0x72, 0x6f, 0x6a, 0x65, 0x63, 0x74, 0x22, 0x3a, 0x31, 0x7d, 0x0a]);
    mkdirSync(path.dirname(s.visualBarrierFile(42)), { recursive: true });
    mkdirSync(path.dirname(commentaryPath), { recursive: true });
    writeFileSync(s.paintingStateFile(), controllerBytes);
    writeFileSync(s.visualBarrierFile(42), barrierBytes);
    writeFileSync(commentaryPath, commentaryBytes);
    writeFileSync(projectState, projectBytes);

    const snapshot = s.snapshotClosureState(record.id);
    expect(snapshot.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: s.paintingStateFile(), existed: true }),
      expect.objectContaining({ file: s.visualBarrierFile(42), existed: true }),
      expect.objectContaining({ file: commentaryPath, existed: true }),
      expect.objectContaining({ file: projectState, existed: true }),
    ]));

    writeFileSync(s.paintingStateFile(), 'mutated-controller');
    writeFileSync(s.visualBarrierFile(42), 'mutated-barrier');
    writeFileSync(commentaryPath, 'mutated-commentary');
    writeFileSync(projectState, 'mutated-project');
    s.restoreClosureState(snapshot);

    expect(readFileSync(s.paintingStateFile())).toEqual(controllerBytes);
    expect(readFileSync(s.visualBarrierFile(42))).toEqual(barrierBytes);
    expect(readFileSync(commentaryPath)).toEqual(commentaryBytes);
    expect(readFileSync(projectState)).toEqual(projectBytes);
  });

  it('restores the operation journal and removes closure-created side state without leaving a partial closure', () => {
    const s = store();
    const root = path.dirname(s.directory);
    const processDir = 'processes/snapshot-atomic-process/run-01';
    s.setArtRunState({
      document_id: 42,
      process_dir: processDir,
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const projectState = path.join(root, ...processDir.split('/'), 'painting-state.json');
    rmSync(projectState, { force: true });
    const commentaryPath = path.join(root, ...processDir.split('/'), 'frames', 'frame-003.txt');
    const record = s.begin(request('snapshot-atomic', 'photoshop_get_state', { document_id: 42 })).record;
    record.preview = { commentary_path: commentaryPath };
    s.write(record);
    const operationBefore = readFileSync(s.file(record.id));
    const controllerBefore = readFileSync(s.paintingStateFile());
    const snapshot = s.snapshotClosureState(record.id);
    expect(snapshot.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: projectState, existed: false }),
      expect.objectContaining({ file: s.visualBarrierFile(42), existed: false }),
      expect.objectContaining({ file: commentaryPath, existed: false }),
    ]));

    s.write({ ...record, report: { did: 'partial', why: 'partial', result: 'partial' }, operation_ack: { token: 'partial' } });
    mkdirSync(path.dirname(s.visualBarrierFile(42)), { recursive: true });
    mkdirSync(path.dirname(commentaryPath), { recursive: true });
    writeFileSync(s.paintingStateFile(), '{"partial":true}');
    writeFileSync(projectState, '{"partial":true}');
    writeFileSync(s.visualBarrierFile(42), '{"planId":"partial","requiresExternalPreview":true}');
    writeFileSync(commentaryPath, 'partial commentary');

    s.restoreClosureState(snapshot);
    expect(readFileSync(s.file(record.id))).toEqual(operationBefore);
    expect(readFileSync(s.paintingStateFile())).toEqual(controllerBefore);
    expect(existsSync(projectState)).toBe(false);
    expect(existsSync(s.visualBarrierFile(42))).toBe(false);
    expect(existsSync(commentaryPath)).toBe(false);
  });

  it('allows a region-only scaffold before brush discovery, but not a mixed brush pass', () => {
    const s = store();
    s.setArtRunState({ document_id: 42, process_dir: 'processes/early-scaffold-process/run-01',
      commentary_mode: 'technical', painting_profile: 'nontrivial_painting' });
    const operation = {
      ...request('early-scaffold', 'photoshop_execute_visual_microplan', {
        document_id: 42, plan_id: 'scaffold', stage: 'GLOBAL_BLOCK_IN', method_class: 'region',
        steps: [{ tool: 'photoshop_paint_regions' }, { tool: 'photoshop_get_preview' }],
      }), problem_id: 'whole-image-masses', stage: 'GLOBAL_BLOCK_IN', scale: 'global',
    };
    expect(() => s.begin({ ...operation, args: { ...operation.args,
      steps: [
        { tool: 'photoshop_paint_regions' },
        { tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] } },
        { tool: 'photoshop_get_preview' },
      ],
    } })).toThrow(/brush_preflight_required/);
    expect(s.begin(operation).record.phase).toBe('started');
  });
  it('fails closed on non-trivial painting until live brush preflight is persisted and blocks raw paint bypass', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-gate-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'nontrivial_painting',
    });

    expect(() => s.begin({
      ...request('before-preflight', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'before-preflight-plan',
        stage: 'SHAPE',
        scale: 'medium',
        method_class: 'paint',
        steps: [{ tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] } }],
      }),
      problem_id: 'brush-form',
      stage: 'SHAPE',
      scale: 'medium',
    })).toThrow(/brush_preflight_required/);

    const configured = s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-gate-process/run-01',
      brush_preflight: brushPreflight(),
    });
    expect(configured.brush_preflight.completed).toBe(true);

    expect(() => s.begin({
      ...request('unknown-brush-role', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'unknown-brush-role-plan',
        stage: 'SHAPE',
        scale: 'medium',
        method_class: 'preset-brush',
        paint_strategy: {
          material_role: 'receiverSurface',
          visual_intent: 'surface-flow',
          brush_role: 'invented-role',
          preset_name: 'ReceiverSurface Brush',
          pressure_policy: 'simulated-size-opacity',
        },
      }),
      problem_id: 'receiverSurface-flow',
      stage: 'SHAPE',
      scale: 'medium',
    })).toThrow(/brush_role_not_preflighted/);

    expect(() => s.begin({
      ...request('wrong-brush-preset', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'wrong-brush-preset-plan',
        stage: 'SHAPE',
        scale: 'medium',
        method_class: 'preset-brush',
        paint_strategy: {
          material_role: 'receiverSurface',
          visual_intent: 'surface-flow',
          brush_role: 'receiverSurface-flow',
          preset_name: 'Uninventoried Brush',
          pressure_policy: 'simulated-size-opacity',
        },
      }),
      problem_id: 'receiverSurface-flow',
      stage: 'SHAPE',
      scale: 'medium',
    })).toThrow(/brush_preset_not_preflighted/);

    expect(() => s.begin({
      ...request('raw-paint-bypass', 'photoshop_paint_strokes', {
        document_id: 42,
        strokes: [{ points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }],
      }),
      problem_id: 'receiverSurface-flow',
      stage: 'SHAPE',
      scale: 'medium',
    })).toThrow(/visual_microplan_required/);

    expect(() => s.begin({
      ...request('missing-paint-strategy', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'missing-paint-strategy-plan',
        stage: 'SHAPE',
        scale: 'medium',
        method_class: 'paint',
      }),
      problem_id: 'receiverSurface-flow',
      stage: 'SHAPE',
      scale: 'medium',
    })).toThrow(/paint_strategy_required/);

    // This suite isolates brush admission at SHAPE. Advancing the same valid
    // brush to FORM must still require an actual whole-frame physical-stack
    // review; a completed brush preflight is not a substitute for that gate.
    expect(() => s.begin({
      ...request('preflighted-form-without-stack-review', 'photoshop_execute_visual_microplan', {
        document_id: 42, plan_id: 'form-stack-gate', stage: 'FORM', scale: 'medium',
        method_class: 'preset-brush',
        paint_strategy: {
          material_role: 'receiverSurface', visual_intent: 'surface-flow',
          brush_role: 'receiverSurface-flow', preset_name: 'ReceiverSurface Brush',
          pressure_policy: 'simulated-size-opacity',
        },
      }),
      problem_id: 'receiverSurface-flow', stage: 'FORM', scale: 'medium',
    })).toThrow(/physical_stack_check_required/);

    const admitted = s.begin({
      ...request('preflighted-brush-plan', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'preflighted-brush-plan',
        stage: 'SHAPE',
        scale: 'medium',
        method_class: 'preset-brush',
        paint_strategy: {
          material_role: 'receiverSurface',
          visual_intent: 'surface-flow',
          brush_role: 'receiverSurface-flow',
          preset_name: 'ReceiverSurface Brush',
          pressure_policy: 'simulated-size-opacity',
        },
      }),
      problem_id: 'receiverSurface-flow',
      stage: 'SHAPE',
      scale: 'medium',
    }).record;
    expect(admitted.phase).toBe('started');
  });

  it('enforces an exclusive supplied brush pack for brush marks while leaving pack identity explicit for stamps', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/exclusive-pack-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
      brush_preflight: exclusivePackBrushPreflight(),
      brush_pack_policy: { mode: 'exclusive', brush_pack_id: 'brush-pack-sha256:test-pack' },
    });

    expect(() => s.begin({
      ...request('exclusive-generic-current-brush', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        method_class: 'paint',
        paint_strategy: {
          material_role: 'receiverSurface', visual_intent: 'surface-flow', brush_role: 'receiverSurface-flow',
          pressure_policy: 'simulated-size-opacity',
        },
        steps: [{ id: 'paint', tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 4, y: 4 }] }] } }],
      }),
      problem_id: 'exclusive-pack-receiverSurface', stage: 'SHAPE', scale: 'medium',
    })).toThrow(/exclusive_brush_pack_preset_required/);

    const admitted = s.begin({
      ...request('exclusive-pack-media', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        method_class: 'preset-brush',
        paint_strategy: {
          material_role: 'receiverSurface', visual_intent: 'surface-flow', brush_role: 'receiverSurface-flow',
          preset_name: 'ReceiverSurface Brush', pressure_policy: 'simulated-size-opacity',
        },
        steps: [
          { id: 'preset', tool: 'photoshop_select_brush_preset', args: { name: 'ReceiverSurface Brush' } },
          { id: 'paint', tool: 'photoshop_paint_strokes', args: { strokes: [{ tool: 'BRUSH', points: [{ x: 1, y: 1 }, { x: 4, y: 4 }] }] } },
        ],
      }),
      problem_id: 'exclusive-pack-receiverSurface', stage: 'SHAPE', scale: 'medium',
    }).record;
    expect(admitted.phase).toBe('started');

    expect(() => s.begin({
      ...request('exclusive-pack-wrong-stamp', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        method_class: 'preset-brush',
        paint_strategy: {
          material_role: 'organicInstances', visual_intent: 'texture', preset_name: 'Leaf Stamp',
          brush_pack_id: 'brush-pack-sha256:other-pack', stamp_profile_id: 'stamp-profile-sha256:leaf',
          pressure_policy: 'native-preset',
        },
        steps: [{
          id: 'stamp', tool: 'photoshop_paint_stamp_instances', args: {
            brush_pack_id: 'brush-pack-sha256:other-pack', stamp_profile_id: 'stamp-profile-sha256:leaf',
            preset_name: 'Leaf Stamp', instances: [{ instance_id: 'leaf-1', x: 20, y: 20, size: 30 }],
          },
        }],
      }),
      problem_id: 'exclusive-pack-organicInstances', stage: 'SHAPE', scale: 'medium',
    })).toThrow(/exclusive_brush_pack_violation/);

    expect(s.artRunState(42)?.brush_pack_policy).toEqual({
      mode: 'exclusive', brush_pack_id: 'brush-pack-sha256:test-pack', applies_to: 'brush_marks_only',
    });
  });

  it('validates brush-preflight intents and restores the durable role map in a fresh SessionStore', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'session-store-brush-preflight-reload-'));
    dirs.push(dir);
    const options = {
      visualBarrierDirectory: path.join(dir, 'barriers'),
      workspaceRoot: dir,
    };
    const controller = path.join(dir, 'controller');
    const first = new SessionStore(controller, options);

    const invalid = brushPreflight();
    invalid.roles[0]!.visual_intents = ['invented-polygon-painter'];
    expect(() => first.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-reload-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: invalid,
    })).toThrow(/unsupported intent/);

    first.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-reload-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: brushPreflight(),
    });

    const restarted = new SessionStore(controller, options);
    expect(restarted.artRunState(42)?.brush_preflight).toMatchObject({
      completed: true,
      inventory_observed: true,
      inventory_total: 123,
      roles: [expect.objectContaining({
        role_id: 'receiverSurface-flow',
        preferred_preset: 'ReceiverSurface Brush',
        pressure_policy: 'simulated-size-opacity',
      })],
    });
  });

  it('reprojects connected descendant geometry when a parent construction revision moves/scales', () => {
    const s = store();
    const binding = {
      protocol: 'photoshop.guard.geometry_binding.v1', owner_id: 'child',
      scene_geometry_model_id: 'scene', scene_geometry_revision: 1,
      vanishing_family_ids: [], dependencies: ['parent'],
      anchors: { near_contact: { x: 20, y: 30 }, far_extent: { x: 40, y: 50 } },
      control_sections: [{ id: 'joint', at: { x: 20, y: 30 }, expected_bounds: { left: 18, top: 28, right: 22, bottom: 32 } }],
      constraints: [{ type: 'contact', target_ref: 'parent', evidence: ['connected parent construction'] }],
      exact_geometry_completion_relevant: false, exact_evidence: [], local_exceptions: [],
    };
    writeProjectionRecord(s, { id: 'parent-r1', documentId: 42, sequence: 1, visual: true, report: true, ack: true, verdict: true });
    const initial = s.read('parent-r1')! as any;
    initial.result = { content: [{ type: 'text', text: JSON.stringify({ ok: true, continuation_layers: [
      { layer_id: 10, hypothesis_id: 'parent', construction_tier: 'primary', construction_change: true },
      { layer_id: 11, hypothesis_id: 'child', construction_tier: 'secondary', parent_hypothesis_id: 'parent', parent_construction_revision: 'parent-r1', geometry_binding: binding },
    ] }) }] };
    s.write(initial);

    writeProjectionRecord(s, { id: 'parent-r2', documentId: 42, sequence: 2, visual: true, report: true, ack: true, verdict: true });
    const moved = s.read('parent-r2')! as any;
    moved.geometry_preflight = { executable_geometry: {
      mode: 'validated-landmark-transform', owner_id: 'parent',
      source_bounds: { left: 10, top: 20, right: 110, bottom: 120 },
      target_bounds: { left: 90, top: 50, right: 290, bottom: 100 },
    } };
    moved.result = { content: [{ type: 'text', text: JSON.stringify({ ok: true, continuation_layers: [
      { layer_id: 10, hypothesis_id: 'parent', construction_tier: 'primary', construction_change: true },
    ] }) }] };
    s.write(moved);

    const owners = s.semanticLayerOwners(42);
    const child = owners.find((owner: any) => owner.hypothesis_id === 'child') as any;
    expect(child.parent_construction_revision).toBe('parent-r2');
    expect(child.geometry_binding.anchors.near_contact).toEqual({ x: 110, y: 55 });
    expect(child.geometry_binding.anchors.far_extent).toEqual({ x: 150, y: 65 });
    expect(child.geometry_binding.control_sections[0]).toMatchObject({
      at: { x: 110, y: 55 }, expected_bounds: { left: 106, top: 54, right: 114, bottom: 56 },
    });
  });

  it('does not propagate malformed persisted parent-transform bounds into descendant geometry', () => {
    const validSource = { left: 10, top: 20, right: 110, bottom: 120 };
    const validTarget = { left: 90, top: 50, right: 290, bottom: 100 };
    const malformed = [
      { source: { ...validSource, left: null }, target: validTarget },
      { source: { ...validSource, left: false }, target: validTarget },
      { source: validSource, target: { ...validTarget, left: '90' } },
      { source: validSource, target: { ...validTarget, left: null } },
    ];
    for (const [index, sample] of malformed.entries()) {
      const s = store();
      const binding = {
        protocol: 'photoshop.guard.geometry_binding.v1', owner_id: 'child',
        scene_geometry_model_id: 'scene', scene_geometry_revision: 1,
        vanishing_family_ids: [], dependencies: ['parent'],
        anchors: { near_contact: { x: 20, y: 30 } },
        control_sections: [], constraints: [],
        exact_geometry_completion_relevant: false, exact_evidence: [], local_exceptions: [],
      };
      writeProjectionRecord(s, { id: `malformed-parent-r1-${index}`, documentId: 42, sequence: 1, visual: true, report: true, ack: true, verdict: true });
      const initial = s.read(`malformed-parent-r1-${index}`)! as any;
      initial.result = { content: [{ type: 'text', text: JSON.stringify({ ok: true, continuation_layers: [
        { layer_id: 10, hypothesis_id: 'parent', construction_tier: 'primary', construction_change: true },
        { layer_id: 11, hypothesis_id: 'child', construction_tier: 'secondary', parent_hypothesis_id: 'parent',
          parent_construction_revision: `malformed-parent-r1-${index}`, geometry_binding: binding },
      ] }) }] };
      s.write(initial);
      writeProjectionRecord(s, { id: `malformed-parent-r2-${index}`, documentId: 42, sequence: 2, visual: true, report: true, ack: true, verdict: true });
      const moved = s.read(`malformed-parent-r2-${index}`)! as any;
      moved.geometry_preflight = { executable_geometry: {
        mode: 'validated-landmark-transform', owner_id: 'parent',
        source_bounds: sample.source, target_bounds: sample.target,
      } };
      moved.result = { content: [{ type: 'text', text: JSON.stringify({ ok: true, continuation_layers: [
        { layer_id: 10, hypothesis_id: 'parent', construction_tier: 'primary', construction_change: true },
      ] }) }] };
      s.write(moved);
      const child = s.semanticLayerOwners(42).find((owner: any) => owner.hypothesis_id === 'child') as any;
      expect(child.geometry_binding.anchors.near_contact).toEqual({ x: 20, y: 30 });
      expect(child.parent_construction_revision).toBe(`malformed-parent-r1-${index}`);
    }
  });

  it('keeps focus-crop construction in document coordinates through later parent revision propagation', () => {
    const s = store();
    const previewLocal = {
      protocol: 'photoshop.guard.geometry_binding.v1', owner_id: 'child',
      scene_geometry_model_id: 'scene', scene_geometry_revision: 1,
      vanishing_family_ids: [], dependencies: ['parent'],
      anchors: { near_contact: { x: 20, y: 30 }, far_extent: { x: 40, y: 50 } },
      control_sections: [{ id: 'joint', at: { x: 20, y: 30 }, expected_bounds: { left: 18, top: 28, right: 22, bottom: 32 } }],
      constraints: [{ type: 'contact', target_ref: 'parent', evidence: ['focus crop construction'] }],
      exact_geometry_completion_relevant: false, exact_evidence: [], local_exceptions: [],
    } as any;
    const documentBinding = transformGeometryBinding(previewLocal, previewToCanvasAffine({
      documentId: 42, canvasWidth: 1200, canvasHeight: 800,
      outputWidth: 400, outputHeight: 300,
      crop: { left: 200, top: 100, right: 1000, bottom: 700 },
    }));
    expect(documentBinding.anchors.near_contact).toEqual({ x: 240, y: 160 });

    writeProjectionRecord(s, { id: 'parent-r1', documentId: 42, sequence: 1, visual: true, report: true, ack: true, verdict: true });
    const initial = s.read('parent-r1')! as any;
    initial.result = { content: [{ type: 'text', text: JSON.stringify({ ok: true, continuation_layers: [
      { layer_id: 10, hypothesis_id: 'parent', construction_tier: 'primary', construction_change: true },
      { layer_id: 11, hypothesis_id: 'child', construction_tier: 'secondary', parent_hypothesis_id: 'parent', parent_construction_revision: 'parent-r1', geometry_binding: documentBinding },
    ] }) }] };
    s.write(initial);

    writeProjectionRecord(s, { id: 'parent-r2', documentId: 42, sequence: 2, visual: true, report: true, ack: true, verdict: true });
    const moved = s.read('parent-r2')! as any;
    moved.geometry_preflight = { executable_geometry: {
      mode: 'validated-landmark-transform', owner_id: 'parent',
      source_bounds: { left: 200, top: 100, right: 1000, bottom: 700 },
      target_bounds: { left: 280, top: 130, right: 1880, bottom: 430 },
    } };
    moved.result = { content: [{ type: 'text', text: JSON.stringify({ ok: true, continuation_layers: [
      { layer_id: 10, hypothesis_id: 'parent', construction_tier: 'primary', construction_change: true },
    ] }) }] };
    s.write(moved);

    const child = s.semanticLayerOwners(42).find((owner: any) => owner.hypothesis_id === 'child') as any;
    expect(child.parent_construction_revision).toBe('parent-r2');
    expect(child.geometry_binding.anchors.near_contact).toEqual({ x: 360, y: 160 });
    expect(child.geometry_binding.anchors.far_extent).toEqual({ x: 440, y: 180 });
    expect(child.geometry_binding.control_sections[0]).toMatchObject({
      at: { x: 360, y: 160 }, expected_bounds: { left: 352, top: 158, right: 368, bottom: 162 },
    });
  });

  it('reuses run-level brush preflight and permits replacement only after relevant invalidation', () => {
    const s = store();
    const base = brushPreflight();
    const first = s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-reuse-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: base,
    });
    const recordedAt = first.brush_preflight.recorded_at;

    const healthyRepeat = s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-reuse-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: structuredClone(base),
    });
    expect(healthyRepeat.brush_preflight.recorded_at).toBe(recordedAt);
    expect(healthyRepeat.brush_preflight.invalidation_reason).toBeUndefined();

    const changedSemantic = brushPreflight();
    changedSemantic.roles[0]!.purpose = 'Different artistic role';
    expect(() => s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-reuse-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: changedSemantic,
    })).toThrow(/brush_preflight_reprobe_requires_invalidation/);

    const changed = brushPreflight();
    changed.roles[0]!.effective_settings.flow = 47;
    const replaced = s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-reuse-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: changed,
      brush_preflight_invalidation: 'settings_changed',
    });
    expect(replaced.brush_preflight).toMatchObject({
      invalidation_reason: 'settings_changed',
      invalidation_source: 'explicit',
      roles: [expect.objectContaining({
        effective_settings: expect.objectContaining({ flow: 47 }),
      })],
    });

    const observedDrift = brushPreflight();
    observedDrift.roles[0]!.effective_settings.flow = 51;
    const inferred = s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-reuse-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: observedDrift,
    });
    expect(inferred.brush_preflight).toMatchObject({
      invalidation_reason: 'settings_changed',
      invalidation_source: 'observed_preflight_diff',
      roles: [expect.objectContaining({ effective_settings: expect.objectContaining({ flow: 51 }) })],
    });

    const observedCatalogDrift = brushPreflight();
    observedCatalogDrift.inventory_total = 124;
    const inferredCatalog = s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/brush-reuse-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: observedCatalogDrift,
    });
    expect(inferredCatalog.brush_preflight).toMatchObject({
      invalidation_reason: 'catalog_changed',
      invalidation_source: 'observed_preflight_diff',
      inventory_total: 124,
    });
  });

  it('infers runtime brush invalidation from a changed authoritative runtime witness', () => {
    const s = store();
    const first = brushPreflight();
    first.runtime_instance_witness = 'instance-one';
    s.setArtRunState({ document_id: 42, process_dir: 'processes/runtime-brush-process/run-01', brush_preflight: first });
    const second = brushPreflight();
    second.runtime_instance_witness = 'instance-two';
    const result = s.setArtRunState({ document_id: 42, process_dir: 'processes/runtime-brush-process/run-01', brush_preflight: second });
    expect(result.brush_preflight).toMatchObject({
      runtime_instance_witness: 'instance-two',
      invalidation_reason: 'runtime_changed',
      invalidation_source: 'bridge_runtime_witness',
    });
  });

  it('admits a known-good microplan in artistic mode without requiring prose commentary as execution authority', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/known-good-run',
      commentary_mode: 'artistic',
      painting_profile: 'simple_graphic',
    });
    const record = s.begin({
      ...request('known-good-guard', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'known-good-region-plan',
      }),
      problem_id: 'recognition-atmosphere',
      stage: 'recognition-block-in',
      scale: 'global',
      severity: 'must-fix',
    }).record;
    expect(record.phase).toBe('started');
    expect(record.visual).toBe(true);
    expect(s.visualBarrier(42)).toBeUndefined();
    s.markDispatched(record);
    expect(s.visualBarrier(42)).toMatchObject({
      planId: 'known-good-region-plan',
      operationId: 'known-good-guard',
      operationSequence: record.sequence,
      requiresExternalPreview: true,
    });
  });

  it('does not treat causal escalation labels as execution authority', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/label-free-run',
      commentary_mode: 'artistic',
      painting_profile: 'simple_graphic',
    });
    const record = s.begin({
      ...request('label-free-guard', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'label-free-plan',
      }),
      problem_id: 'shape-readability',
      stage: 'recognition-block-in',
      scale: 'global',
      severity: 'must-fix',
      causal_escalation_level: 'legacy-narrative-label',
    } as any).record;
    expect(record.phase).toBe('started');
    expect(record.visual).toBe(true);
  });

  it('auto-closes a legacy invalid-plan barrier as not-executed without report, ack, preview, or verdict debt', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const uncertain = s.begin({
      ...request('invalid-plan', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'invalid-plan',
      }),
      problem_id: 'invalid-plan-validation',
    }).record;
    s.markDispatched(uncertain);
    s.complete(uncertain, {
      isError: true,
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: false,
          code: 'invalid_visual_microplan',
          message: 'simulated legacy parser rejection before mutation dispatch',
        }),
      }],
    });
    expect(s.visualBarrier(42)?.planId).toBe('invalid-plan');
    expect(s.visualBarrier(42)?.operationId).toBe('invalid-plan');
    const status = s.status();
    const resolved = s.read('invalid-plan')!;
    expect(resolved.phase).toBe('completed');
    expect(resolved.visual).toBe(false);
    expect(resolved.execution).toBe('not-executed');
    expect(s.visualBarrier(42)).toBeUndefined();
    expect(status.pending_reports).not.toContain('invalid-plan');
    expect(status.pending_operation_acks).not.toContain('invalid-plan');
    expect(status.pending_visual_verdicts).not.toContain('invalid-plan');
    expect(status.uncertain).not.toContain('invalid-plan');

    const next = s.begin(request('state-after-invalid', 'photoshop_get_state', { document_id: 42 })).record;
    expect(next.phase).toBe('started');
  });

  it('auto-closes a legacy missing-document activation as not-executed', () => {
    const s = store();
    const uncertain = s.begin(request(
      'legacy-missing-document-activation',
      'photoshop_set_active_document',
      { document_id: 877 }
    )).record;
    s.markDispatched(uncertain);
    s.complete(uncertain, {
      isError: true,
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: false,
          code: 'document_not_found',
          message: 'No open document with id 877',
        }),
      }],
    });
    expect(s.read('legacy-missing-document-activation')?.phase).toBe('uncertain');

    const status = s.status();
    const resolved = s.read('legacy-missing-document-activation')!;
    expect(resolved).toMatchObject({
      phase: 'completed',
      visual: false,
      execution: 'not-executed',
      failed: true,
    });
    expect(status.uncertain).not.toContain('legacy-missing-document-activation');
  });

  it('terminalizes an exact zero-side-effect preparation failure but keeps prior preparation side effects uncertain', () => {
    const exact = store();
    exact.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/e16-exact',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const exactRecord = exact.begin({
      ...request('e16-exact', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'e16-exact',
      }),
      problem_id: 'e16-exact-problem',
    }).record;
    exact.markDispatched(exactRecord);
    exact.complete(exactRecord, {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({
        ok: false,
        code: 'microplan_prepare_failed',
        execution: 'not-executed',
        terminal: true,
        visual_mutation_started: false,
        preparation_execution: {
          failed_step_class: 'preparation-only',
          failed_step_execution: 'not-executed',
          prior_side_effecting_preparation_completed: false,
          side_effects_possible: false,
        },
      }) }],
    });
    const exactCompleted = exact.read('e16-exact')!;
    expect(exactCompleted).toMatchObject({
      phase: 'completed',
      execution: 'not-executed',
      visual: false,
      guard_ack_required: false,
    });
    expect(exact.visualBarrier(42)).toBeUndefined();
    expect(exact.status().uncertain).not.toContain('e16-exact');

    const partial = store();
    partial.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/e16-partial',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const partialRecord = partial.begin({
      ...request('e16-partial', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'e16-partial',
      }),
      problem_id: 'e16-partial-problem',
    }).record;
    partial.markDispatched(partialRecord);
    partial.complete(partialRecord, {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({
        ok: false,
        code: 'microplan_prepare_failed',
        visual_mutation_started: false,
        preparation_execution: {
          prior_side_effecting_preparation_completed: true,
          side_effects_possible: true,
        },
      }) }],
    });
    const partialCompleted = partial.read('e16-partial')!;
    expect(partialCompleted.phase).toBe('uncertain');
    expect(partialCompleted.execution).not.toBe('not-executed');
    expect(partial.visualBarrier(42)?.operationId).toBe('e16-partial');
    expect(partial.status().uncertain).toContain('e16-partial');
  });

  it('never classifies a successful visual mutation as not-executed', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/successful-mutation',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const record = s.begin({
      ...request('successful-plan', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'successful-plan',
      }),
      problem_id: 'successful-plan-test',
    }).record;
    s.markDispatched(record);
    s.complete(record, {
      content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        mutation_ok: true,
        mutation_count: 1,
        mutation_results: { paint: { ok: true } },
      }) }],
    });

    const completed = s.read('successful-plan')!;
    expect(s.hasDurableNotExecutedProof(completed)).toBe(false);
    expect(completed.execution).not.toBe('not-executed');
    const status = s.status();
    expect(status.pending_visual_verdicts).toContain('successful-plan');
    expect(s.visualBarrier(42)?.operationId).toBe('successful-plan');
  });

  it('persists execution-derived stamp instance bounds as Guard review metadata', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/stamp-instance-metadata',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const record = s.begin({
      ...request('stamp-plan', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'stamp-plan',
      }),
      problem_id: 'stamp-instance-review-metadata',
    }).record;
    s.markDispatched(record);
    s.complete(record, {
      content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        mutation_ok: true,
        mutation_count: 1,
        mutation_results: {
          stamps: {
            ok: true,
            details: {
              motif_instances: [
                {
                  id: 'motifForm-a',
                  category: 'motifForm',
                  stamp_profile_id: 'stamp-profile-a',
                  region_bounds: { left: 75, top: 80, right: 125, bottom: 120 },
                },
                {
                  id: 'motifForm-b',
                  category: 'motifForm',
                  stamp_profile_id: 'stamp-profile-a',
                  region_bounds: { left: 250, top: 190, right: 350, bottom: 290 },
                },
              ],
            },
          },
        },
      }) }],
    });

    expect(s.read('stamp-plan')?.observed_motif_instances).toEqual([
      {
        id: 'motifForm-a',
        category: 'motifForm',
        stamp_profile_id: 'stamp-profile-a',
        region_bounds: { left: 75, top: 80, right: 125, bottom: 120 },
      },
      {
        id: 'motifForm-b',
        category: 'motifForm',
        stamp_profile_id: 'stamp-profile-a',
        region_bounds: { left: 250, top: 190, right: 350, bottom: 290 },
      },
    ]);
  });

  it('does not treat matching post-state and preview as proof of not-executed after a generic uncertain failure', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/run-02',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const uncertain = s.begin({
      ...request('timeout-plan', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'timeout-plan',
      }),
      problem_id: 'timeout-validation',
    }).record;
    s.markDispatched(uncertain);
    s.fail(uncertain, new Error('simulated timeout after dispatch'));
    closeReportAndAck(s, 'timeout-plan');

    const state = s.begin(request('state-after-timeout', 'photoshop_get_state', { document_id: 42 })).record;
    s.complete(state, { content: [{ type: 'text', text: JSON.stringify({ ok: true, hasDocument: true }) }] });
    closeReportAndAck(s, 'state-after-timeout');

    const previewPath = path.join(s.directory, 'same-looking-frame.jpg');
    writeFileSync(previewPath, 'same-looking-frame');
    const sha256 = createHash('sha256').update('same-looking-frame').digest('hex');
    const preview = s.begin(request('preview-after-timeout', 'photoshop_get_preview', { document_id: 42 })).record;
    s.complete(preview, {
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, sha256, materialized_path: previewPath, width: 1, height: 1, mime_type: 'image/jpeg' }),
      }],
    });
    closeReportAndAck(s, 'preview-after-timeout');

    expect(() => s.reconcile({
      id: 'timeout-plan',
      state_id: 'state-after-timeout',
      preview_id: 'preview-after-timeout',
      outcome: 'not-executed',
      reason: 'The fresh state and preview look unchanged, but no original pre-dispatch execution proof exists',
    })).toThrow(/durable pre-dispatch evidence/);
    expect(s.visualBarrier(42)?.operationId).toBe('timeout-plan');
  });

  it('attaches fresh recovery preview when a visual timeout is reconciled as partial', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/partial-preview-recovery',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const uncertain = s.begin({
      ...request('partial-preview-plan', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'partial-preview-plan',
      }),
      problem_id: 'partial-preview-recovery',
    }).record;
    s.markDispatched(uncertain);
    s.fail(uncertain, new Error('simulated timeout after partial visual mutation'));
    closeReportAndAck(s, 'partial-preview-plan');

    const state = s.begin(request('partial-preview-state', 'photoshop_get_state', { document_id: 42 })).record;
    s.complete(state, { content: [{ type: 'text', text: JSON.stringify({ ok: true, hasDocument: true }) }] });
    closeReportAndAck(s, 'partial-preview-state');

    const previewPath = path.join(s.directory, 'partial-recovery-frame.jpg');
    writeFileSync(previewPath, 'partial-recovery-frame');
    const sha256 = createHash('sha256').update('partial-recovery-frame').digest('hex');
    const preview = s.begin(request('partial-preview-frame', 'photoshop_get_preview', { document_id: 42 })).record;
    s.complete(preview, {
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, sha256, materialized_path: previewPath, width: 1, height: 1, mime_type: 'image/jpeg' }),
      }],
    });
    closeReportAndAck(s, 'partial-preview-frame');

    s.reconcile({
      id: 'partial-preview-plan',
      state_id: 'partial-preview-state',
      preview_id: 'partial-preview-frame',
      outcome: 'partial',
      reason: 'Fresh same-document state and preview prove that a partial visual result remains and is safe to classify.',
    });

    const recovered = s.read('partial-preview-plan')!;
    expect(recovered.phase).toBe('completed');
    expect(recovered.execution).toBe('partial');
    expect(recovered.preview?.sha256).toBe(sha256);
    expect(recovered.preview?.document_id).toBe(42);
    expect(s.visualBarrier(42)).toMatchObject({
      operationId: 'partial-preview-plan',
      sha256,
      requiresExternalPreview: false,
    });
  });

  it('upgrades a legacy reconciled partial visual record that is missing its attached recovery preview', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/legacy-partial-preview-recovery',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const uncertain = s.begin({
      ...request('legacy-partial-preview-plan', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'legacy-partial-preview-plan',
      }),
      problem_id: 'legacy-partial-preview-recovery',
    }).record;
    s.markDispatched(uncertain);
    s.fail(uncertain, new Error('simulated timeout after partial visual mutation'));
    closeReportAndAck(s, 'legacy-partial-preview-plan');

    const state = s.begin(request('legacy-partial-preview-state', 'photoshop_get_state', { document_id: 42 })).record;
    s.complete(state, { content: [{ type: 'text', text: JSON.stringify({ ok: true, hasDocument: true }) }] });
    closeReportAndAck(s, 'legacy-partial-preview-state');

    const previewPath = path.join(s.directory, 'legacy-partial-recovery-frame.jpg');
    writeFileSync(previewPath, 'legacy-partial-recovery-frame');
    const sha256 = createHash('sha256').update('legacy-partial-recovery-frame').digest('hex');
    const preview = s.begin(request('legacy-partial-preview-frame', 'photoshop_get_preview', { document_id: 42 })).record;
    s.complete(preview, {
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, sha256, materialized_path: previewPath, width: 1, height: 1, mime_type: 'image/jpeg' }),
      }],
    });
    closeReportAndAck(s, 'legacy-partial-preview-frame');

    const legacy = s.read('legacy-partial-preview-plan')!;
    legacy.phase = 'completed';
    legacy.failed = false;
    legacy.execution = 'partial';
    legacy.resolved = {
      id: 'legacy-partial-preview-plan',
      state_id: 'legacy-partial-preview-state',
      preview_id: 'legacy-partial-preview-frame',
      outcome: 'partial',
      reason: 'Legacy runtime settled the partial execution but failed to attach its recovery preview.',
      at: new Date().toISOString(),
    };
    if (legacy.error) {
      legacy.recovery_original_error = legacy.error;
      delete legacy.error;
    }
    delete legacy.preview;
    delete legacy.preview_attached_at;
    s.write(legacy);

    s.reconcile({
      id: 'legacy-partial-preview-plan',
      state_id: 'legacy-partial-preview-state',
      preview_id: 'legacy-partial-preview-frame',
      outcome: 'partial',
      reason: 'Idempotent recovery upgrade attaches the already verified fresh preview without changing the settled partial outcome.',
    });

    const recovered = s.read('legacy-partial-preview-plan')!;
    expect(recovered.phase).toBe('completed');
    expect(recovered.execution).toBe('partial');
    expect(recovered.preview?.sha256).toBe(sha256);
    expect(recovered.preview?.document_id).toBe(42);
    expect(s.visualBarrier(42)).toMatchObject({
      operationId: 'legacy-partial-preview-plan',
      sha256,
      requiresExternalPreview: false,
    });
    expect(() => s.reconcile({
      id: 'legacy-partial-preview-plan',
      state_id: 'legacy-partial-preview-state',
      preview_id: 'legacy-partial-preview-frame',
      outcome: 'completed',
      reason: 'A legacy preview attachment must not be allowed to upgrade the already settled execution outcome.',
    })).toThrow('Expected an interrupted or uncertain operation');
  });

  it('does not clear a newer barrier that reuses the same plan id', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/session-regression-process/run-03',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const uncertain = s.begin({
      ...request('old-operation', 'photoshop_execute_visual_microplan', {
        document_id: 42,
        plan_id: 'reused-plan',
      }),
      problem_id: 'legacy-validation',
    }).record;
    s.markDispatched(uncertain);
    s.complete(uncertain, {
      isError: true,
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: false, code: 'invalid_visual_microplan', message: 'legacy parser rejection' }),
      }],
    });
    closeReportAndAck(s, 'old-operation');

    const state = s.begin(request('state-after-old', 'photoshop_get_state', { document_id: 42 })).record;
    s.complete(state, { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] });
    closeReportAndAck(s, 'state-after-old');
    const previewPath = path.join(s.directory, 'old-frame.jpg');
    writeFileSync(previewPath, 'old-frame');
    const sha256 = createHash('sha256').update('old-frame').digest('hex');
    const preview = s.begin(request('preview-after-old', 'photoshop_get_preview', { document_id: 42 })).record;
    s.complete(preview, {
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, sha256, materialized_path: previewPath, width: 1, height: 1, mime_type: 'image/jpeg' }),
      }],
    });
    closeReportAndAck(s, 'preview-after-old');

    s.setVisualBarrier(42, {
      planId: 'reused-plan',
      operationId: 'newer-operation',
      operationSequence: 999,
      requiresExternalPreview: true,
    });
    s.reconcile({
      id: 'old-operation',
      state_id: 'state-after-old',
      preview_id: 'preview-after-old',
      outcome: 'not-executed',
      reason: 'The original parser result proves the old operation never reached mutation dispatch',
    });
    expect(s.visualBarrier(42)?.operationId).toBe('newer-operation');
  });

  it('accepts root-level documents arrays as closed-document reconciliation evidence', () => {
    const s = store();
    const uncertain = s.begin(request('uncertain-save', 'photoshop_save_document', {
      document_id: 42,
      path: 'unused-test-path.psd',
      format: 'PSD',
    })).record;
    uncertain.dispatched = true;
    s.fail(uncertain, new Error('simulated interrupted save'));
    closeReportAndAck(s, 'uncertain-save');

    const documents = s.begin(request('documents-after-close', 'photoshop_list_documents')).record;
    s.complete(documents, {
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, count: 0, documents: [], active_document_id: null }),
      }],
    });

    const resolved = s.reconcile({
      id: 'uncertain-save',
      documents_id: 'documents-after-close',
      document_closed_confirmed: true,
      outcome: 'abandoned',
      reason: 'The user confirmed document 42 was closed and fresh root-level document evidence shows it absent',
    });

    expect(resolved.resolved.evidence_mode).toBe('document_absent');
    expect(resolved.resolved.target_document_id).toBe(42);
  });

  it('allows fresh read-only reconciliation evidence before report debt is closed on an uncertain operation', () => {
    const s = store();
    const uncertain = s.begin({
      ...request('uncertain-selection', 'photoshop_select_rectangle', {
        document_id: 42,
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
      }),
      problem_id: 'uncertain-selection-problem',
    }).record;
    s.markDispatched(uncertain);
    s.fail(uncertain, new Error('simulated uncertain selection failure'));

    const stateErrors = s.collectPreflightErrors(request('reconcile-state', 'photoshop_get_state', {
      document_id: 42,
    }));
    const previewErrors = s.collectPreflightErrors(request('reconcile-preview', 'photoshop_get_preview', {
      document_id: 42,
    }));
    expect(stateErrors.some(error => error.includes('Report required for uncertain-selection'))).toBe(false);
    expect(previewErrors.some(error => error.includes('Report required for uncertain-selection'))).toBe(false);
    expect(stateErrors.some(error => error.includes('Uncertain operation uncertain-selection'))).toBe(false);
    expect(previewErrors.some(error => error.includes('Uncertain operation uncertain-selection'))).toBe(false);

    const mutationErrors = s.collectPreflightErrors(request('blocked-mutation', 'photoshop_fill_layer', {
      document_id: 42,
      red: 10,
      green: 20,
      blue: 30,
    }));
    expect(mutationErrors.some(error => error.includes('Report required for uncertain-selection'))).toBe(true);
    expect(mutationErrors.some(error => error.includes('Uncertain operation uncertain-selection'))).toBe(true);
  });

  it('reclassifies a reconciled selection as completed non-visual configuration state', () => {
    const s = store();
    const uncertain = s.begin({
      ...request('selection-reconcile-completed', 'photoshop_select_rectangle', {
        document_id: 42,
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
      }),
      problem_id: 'selection-reconcile-problem',
    }).record;
    s.markDispatched(uncertain);
    s.fail(uncertain, new Error('simulated transport/modal response ambiguity'));

    const state = s.begin(request('selection-reconcile-state', 'photoshop_get_state', { document_id: 42 })).record;
    s.complete(state, { content: [{ type: 'text', text: JSON.stringify({ ok: true, document: { id: 42 }, hasSelection: true }) }] });
    closeReportAndAck(s, 'selection-reconcile-state');
    const previewPath = path.join(s.directory, 'selection-reconcile-preview.jpg');
    writeFileSync(previewPath, 'selection-reconcile-preview');
    const previewSha = createHash('sha256').update('selection-reconcile-preview').digest('hex');
    const preview = s.begin(request('selection-reconcile-preview', 'photoshop_get_preview', { document_id: 42 })).record;
    s.complete(preview, {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, sha256: previewSha, materialized_path: previewPath }) }],
    });
    closeReportAndAck(s, 'selection-reconcile-preview');

    s.reconcile({
      id: 'selection-reconcile-completed',
      state_id: 'selection-reconcile-state',
      preview_id: 'selection-reconcile-preview',
      outcome: 'completed',
      reason: 'Fresh same-document evidence proves the requested selection postcondition is present.',
    });

    const record = s.read('selection-reconcile-completed')!;
    expect(record).toMatchObject({
      phase: 'completed',
      failed: false,
      execution: 'completed',
      visual: false,
      resolved: { outcome: 'completed' },
    });
    expect(s.statusCompact().pending_visual_verdicts).not.toContain('selection-reconcile-completed');
  });

  it('treats closed-document abandonment as terminal for report, ack, verdict, resume, and preflight debt', () => {
    const s = store();
    const abandoned = s.begin({
      ...request('abandoned-visual', 'photoshop_delete_layer', {
        document_id: 42,
        layer_id: 7,
      }),
      problem_id: 'abandoned-visual-problem',
    }).record;
    abandoned.dispatched = true;
    abandoned.preview = {
      sha256: 'a'.repeat(64),
      materialized_path: path.join(s.directory, 'abandoned-visual.jpg'),
    };
    s.fail(abandoned, new Error('simulated interrupted visual mutation'));
    closeReportAndAck(s, 'abandoned-visual');

    const documents = s.begin(request('documents-after-abandoned-visual', 'photoshop_list_documents')).record;
    s.complete(documents, {
      content: [{
        type: 'text',
        text: JSON.stringify({ ok: true, details: { count: 0, documents: [], active_document_id: null } }),
      }],
    });

    s.reconcile({
      id: 'abandoned-visual',
      documents_id: 'documents-after-abandoned-visual',
      document_closed_confirmed: true,
      outcome: 'abandoned',
      reason: 'The user confirmed document 42 was closed and fresh document evidence proves it is absent',
    });

    const historical = s.read('abandoned-visual')!;
    delete historical.report;
    historical.operation_receipt = {
      protocol: 'photoshop.guard.operation_receipt.v1',
      operation_id: 'abandoned-visual',
      token: 'historical-abandoned-token',
      issued_at: new Date().toISOString(),
      phase: 'completed',
      execution: 'completed',
    };
    delete historical.operation_ack;
    s.write(historical);

    const compact = s.statusCompact();
    expect(compact.uncertain).not.toContain('abandoned-visual');
    expect(compact.pending_reports).not.toContain('abandoned-visual');
    expect(compact.pending_operation_acks).not.toContain('abandoned-visual');
    expect(compact.pending_visual_verdicts).not.toContain('abandoned-visual');
    expect(compact.documents['42']?.continuation_watch?.phase).not.toBe('awaiting_report');
    expect(compact.documents['42']?.continuation_watch?.phase).not.toBe('awaiting_operation_ack');
    expect(compact.documents['42']?.workflow_lifecycle).toMatchObject({
      status: 'stopped',
      reason: 'abandoned_document_absent',
      operation_id: 'abandoned-visual',
    });
    expect(compact.documents['42']?.visual_cadence?.active_visual_workflow).toBe(false);
    expect(s.resume(42).pending_visual_verdict).toBeNull();

    const errors = s.collectPreflightErrors(request('fresh-read-after-abandonment', 'photoshop_get_state', {
      document_id: 42,
    }));
    expect(errors.some(error => error.includes('Report required for abandoned-visual'))).toBe(false);
  });

  it('scans operation records, painting state, and all jobs once per statusCompact projection request', () => {
    const s = store();
    writeProjectionPaintingState(s, [11, 22, 33]);
    createProjectionJob(s, 'projection-job-a', 11);
    createProjectionJob(s, 'projection-job-b', 22);
    const completed = createProjectionJob(s, 'projection-job-completed', 33);
    writeJobCompleted(completed.dir, 0);

    const recordsSpy = vi.spyOn(s, 'records');
    const paintingSpy = vi.spyOn(s, 'paintingState');
    const activeJobsSpy = vi.spyOn(s, 'activeJobs');
    const readJobSpy = vi.spyOn(s, 'readJobProjection');

    const compact = s.statusCompact();

    expect(recordsSpy).toHaveBeenCalledTimes(1);
    expect(paintingSpy).toHaveBeenCalledTimes(1);
    expect(activeJobsSpy).toHaveBeenCalledTimes(1);
    expect(readJobSpy).toHaveBeenCalledTimes(3);
    expect(compact.active_jobs.map((job: any) => job.operation_id).sort()).toEqual([
      'projection-job-a',
      'projection-job-b',
    ]);
  });

  it('reuses one presentation state for multiple active jobs and preserves the selected output language', () => {
    const s = store();
    writeProjectionPaintingState(s, [11, 22]);
    createProjectionJob(s, 'localized-projection-a', 11);
    createProjectionJob(s, 'localized-projection-b', 22);
    s.setUserConfig({ language: 'en' });
    const paintingSpy = vi.spyOn(s, 'paintingState');
    const projection = s.captureProjectionContext();
    expect(paintingSpy).toHaveBeenCalledTimes(1);
    expect(projection.activeJobs).toHaveLength(2);
    expect(projection.activeJobs.every(job => job.narrative.text.startsWith('Now:') && job.narrative.language === 'en')).toBe(true);
    paintingSpy.mockClear();
    const fromSnapshot = s.activeJobs(undefined, undefined, projection.capturedAt, projection.paintingState);
    expect(paintingSpy).not.toHaveBeenCalled();
    expect(fromSnapshot).toEqual(projection.activeJobs);
    paintingSpy.mockClear();
    expect(s.activeJobs(undefined)).toHaveLength(2);
    expect(paintingSpy).toHaveBeenCalledTimes(1);
  });

  it('captures one fresh projection for full status and one fresh projection for resume', () => {
    const s = store();
    writeProjectionPaintingState(s, [34]);
    createProjectionJob(s, 'projection-job-status-resume', 34);
    writeProjectionRecord(s, {
      id: 'projection-record-status-resume',
      documentId: 34,
      sequence: 1,
      report: true,
      ack: true,
    });

    const recordsSpy = vi.spyOn(s, 'records');
    const paintingSpy = vi.spyOn(s, 'paintingState');
    const activeJobsSpy = vi.spyOn(s, 'activeJobs');
    const readJobSpy = vi.spyOn(s, 'readJobProjection');

    s.status();
    expect(recordsSpy).toHaveBeenCalledTimes(1);
    expect(paintingSpy).toHaveBeenCalledTimes(1);
    expect(activeJobsSpy).toHaveBeenCalledTimes(1);
    expect(readJobSpy).toHaveBeenCalledTimes(1);

    recordsSpy.mockClear();
    paintingSpy.mockClear();
    activeJobsSpy.mockClear();
    readJobSpy.mockClear();

    s.resume(34);
    expect(recordsSpy).toHaveBeenCalledTimes(1);
    expect(paintingSpy).toHaveBeenCalledTimes(1);
    expect(activeJobsSpy).toHaveBeenCalledTimes(1);
    expect(readJobSpy).toHaveBeenCalledTimes(1);
  });

  it('reuses supplied projection snapshots throughout cadence, continuation watch, and next-action calculations', () => {
    const s = store();
    writeProjectionPaintingState(s, [41, 42]);
    createProjectionJob(s, 'projection-job-nested', 41);
    writeProjectionRecord(s, {
      id: 'projection-record-nested',
      documentId: 41,
      sequence: 1,
      report: true,
      ack: true,
    });
    const context = s.captureProjectionContext();

    const recordsSpy = vi.spyOn(s, 'records');
    const paintingSpy = vi.spyOn(s, 'paintingState');
    const activeJobsSpy = vi.spyOn(s, 'activeJobs');
    const readJobSpy = vi.spyOn(s, 'readJobProjection');

    s.visualCadenceState(41, context.records, context);
    s.continuationWatchState(41, context.records, context);
    s.documentNextRequiredAction(41, context.records, context);
    s.checkpointState(41, context.records, context);
    s.recognitionMetrics(41, context.records, context);
    s.latencySummary(41, context.records, context);
    s.synchronizeVisualBarrier(41, context.records, context);

    expect(recordsSpy).not.toHaveBeenCalled();
    expect(paintingSpy).not.toHaveBeenCalled();
    expect(activeJobsSpy).not.toHaveBeenCalled();
    expect(readJobSpy).not.toHaveBeenCalled();
  });

  it('filters document active jobs from an in-memory snapshot with the same result as a fresh filtered scan', () => {
    const s = store();
    writeProjectionPaintingState(s, [51, 52]);
    createProjectionJob(s, 'projection-job-51-a', 51);
    createProjectionJob(s, 'projection-job-52', 52);
    createProjectionJob(s, 'projection-job-51-b', 51);

    const context = s.captureProjectionContext();
    const fromSnapshot = s.activeJobs(51, context.activeJobs, context.capturedAt);
    const fromFreshScan = s.activeJobs(51, undefined, context.capturedAt);

    expect(fromSnapshot).toEqual(fromFreshScan);
    expect(fromSnapshot.map((job: any) => job.operation_id).sort()).toEqual([
      'projection-job-51-a',
      'projection-job-51-b',
    ]);
  });

  it('captures fresh active-job state on each separate statusCompact request', () => {
    const s = store();
    writeProjectionPaintingState(s, [61]);
    const created = createProjectionJob(s, 'projection-job-freshness', 61);

    const first = s.statusCompact();
    expect(first.active_jobs.map((job: any) => job.operation_id)).toContain('projection-job-freshness');
    expect(first.documents['61']?.visual_cadence?.blockers?.active_job).toBe(created.jobId);

    writeJobCompleted(created.dir, 0);

    const second = s.statusCompact();
    expect(second.active_jobs.map((job: any) => job.operation_id)).not.toContain('projection-job-freshness');
    expect(second.documents['61']?.visual_cadence?.blockers?.active_job).toBeNull();
  });

  it('keeps corrupt or partial jobs isolated while returning healthy jobs from status projection', () => {
    const s = store();
    writeProjectionPaintingState(s, [71]);
    createProjectionJob(s, 'projection-job-healthy', 71);
    const corruptDir = path.join(s.directory, 'jobs', 'job-corrupt-partial');
    mkdirSync(corruptDir, { recursive: true });
    writeFileSync(path.join(corruptDir, 'job.json'), '{not-json');
    writeFileSync(path.join(corruptDir, 'input.json'), JSON.stringify({
      next_operation: {
        id: 'projection-job-corrupt',
        tool: 'photoshop_get_state',
        args: { document_id: 71 },
        summary: 'Corrupt job fixture',
        purpose: 'Must not make status unavailable',
      },
    }));

    expect(() => s.statusCompact()).not.toThrow();
    const compact = s.statusCompact();
    expect(compact.active_jobs.map((job: any) => job.operation_id)).toEqual(['projection-job-healthy']);
  });

  it('preserves legacy nested status semantics when the same records, painting state, jobs, and clock are projected once', () => {
    const s = store();
    const fixedNow = Date.UTC(2026, 8, 20, 12, 10, 0);
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    writeProjectionPaintingState(s, [81, 82]);
    writeProjectionRecord(s, {
      id: 'projection-accepted-visual',
      documentId: 81,
      sequence: 1,
      visual: true,
      report: true,
      ack: true,
      verdict: true,
    });
    writeProjectionRecord(s, {
      id: 'projection-pending-visual',
      documentId: 81,
      sequence: 2,
      visual: true,
      report: true,
      ack: true,
      verdict: false,
    });
    writeProjectionRecord(s, {
      id: 'projection-uncertain-read',
      documentId: 82,
      sequence: 3,
      phase: 'started',
      report: false,
      ack: false,
    });
    createProjectionJob(s, 'projection-job-parity', 82);

    const legacyRecords = s.records();
    const legacyState = s.paintingState();
    const legacyActiveJobs = s.activeJobs(undefined, undefined, fixedNow);
    const legacyDocumentIds = [...new Set([
      ...legacyRecords.map((record: any) => record.args?.document_id).filter((id: any) => Number.isSafeInteger(id) && id > 0),
      ...Object.keys(legacyState.documents ?? {}).map(Number).filter(id => Number.isSafeInteger(id) && id > 0),
    ])];
    const legacyDocuments = Object.fromEntries(legacyDocumentIds.map(documentId => [String(documentId), {
      visual_cadence: s.visualCadenceState(documentId, legacyRecords),
      continuation_watch: s.continuationWatchState(documentId, legacyRecords),
      next_required_action: s.documentNextRequiredAction(documentId, legacyRecords),
      recognition_metrics: s.recognitionMetrics(documentId, legacyRecords),
      latency_summary: s.latencySummary(documentId, legacyRecords),
    }]));

    const compact = s.statusCompact();

    expect(compact.pending_reports).toEqual(
      legacyRecords
        .filter((record: any) => record.execution !== 'not-executed' && record.resolved?.outcome !== 'abandoned' && !record.report)
        .map((record: any) => record.id)
    );
    expect(compact.pending_operation_acks).toEqual(
      legacyRecords
        .filter((record: any) => record.execution !== 'not-executed' && record.resolved?.outcome !== 'abandoned'
          && record.operation_receipt && !record.operation_ack)
        .map((record: any) => record.id)
    );
    expect(compact.pending_visual_verdicts).toEqual(
      legacyRecords.filter((record: any) => record.visual && !record.verdict).map((record: any) => record.id)
    );
    expect(compact.uncertain).toEqual(
      legacyRecords.filter((record: any) => record.phase !== 'completed' && !record.resolved).map((record: any) => record.id)
    );
    expect(compact.active_jobs).toEqual(legacyActiveJobs);
    for (const documentId of legacyDocumentIds) {
      expect(compact.documents[String(documentId)]?.visual_cadence).toEqual(legacyDocuments[String(documentId)].visual_cadence);
      expect(compact.documents[String(documentId)]?.continuation_watch).toEqual(legacyDocuments[String(documentId)].continuation_watch);
      expect(compact.documents[String(documentId)]?.next_required_action).toBe(legacyDocuments[String(documentId)].next_required_action);
      expect(compact.documents[String(documentId)]?.recognition_metrics).toEqual(legacyDocuments[String(documentId)].recognition_metrics);
      expect(compact.documents[String(documentId)]?.latency_summary).toEqual(legacyDocuments[String(documentId)].latency_summary);
    }
    expect(compact.next_required_action).toBe(legacyActiveJobs.at(-1)?.poll_command);
  });

  it('aggregates artistic throughput without letting the ratio hide recovery or regression outcomes', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/throughput-metrics-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });
    s.recordArtisticThroughputEvent(42, {
      kind: 'semantic-dispatch', model_visible: true, semantic_actions: 6, operation_id: 'pass-a',
      deterministic_violations_encountered_count: 3,
      deterministic_violations_repaired_count: 2,
      deterministic_violations_unresolved_count: 1,
      violation_accounting: [
        { code: 'semantic_layer_pollution', repair_class: 'AUTO_PATCH', encountered: 1, repaired: 1, unresolved: 0 },
        { code: 'compact_pass_visual_mutation_limit', repair_class: 'SPLIT_DEFER', encountered: 1, repaired: 1, unresolved: 0 },
        { code: 'compact_action_class_invalid', repair_class: 'AUTO_NORMALIZE', encountered: 1, repaired: 0, unresolved: 1 },
      ],
    });
    s.recordArtisticThroughputEvent(42, {
      kind: 'bookkeeping', model_visible: true, semantic_actions: 0, operation_id: 'pass-a',
    });

    s.write({
      id: 'pass-a', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      summary: 'Throughput fixture', purpose: 'Keep quality controls adjacent to the ratio',
      hash: 'throughput-pass-a', sequence: 1, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', visual: true, execution: 'completed', failed: false,
      verdict: {
        verdict: 'regression', disposition: 'rollback', target_resolved: 'no',
        significance: { execution_effect: 'meaningful', detected_change: true },
      },
      latency: {
        guard_preflight_ms: 4, report_ack_closure_ms: 2, recovery_reconciliation_ms: 1,
        photoshop_dispatch_wall_ms: 14, visual_evaluation_verdict_gap_ms: 7,
      },
    });

    const metrics = s.artisticThroughputMetrics(42) as any;
    expect(metrics).toMatchObject({
      model_visible_guard_round_trips: 2,
      semantic_dispatch_round_trips: 1,
      bookkeeping_only_round_trips: 1,
      semantic_artistic_actions_dispatched: 6,
      artistic_actions_per_model_visible_guard_round_trip: 3,
      deterministic_violations_encountered_count: 3,
      deterministic_violations_repaired_count: 2,
      deterministic_violations_unresolved_count: 1,
      violation_accounting_by_class_code: {
        'AUTO_PATCH:semantic_layer_pollution': {
          repair_class: 'AUTO_PATCH', code: 'semantic_layer_pollution', encountered: 1, repaired: 1, unresolved: 0,
        },
        'SPLIT_DEFER:compact_pass_visual_mutation_limit': {
          repair_class: 'SPLIT_DEFER', code: 'compact_pass_visual_mutation_limit', encountered: 1, repaired: 1, unresolved: 0,
        },
        'AUTO_NORMALIZE:compact_action_class_invalid': {
          repair_class: 'AUTO_NORMALIZE', code: 'compact_action_class_invalid', encountered: 1, repaired: 0, unresolved: 1,
        },
      },
      outcomes: {
        regression_passes: 1,
        recovery_or_uncertain_records: 0,
        evidence_integrity_failures: 0,
      },
      diagnostic_only: true,
    });
    expect(metrics.timing).toMatchObject({
      guard_bookkeeping_ms_observed: 7,
      photoshop_dispatch_ms_observed: 14,
      visual_evaluation_gap_ms_observed: 7,
      guard_bookkeeping_share_of_measured_time: 0.25,
    });
  });

  it('compares the same six-action representative task before/after semantic-pass batching without using throughput as quality proof', () => {
    const s = store();
    for (const documentId of [41, 42]) {
      s.setArtRunState({
        document_id: documentId,
        process_dir: `processes/p0-c-throughput-process/run-${documentId}`,
        painting_profile: 'simple_graphic',
        commentary_mode: 'technical',
      });
    }

    const writeAcceptedVisual = (documentId: number, id: string, sequence: number, latency: Record<string, number>) => {
      s.write({
        id, tool: 'photoshop_execute_visual_microplan', args: { document_id: documentId },
        summary: 'Same six-action representative artistic task', purpose: 'P0-C before/after throughput fixture',
        hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
        phase: 'completed', visual: true, execution: 'completed', failed: false,
        verdict: {
          verdict: 'improvement', disposition: 'accept', target_resolved: 'yes',
          significance: { execution_effect: 'meaningful', detected_change: true },
        },
        latency,
      });
    };

    // Baseline: six one-action semantic calls, each followed by one bookkeeping-only closure call.
    for (let index = 0; index < 6; index++) {
      s.recordArtisticThroughputEvent(41, { kind: 'semantic-dispatch', model_visible: true, semantic_actions: 1 });
      s.recordArtisticThroughputEvent(41, { kind: 'bookkeeping', model_visible: true, semantic_actions: 0 });
      writeAcceptedVisual(41, `baseline-${index + 1}`, index + 1, {
        guard_preflight_ms: 5,
        report_ack_closure_ms: 5,
        recovery_reconciliation_ms: 0,
        photoshop_dispatch_wall_ms: 20,
        visual_evaluation_verdict_gap_ms: 10,
        semantic_cycle_wall_ms: 40,
      });
    }

    // P0-C: the same six semantic actions in one bounded pass plus one compact close-only call.
    s.recordArtisticThroughputEvent(42, { kind: 'semantic-dispatch', model_visible: true, semantic_actions: 6 });
    s.recordArtisticThroughputEvent(42, { kind: 'bookkeeping', model_visible: true, semantic_actions: 0 });
    writeAcceptedVisual(42, 'semantic-pass', 7, {
      guard_preflight_ms: 8,
      report_ack_closure_ms: 7,
      recovery_reconciliation_ms: 0,
      photoshop_dispatch_wall_ms: 45,
      visual_evaluation_verdict_gap_ms: 15,
      semantic_cycle_wall_ms: 75,
    });

    const baseline = s.artisticThroughputMetrics(41) as any;
    const semantic = s.artisticThroughputMetrics(42) as any;
    const baselineWall = s.currentDocumentRecords(41).reduce((sum: number, record: any) => sum + Number(record.latency?.semantic_cycle_wall_ms ?? 0), 0);
    const semanticWall = s.currentDocumentRecords(42).reduce((sum: number, record: any) => sum + Number(record.latency?.semantic_cycle_wall_ms ?? 0), 0);

    expect(baseline).toMatchObject({
      model_visible_guard_round_trips: 12,
      semantic_artistic_actions_dispatched: 6,
      artistic_actions_per_model_visible_guard_round_trip: 0.5,
      outcomes: { regression_passes: 0, recovery_or_uncertain_records: 0, evidence_integrity_failures: 0 },
    });
    expect(semantic).toMatchObject({
      model_visible_guard_round_trips: 2,
      semantic_artistic_actions_dispatched: 6,
      artistic_actions_per_model_visible_guard_round_trip: 3,
      outcomes: { regression_passes: 0, recovery_or_uncertain_records: 0, evidence_integrity_failures: 0 },
    });
    expect(semanticWall).toBe(75);
    expect(baselineWall).toBe(240);
    expect(semanticWall).toBeLessThan(baselineWall);
  });

  it('reads a closed legacy visual verdict without creating new closure debt and does not keep a run active from current_stage alone', () => {
    const s = store();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 20, 12, 0, 30));
    writeProjectionPaintingState(s, [91]);
    writeProjectionRecord(s, {
      id: 'legacy-closed-visual',
      documentId: 91,
      sequence: 1,
      visual: true,
      report: true,
      ack: true,
      verdict: true,
    });

    const legacy = s.read('legacy-closed-visual')!;
    expect(legacy.verdict?.observations).toBeUndefined();
    expect(legacy.verdict?.goal_assessment).toBeUndefined();

    const compact = s.statusCompact();
    expect(compact.pending_reports).not.toContain('legacy-closed-visual');
    expect(compact.pending_operation_acks).not.toContain('legacy-closed-visual');
    expect(compact.pending_visual_verdicts).not.toContain('legacy-closed-visual');
    expect(compact.documents['91'].visual_cadence.active_visual_workflow).toBe(false);
    expect(compact.documents['91'].continuation_watch.active_visual_workflow).toBe(false);
    expect(compact.documents['91'].next_required_action).toBe('ready');

    const resumed = s.resume(91);
    expect(resumed.pending_visual_verdict).toBeNull();
    expect(resumed.next_required_action).toBe('ready');
  });

  it('stops legacy diagnostic-style continuation after a later closed save without resolving open visual problems', () => {
    const s = store();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 20, 12, 1, 0));
    mkdirSync(path.dirname(s.paintingStateFile()), { recursive: true });
    writeFileSync(s.paintingStateFile(), JSON.stringify({
      schema_version: RUNTIME_STATE_VERSION,
      version: 2,
      revision: 1,
      documents: {
        '5003': {
          document_id: 5003,
          process_dir: 'processes/brush-trace-diagnostic-process/run-01',
          painting_profile: 'simple_graphic',
          current_stage: 'SHAPE',
          active_scale: 'global',
          visual_problems: {
            'brush-diag-round-trace': {
              problem_id: 'brush-diag-round-trace',
              scale: 'global',
              severity: 'must-fix',
              status: 'open',
            },
            'brush-diag-soft-trace': {
              problem_id: 'brush-diag-soft-trace',
              scale: 'global',
              severity: 'must-fix',
              status: 'open',
            },
            'cumulative-trend-pressure-taper-visible': {
              problem_id: 'cumulative-trend-pressure-taper-visible',
              scale: 'global',
              severity: 'must-fix',
              status: 'open',
            },
          },
          active_problem: {
            problem_id: 'cumulative-trend-pressure-taper-visible',
            scale: 'global',
            severity: 'must-fix',
            status: 'open',
          },
          last_critique: {
            operation_id: 'brush_diag_soft_ab_005',
            verdict: 'neutral',
            disposition: 'accept',
            target_resolved: 'uncertain',
            uncertainty: 'Brush diagnostic evidence remains intentionally inconclusive.',
          },
        },
      },
    }, null, 2));

    writeProjectionRecord(s, {
      id: 'brush_diag_round_ab_003', documentId: 5003, sequence: 1,
      visual: true, report: true, ack: true, verdict: true,
    });
    writeProjectionRecord(s, {
      id: 'brush_diag_soft_ab_005', documentId: 5003, sequence: 2,
      visual: true, report: true, ack: true, verdict: true,
    });
    for (const id of ['brush_diag_round_ab_003', 'brush_diag_soft_ab_005']) {
      const record = s.read(id)!;
      record.verdict.verdict = 'neutral';
      record.verdict.disposition = 'accept';
      record.verdict.target_resolved = 'uncertain';
      s.write(record);
    }
    writeProjectionRecord(s, {
      id: 'brush_diag_save_contact_006', documentId: 5003, sequence: 3,
      report: true, ack: true,
    });
    const save = s.read('brush_diag_save_contact_006')!;
    save.tool = 'photoshop_save_document';
    save.args.path = path.join(
      path.dirname(s.paintingStateFile()),
      'processes', 'brush-trace-diagnostic-process', 'run-01', 'final', 'brush-trace-contact-sheet.png'
    );
    save.args.format = 'PNG';
    s.write(save);

    const compact = s.statusCompact();
    const doc = compact.documents['5003'];
    expect(doc.largest_open_must_fix?.status).toBe('open');
    expect(doc.last_critique.target_resolved).toBe('uncertain');
    expect(doc.unresolved_visual_basis.status).toBe('uncertain');
    expect(doc.visual_cadence.active_visual_workflow).toBe(false);
    expect(doc.continuation_watch.active_visual_workflow).toBe(false);
    expect(doc.continuation_watch.phase).toBe('ready');
    expect(doc.workflow_lifecycle).toMatchObject({
      status: 'stopped',
      reason: 'legacy_inferred_closed_continuation',
    });
    expect(doc.next_required_action).toBe('ready');

    const rawState = s.paintingState().documents['5003'];
    expect(Object.values(rawState.visual_problems).every((problem: any) => problem.status === 'open')).toBe(true);
    expect(s.read('brush_diag_soft_ab_005')?.verdict?.target_resolved).toBe('uncertain');
  });

  it('does not infer legacy workflow completion from an ordinary closed preparation step', () => {
    const s = store();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 20, 12, 1, 0));
    mkdirSync(path.dirname(s.paintingStateFile()), { recursive: true });
    writeFileSync(s.paintingStateFile(), JSON.stringify({
      schema_version: RUNTIME_STATE_VERSION,
      version: 2,
      revision: 1,
      documents: {
        '5004': {
          document_id: 5004,
          current_stage: 'SHAPE',
          active_scale: 'global',
          visual_problems: {
            'shape-open': {
              problem_id: 'shape-open',
              scale: 'global',
              severity: 'must-fix',
              status: 'open',
            },
          },
          active_problem: {
            problem_id: 'shape-open',
            scale: 'global',
            severity: 'must-fix',
            status: 'open',
          },
          last_critique: {
            operation_id: 'legacy-live-visual',
            verdict: 'neutral',
            disposition: 'accept',
            target_resolved: 'uncertain',
            uncertainty: 'The shape still needs another pass.',
          },
        },
      },
    }, null, 2));

    writeProjectionRecord(s, {
      id: 'legacy-live-visual', documentId: 5004, sequence: 1,
      visual: true, report: true, ack: true, verdict: true,
    });
    const visual = s.read('legacy-live-visual')!;
    visual.verdict.verdict = 'neutral';
    visual.verdict.disposition = 'accept';
    visual.verdict.target_resolved = 'uncertain';
    s.write(visual);

    writeProjectionRecord(s, {
      id: 'legacy-brush-preparation', documentId: 5004, sequence: 2,
      report: true, ack: true,
    });
    const prep = s.read('legacy-brush-preparation')!;
    prep.tool = 'photoshop_set_brush';
    s.write(prep);

    const compact = s.statusCompact();
    const doc = compact.documents['5004'];
    expect(doc.workflow_lifecycle).toMatchObject({
      status: 'active',
      reason: 'legacy_inferred_visual_continuation',
    });
    expect(doc.visual_cadence.active_visual_workflow).toBe(true);
    expect(doc.continuation_watch.active_visual_workflow).toBe(true);
    expect(doc.next_required_action).not.toBe('ready');
    expect(s.paintingState().documents['5004'].visual_problems['shape-open'].status).toBe('open');
  });

  it('prioritizes a pending Art Director review over a stopped lifecycle ready state', () => {
    const s = store();
    writeProjectionRecord(s, {
      id: 'review-due-visual', documentId: 42, sequence: 1,
      visual: true, report: true, ack: true, verdict: true,
    });
    s.updatePaintingState(42, current => ({
      ...current,
      document_id: 42,
      workflow_lifecycle: {
        status: 'stopped',
        reason: 'close_only_finalization',
        operation_id: 'read-only-check',
        at: new Date().toISOString(),
      },
      art_director: {
        directive_id: 'review-priority-regression',
        status: 'review_due',
        review_due: true,
        review_reason: 'cadence:5_microplans',
        current_task_id: 'organicInstances-light',
        tasks: [{ task_id: 'organicInstances-light', status: 'active' }],
      },
    }));

    expect(s.documentNextRequiredAction(42)).toBe(
      'Art Director review required for directive review-priority-regression: cadence:5_microplans'
    );
  });

  it('detects nonvisual progress stall without letting read-only churn reset the visual clock', () => {
    const s = store();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 20, 12, 3, 40));
    writeProjectionRecord(s, {
      id: 'last-visual-before-read-churn', documentId: 77, sequence: 1,
      visual: true, report: true, ack: true, verdict: true,
    });
    writeProjectionRecord(s, {
      id: 'late-read-only-check', documentId: 77, sequence: 200,
      report: true, ack: true,
    });
    s.updatePaintingState(77, current => ({
      ...current,
      document_id: 77,
      workflow_lifecycle: {
        status: 'active',
        reason: 'operation_dispatched',
        operation_id: 'last-visual-before-read-churn',
        at: new Date(Date.UTC(2026, 8, 20, 12, 0, 1)).toISOString(),
      },
      art_director: {
        directive_id: 'nonvisual-stall-regression',
        status: 'active',
        review_due: false,
        current_task_id: 'organicInstances-light',
        tasks: [
          { task_id: 'organicInstances-light', status: 'active' },
          { task_id: 'focal-details', status: 'pending' },
        ],
      },
    }));

    const watch = s.continuationWatchState(77);
    expect(watch.seconds_since_last_visual_change).toBeGreaterThanOrEqual(210);
    expect(watch.seconds_since_last_advancement).toBeGreaterThanOrEqual(210);
    expect(watch.nonvisual_progress_stall).toBe(true);
    expect(watch.nonvisual_progress_stall_reason).toBe('unfinished_painting_without_visual_pass');
    expect(watch.next_required_action).toBe(
      'Painter: execute bounded task organicInstances-light under directive nonvisual-stall-regression'
    );
  });

  it('does not infer legacy workflow completion from a mid-run PSD checkpoint save', () => {
    const s = store();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 20, 12, 1, 0));
    mkdirSync(path.dirname(s.paintingStateFile()), { recursive: true });
    writeFileSync(s.paintingStateFile(), JSON.stringify({
      schema_version: RUNTIME_STATE_VERSION,
      version: 2,
      revision: 1,
      documents: {
        '5005': {
          document_id: 5005,
          current_stage: 'SHAPE',
          visual_problems: {
            'shape-open': { problem_id: 'shape-open', scale: 'global', severity: 'must-fix', status: 'open' },
          },
          active_problem: { problem_id: 'shape-open', scale: 'global', severity: 'must-fix', status: 'open' },
          last_critique: {
            operation_id: 'legacy-checkpoint-visual',
            verdict: 'neutral',
            disposition: 'accept',
            target_resolved: 'uncertain',
            uncertainty: 'The painting continues after this checkpoint.',
          },
        },
      },
    }, null, 2));

    writeProjectionRecord(s, {
      id: 'legacy-checkpoint-visual', documentId: 5005, sequence: 1,
      visual: true, report: true, ack: true, verdict: true,
    });
    const visual = s.read('legacy-checkpoint-visual')!;
    visual.verdict.verdict = 'neutral';
    visual.verdict.disposition = 'accept';
    visual.verdict.target_resolved = 'uncertain';
    s.write(visual);

    writeProjectionRecord(s, {
      id: 'legacy-midrun-checkpoint', documentId: 5005, sequence: 2,
      report: true, ack: true,
    });
    const checkpoint = s.read('legacy-midrun-checkpoint')!;
    checkpoint.tool = 'photoshop_save_document';
    checkpoint.args.path = path.join(s.directory, 'checkpoints', 'midrun.psd');
    checkpoint.args.format = 'PSD';
    checkpoint.checkpoint = checkpoint.args.path;
    s.write(checkpoint);

    const doc = s.statusCompact().documents['5005'];
    expect(doc.workflow_lifecycle).toMatchObject({
      status: 'active',
      reason: 'legacy_inferred_visual_continuation',
    });
    expect(doc.visual_cadence.active_visual_workflow).toBe(true);
    expect(doc.next_required_action).not.toBe('ready');
  });

  it('projects compact artistic continuation state with durable task candidates and owner bindings', () => {
    const s = store();
    const createdAt = new Date(Date.UTC(2026, 9, 2, 12, 0, 0)).toISOString();
    s.write({
      id: 'continuation-owner-bindings',
      tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42 },
      summary: 'Establish durable semantic owner bindings',
      purpose: 'Seed compact artistic continuation projection',
      hash: 'continuation-owner-bindings-hash',
      sequence: 1,
      created_at: createdAt,
      completed_at: createdAt,
      phase: 'completed',
      visual: true,
      execution: 'completed',
      failed: false,
      result: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            continuation_layers: [
              { hypothesis_id: 'hero-owner', layer_id: 11, physical_role: 'primary subject mass',
                geometry_binding: { model_revision: 3, owner_id: 'hero-owner', plane_id: 'ground', primitive_id: 'hero-box' } },
              { hypothesis_id: 'support-owner', layer_id: 12, physical_role: 'supporting environment' },
            ],
          }),
        }],
      },
    });
    s.updatePaintingState(42, current => ({
      ...current,
      document_id: 42,
      current_stage: 'FORM',
      active_scale: 'medium',
      active_problem: {
        problem_id: 'hero-perspective',
        scale: 'medium',
        severity: 'must-fix',
        status: 'open',
        stage: 'FORM',
        region: 'hero foreground',
        hypothesis: 'Perspective drift is flattening the hero.',
        depends_on_problem_ids: ['ground-contact'],
      },
      visual_problems: {
        ...(current.visual_problems ?? {}),
        'hero-perspective': {
          problem_id: 'hero-perspective',
          scale: 'medium',
          severity: 'must-fix',
          status: 'open',
          region: 'hero foreground',
          hypothesis: 'Perspective drift is flattening the hero.',
          depends_on_problem_ids: ['ground-contact'],
        },
      },
      art_director: {
        directive_id: 'continuation-directive',
        status: 'active',
        current_task_id: 'hero-form',
        artistic_evaluation_contract: {
          protected_qualities: ['Preserve silhouette clarity.', 'Preserve quiet background hierarchy.'],
        },
        perceptual_hierarchy: {
          zones: [
            { id: 'hero-zone', owner_ids: ['hero-owner'] },
            { id: 'support-zone', owner_ids: ['support-owner'] },
          ],
        },
        tasks: [
          {
            task_id: 'hero-form',
            summary: 'Strengthen the hero form and perspective.',
            status: 'active',
            allowed_scales: ['medium'],
            allowed_global_changes: ['large-value'],
            affected_relations: ['hero-to-ground contact'],
            affected_qualities: ['silhouette clarity'],
            perceptual_zone_ids: ['hero-zone'],
          },
          {
            task_id: 'support-light',
            summary: 'Refine supporting light hierarchy.',
            status: 'pending',
            allowed_scales: ['medium', 'small'],
            allowed_global_changes: [],
            affected_relations: ['support-to-hero contrast'],
            affected_qualities: ['quiet background hierarchy'],
            perceptual_zone_ids: ['support-zone'],
          },
        ],
      },
    }));

    expect(s.compactPassContext(42).art_director.tasks).toEqual([
      expect.objectContaining({
        task_id: 'hero-form',
        summary: 'Strengthen the hero form and perspective.',
        allowed_global_changes: ['large-value'],
        affected_relations: ['hero-to-ground contact'],
        affected_qualities: ['silhouette clarity'],
      }),
      expect.objectContaining({
        task_id: 'support-light',
        summary: 'Refine supporting light hierarchy.',
        allowed_global_changes: [],
        affected_relations: ['support-to-hero contrast'],
        affected_qualities: ['quiet background hierarchy'],
      }),
    ]);

    const continuation = s.artisticContinuationContext(42) as any;
    expect(continuation).toMatchObject({
      document_id: 42,
      current_stage: 'FORM',
      active_scale: 'medium',
      current_problem: {
        problem_id: 'hero-perspective',
        scale: 'medium',
        severity: 'must-fix',
        region: 'hero foreground',
        hypothesis: 'Perspective drift is flattening the hero.',
        depends_on_problem_ids: ['ground-contact'],
        structural_or_global: false,
      },
      owners: [
        { owner_id: 'hero-owner', role: 'primary subject mass', layer_id: 11,
          geometry_binding: { model_revision: 3, owner_id: 'hero-owner', plane_id: 'ground', primitive_id: 'hero-box' } },
        { owner_id: 'support-owner', role: 'supporting environment', layer_id: 12 },
      ],
      current_task: {
        directive_id: 'continuation-directive',
        task_id: 'hero-form',
        summary: 'Strengthen the hero form and perspective.',
        allowed_scales: ['medium'],
        allowed_global_changes: ['large-value'],
        affected_relations: ['hero-to-ground contact'],
        affected_qualities: ['silhouette clarity'],
        owner_ids: ['hero-owner'],
      },
      next_candidates: [
        expect.objectContaining({
          candidate_id: 'A', kind: 'continue-current-task', task_id: 'hero-form',
          problem_id: 'hero-perspective', owner_ids: ['hero-owner'],
        }),
        expect.objectContaining({
          candidate_id: 'B', kind: 'next-planner-task', task_id: 'support-light', owner_ids: ['support-owner'],
        }),
        {
          candidate_id: 'C', kind: 'correct-current-problem', problem_id: 'hero-perspective',
          scale: 'medium', severity: 'must-fix', stage: 'FORM',
        },
      ],
      protected_qualities: ['Preserve silhouette clarity.', 'Preserve quiet background hierarchy.'],
    });

    const projection = s.captureProjectionContext({ activeJobs: [], capturedAt: Date.now() });
    const recordsSpy = vi.spyOn(s, 'records').mockImplementation(() => {
      throw new Error('artistic continuation must reuse the supplied request-local projection');
    });
    expect(s.artisticContinuationContext(42, projection)).toEqual(continuation);
    expect(recordsSpy).not.toHaveBeenCalled();
    expect(continuation).not.toHaveProperty('brush_roles');
    expect(continuation).not.toHaveProperty('scene_geometry_model');
    expect(continuation).not.toHaveProperty('scene_lighting_color_model');
    expect(continuation).not.toHaveProperty('scene_camera_imaging_model');
    expect(continuation).not.toHaveProperty('artistic_evaluation_contract');
  });

  it('projects the latest scene geometry revision only for the exact current document incarnation in bounded status/resume summaries', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({
      ...current,
      document_instance: {
        protocol: 'photoshop.guard.document_instance.v1',
        host_witness: {
          protocol: 'photoshop.uxp.document_instance_witness.v1',
          session_id: 'uxp-session-a',
          token: 'doc-42-incarnation-a',
        },
      },
    }));
    const geometry = (revision: number, incarnation = 'doc-42-incarnation-a') => ({
      model_id: 'station-perspective-01', revision, applicability: 'coherent_3d',
      source_frame: { document_id: 42, document_incarnation: incarnation, width: 1600, height: 900 },
      projection: { kind: 'one_point', vanishing_points: [] },
    });
    const writeGeometry = (id: string, sequence: number, model: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      summary: id, purpose: 'scene geometry regression', hash: `hash-${id}`, sequence,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true,
      scene_geometry_model: model,
    } as any);

    writeGeometry('geometry-r1', 1, geometry(1));
    const detailedGeometry = {
      ...geometry(2),
      line_families: Array.from({ length: 16 }, (_, family) => ({
        id: `family-${family}`,
        members: Array.from({ length: 32 }, (_, member) => ({
          id: `line-${family}-${member}`,
          points: [{ x: family * 50, y: member * 20 }, { x: 800, y: 300 }],
        })).sort((a, b) => a.id.localeCompare(b.id)),
      })).sort((a, b) => a.id.localeCompare(b.id)),
    };
    writeGeometry('geometry-r2', 2, detailedGeometry);
    writeGeometry('geometry-stale-incarnation', 3, geometry(3, 'doc-42-incarnation-old'));

    expect(s.sceneGeometryModel(42)).toMatchObject({
      model_id: 'station-perspective-01', revision: 2,
      source_operation_id: 'geometry-r2', source_sequence: 2,
    });
    const full = s.compactPassContext(42).scene_geometry_model;
    expect(full).toMatchObject({ revision: 2, line_families: detailedGeometry.line_families });
    const summary = s.statusCompact().documents['42'].scene_geometry_model;
    expect(summary).toEqual({
      model_id: detailedGeometry.model_id, revision: 2, applicability: 'coherent_3d',
      source_frame: detailedGeometry.source_frame, projection: { kind: 'one_point' },
      source_operation_id: 'geometry-r2', source_sequence: 2,
      source_operation_path: s.file('geometry-r2'),
    });
    expect(Buffer.byteLength(JSON.stringify(summary))).toBeLessThan(1000);
    expect(Buffer.byteLength(JSON.stringify(full))).toBeGreaterThan(30000);
    expect(JSON.parse(readFileSync(summary.source_operation_path, 'utf8')).scene_geometry_model)
      .toEqual(detailedGeometry);
    expect(s.resume(42).document.scene_geometry_model).toEqual(summary);

    s.observeDocumentInstance(42, {
      protocol: 'photoshop.uxp.document_instance_witness.v1',
      session_id: 'uxp-session-b', token: 'doc-42-incarnation-b',
    });
    expect(s.sceneGeometryModel(42)).toBeNull();
    expect(s.compactPassContext(42).scene_geometry_model).toBeNull();
    expect(s.statusCompact().documents['42'].scene_geometry_model).toBeNull();
  });

  it('projects selective geometry-stale owner debt from durable scene revision history', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({
      ...current,
      document_instance: {
        protocol: 'photoshop.guard.document_instance.v1',
        host_witness: {
          protocol: 'photoshop.uxp.document_instance_witness.v1',
          session_id: 'uxp-session-geometry-stale', token: 'doc-42-geometry-stale',
        },
      },
    }));
    const geometry = (revision: number, railX: number) => ({
      model_id: 'selective-scene', revision, applicability: 'coherent_3d',
      source_frame: { document_id: 42, document_incarnation: 'doc-42-geometry-stale', width: 1000, height: 700 },
      projection: { kind: 'two_point', vanishing_points: [
        { id: 'rail_vp', x: 500, y: 200, evidence: 'proposed', derived_from: [] },
        { id: 'facade_vp', x: 900, y: 210, evidence: 'proposed', derived_from: [] },
      ] },
      line_families: [
        { id: 'rails', vanishing_point_id: 'rail_vp', members: [{ id: 'left_rail', points: [{ x: 100, y: 650 }, { x: railX, y: 200 }] }] },
        { id: 'facade', vanishing_point_id: 'facade_vp', members: [{ id: 'roof_edge', points: [{ x: 600, y: 300 }, { x: 900, y: 210 }] }] },
      ],
      support_planes: [
        { id: 'track_plane', role: 'track', vanishing_family_ids: ['rails'], boundary_relations: ['left_rail'] },
        { id: 'wall_plane', role: 'planarForm', vanishing_family_ids: ['facade'], boundary_relations: ['roof_edge'] },
      ],
      scale_anchors: [],
    });
    const binding = (ownerId: string, family: string, plane: string, dependency: string) => ({
      owner_id: ownerId, scene_geometry_model_id: 'selective-scene', scene_geometry_revision: 1,
      support_plane_id: plane, vanishing_family_ids: [family], dependencies: [dependency],
      anchors: { near_contact: { x: 200, y: 600 } }, control_sections: [], constraints: [], local_exceptions: [],
    });
    const writeGeometry = (id: string, sequence: number, model: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      summary: id, purpose: 'selective geometry stale regression', hash: `hash-${id}`, sequence,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true,
      scene_geometry_model: model,
    } as any);
    writeGeometry('geometry-r1-selective', 1, geometry(1, 500));
    s.write({
      id: 'geometry-owner-bindings', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      summary: 'bind owners', purpose: 'selective geometry stale regression', hash: 'hash-bind-owners', sequence: 2,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true,
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, continuation_layers: [
        { layer_id: 12, hypothesis_id: 'primaryAssembly', geometry_binding: binding('primaryAssembly', 'rails', 'track_plane', 'left_rail') },
        { layer_id: 13, hypothesis_id: 'openingForm', geometry_binding: binding('openingForm', 'facade', 'wall_plane', 'roof_edge') },
      ] }) }] },
    } as any);
    writeGeometry('geometry-r2-selective', 3, geometry(2, 540));

    expect(s.geometryBindingStates(42)).toEqual([
      expect.objectContaining({ owner_id: 'openingForm', stale: false, reason: 'current', changed_dependency_ids: [] }),
      expect.objectContaining({ owner_id: 'primaryAssembly', stale: true, reason: 'dependency_changed', changed_dependency_ids: expect.arrayContaining(['left_rail', 'rails', 'track_plane']) }),
    ]);
    expect(s.compactPassContext(42).geometry_binding_states).toEqual(s.geometryBindingStates(42));
    expect(s.statusCompact().documents['42'].geometry_binding_states).toEqual(s.geometryBindingStates(42));
  });

  it('schedules rebuild debt only for generated geometry whose recorded source boundary changed', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({ ...current, document_instance: {
      protocol: 'photoshop.guard.document_instance.v1',
      host_witness: { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'uxp-generated-debt', token: 'doc-42-generated-debt' },
    }}));
    const geometry = (revision: number, leftTopX: number, unrelatedX: number) => ({
      model_id: 'generated-scene', revision, applicability: 'coherent_3d',
      source_frame: { document_id: 42, document_incarnation: 'doc-42-generated-debt', width: 1000, height: 700 },
      projection: { kind: 'one_point', vanishing_points: [{ id: 'vp', x: 500, y: 180, evidence: 'derived', derived_from: ['left', 'right'] }] },
      line_families: [{ id: 'facade', vanishing_point_id: 'vp', members: [
        { id: 'left', points: [{ x: 180, y: 650 }, { x: leftTopX, y: 180 }] },
        { id: 'right', points: [{ x: 820, y: 650 }, { x: 500, y: 180 }] },
        { id: 'unrelated', points: [{ x: 50, y: 600 }, { x: unrelatedX, y: 300 }] },
      ] }], support_planes: [], scale_anchors: [],
    });
    const writeScene = (id: string, sequence: number, model: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: id, purpose: 'generated rebuild debt',
      hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true, report: {}, verdict: {}, scene_geometry_model: model,
    } as any);
    const r1 = geometry(1, 500, 200);
    writeScene('generated-scene-r1', 1, r1);
    s.write({
      id: 'generated-facade-r1', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      summary: 'derived facade band', purpose: 'generated rebuild debt', hash: 'hash-generated-r1', sequence: 2,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(), phase: 'completed', execution: 'completed', failed: false, visual: true, report: {}, verdict: {},
      geometry_preflight: {
        executable_geometry: {
          mode: 'derived-boundary-sections', owner_id: 'facade-owner', scene_geometry_model_id: 'generated-scene', scene_geometry_revision: 1,
          dependency_ids: ['left', 'right'], dependency_snapshots: {
            left: JSON.stringify(r1.line_families[0].members[0]), right: JSON.stringify(r1.line_families[0].members[1]),
          }, tools: ['photoshop_paint_regions'], dispatched_point_count: 4, tolerance_px: 3,
        },
      },
    } as any);
    // A later scene record can reuse the original revision number while
    // changing the camera. The generated contour must retain its pre-paint
    // source model rather than trusting that revision number or the latest
    // same-revision model as its original authority.
    writeScene('generated-scene-r1-camera-reused', 2.5, {
      ...r1, projection: { ...r1.projection, horizon: {
        line: [{ x: 0, y: 180 }, { x: 1000, y: 180 }],
      } },
    });
    writeScene('generated-scene-r2-unrelated', 3, geometry(2, 500, 240));
    // The later same-revision camera record must not be mistaken for the
    // pre-paint source when comparing a genuine unrelated revision 2.
    expect(s.generatedGeometryRebuildDebt(42)).toEqual([]);

    writeScene('generated-scene-r3-boundary', 4, geometry(3, 540, 240));
    expect(s.generatedGeometryRebuildDebt(42)).toEqual([
      expect.objectContaining({ code: 'generated_geometry_rebuild_required', owner_id: 'facade-owner', reason: 'dependency_changed', changed_dependency_ids: ['left'] }),
    ]);
    expect(s.compactPassContext(42).generated_geometry_rebuild_debt).toEqual(s.generatedGeometryRebuildDebt(42));
    expect(s.statusCompact().documents['42'].generated_geometry_rebuild_debt).toEqual(s.generatedGeometryRebuildDebt(42));
    expect(s.documentNextRequiredAction(42)).toContain('rebuild generated geometry for owner facade-owner');
    const resumed = s.resume(42);
    expect(resumed.document.generated_geometry_rebuild_debt).toEqual(s.generatedGeometryRebuildDebt(42));
    expect(resumed.next_required_action).toContain('rebuild generated geometry for owner facade-owner');
    expect(resumed.resume_summary.next).toContain('rebuild generated geometry for owner facade-owner');

    const r3 = geometry(3, 540, 240);
    s.write({
      id: 'generated-facade-r3-rebuilt', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      summary: 'rebuilt derived facade band', purpose: 'generated rebuild debt closure', hash: 'hash-generated-r3', sequence: 5,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(), phase: 'completed', execution: 'completed', failed: false, visual: true, report: {}, verdict: {},
      geometry_preflight: {
        executable_geometry: {
          mode: 'derived-boundary-sections', owner_id: 'facade-owner', scene_geometry_model_id: 'generated-scene', scene_geometry_revision: 3,
          dependency_ids: ['left', 'right'], dependency_snapshots: {
            left: JSON.stringify(r3.line_families[0].members[0]), right: JSON.stringify(r3.line_families[0].members[1]),
          }, tools: ['photoshop_paint_regions'], dispatched_point_count: 4, tolerance_px: 3,
        },
      },
    } as any);
    expect(s.generatedGeometryRebuildDebt(42)).toEqual([]);
    expect(s.compactPassContext(42).generated_geometry_rebuild_debt).toEqual([]);
    expect(s.statusCompact().documents['42'].generated_geometry_rebuild_debt).toEqual([]);
    expect(s.documentNextRequiredAction(42)).not.toContain('rebuild generated geometry for owner facade-owner');

    // The pre-fix line-only snapshot remains selectively reusable through the
    // persisted source revision, but a global camera change cannot reuse it.
    const projectionChanged = geometry(4, 540, 240);
    writeScene('generated-scene-r4-horizon', 6, {
      ...projectionChanged,
      projection: { ...projectionChanged.projection, horizon: {
        line: [{ x: 0, y: 180 }, { x: 1000, y: 180 }],
      } },
    });
    expect(s.generatedGeometryRebuildDebt(42)).toEqual([
      expect.objectContaining({
        code: 'generated_geometry_rebuild_required', owner_id: 'facade-owner',
        reason: 'dependency_changed', changed_dependency_ids: ['__projection__'],
      }),
    ]);
  });

  it('projects E.17c completion debt only from insufficient scene geometry or completion-relevant stale E.18 bindings', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({
      ...current,
      document_instance: {
        protocol: 'photoshop.guard.document_instance.v1',
        host_witness: {
          protocol: 'photoshop.uxp.document_instance_witness.v1',
          session_id: 'uxp-e17c', token: 'doc-42-e17c',
        },
      },
    }));
    const geometry = (revision: number, farX: number) => ({
      model_id: 'e17c-scene', revision, applicability: 'coherent_3d',
      source_frame: { document_id: 42, document_incarnation: 'doc-42-e17c', width: 1200, height: 800 },
      projection: { kind: 'one_point', vanishing_points: [{ id: 'vp', x: 600, y: 200, evidence: 'derived', derived_from: ['left', 'right'] }] },
      line_families: [{ id: 'rails', vanishing_point_id: 'vp', members: [
        { id: 'left', points: [{ x: 300, y: 760 }, { x: farX, y: 200 }] },
        { id: 'right', points: [{ x: 900, y: 760 }, { x: 600, y: 200 }] },
      ] }],
      support_planes: [{ id: 'track', role: 'track support', vanishing_family_ids: ['rails'], boundary_relations: ['left', 'right'] }],
      scale_anchors: [{ id: 'near-scale', contact_point: { x: 600, y: 700 }, visible_extent: 180, depth_role: 'near' }],
    });
    const writeGeometry = (id: string, sequence: number, model: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: id, purpose: 'E17c completion geometry',
      hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true, scene_geometry_model: model,
    } as any);
    writeGeometry('e17c-geometry-r1', 1, geometry(1, 600));
    s.write({
      id: 'e17c-owner', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      summary: 'completion relevant owner', purpose: 'E17c completion geometry', hash: 'hash-e17c-owner', sequence: 2,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(), phase: 'completed', execution: 'completed', failed: false, visual: true,
      result: { content: [{ type: 'text', text: JSON.stringify({ continuation_layers: [{
        layer_id: 31, hypothesis_id: 'primaryAssembly', geometry_binding: {
          owner_id: 'primaryAssembly', scene_geometry_model_id: 'e17c-scene', scene_geometry_revision: 1,
          support_plane_id: 'track', vanishing_family_ids: ['rails'], dependencies: ['left', 'right', 'near-scale'],
          anchors: { near_contact: { x: 600, y: 700 }, far_extent: { x: 600, y: 360 }, centerline: { line: [{ x: 600, y: 700 }, { x: 600, y: 360 }] } },
          control_sections: [
            { id: 'near', at: { x: 600, y: 650 }, expected_bounds: { left: 500, top: 560, right: 700, bottom: 740 } },
            { id: 'mid', at: { x: 600, y: 470 }, expected_bounds: { left: 545, top: 420, right: 655, bottom: 520 } },
          ],
          constraints: [
            { type: 'converges_to', subject_ref: 'primaryAssembly', target_ref: 'rails', evidence: ['centerline'] },
            { type: 'supported_by', subject_ref: 'primaryAssembly', target_ref: 'track', evidence: ['contact'] },
            { type: 'scales_with_depth', subject_ref: 'primaryAssembly', target_ref: 'near-scale', evidence: ['near/mid sections'] },
          ],
          exact_geometry_completion_relevant: true,
          exact_evidence: [{
            id: 'primaryAssembly-measurement', method: 'photoshop_measure_points',
            source_frame: { document_id: 42, document_incarnation: 'doc-42-e17c', width: 1200, height: 800 },
          }],
          local_exceptions: [],
        },
      }] }) }] },
    } as any);
    expect(s.geometryCompletionDebt(42)).toEqual([]);

    writeGeometry('e17c-geometry-r2', 3, geometry(2, 640));
    expect(s.geometryCompletionDebt(42)).toEqual([
      expect.objectContaining({ code: 'geometry_completion_binding_stale', owner_id: 'primaryAssembly' }),
    ]);
    expect(s.compactPassContext(42).geometry_completion_debt).toEqual(s.geometryCompletionDebt(42));
    expect(s.statusCompact().documents['42'].geometry_completion_debt).toEqual(s.geometryCompletionDebt(42));
  });

  it('persists the latest lighting/color model for the exact document incarnation', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({ ...current, document_instance: {
      protocol: 'photoshop.guard.document_instance.v1', document_id: 42,
      host_witness: { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'uxp-light-a', token: 'doc-42-light-a' },
    }}));
    const model = (revision: number, incarnation = 'doc-42-light-a') => ({
      model_id: 'station-light-color-01', revision,
      source_frame: { document_id: 42, document_incarnation: incarnation },
      global_value_structure: { key: 'low' },
      ambient_environment: { id: 'twilight', role: 'ambient', family: 'cool_teal', provenance: 'user-or-prompt', chroma: 'low', value_role: 'fill' },
      emitters: [], palette_relations: ['cool_environment_dominates'], sampled_anchors: [], intentional_exceptions: [],
    });
    const writeModel = (id: string, sequence: number, value: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: id, purpose: 'lighting persistence',
      hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true, scene_lighting_color_model: value,
    } as any);
    writeModel('light-r1', 1, model(1));
    writeModel('light-r2', 2, model(2));
    writeModel('light-old-incarnation', 3, model(3, 'doc-42-light-old'));
    expect(s.sceneLightingColorModel(42)).toMatchObject({ model_id: 'station-light-color-01', revision: 2, source_operation_id: 'light-r2' });
    expect(s.compactPassContext(42).scene_lighting_color_model).toMatchObject({ revision: 2 });
    expect(s.statusCompact().documents['42'].scene_lighting_color_model).toMatchObject({ revision: 2, source_operation_id: 'light-r2' });
  });

  it('projects E.17d physical-effect debt from persistent optical owners and current E.19 causality', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({ ...current, document_instance: {
      protocol: 'photoshop.guard.document_instance.v1', document_id: 42,
      host_witness: { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'uxp-e17d', token: 'doc-42-e17d' },
    }}));
    const light = (revision: number, family: string) => ({
      model_id: 'e17d-light', revision,
      source_frame: { document_id: 42, document_incarnation: 'doc-42-e17d' },
      global_value_structure: { key: 'low' },
      ambient_environment: { id: 'twilight', role: 'ambient', family: 'cool_teal', provenance: 'user-or-prompt', chroma: 'low', value_role: 'fill' },
      emitters: [{ id: 'lantern', role: 'emitter', family, provenance: 'user-or-prompt', light_role: 'local_primary' }],
      palette_relations: [], sampled_anchors: [], intentional_exceptions: [],
    });
    const writeLight = (id: string, sequence: number, value: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: id, purpose: 'E17d light',
      hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true, scene_lighting_color_model: value,
    } as any);
    writeLight('e17d-light-r1', 1, light(1, 'warm_amber'));
    s.write({
      id: 'e17d-effect-owners', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      summary: 'effect owners', purpose: 'E17d physical roles', hash: 'hash-e17d-owners', sequence: 2,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(), phase: 'completed', execution: 'completed', failed: false, visual: true,
      result: { content: [{ type: 'text', text: JSON.stringify({ continuation_layers: [
        { layer_id: 41, hypothesis_id: 'lantern-glow', physical_role: 'optical-effect', opacity_role: 'transparent-overlay' },
        { layer_id: 42, hypothesis_id: 'camera-finish', physical_role: 'camera-post', opacity_role: 'effect-only' },
      ] }) }] },
    } as any);
    expect(s.physicalEffectCompletionDebt(42)).toEqual([
      expect.objectContaining({ code: 'physical_effect_lighting_binding_missing', owner_id: 'lantern-glow' }),
    ]);

    const components = Object.fromEntries([
      'base_response', 'form_light_response', 'specular_reflection', 'transmission',
      'surface_condition', 'variation_scale', 'edge_contact',
    ].map(key => [key, { applicability: key === 'transmission' ? 'not-applicable' : 'required', intent: `Concrete ${key} intent for optical-effect accountability.` }]));
    s.write({
      id: 'e17d-glow-binding', tool: 'photoshop_execute_visual_microplan',
      args: {
        document_id: 42,
        logical_layer: { hypothesis_id: 'lantern-glow' },
        material_response: {
          response_role: 'optical-effect', components,
          microtexture: { policy: 'deferred', intent: 'Glow remains subordinate to source causality.' },
          lighting_color_binding: {
            scene_model_id: 'e17d-light', scene_model_revision: 1,
            base_color_family: 'warm_glow', receives: ['twilight', 'lantern'], reflection_sources: ['lantern'], color_relations: [],
          },
        },
      },
      summary: 'bind glow causality', purpose: 'E17d physical roles', hash: 'hash-e17d-bind', sequence: 3,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(), phase: 'completed', execution: 'completed', failed: false, visual: true,
    } as any);
    expect(s.physicalEffectCompletionDebt(42)).toEqual([]);

    writeLight('e17d-light-r2', 4, light(2, 'pale_lemon'));
    expect(s.physicalEffectCompletionDebt(42)).toEqual([
      expect.objectContaining({ code: 'physical_effect_lighting_binding_stale', owner_id: 'lantern-glow', changed_dependency_ids: ['lantern'] }),
    ]);
    expect(s.compactPassContext(42).physical_effect_completion_debt).toEqual(s.physicalEffectCompletionDebt(42));
    expect(s.statusCompact().documents['42'].physical_effect_completion_debt).toEqual(s.physicalEffectCompletionDebt(42));
  });

  it('exposes selective lighting/color stale debt per material owner', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({ ...current, document_instance: {
      protocol: 'photoshop.guard.document_instance.v1', document_id: 42,
      host_witness: { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'uxp-light-b', token: 'doc-42-light-b' },
    }}));
    const model = (revision: number, headlightFamily: string) => ({
      model_id: 'station-light-color-selective', revision,
      source_frame: { document_id: 42, document_incarnation: 'doc-42-light-b' },
      global_value_structure: { key: 'low' },
      ambient_environment: { id: 'twilight', role: 'ambient', family: 'cool_teal', provenance: 'user-or-prompt', chroma: 'low', value_role: 'fill' },
      emitters: [{ id: 'headlight', role: 'emitter', family: headlightFamily, provenance: 'user-or-prompt', light_role: 'local_primary' }],
      palette_relations: [], sampled_anchors: [], intentional_exceptions: [],
    });
    const components = Object.fromEntries([
      'base_response', 'form_light_response', 'specular_reflection', 'transmission',
      'surface_condition', 'variation_scale', 'edge_contact',
    ].map(key => [key, { applicability: key === 'transmission' ? 'not-applicable' : 'required', intent: `Concrete ${key} intent for selective invalidation.` }]));
    const material = (receives: string[], reflections: string[]) => ({
      response_role: 'base-material', components,
      microtexture: { policy: 'deferred', intent: 'Microtexture remains downstream of scene lighting.' },
      lighting_color_binding: {
        scene_model_id: 'station-light-color-selective', scene_model_revision: 1,
        base_color_family: 'muted_metal', receives, reflection_sources: reflections, color_relations: [],
      },
    });
    const writeModel = (id: string, sequence: number, value: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: id, purpose: 'lighting invalidation',
      hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true, scene_lighting_color_model: value,
    } as any);
    writeModel('lighting-selective-r1', 1, model(1, 'warm_amber'));
    for (const [sequence, owner, response] of [
      [2, 'primaryAssembly', material(['twilight', 'headlight'], ['headlight'])],
      [3, 'supportMass', material(['twilight'], [])],
    ] as const) {
      s.write({
        id: `material-${owner}`, tool: 'photoshop_execute_visual_microplan',
        args: { document_id: 42, logical_layer: { hypothesis_id: owner }, material_response: response },
        summary: `material ${owner}`, purpose: 'lighting invalidation', hash: `hash-${owner}`, sequence,
        created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
        phase: 'completed', execution: 'completed', failed: false, visual: true,
      } as any);
    }
    writeModel('lighting-selective-r2', 4, model(2, 'pale_lemon'));

    expect(s.lightingColorBindingStates(42)).toEqual([
      expect.objectContaining({ owner_id: 'primaryAssembly', stale: true, reason: 'dependency_changed', changed_dependency_ids: ['headlight'] }),
      expect.objectContaining({ owner_id: 'supportMass', stale: false, reason: 'current', changed_dependency_ids: [] }),
    ]);
    expect(s.compactPassContext(42).lighting_color_binding_states).toEqual(s.lightingColorBindingStates(42));
    expect(s.statusCompact().documents['42'].lighting_color_binding_states).toEqual(s.lightingColorBindingStates(42));
  });

  it('bridges geometry changes into lighting stale debt only for declared spatial relations', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({ ...current, document_instance: {
      protocol: 'photoshop.guard.document_instance.v1', document_id: 42,
      host_witness: { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'uxp-light-spatial', token: 'doc-42-light-spatial' },
    }}));
    const light = {
      model_id: 'spatial-light', revision: 1,
      source_frame: { document_id: 42, document_incarnation: 'doc-42-light-spatial' },
      global_value_structure: { key: 'low' },
      ambient_environment: { id: 'twilight', role: 'ambient', family: 'cool_teal', provenance: 'user-or-prompt', chroma: 'low', value_role: 'fill' },
      emitters: [{ id: 'headlight', role: 'emitter', family: 'warm_amber', provenance: 'user-or-prompt', light_role: 'local_primary' }],
      palette_relations: [], sampled_anchors: [], intentional_exceptions: [],
    };
    const geometry = (revision: number, vpX: number) => ({
      model_id: 'spatial-geometry', revision, applicability: 'coherent_3d',
      source_frame: { document_id: 42, document_incarnation: 'doc-42-light-spatial', width: 1200, height: 800 },
      projection: { kind: 'one_point', horizon: { line: [{ x: 0, y: 300 }, { x: 1200, y: 300 }] }, vanishing_points: [
        { id: 'rail_depth', x: vpX, y: 300, evidence: 'derived', derived_from: ['left_rail', 'right_rail'] },
      ] },
    });
    const components = Object.fromEntries([
      'base_response', 'form_light_response', 'specular_reflection', 'transmission',
      'surface_condition', 'variation_scale', 'edge_contact',
    ].map(key => [key, { applicability: key === 'transmission' ? 'not-applicable' : 'required', intent: `Concrete ${key} intent for spatial lighting invalidation.` }]));
    const material = (spatial: boolean) => ({
      response_role: 'base-material', components,
      microtexture: { policy: 'deferred', intent: 'Microtexture remains downstream of spatial lighting.' },
      lighting_color_binding: {
        scene_model_id: 'spatial-light', scene_model_revision: 1,
        base_color_family: 'muted_metal', receives: ['twilight', 'headlight'], reflection_sources: ['headlight'], color_relations: [],
        ...(spatial ? { spatial_relation: {
          scene_geometry_model_id: 'spatial-geometry', scene_geometry_revision: 1, dependency_ids: ['rail_depth'],
        } } : {}),
      },
    });
    const writeScene = (id: string, sequence: number, fields: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: id, purpose: 'spatial lighting invalidation',
      hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true, ...fields,
    } as any);
    writeScene('spatial-light-r1', 1, { scene_lighting_color_model: light });
    writeScene('spatial-geometry-r1', 2, { scene_geometry_model: geometry(1, 600) });
    for (const [sequence, owner, response] of [[3, 'primaryAssembly', material(true)], [4, 'supportMass', material(false)]] as const) {
      s.write({
        id: `spatial-material-${owner}`, tool: 'photoshop_execute_visual_microplan',
        args: { document_id: 42, logical_layer: { hypothesis_id: owner }, material_response: response },
        summary: owner, purpose: 'spatial lighting invalidation', hash: `hash-spatial-${owner}`, sequence,
        created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
        phase: 'completed', execution: 'completed', failed: false, visual: true,
      } as any);
    }
    writeScene('spatial-geometry-r2', 5, { scene_geometry_model: geometry(2, 640) });

    expect(s.lightingColorBindingStates(42)).toEqual([
      expect.objectContaining({ owner_id: 'primaryAssembly', stale: true, reason: 'dependency_changed', changed_dependency_ids: ['rail_depth'],
        spatial_relation: expect.objectContaining({ stale: true, changed_dependency_ids: ['rail_depth'] }) }),
      expect.objectContaining({ owner_id: 'supportMass', stale: false }),
    ]);
  });

  it('persists the latest camera/imaging model only for the exact current document incarnation', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({ ...current, document_instance: {
      protocol: 'photoshop.guard.document_instance.v1', document_id: 42,
      host_witness: { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'uxp-camera-a', token: 'doc-42-camera-a' },
    }}));
    const camera = (revision: number, incarnation = 'doc-42-camera-a') => ({
      model_id: 'station-camera-01', revision,
      source_frame: { document_id: 42, document_incarnation: incarnation },
      geometry_model_id: 'station-geometry-01', geometry_model_revision: 3,
      lighting_color_model_id: 'station-light-color-01', lighting_color_model_revision: 2,
      camera: { framing: 'rigidScene three-quarter view', view_character: 'wide', lens_character: 'moderately wide' },
      focus: { focal_depth_or_plane: 'primaryAssembly-front-plane', depth_of_field_behavior: 'progressive-softening', foreground_softness: 'slight', background_softness: 'moderate' },
      motion: { camera_motion: 'locked', subject_motion: 'slow-arrival', shutter_character: 'mostly-frozen' },
      optical_response: { base_softness: 'low', bloom: 'local', halation: 'subtle' },
      capture_finish: { grain: 'fine', vignette: 'subtle', film_or_sensor_character: 'restrained-digital' },
      intentional_exceptions: [],
    });
    const writeCamera = (id: string, sequence: number, value: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: id, purpose: 'camera persistence',
      hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true, scene_camera_imaging_model: value,
    } as any);
    writeCamera('camera-r1', 1, camera(1));
    writeCamera('camera-r2', 2, camera(2));
    writeCamera('camera-old-incarnation', 3, camera(3, 'doc-42-camera-old'));
    expect(s.sceneCameraImagingModel(42)).toMatchObject({ model_id: 'station-camera-01', revision: 2, source_operation_id: 'camera-r2' });
    expect(s.compactPassContext(42).scene_camera_imaging_model).toMatchObject({ revision: 2 });
    expect(s.statusCompact().documents['42'].scene_camera_imaging_model).toMatchObject({ revision: 2, source_operation_id: 'camera-r2' });
  });

  it('exposes selective camera/imaging stale debt separately from geometry and lighting debt', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    s.updatePaintingState(42, current => ({ ...current, document_instance: {
      protocol: 'photoshop.guard.document_instance.v1', document_id: 42,
      host_witness: { protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'uxp-camera-selective', token: 'doc-42-camera-selective' },
    }}));
    const geometry = {
      model_id: 'camera-geometry', revision: 1, applicability: 'coherent_3d',
      source_frame: { document_id: 42, document_incarnation: 'doc-42-camera-selective', width: 1200, height: 800 },
      projection: { kind: 'one_point', vanishing_points: [{ id: 'depth-vp', x: 600, y: 300, evidence: 'proposed', derived_from: [] }] },
      line_families: [{ id: 'depth-family', vanishing_point_id: 'depth-vp', members: [
        { id: 'left-edge', points: [{ x: 100, y: 700 }, { x: 600, y: 300 }] },
        { id: 'right-edge', points: [{ x: 300, y: 700 }, { x: 600, y: 300 }] },
      ] }],
      support_planes: [{ id: 'track-plane', role: 'track', vanishing_family_ids: ['depth-family'], boundary_relations: ['left-edge', 'right-edge'] }],
      scale_anchors: [],
    };
    const camera = (revision: number, focal: string) => ({
      model_id: 'selective-camera', revision,
      source_frame: { document_id: 42, document_incarnation: 'doc-42-camera-selective' },
      geometry_model_id: 'camera-geometry', geometry_model_revision: 1,
      camera: { framing: 'rigidScene', view_character: 'normal', lens_character: 'qualitative normal lens' },
      focus: { focal_depth_or_plane: focal, depth_of_field_behavior: 'far softens', foreground_softness: 'slight', background_softness: 'soft' },
      motion: { camera_motion: 'locked', subject_motion: 'none', shutter_character: 'static' },
      optical_response: { base_softness: 'low', bloom: 'none', halation: 'none' },
      capture_finish: { grain: 'fine', vignette: 'none', film_or_sensor_character: 'neutral' },
      intentional_exceptions: [],
    });
    const geometryBinding = {
      owner_id: 'primaryAssembly', scene_geometry_model_id: 'camera-geometry', scene_geometry_revision: 1,
      support_plane_id: 'track-plane', vanishing_family_ids: ['depth-family'], dependencies: ['left-edge'],
      anchors: { near_contact: { x: 200, y: 650 } }, control_sections: [], constraints: [], local_exceptions: [],
    };
    const writeScene = (id: string, sequence: number, fields: any) => s.write({
      id, tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: id, purpose: 'camera stale projection',
      hash: `hash-${id}`, sequence, created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true, ...fields,
    } as any);
    writeScene('camera-geometry-r1', 1, { scene_geometry_model: geometry });
    writeScene('camera-selective-r1', 2, { scene_camera_imaging_model: camera(1, 'primaryAssembly-plane') });
    s.write({
      id: 'camera-owner-bindings', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 },
      summary: 'camera owners', purpose: 'camera stale projection', hash: 'hash-camera-owners', sequence: 3,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      phase: 'completed', execution: 'completed', failed: false, visual: true,
      result: { content: [{ type: 'text', text: JSON.stringify({ continuation_layers: [
        { layer_id: 12, hypothesis_id: 'primaryAssembly', geometry_binding: geometryBinding, camera_binding: {
          scene_camera_model_id: 'selective-camera', scene_camera_revision: 1, geometry_binding_owner_id: 'primaryAssembly',
          depth_role: 'focal', expected_focus_role: 'sharp', dependency_domains: ['focus'],
        } },
        { layer_id: 13, hypothesis_id: 'post', camera_binding: {
          scene_camera_model_id: 'selective-camera', scene_camera_revision: 1,
          depth_role: 'far', expected_focus_role: 'soft', dependency_domains: ['capture-finish'],
          approximate_depth_rationale: 'Atmospheric overlap provides a sufficient approximate far-depth class.',
        } },
      ] }) }] },
    } as any);
    writeScene('camera-selective-r2', 4, { scene_camera_imaging_model: camera(2, 'far-platform-plane') });

    expect(s.cameraBindingStates(42)).toEqual([
      expect.objectContaining({ owner_id: 'post', stale: false, reason: 'current', changed_dependency_ids: [] }),
      expect.objectContaining({ owner_id: 'primaryAssembly', stale: true, reason: 'dependency_changed', changed_dependency_ids: ['focus'] }),
    ]);
    expect(s.compactPassContext(42).camera_binding_states).toEqual(s.cameraBindingStates(42));
    expect(s.statusCompact().documents['42'].camera_binding_states).toEqual(s.cameraBindingStates(42));

    writeScene('camera-geometry-r2', 5, {
      scene_geometry_model: {
        ...geometry,
        revision: 2,
        support_planes: [{ ...geometry.support_planes[0], role: 'shifted track support' }],
      },
    });
    expect(s.cameraBindingStates(42)).toEqual([
      expect.objectContaining({ owner_id: 'post', stale: false, changed_dependency_ids: [] }),
      expect.objectContaining({ owner_id: 'primaryAssembly', stale: true, changed_dependency_ids: expect.arrayContaining(['focus', 'geometry']) }),
    ]);
  });

  it('exposes perceptual hierarchy stale debt separately and only for materially changed owner zones/order', () => {
    const s = store();
    writeProjectionPaintingState(s, [42]);
    const h1 = {
      protocol: 'photoshop.guard.perceptual_hierarchy.v1', revision: 1, mode: 'ranked',
      zones: [
        { id: 'hero', owner_ids: ['primaryAssembly'], priority: 'primary', contrast_budget: 'high', detail_budget: 'high', edge_certainty: 'high', chroma_accent: 'allowed' },
        { id: 'background', owner_ids: ['supportMass'], priority: 'support', contrast_budget: 'low', detail_budget: 'low', edge_certainty: 'low', chroma_accent: 'restricted' },
      ],
      ordering: ['hero', 'background'],
    };
    s.updatePaintingState(42, current => ({ ...current, art_director: {
      directive_id: 'hierarchy-directive', revision: 1, status: 'active', current_task_id: 'hero-task',
      perceptual_hierarchy: h1, perceptual_hierarchy_history: [],
      tasks: [{ task_id: 'hero-task', status: 'active', allowed_scales: ['medium'], perceptual_zone_ids: ['hero'] }],
    }}));
    s.write({
      id: 'hierarchy-owners', tool: 'photoshop_execute_visual_microplan', args: { document_id: 42 }, summary: 'hierarchy owners', purpose: 'attention binding',
      hash: 'hash-hierarchy-owners', sequence: 1, created_at: new Date().toISOString(), completed_at: new Date().toISOString(), phase: 'completed', execution: 'completed', failed: false, visual: true,
      result: { content: [{ type: 'text', text: JSON.stringify({ continuation_layers: [
        { layer_id: 21, hypothesis_id: 'primaryAssembly', attention_binding: { hierarchy_revision: 1, zone_id: 'hero', dimensions: ['contrast', 'detail', 'edge'] } },
        { layer_id: 22, hypothesis_id: 'supportMass', attention_binding: { hierarchy_revision: 1, zone_id: 'background', dimensions: ['detail'] } },
      ] }) }] },
    } as any);
    expect(s.attentionBindingStates(42)).toEqual([
      expect.objectContaining({ owner_id: 'primaryAssembly', stale: false }),
      expect.objectContaining({ owner_id: 'supportMass', stale: false }),
    ]);

    const h2 = { ...h1, revision: 2, zones: [h1.zones[0], { ...h1.zones[1], detail_budget: 'medium' }] };
    s.updatePaintingState(42, current => ({ ...current, art_director: {
      ...current.art_director, perceptual_hierarchy: h2, perceptual_hierarchy_history: [h1],
    }}));
    expect(s.attentionBindingStates(42)).toEqual([
      expect.objectContaining({ owner_id: 'primaryAssembly', stale: false, changed_dependency_ids: [] }),
      expect.objectContaining({ owner_id: 'supportMass', stale: true, changed_dependency_ids: ['zone:background'] }),
    ]);

    const h3 = { ...h2, revision: 3, ordering: ['background', 'hero'] };
    s.updatePaintingState(42, current => ({ ...current, art_director: {
      ...current.art_director, perceptual_hierarchy: h3, perceptual_hierarchy_history: [h1, h2],
    }}));
    expect(s.attentionBindingStates(42)).toEqual([
      expect.objectContaining({ owner_id: 'primaryAssembly', stale: true, changed_dependency_ids: ['ordering'] }),
      expect.objectContaining({ owner_id: 'supportMass', stale: true, changed_dependency_ids: expect.arrayContaining(['ordering']) }),
    ]);
    expect(s.compactPassContext(42).attention_binding_states).toEqual(s.attentionBindingStates(42));
    expect(s.statusCompact().documents['42'].attention_binding_states).toEqual(s.attentionBindingStates(42));
  });

});
