/** User-visible PaintPilot report/progress copy. Never localize wire protocol keys. */
export const REPORT_LANGUAGES = ['ru', 'en', 'es', 'pt-BR', 'de', 'fr'] as const;
export type ReportLanguage = typeof REPORT_LANGUAGES[number];
export const CONFIG_LANGUAGES = ['auto', ...REPORT_LANGUAGES] as const;

export function normalizeReportLanguage(value: unknown): ReportLanguage | undefined {
  if (typeof value !== 'string') return undefined;
  const canonical = value.trim().toLowerCase();
  if (canonical === 'pt-br' || canonical === 'pt_br') return 'pt-BR';
  return REPORT_LANGUAGES.find(item => item.toLowerCase() === canonical);
}

/** Auto preserves the old Cyrillic/other fallback; the host owns conversation-language detection. */
export function effectiveReportLanguage(value: unknown, ...samples: unknown[]): ReportLanguage {
  return normalizeReportLanguage(value)
    ?? (samples.some(sample => /[А-Яа-яЁё]/.test(String(sample ?? ''))) ? 'ru' : 'en');
}

const en = {
  frame: 'Frame', operation: 'Operation', stage: 'Stage', region: 'Region',
  before: 'Before pass:', after: 'After pass:', did: 'Did', why: 'Why', result: 'Result',
  missing: 'No pre-pass artistic commentary was recorded.', technicalRecord: 'Technical record:',
  unconfirmedPass: 'Pass execution is unconfirmed.', unassessedVisual: 'The visual result is not yet assessed.',
  rollback: 'The pass was rejected; rollback was selected.',
  completedStep: 'I completed this step: {text}.', defaultStep: 'I completed the next artistic step.',
  purpose: 'This is to {text}.', outcome: 'As a result, {text}.',
  toolIntro: 'In Photoshop I use the {tools}.', brushSettings: 'Brush settings: {settings}.',
  workingLayer: 'Working layer', brushPreset: 'Brush preset', gaussianRadius: 'Gaussian Blur: radius',
  blendMode: 'Blend mode', layerOpacity: 'Layer opacity', regionFills: 'Region fills',
  regionFill: 'Region fill', opacity: 'opacity', gradientDirection: 'Mask gradient direction',
  gradientBounds: 'Mask gradient bounds', gradient: 'Gradient', colorStops: 'Color stops',
  brushSize: '{value} px size', brushSetting: '{value}% {key}',
  toolBrush: 'brush', toolPencil: 'pencil', toolSmudge: 'Smudge tool', toolEraser: 'eraser',
  toolGaussian: 'Gaussian Blur', toolSmartBlur: 'Smart Blur', toolRegions: 'filled regions',
  toolFillLayer: 'layer fill', toolRectangle: 'rectangular selection', toolEllipse: 'elliptical selection',
  toolMask: 'layer mask', toolGradientMask: 'gradient mask', toolColorGradient: 'gradient',
  toolMoveLayer: 'layer move', toolScaleLayer: 'layer scaling', toolRotateLayer: 'layer rotation',
  toolBlend: 'layer blend mode', toolOpacity: 'layer opacity', toolCurves: 'Curves',
  toolLevels: 'Levels', toolContentAware: 'Content-Aware Fill',
  brushHardness: 'hardness', brushOpacity: 'opacity', brushFlow: 'flow',
  brushSpacing: 'spacing', brushSmoothing: 'smoothing',
  directionRightLeft: 'right to left', directionLeftRight: 'left to right',
  directionTopBottom: 'top to bottom', directionBottomTop: 'bottom to top',
  passCompleted: 'Completed the planned artistic pass{region}.',
  passUnconfirmed: 'Execution of the artistic pass{region} is unconfirmed.',
  inRegion: ' in “{region}”',
  observedSaved: 'A visual observation was recorded for this pass only.',
  executionConfirmed: 'Execution confirmed; the visual result is not yet assessed.',
  executionUnconfirmed: 'Execution unconfirmed; the visual result is not yet assessed.',
  guardCompleted: 'Guard recorded completion of {tool}.',
  guardUnconfirmed: 'Guard recorded unconfirmed execution of {tool}.',
  guardWhy: 'Close the technical operation cycle and persist the confirmed state.',
  intentMissing: 'The artistic intent of this pass was not recorded.',
  now: 'Now', next: 'Next', observed: 'Observed', unresolved: 'Unresolved visual basis',
  idleNow: 'working session restored', idleWhy: 'continue from the last confirmed state without replaying actions',
  idlePhotoshop: 'no active operation', defaultNow: 'performing the next Photoshop step',
  nextNotExecuted: 'correct the rejected request; Photoshop did not execute the operation',
  nextFailed: 'reconcile confirmed state without replaying the mutation',
  nextBefore: 'execute the planned mutation after recording the starting frame',
  nextAfterLocal: 'compare the local before/after frames and assess the result',
  nextAfter: 'inspect the final frame and assess the result',
  nextRollback: 'complete bounded rollback of the rejected pass',
  nextVerdict: 'continue from the recorded observation and remaining defects',
  nextVisual: 'assess the image and decide whether to accept, correct or roll back',
  nextNonvisual: 'use the result for the next task decision',
  nextFocus: 'compare the local before/after frames',
  nextPreview: 'obtain and assess the final frame before the next mutation',
  nextInspect: 'inspect the delivered frame', nextSave: 'confirm the checkpoint and continue from saved state',
  nextGeneric: 'assess the result and select the next useful step',
  statusNotExecuted: 'operation was not executed', statusQueued: 'operation is queued',
  statusStarting: 'operation is starting', statusBefore: 'capturing the starting frame',
  statusAfter: 'capturing the final frame', statusAwaiting: 'execution completed; the final frame is still required',
  statusVisualConfirmed: 'execution completed; final frame recorded',
  statusVisualUnconfirmed: 'execution completed; final frame is unconfirmed',
  statusCompleted: 'operation completed', statusFailed: 'operation failed',
  statusUncertain: 'execution outcome is unconfirmed', statusRunning: 'operation is running',
  unchangedFrame: 'Decoded BEFORE/AFTER frames are identical. This pass produced no visible change; the claimed improvement is unconfirmed.',
};

