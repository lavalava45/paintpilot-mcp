# PaintPilot P0 — итоговая source-only приёмка, 2026-10-14

## Итог согласованного P0

В отдельной технической ветке `integration/night-refactor-20261014`
создано 14 модулей `src/core/guard/compact-*.ts` и 14 собственных
`tests/compact-*.test.ts`; все 14 подключены к `cycle-compiler.ts`.
Первый коммит `3151952` выделяет 13 модулей на исходной чистой базе.
Следующий коммит содержит `compact-change-domains` и отдельные
Guard-контрактные регрессии. В основной ветке `digital-painting` ничего
не переключалось и незакоммиченное дерево не заменялось.

## Финальный архитектурный контроль

- Вынесены проверки envelope/документа, method/action, бюджета и stroke,
  semantic layer owner, physical stack, review region, brush material,
  construction role, edge binding и change domain. Компилятор сохраняет
  сборку конечной операции, authority, state/owner/geometry/revision,
  exact BEFORE/AFTER review и dispatch; это не новый слой допуска.
- 14 модулей подключены статическими импортами. `GuardCycleCompileViolation`
  импортируется только как TypeScript `import type`, поэтому исполняемого
  обратного импорта в компилятор не появилось.
- Четырнадцатый модуль — **не механическое извлечение** из чистого HEAD.
  Он проверяет явно объявленные `change_domains` и добавляет допустимые
  домены к вычисленным. Недопустимые данные отклоняются до диспатча;
  реальные tool mutations в двух новых регрессионных сценариях не исполнялись.
  Эта семантика уже присутствовала в большом незакоммиченном рабочем дереве;
  изолированный коммит теперь сохраняет её отдельно и явно.
- Stateful cross-layer authority, doc identity, History, no-replay, exact-image
  review, geometry/causal revision bindings и recovery **не переносились**.
  В `compileCompactPass()` остаётся крупная stateful часть; её дальнейшее
  разделение откладывается до отдельного доказательства безопасности.

## Верификация

- Исходный изолированный коммит 13 модулей: `verify:canonical` PASS,
  149 test files/1588 tests PASS.
- После интеграции 14-го: `npx tsc --noEmit` PASS; адресные
  `compact-contract-regressions`, `compact-change-domains`, `next-pass-compiler`,
  `direct-change-domains`: **114/114 PASS** (4 files);
  `npm run verify:canonical` **PASS, exit 0**, acceptance matrix 150 files,
  lint 0 errors/84 warnings, Guard contract, packaging, policy, product
  identity, provenance, evidence ledger, tooling and bilingual docs PASS.
- Первоначальный gate в Windows worktree упёрся в автоматически заменённые
  CRLF у пяти неизменённых license notices. Они восстановлены **побайтно
  из HEAD в изолированной worktree**, после чего проверка всех сторонних
  лицензий и полный `verify:canonical` успешно прошли. Эти лицензии в
  коммиты не включаются.

**Граница завершения:** ограниченный P0 этап из 14 чистых boundary-helper
модулей закрыт как проверенная source-level инженерная задача. Это **не**
Beta/release или live Photoshop-acceptance, не доказательство финального
качества картины и не требование немедленно начинать P1. Следующие задачи:
контролируемая интеграция технической ветки с текущим грязным деревом,
отдельная live-квалификация изменения `change_domains`, условный P1
`SessionStore`, инвентаризация Runtime/MCP/UXP по P2/P3.
