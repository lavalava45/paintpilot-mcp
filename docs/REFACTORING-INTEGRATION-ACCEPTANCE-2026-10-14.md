# PaintPilot — интеграционная проверка ночного рефакторинга, 2026-10-14

**Вердикт:** offline machine gate **PASS**; выборочный commit **BLOCKED** до безопасного разделения уже существующего dirty worktree; live Photoshop/Beta acceptance **NOT VERIFIED**.

## Проверенный срез

- Ветка `digital-painting`, исходный HEAD `53dd8e9` (состояние рабочей директории не равно HEAD).
- В `src/core/guard/cycle-compiler.ts` подключены 14 вынесенных модулей `compact-*.ts` с 14 соответствующими тестовыми файлами `tests/compact-*.test.ts` (помимо прежних compact-contract и compact-v2 тестов).
- Границы модулей: `compact-edge-bindings` (edge intent), `compact-change-domains` (change domains), `compact-stroke-budget` (stroke AUTO-batch), `compact-initial-layer-tone` (первичная заливка), `compact-action-class` (action class/replace), `compact-method-admissibility` (method/tool), `compact-physical-stack` (physical roles/depth/temporary stage), `compact-layer-targets` (owner/layer projection), `compact-owner-metadata` (semantic owner contract), `compact-envelope-gates` (request/document/bundle), `compact-pass-budget-gates` (hard/adaptive/layers), `compact-review-region-gates` (review crop), `compact-construction-role-gates` (construction/material), `compact-brush-material-preflight` (brush material preflight).
- Вызовы проверок остались в компиляторе, где сохраняются последовательность отказов, состояние сеанса, runtime/Photoshop dispatch, geometry/revision/owner authority. Зависимости новых модулей от типа `GuardCycleCompileViolation` являются type-only и не добавляют исполняемого обратного импорта компилятора.
- Для зафиксированного состояния компилятора SHA-256: `2E99AAD7F9F94C092CC05FBA80020B0EFE8B28751FAA192EDD5605156E924452`.

## Фактические проверки

- `npm run verify:canonical` **PASS**, exit `0`; включает `build:server`, public Guard contract, third-party notices, packaging, lint, acceptance, compact-v2, painting policy, Photoshop prompts, source independence, product identity, provenance, external intake, tool counts, live-evidence ledger structure и bilingual docs.
- Приёмочный Vitest: **174/174 файлов и 1906/1906 тестов PASS**; тесты исполнялись уже с 14 извлечёнными модулями.
- Предшествующий интеграционный адресный прогон: **18/18 файлов и 212/212 тестов PASS** (`compact-*`, `next-pass-compiler`, `geometry-contract-repair`).
- TypeScript/сборка **PASS**. ESLint **0 ошибок, 173 предупреждения** в полном проекте; адресный ESLint 14 модулей **0 ошибок, 1 предупреждение** (`compact-action-class.ts`, старый `any` в перенесённой проверке). `git diff --check` **PASS**; Git также предупреждал о будущей конвертации LF/CRLF.
- Проверка live-evidence-ledger: **STRUCTURE PASS**, 23 записи; 21 локально проверена по хешу, 2 gitignored файла отсутствуют — **не проверены**, а не считаются успешными native-прогонами.
- Журнал прогона: `%TEMP%\paintpilot-verify-canonical-20261014.log` на рабочем Windows-хосте (лог вне Git).

## Граница приёмки и открытые риски

- Это **offline/source-only** подтверждение. Не проводились Photoshop/UXP smoke, проверка фактически загруженной версии MCP/UXP, History/recovery drill, шесть квалификационных художественных прогонов или независимая визуальная приёмка.
- Отдельного воспроизведённого дефекта архитектуры в 14 выделенных проверках во время приёмки не обнаружено. При freeze не меняли production-код ради косметической переработки. `compact-physical-stack` объединяет связанные stack/stage-gates, но дальнейшее разделение без дефекта нецелесообразно.
- **Причина отсутствия коммита:** HEAD устарел относительно обширных чужих незакоммиченных изменений. `cycle-compiler.ts` содержит перемешанные ночные извлечения и более ранние незакоммиченные изменения `canvasComponent`, `problem-links`, `brush-role-extension` и другие; `CHANGELOG.md` содержит большую общую недавнюю историю. `git add` целого компилятора или changelog включил бы постороннюю работу, а commit только 14 новых файлов без подключений компилятора был бы неполной интеграцией. Ни staged changes, ни commit не создавались; ничего не сбрасывали.
- **Следующая точка:** сначала выделить базу остальных dirty-изменений в отдельные проверенные коммиты/ветку без потери правок; после этого создать атомарный refactor commit, проверить его дерево отдельно и лишь затем рассматривать условный P1 `SessionStore`. P0 продолжение компилятора, P1/P2/P3 остаются открытыми.