type Messages = { [K in keyof typeof en]: string };

const ru: Messages = {
  frame:'Кадр',operation:'Операция',stage:'Этап',region:'Область',before:'Перед проходом:',after:'После прохода:',did:'Что сделал',why:'Зачем',result:'Результат',
  missing:'Художественный комментарий перед проходом не был записан.',technicalRecord:'Техническая запись:',unconfirmedPass:'Выполнение прохода не подтверждено.',unassessedVisual:'Визуальный результат ещё не оценён.',rollback:'Проход признан неудачным; выбран откат.',
  completedStep:'Я сделал следующий шаг: {text}.',defaultStep:'Я сделал следующий художественный шаг.',purpose:'Для того чтобы {text}.',outcome:'В результате {text}.',
  toolIntro:'В Photoshop я использую {tools}.',brushSettings:'Для кисти ставлю {settings}.',workingLayer:'Рабочий слой',brushPreset:'Кисть',gaussianRadius:'Размытие по Гауссу: радиус',blendMode:'Режим наложения',layerOpacity:'Непрозрачность слоя',regionFills:'Контурных заливок',regionFill:'Контурная заливка',opacity:'непрозрачность',gradientDirection:'Направление градиента маски',gradientBounds:'Границы градиента маски',gradient:'Градиент',colorStops:'Цветовые точки',brushSize:'размер {value} px',brushSetting:'{key} {value}%',
  toolBrush:'кисть',toolPencil:'карандаш',toolSmudge:'палец / Smudge',toolEraser:'ластик',toolGaussian:'размытие по Гауссу',toolSmartBlur:'Smart Blur',toolRegions:'заливку контуров',toolFillLayer:'заливку слоя',toolRectangle:'прямоугольное выделение',toolEllipse:'эллиптическое выделение',toolMask:'маску слоя',toolGradientMask:'градиент на маске',toolColorGradient:'градиент',toolMoveLayer:'перемещение слоя',toolScaleLayer:'масштабирование слоя',toolRotateLayer:'поворот слоя',toolBlend:'режим наложения слоя',toolOpacity:'непрозрачность слоя',toolCurves:'Кривые',toolLevels:'Уровни',toolContentAware:'заливку с учётом содержимого',
  brushHardness:'жёсткость',brushOpacity:'непрозрачность',brushFlow:'поток',brushSpacing:'интервал',brushSmoothing:'сглаживание',directionRightLeft:'справа налево',directionLeftRight:'слева направо',directionTopBottom:'сверху вниз',directionBottomTop:'снизу вверх',
  passCompleted:'Выполнен запланированный художественный проход{region}.',passUnconfirmed:'Выполнение художественного прохода не подтверждено{region}.',inRegion:' в области «{region}»',observedSaved:'Визуальное наблюдение записано; оно относится только к этому проходу.',executionConfirmed:'Выполнение подтверждено; визуальный результат ещё не оценён.',executionUnconfirmed:'Выполнение не подтверждено; визуальный результат ещё не оценён.',guardCompleted:'Guard зафиксировал завершение операции {tool}.',guardUnconfirmed:'Guard зафиксировал неподтверждённое выполнение операции {tool}.',guardWhy:'Закрыть технический цикл операции и сохранить подтверждённое состояние.',intentMissing:'Художественный замысел прохода не записан.',
  now:'Сейчас',next:'Следом',observed:'Наблюдение',unresolved:'Нерешённое визуальное основание',idleNow:'рабочая сессия восстановлена',idleWhy:'продолжить с последнего подтверждённого состояния без повторного выполнения действий',idlePhotoshop:'активной операции нет',defaultNow:'выполняю следующий шаг в Photoshop',
  nextNotExecuted:'исправить отклонённый запрос; операция в Photoshop не выполнялась',nextFailed:'восстановить подтверждённое состояние без повторного запуска действия',nextBefore:'после фиксации исходной области выполнить запланированное действие',nextAfterLocal:'сравнить исходный и итоговый кадры области и оценить результат',nextAfter:'проверить итоговый кадр и оценить результат',nextRollback:'завершить ограниченный откат отвергнутого прохода',nextVerdict:'продолжить по записанному наблюдению и оставшимся недостаткам',nextVisual:'оценить изображение и решить: принять, скорректировать или откатить',nextNonvisual:'использовать результат для следующего решения по задаче',nextFocus:'сравнить исходный и итоговый кадры именно этой области',nextPreview:'получить итоговый кадр и оценить его перед следующим действием',nextInspect:'визуально проверить полученный кадр',nextSave:'подтвердить сохранение и продолжить с сохранённого состояния',nextGeneric:'оценить результат и выбрать следующий осмысленный шаг',
  statusNotExecuted:'операция не выполнялась',statusQueued:'операция поставлена в очередь',statusStarting:'операция запускается',statusBefore:'снимается исходный кадр',statusAfter:'снимается итоговый кадр',statusAwaiting:'выполнение завершено; итоговый кадр ещё нужен',statusVisualConfirmed:'выполнение завершено; итоговый кадр записан',statusVisualUnconfirmed:'выполнение завершено; итоговый кадр не подтверждён',statusCompleted:'операция завершена',statusFailed:'операция завершилась ошибкой',statusUncertain:'результат выполнения не подтверждён',statusRunning:'операция выполняется',
  unchangedFrame:'Декодированные кадры до и после совпадают. Этот проход не дал видимого изменения; заявленное улучшение не подтверждено.',
};

