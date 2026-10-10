/** Offline documentation parity and relative-link verification. No network or Photoshop. */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chapters = [
  'README.md', 'how-it-works.md', 'painting-method.md', 'guard-and-recovery.md',
  'visual-verification.md', 'runtime-adaptation.md', 'findings.md',
  'process-revision-perspective-color.md', 'evaluation.md',
];
const errors = [];
const imageSets = { ru: new Set(), en: new Set() };
const byChapter = { ru: new Map(), en: new Map() };
const imageRe = /!\[[^\]]*\]\(([^)]+)\)/g;
const linkRe = /!?\[[^\]]*\]\(([^)]+)\)/g;

for (const lang of ['ru', 'en']) {
  for (const name of chapters) {
    const path = join(root, 'docs', lang, name);
    if (!existsSync(path)) {
      errors.push(`Missing ${lang} chapter: ${name}`);
      continue;
    }
    const source = readFileSync(path, 'utf8');
    if (source.length < 900) errors.push(`Suspiciously short ${lang} chapter: ${name}`);
    const other = lang === 'ru' ? 'en' : 'ru';
    const pair = name === 'README.md' ? `../${other}/README.md` : `../${other}/${name}`;
    if (!source.includes(pair)) errors.push(`Missing reciprocal language link: ${lang}/${name}`);
    for (const match of source.matchAll(linkRe)) {
      const target = match[1].trim().split(/[?#]/)[0];
      if (!target || /^(?:https?:|mailto:|data:|#)/i.test(target)) continue;
      const link = resolve(dirname(path), decodeURIComponent(target));
      if (!existsSync(link)) errors.push(`Broken relative link: docs/${lang}/${name} → ${target}`);
    }
    for (const match of source.matchAll(imageRe)) {
      const imagePath = resolve(dirname(path), match[1].split(/[?#]/)[0]);
      if (!['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(extname(imagePath).toLowerCase()))
        errors.push(`Unsupported illustration format: ${match[1]}`);
      if (!imagePath.includes(join('docs', 'ru', 'images')))
        errors.push(`Historical evidence must be shared from original RU images: ${lang}/${name}`);
      imageSets[lang].add(imagePath);
    }
    byChapter[lang].set(name, {
      figures: [...source.matchAll(imageRe)].map(m => m[1].split(/[?#]/)[0].split(/[\\/]/).at(-1)).sort(),
      sections: [...source.matchAll(/^## (\d+)\./gm)].map(m => Number(m[1])),
    });
    const expected = lang === 'en' ? /^# [A-Za-z]/m : /^# [А-ЯЁA-Za-z]/mu;
    if (!expected.test(source)) errors.push(`Unexpected chapter heading: ${lang}/${name}`);
  }
}
for (const name of chapters) {
  const ru = byChapter.ru.get(name);
  const en = byChapter.en.get(name);
  if (!ru || !en) continue;
  if (JSON.stringify(ru.figures) !== JSON.stringify(en.figures))
    errors.push(`Different illustration evidence in RU/EN: ${name}`);
  if (JSON.stringify(ru.sections) !== JSON.stringify(en.sections))
    errors.push(`Different numbered topic coverage in RU/EN: ${name}`);
}

const images = readdirSync(join(root, 'docs', 'ru', 'images'))
  .filter(name => /\.(?:jpe?g|png|webp)$/i.test(name))
  .map(name => join(root, 'docs', 'ru', 'images', name));
for (const item of images) {
  for (const lang of ['ru', 'en']) {
    if (!imageSets[lang].has(item)) errors.push(`Unreferenced historical image in ${lang}: ${item}`);
  }
}
for (const name of ['README.md', 'README.ru.md']) {
  const text = readFileSync(join(root, name), 'utf8');
  if (!text.includes('docs/en/README.md') || !text.includes('docs/ru/README.md'))
    errors.push(`Missing bilingual documentation entry in ${name}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Bilingual docs PASS: ${chapters.length} paired chapters, ${images.length} shared historical images, no broken relative links`);
}
