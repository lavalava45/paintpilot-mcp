# PaintPilot — изолированная фиксация ночных извлечений (2026-10-14)

**База:** `53dd8e9` (`digital-painting` до незакоммиченных изменений).
**Статус:** 13 из 14 выделенных модулей собраны в независимой Git worktree,
сохранены все исходные файлы и тесты выбранного среза без включения других изменений.

Выполнены 13 извлечений: `compact-edge-bindings`, `compact-stroke-budget`,
`compact-initial-layer-tone`, `compact-action-class`, `compact-method-admissibility`,
`compact-physical-stack`, `compact-layer-targets`, `compact-owner-metadata`,
`compact-envelope-gates`, `compact-pass-budget-gates`,
`compact-review-region-gates`, `compact-construction-role-gates`,
`compact-brush-material-preflight`. Для каждого создан owning-тест.

**Изолированные проверки:** `npx tsc --noEmit` PASS; адресные 192/192 PASS
(17 файлов); `npm run verify:canonical` PASS, 149/149 тестовых файлов,
1588/1588 тестов; ESLint без ошибок. Из-за Windows `core.autocrlf=true`
пять неизменённых лицензионных notices во временном checkout были восстановлены
побайтно из HEAD перед канонической проверкой; эти файлы не фиксируются.

**Объём коммита:** изменения компилятора для 13 чистых извлечений,
13 новых модулей, 13 тестовых файлов и эта документация/CHANGELOG.
Вынесенный `compact-change-domains` **оставлен вне изолированного коммита**:
в базовом HEAD проверка `raw.change_domains` ещё не существовала, а текущий
вызов валидатора связан с независимым изменением policy. Сохранена исходная
HEAD-ограниченность сканирования физических layer targets по масштабу —
в отличие от другой незакоммиченной работы, расширяющей проверку на все масштабы.
Обе зоны требуют отдельной policy/release квалификации.

**Не проверялось:** загруженная версия MCP, Photoshop/UXP native smoke,
реальные History/recovery, шесть художественных сцен и Beta acceptance.
Большое исходное рабочее дерево, включая 14-й helper, остаётся нетронутым;
техническая ветка не является предложением заменять его `reset`/`checkout`.