const es: Messages = {
  frame:'Fotograma',operation:'Operación',stage:'Etapa',region:'Zona',before:'Antes de la pasada:',after:'Después de la pasada:',did:'Qué hice',why:'Por qué',result:'Resultado',
  missing:'No se registró ningún comentario artístico previo.',technicalRecord:'Registro técnico:',unconfirmedPass:'La ejecución de la pasada no está confirmada.',unassessedVisual:'El resultado visual aún no se ha evaluado.',rollback:'Se rechazó la pasada y se eligió deshacerla.',
  completedStep:'He completado este paso: {text}.',defaultStep:'He completado el siguiente paso artístico.',purpose:'El objetivo es {text}.',outcome:'Como resultado, {text}.',
  toolIntro:'En Photoshop utilizo {tools}.',brushSettings:'Ajustes del pincel: {settings}.',workingLayer:'Capa de trabajo',brushPreset:'Pincel',gaussianRadius:'Desenfoque gaussiano: radio',blendMode:'Modo de fusión',layerOpacity:'Opacidad de la capa',regionFills:'Rellenos de regiones',regionFill:'Relleno de región',opacity:'opacidad',gradientDirection:'Dirección del degradado de máscara',gradientBounds:'Límites del degradado de máscara',gradient:'Degradado',colorStops:'Paradas de color',brushSize:'tamaño {value} px',brushSetting:'{key} {value}%',
  toolBrush:'pincel',toolPencil:'lápiz',toolSmudge:'herramienta Dedo',toolEraser:'borrador',toolGaussian:'desenfoque gaussiano',toolSmartBlur:'desenfoque suavizado',toolRegions:'relleno de regiones',toolFillLayer:'relleno de capa',toolRectangle:'selección rectangular',toolEllipse:'selección elíptica',toolMask:'máscara de capa',toolGradientMask:'degradado de máscara',toolColorGradient:'degradado',toolMoveLayer:'movimiento de capa',toolScaleLayer:'escalado de capa',toolRotateLayer:'rotación de capa',toolBlend:'modo de fusión de capa',toolOpacity:'opacidad de capa',toolCurves:'Curvas',toolLevels:'Niveles',toolContentAware:'relleno según el contenido',
  brushHardness:'dureza',brushOpacity:'opacidad',brushFlow:'flujo',brushSpacing:'espaciado',brushSmoothing:'suavizado',directionRightLeft:'de derecha a izquierda',directionLeftRight:'de izquierda a derecha',directionTopBottom:'de arriba abajo',directionBottomTop:'de abajo arriba',
  passCompleted:'Se completó la pasada artística prevista{region}.',passUnconfirmed:'La ejecución de la pasada artística{region} no está confirmada.',inRegion:' en «{region}»',observedSaved:'Se registró una observación visual solo para esta pasada.',executionConfirmed:'Ejecución confirmada; el resultado visual aún no se ha evaluado.',executionUnconfirmed:'Ejecución sin confirmar; el resultado visual aún no se ha evaluado.',guardCompleted:'Guard registró la finalización de {tool}.',guardUnconfirmed:'Guard registró una ejecución sin confirmar de {tool}.',guardWhy:'Cerrar el ciclo técnico y conservar el estado confirmado.',intentMissing:'No se registró la intención artística de esta pasada.',
  now:'Ahora',next:'Siguiente',observed:'Observación',unresolved:'Problema visual pendiente',idleNow:'sesión de trabajo restaurada',idleWhy:'continuar desde el último estado confirmado sin repetir acciones',idlePhotoshop:'no hay ninguna operación activa',defaultNow:'realizando el siguiente paso en Photoshop',
  nextNotExecuted:'corregir la solicitud rechazada; Photoshop no ejecutó la operación',nextFailed:'recuperar el estado confirmado sin repetir la modificación',nextBefore:'ejecutar la acción prevista tras registrar el fotograma inicial',nextAfterLocal:'comparar los fotogramas de la zona y evaluar el resultado',nextAfter:'inspeccionar el fotograma final y evaluar el resultado',nextRollback:'completar la reversión limitada de la pasada rechazada',nextVerdict:'continuar según la observación y los defectos pendientes',nextVisual:'evaluar la imagen y decidir si aceptar, corregir o deshacer',nextNonvisual:'utilizar el resultado para decidir el siguiente paso',nextFocus:'comparar los fotogramas inicial y final de esta zona',nextPreview:'obtener y evaluar el fotograma final antes de modificar',nextInspect:'inspeccionar el fotograma recibido',nextSave:'confirmar el guardado y continuar desde el estado guardado',nextGeneric:'evaluar el resultado y elegir el siguiente paso útil',
  statusNotExecuted:'la operación no se ejecutó',statusQueued:'operación en cola',statusStarting:'iniciando la operación',statusBefore:'capturando el fotograma inicial',statusAfter:'capturando el fotograma final',statusAwaiting:'ejecución completada; falta el fotograma final',statusVisualConfirmed:'ejecución completada; fotograma final registrado',statusVisualUnconfirmed:'ejecución completada; fotograma final sin confirmar',statusCompleted:'operación completada',statusFailed:'la operación falló',statusUncertain:'resultado de ejecución sin confirmar',statusRunning:'operación en curso',
  unchangedFrame:'Los fotogramas ANTES/DESPUÉS son idénticos. Esta pasada no produjo cambios visibles; la mejora declarada no está confirmada.',
};