## Дополнение 10:19 — частичная разблокировка отдельной фиксации

В отдельной Git worktree на точной базе `53dd8e9` сформирован и закоммичен **самостоятельный срез 13 из 14 модулей**: `3151952ec226c6c2e8f43d1d693b7f083eb1fa59`, ветка `integration/night-refactor-20261014`, 29 файлов (13 модулей, 13 owning-тестов, компилятор, CHANGELOG и отдельный документ). В изолированной worktree: TypeScript PASS; 17 файлов / 192 теста PASS; `verify:canonical` **PASS**, 149 файлов / 1588 тестов PASS, ESLint 0 ошибок. Точные исходные байты пяти лицензий были восстановлены из HEAD исключительно в проверочной worktree, поскольку Windows `core.autocrlf=true` вызывал ложный SHA-256 drift при первом canonical-run; лицензии в коммит не вошли.

**Почему не 14/14:** `compact-change-domains` в большом незакоммиченном рабочем дереве связан с новым поведением проверки `raw.change_domains`, которого нет в чистом HEAD. Включить его как эквивалентное извлечение означало бы скрытно изменить контракт. Аналогично изолированный вызов `compact-layer-targets` сохраняет прежнее ограничение проверки масштаба HEAD, не захватывая отдельную политику расширенной cross-layer в большом рабочем дереве. Остаток незакоммиченного дерева не переносился, не сбрасывался и не коммитился.

Исходная ветка `digital-painting` **не переключалась и не продвигалась** на `3151952`. Отдельный коммит существует на технической ветке и не предназначен для автоматического cherry-pick в текущее грязное дерево без предварительного согласования и интеграции. Приёмка 1906/1906 тестов выше остаётся доказательством **текущего полного дерева** (14 модулей); 1588/1588 — доказательством **другого изолированного коммита** (13 модулей), эти два результата нельзя смешивать. P0/P1/P2/P3 и live Beta acceptance не закрыты.

## Дополнение 10:40 — завершение согласованного P0 в изолированной ветке

Поверх `3151952` создан коммит `c98fda14714370d70d5641826d7ba101dca66cbc`
(`fix(guard): validate authored compact change domains`). Он включает
четырнадцатый `compact-change-domains.ts`, его 4 unit-теста, два интеграционных
fail-closed теста для direct/VisualMicroPlan, подключения в компиляторе и
документацию. Изменение **намеренно семантическое**: в чистом HEAD не было
такого компиляторного admission для `raw.change_domains`, поэтому оно
зафиксировано отдельным коммитом, а не смешано с 13 механическими извлечениями.
В изолированной worktree: TypeScript PASS, адресные 4 файла / 114 тестов PASS,
`npm run verify:canonical` **PASS, exit 0**; acceptance matrix — 150 тестовых
файлов; ESLint 0 ошибок, 84 предупреждения. Первый canonical-прогон в этой
Windows worktree упёрся только в авто-CRLF лицензионных notices: они были
восстановлены побайтно из HEAD в этой worktree, затем canonical прошёл.

**Вердикт:** согласованный ограниченный P0 по выделению 14 проверочных
модулей закрыт на проверенной технической ветке. Это **не завершение**
всей декомпозиции `compileCompactPass()`, а также **не merge** в грязную
основную ветку, не live/runtime verification и не закрытие Beta-гейтов.
Открыты чистая интеграция веток, приёмка новой семантики в загруженном
рантайме, условный P1 `SessionStore` и P2/P3 Runtime/MCP/UXP.
