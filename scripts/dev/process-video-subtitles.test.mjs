import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subtitleBlocks, distributeSubtitleBlocks, missingSidecarCommentary } from './process-video-subtitles.mjs';

test('existing sidecar keeps intent, craft/settings and observed result as three blocks', () => {
  const text = '\uFEFFЯ планирую уточнить руку.\r\nХочу сохранить её изгиб.\r\n'
    + 'В Photoshop я использую кисть.\r\nРазмер кисти: 20 px.\r\n\r\n'
    + 'После прохода изгиб стал плавнее. Результат пока не завершён.\r\nНужна следующая правка.';
  const blocks = subtitleBlocks(text);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0], 'Я планирую уточнить руку.\nХочу сохранить её изгиб.');
  assert.equal(blocks[1], 'В Photoshop я использую кисть.\nРазмер кисти: 20 px.');
  assert.equal(blocks[2], 'После прохода изгиб стал плавнее. Результат пока не завершён.\nНужна следующая правка.');
  const cues = distributeSubtitleBlocks(blocks, 2, 14, 7);
  assert.deepEqual(cues.map(({ index, start, end }) => [index, start, end]),
    [[7, 2, 6], [8, 6, 10], [9, 10, 14]]);
});

test('paragraphs, plain legacy lines, single block and English craft are retained', () => {
  assert.deepEqual(subtitleBlocks('One sentence. Another sentence.'), ['One sentence. Another sentence.']);
  assert.deepEqual(subtitleBlocks('One\nTwo\nThree'), ['One', 'Two', 'Three']);
  assert.deepEqual(subtitleBlocks('One\ncontinued\n \nTwo\n\nThree'), ['One\ncontinued', 'Two', 'Three']);
  assert.deepEqual(subtitleBlocks('I will refine the form.\nIn Photoshop I use the brush.\nSize: 10 px.\n\nStill unfinished.'),
    ['I will refine the form.', 'In Photoshop I use the brush.\nSize: 10 px.', 'Still unfinished.']);
  assert.deepEqual(subtitleBlocks(' \r\n'), []);
});

test('fractional adjacent clip boundaries are shared and last cue ends exactly at clip end', () => {
  const first = distributeSubtitleBlocks(['a', 'b', 'c'], 0, 1.2344);
  const second = distributeSubtitleBlocks(['d', 'e', 'f'], 1.2344, 5.2357, 4);
  assert.equal(first[0].start, 0);
  assert.equal(first.at(-1).end, second[0].start);
  assert.equal(second.at(-1).end, 5.236);
  for (const cues of [first, second]) {
    const durations = cues.map((cue) => Math.round((cue.end - cue.start) * 1000));
    assert.ok(Math.max(...durations) - Math.min(...durations) <= 1);
    cues.slice(1).forEach((cue, index) => assert.equal(cues[index].end, cue.start));
  }
});

test('very short segments preserve text without zero-length cues; invalid timing fails', () => {
  const cues = distributeSubtitleBlocks(['a', 'b', 'c'], 0, 0.002);
  assert.equal(cues.map((cue) => cue.text).join('\n'), 'a\nb\nc');
  assert.equal(cues.length, 2);
  assert.ok(cues.every((cue) => cue.end > cue.start));
  assert.equal(cues.at(-1).end, 0.002);
  assert.throws(() => distributeSubtitleBlocks(['a'], 1, 1));
});

test('missing sidecars use recorded manifest intent/outcome without inventing success', () => {
  const fallback = missingSidecarCommentary({ artistic_intent: 'Я хочу уточнить гриф.' });
  assert.deepEqual(subtitleBlocks(fallback), ['Я хочу уточнить гриф.',
    'Комментарий к результату этого фрагмента не сохранён; успешное выполнение не подтверждается.']);
  assert.equal(missingSidecarCommentary({ artistic_intent: 'Attempt a correction.', outcome_note: 'Not executed.' }),
    'Attempt a correction.\n\nNot executed.');
  assert.match(missingSidecarCommentary({ artistic_intent: 'Attempt a correction.' }), /not confirmed/);
  assert.throws(() => missingSidecarCommentary({ artistic_intent: ' ' }), /Missing subtitle/);
});