const ptBR: Messages = {
  frame:'Quadro',operation:'Operação',stage:'Etapa',region:'Região',before:'Antes da etapa:',after:'Depois da etapa:',did:'O que fiz',why:'Por quê',result:'Resultado',
  missing:'Nenhum comentário artístico anterior à etapa foi registrado.',technicalRecord:'Registro técnico:',unconfirmedPass:'A execução da etapa não foi confirmada.',unassessedVisual:'O resultado visual ainda não foi avaliado.',rollback:'A etapa foi rejeitada e o desfazer foi selecionado.',
  completedStep:'Concluí esta etapa: {text}.',defaultStep:'Concluí a próxima etapa artística.',purpose:'O objetivo é {text}.',outcome:'Como resultado, {text}.',
  toolIntro:'No Photoshop, uso {tools}.',brushSettings:'Configurações do pincel: {settings}.',workingLayer:'Camada de trabalho',brushPreset:'Predefinição de pincel',gaussianRadius:'Desfoque gaussiano: raio',blendMode:'Modo de mesclagem',layerOpacity:'Opacidade da camada',regionFills:'Preenchimentos de regiões',regionFill:'Preenchimento de região',opacity:'opacidade',gradientDirection:'Direção do degradê da máscara',gradientBounds:'Limites do degradê da máscara',gradient:'Degradê',colorStops:'Pontos de cor',brushSize:'tamanho {value} px',brushSetting:'{key} {value}%',
  toolBrush:'pincel',toolPencil:'lápis',toolSmudge:'ferramenta Borrar',toolEraser:'borracha',toolGaussian:'desfoque gaussiano',toolSmartBlur:'desfoque inteligente',toolRegions:'preenchimento de regiões',toolFillLayer:'preenchimento de camada',toolRectangle:'seleção retangular',toolEllipse:'seleção elíptica',toolMask:'máscara de camada',toolGradientMask:'degradê de máscara',toolColorGradient:'degradê',toolMoveLayer:'movimentação de camada',toolScaleLayer:'redimensionamento de camada',toolRotateLayer:'rotação de camada',toolBlend:'modo de mesclagem da camada',toolOpacity:'opacidade da camada',toolCurves:'Curvas',toolLevels:'Níveis',toolContentAware:'preenchimento sensível ao conteúdo',
  brushHardness:'dureza',brushOpacity:'opacidade',brushFlow:'fluxo',brushSpacing:'espaçamento',brushSmoothing:'suavização',directionRightLeft:'da direita para a esquerda',directionLeftRight:'da esquerda para a direita',directionTopBottom:'de cima para baixo',directionBottomTop:'de baixo para cima',
  passCompleted:'A etapa artística planejada foi concluída{region}.',passUnconfirmed:'A execução da etapa artística{region} não foi confirmada.',inRegion:' na região “{region}”',observedSaved:'Uma observação visual foi registrada apenas para esta etapa.',executionConfirmed:'Execução confirmada; o resultado visual ainda não foi avaliado.',executionUnconfirmed:'Execução não confirmada; o resultado visual ainda não foi avaliado.',guardCompleted:'O Guard registrou a conclusão de {tool}.',guardUnconfirmed:'O Guard registrou execução não confirmada de {tool}.',guardWhy:'Encerrar o ciclo técnico e preservar o estado confirmado.',intentMissing:'A intenção artística desta etapa não foi registrada.',
  now:'Agora',next:'Próximo passo',observed:'Observação',unresolved:'Questão visual pendente',idleNow:'sessão de trabalho restaurada',idleWhy:'continuar do último estado confirmado sem repetir ações',idlePhotoshop:'nenhuma operação ativa',defaultNow:'realizando a próxima etapa no Photoshop',
  nextNotExecuted:'corrigir a solicitação rejeitada; o Photoshop não executou a operação',nextFailed:'restaurar o estado confirmado sem repetir a alteração',nextBefore:'executar a ação planejada após registrar o quadro inicial',nextAfterLocal:'comparar os quadros da região e avaliar o resultado',nextAfter:'inspecionar o quadro final e avaliar o resultado',nextRollback:'concluir a reversão limitada da etapa rejeitada',nextVerdict:'continuar com base na observação e nos problemas pendentes',nextVisual:'avaliar a imagem e decidir se deve aceitar, corrigir ou desfazer',nextNonvisual:'usar o resultado para decidir o próximo passo',nextFocus:'comparar os quadros inicial e final desta região',nextPreview:'obter e avaliar o quadro final antes da próxima alteração',nextInspect:'inspecionar o quadro recebido',nextSave:'confirmar o salvamento e continuar do estado salvo',nextGeneric:'avaliar o resultado e escolher o próximo passo útil',
  statusNotExecuted:'operação não executada',statusQueued:'operação na fila',statusStarting:'iniciando operação',statusBefore:'capturando quadro inicial',statusAfter:'capturando quadro final',statusAwaiting:'execução concluída; o quadro final ainda é necessário',statusVisualConfirmed:'execução concluída; quadro final registrado',statusVisualUnconfirmed:'execução concluída; quadro final não confirmado',statusCompleted:'operação concluída',statusFailed:'falha na operação',statusUncertain:'resultado da execução não confirmado',statusRunning:'operação em andamento',
  unchangedFrame:'Os quadros ANTES/DEPOIS são idênticos. Esta etapa não produziu mudança visível; a melhoria declarada não foi confirmada.',
};

const de: Messages = {
  frame:'Bild',operation:'Operation',stage:'Phase',region:'Bereich',before:'Vor dem Arbeitsschritt:',after:'Nach dem Arbeitsschritt:',did:'Ausgeführt',why:'Warum',result:'Ergebnis',
  missing:'Vor dem Arbeitsschritt wurde kein künstlerischer Kommentar erfasst.',technicalRecord:'Technisches Protokoll:',unconfirmedPass:'Die Ausführung des Arbeitsschritts ist nicht bestätigt.',unassessedVisual:'Das visuelle Ergebnis wurde noch nicht bewertet.',rollback:'Der Arbeitsschritt wurde verworfen; Rückgängig wurde gewählt.',
  completedStep:'Ich habe diesen Schritt abgeschlossen: {text}.',defaultStep:'Ich habe den nächsten künstlerischen Schritt abgeschlossen.',purpose:'Das Ziel ist {text}.',outcome:'Als Ergebnis: {text}.',
  toolIntro:'In Photoshop verwende ich {tools}.',brushSettings:'Pinseleinstellungen: {settings}.',workingLayer:'Arbeitsebene',brushPreset:'Pinselvorgabe',gaussianRadius:'Gaußscher Weichzeichner: Radius',blendMode:'Mischmodus',layerOpacity:'Deckkraft der Ebene',regionFills:'Flächenfüllungen',regionFill:'Flächenfüllung',opacity:'Deckkraft',gradientDirection:'Richtung des Maskenverlaufs',gradientBounds:'Grenzen des Maskenverlaufs',gradient:'Verlauf',colorStops:'Farbstopps',brushSize:'Größe {value} px',brushSetting:'{key} {value}%',
  toolBrush:'Pinsel',toolPencil:'Buntstift',toolSmudge:'Wischfinger',toolEraser:'Radiergummi',toolGaussian:'Gaußschen Weichzeichner',toolSmartBlur:'Selektiven Weichzeichner',toolRegions:'Flächenfüllung',toolFillLayer:'Ebenenfüllung',toolRectangle:'rechteckige Auswahl',toolEllipse:'elliptische Auswahl',toolMask:'Ebenenmaske',toolGradientMask:'Maskenverlauf',toolColorGradient:'Verlauf',toolMoveLayer:'Ebene verschieben',toolScaleLayer:'Ebene skalieren',toolRotateLayer:'Ebene drehen',toolBlend:'Ebenenmischmodus',toolOpacity:'Ebenendeckkraft',toolCurves:'Gradationskurven',toolLevels:'Tonwertkorrektur',toolContentAware:'inhaltsbasierte Füllung',
  brushHardness:'Härte',brushOpacity:'Deckkraft',brushFlow:'Fluss',brushSpacing:'Abstand',brushSmoothing:'Glättung',directionRightLeft:'von rechts nach links',directionLeftRight:'von links nach rechts',directionTopBottom:'von oben nach unten',directionBottomTop:'von unten nach oben',
  passCompleted:'Der geplante künstlerische Arbeitsschritt wurde abgeschlossen{region}.',passUnconfirmed:'Die Ausführung des künstlerischen Arbeitsschritts{region} ist nicht bestätigt.',inRegion:' im Bereich „{region}“',observedSaved:'Eine visuelle Beobachtung wurde nur für diesen Arbeitsschritt erfasst.',executionConfirmed:'Ausführung bestätigt; das visuelle Ergebnis wurde noch nicht bewertet.',executionUnconfirmed:'Ausführung unbestätigt; das visuelle Ergebnis wurde noch nicht bewertet.',guardCompleted:'Guard hat den Abschluss von {tool} erfasst.',guardUnconfirmed:'Guard hat die unbestätigte Ausführung von {tool} erfasst.',guardWhy:'Den technischen Vorgang abschließen und den bestätigten Zustand speichern.',intentMissing:'Die künstlerische Absicht wurde für diesen Arbeitsschritt nicht erfasst.',
  now:'Jetzt',next:'Als Nächstes',observed:'Beobachtung',unresolved:'Offenes visuelles Problem',idleNow:'Arbeitssitzung wiederhergestellt',idleWhy:'vom letzten bestätigten Zustand aus fortsetzen, ohne Aktionen zu wiederholen',idlePhotoshop:'keine aktive Operation',defaultNow:'ich führe den nächsten Schritt in Photoshop aus',
  nextNotExecuted:'abgelehnte Anfrage korrigieren; Photoshop hat die Operation nicht ausgeführt',nextFailed:'bestätigten Zustand wiederherstellen, ohne die Änderung erneut auszuführen',nextBefore:'geplante Aktion nach Erfassung des Ausgangsbildes ausführen',nextAfterLocal:'Vorher-/Nachher-Bilder des Bereichs vergleichen und Ergebnis bewerten',nextAfter:'Endbild prüfen und Ergebnis bewerten',nextRollback:'begrenztes Rückgängigmachen des verworfenen Schritts abschließen',nextVerdict:'anhand der Beobachtung und offener Mängel fortfahren',nextVisual:'Bild bewerten und über Annahme, Korrektur oder Rückgängigmachen entscheiden',nextNonvisual:'Ergebnis für die nächste Aufgabenentscheidung verwenden',nextFocus:'Vorher-/Nachher-Bilder dieses Bereichs vergleichen',nextPreview:'Endbild vor der nächsten Änderung abrufen und bewerten',nextInspect:'übermitteltes Bild prüfen',nextSave:'Speicherung bestätigen und mit gespeichertem Zustand fortfahren',nextGeneric:'Ergebnis bewerten und nächsten sinnvollen Schritt auswählen',
  statusNotExecuted:'Operation nicht ausgeführt',statusQueued:'Operation in Warteschlange',statusStarting:'Operation wird gestartet',statusBefore:'Ausgangsbild wird erfasst',statusAfter:'Endbild wird erfasst',statusAwaiting:'Ausführung abgeschlossen; Endbild wird noch benötigt',statusVisualConfirmed:'Ausführung abgeschlossen; Endbild erfasst',statusVisualUnconfirmed:'Ausführung abgeschlossen; Endbild nicht bestätigt',statusCompleted:'Operation abgeschlossen',statusFailed:'Operation fehlgeschlagen',statusUncertain:'Ausführungsergebnis nicht bestätigt',statusRunning:'Operation läuft',
  unchangedFrame:'Die dekodierten VORHER-/NACHHER-Bilder sind identisch. Dieser Schritt bewirkte keine sichtbare Änderung; die gemeldete Verbesserung ist nicht bestätigt.',
};

const fr: Messages = {
  frame:'Image',operation:'Opération',stage:'Étape',region:'Zone',before:'Avant le passage :',after:'Après le passage :',did:'Action effectuée',why:'Pourquoi',result:'Résultat',
  missing:'Aucun commentaire artistique préalable n’a été enregistré.',technicalRecord:'Journal technique :',unconfirmedPass:'L’exécution du passage n’est pas confirmée.',unassessedVisual:'Le résultat visuel n’a pas encore été évalué.',rollback:'Le passage a été rejeté ; l’annulation a été choisie.',
  completedStep:'J’ai terminé cette étape : {text}.',defaultStep:'J’ai terminé la prochaine étape artistique.',purpose:'L’objectif est de {text}.',outcome:'En conséquence, {text}.',
  toolIntro:'Dans Photoshop, j’utilise {tools}.',brushSettings:'Réglages du pinceau : {settings}.',workingLayer:'Calque de travail',brushPreset:'Forme de pinceau',gaussianRadius:'Flou gaussien : rayon',blendMode:'Mode de fusion',layerOpacity:'Opacité du calque',regionFills:'Remplissages de zones',regionFill:'Remplissage de zone',opacity:'opacité',gradientDirection:'Direction du dégradé de masque',gradientBounds:'Limites du dégradé de masque',gradient:'Dégradé',colorStops:'Étapes de couleur',brushSize:'taille {value} px',brushSetting:'{key} {value} %',
  toolBrush:'pinceau',toolPencil:'crayon',toolSmudge:'outil Doigt',toolEraser:'gomme',toolGaussian:'flou gaussien',toolSmartBlur:'flou optimisé',toolRegions:'remplissage de zones',toolFillLayer:'remplissage de calque',toolRectangle:'sélection rectangulaire',toolEllipse:'sélection elliptique',toolMask:'masque de fusion',toolGradientMask:'dégradé de masque',toolColorGradient:'dégradé',toolMoveLayer:'déplacement de calque',toolScaleLayer:'mise à l’échelle du calque',toolRotateLayer:'rotation du calque',toolBlend:'mode de fusion du calque',toolOpacity:'opacité du calque',toolCurves:'Courbes',toolLevels:'Niveaux',toolContentAware:'remplissage d’après le contenu',
  brushHardness:'dureté',brushOpacity:'opacité',brushFlow:'flux',brushSpacing:'pas',brushSmoothing:'lissage',directionRightLeft:'de droite à gauche',directionLeftRight:'de gauche à droite',directionTopBottom:'de haut en bas',directionBottomTop:'de bas en haut',
  passCompleted:'Le passage artistique prévu est terminé{region}.',passUnconfirmed:'L’exécution du passage artistique{region} n’est pas confirmée.',inRegion:' dans la zone « {region} »',observedSaved:'Une observation visuelle a été enregistrée uniquement pour ce passage.',executionConfirmed:'Exécution confirmée ; le résultat visuel n’a pas encore été évalué.',executionUnconfirmed:'Exécution non confirmée ; le résultat visuel n’a pas encore été évalué.',guardCompleted:'Guard a enregistré la fin de {tool}.',guardUnconfirmed:'Guard a enregistré une exécution non confirmée de {tool}.',guardWhy:'Clore le cycle technique et conserver l’état confirmé.',intentMissing:'L’intention artistique de ce passage n’a pas été enregistrée.',
  now:'Maintenant',next:'Ensuite',observed:'Observation',unresolved:'Problème visuel non résolu',idleNow:'session de travail restaurée',idleWhy:'reprendre depuis le dernier état confirmé sans répéter les actions',idlePhotoshop:'aucune opération en cours',defaultNow:'je réalise l’étape suivante dans Photoshop',
  nextNotExecuted:'corriger la demande rejetée ; Photoshop n’a pas exécuté l’opération',nextFailed:'rétablir l’état confirmé sans répéter la modification',nextBefore:'effectuer l’action prévue après avoir enregistré l’image initiale',nextAfterLocal:'comparer les images avant/après de la zone et évaluer le résultat',nextAfter:'examiner l’image finale et évaluer le résultat',nextRollback:'terminer l’annulation limitée du passage rejeté',nextVerdict:'continuer à partir de l’observation et des défauts restants',nextVisual:'évaluer l’image et décider de valider, corriger ou annuler',nextNonvisual:'utiliser le résultat pour décider de la prochaine action',nextFocus:'comparer les images avant/après de cette zone',nextPreview:'obtenir et évaluer l’image finale avant la modification suivante',nextInspect:'examiner l’image reçue',nextSave:'confirmer l’enregistrement et reprendre depuis l’état sauvegardé',nextGeneric:'évaluer le résultat et choisir la prochaine action utile',
  statusNotExecuted:'opération non exécutée',statusQueued:'opération en attente',statusStarting:'démarrage de l’opération',statusBefore:'capture de l’image initiale',statusAfter:'capture de l’image finale',statusAwaiting:'exécution terminée ; image finale encore nécessaire',statusVisualConfirmed:'exécution terminée ; image finale enregistrée',statusVisualUnconfirmed:'exécution terminée ; image finale non confirmée',statusCompleted:'opération terminée',statusFailed:'échec de l’opération',statusUncertain:'résultat de l’exécution non confirmé',statusRunning:'opération en cours',
  unchangedFrame:'Les images AVANT/APRÈS décodées sont identiques. Ce passage n’a produit aucun changement visible ; l’amélioration annoncée n’est pas confirmée.',
};

const catalog: Record<ReportLanguage, Messages> = { en, ru, es, 'pt-BR': ptBR, de, fr };
export type ReportMessageKey = keyof Messages;
export function reportText(language: unknown, key: ReportMessageKey, variables: Record<string, unknown> = {}): string {
  let result = catalog[effectiveReportLanguage(language)][key];
  for (const [name, value] of Object.entries(variables)) result = result.split(`{${name}}`).join(String(value));
  return result;
}

export const MODEL_REPORT_LANGUAGE_NAME: Record<ReportLanguage, string> = {
  ru: 'Russian', en: 'English', es: 'Spanish', 'pt-BR': 'Brazilian Portuguese', de: 'German', fr: 'French',
};

/** English safety instructions may remain in the model-facing protocol, not in reports. */
export function modelReportLanguageDirective(language: unknown): string {
  const normalized = normalizeReportLanguage(language);
  return normalized ? `Write all user-visible observations, goals, reports and commentary in ${MODEL_REPORT_LANGUAGE_NAME[normalized]}. Preserve machine identifiers and Photoshop layer names verbatim.` : '';
}
