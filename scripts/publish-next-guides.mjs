#!/usr/bin/env node
// Перекладчик очереди SEO-гайдов → posts.ts. LLM НЕ нужен: просто двигает
// N готовых гайдов из queue.json в опубликованный массив posts.ts с датой
// сегодня, затем git commit + push (push → CI → Deploy публикует).
//
// Запуск (cron/GitHub Actions):
//   node scripts/publish-next-guides.mjs
// Переменные окружения:
//   PUBLISH_COUNT   сколько гайдов публиковать за раз (по умолчанию 2)
//   DRY_RUN=1       ничего не писать и не коммитить — только показать, что было бы
//   NO_GIT=1        записать файлы, но не делать git add/commit/push
//   QUEUE_PATH / POSTS_PATH  переопределить пути (для тестов)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const QUEUE_PATH = process.env.QUEUE_PATH || resolve(REPO, 'apps/web/lib/news/queue.json');
const POSTS_PATH = process.env.POSTS_PATH || resolve(REPO, 'apps/web/lib/news/posts.ts');
const N = parseInt(process.env.PUBLISH_COUNT || '2', 10);
const DRY = process.env.DRY_RUN === '1';
const NO_GIT = process.env.NO_GIT === '1';

const REQUIRED = ['slug', 'title', 'description', 'keywords', 'category', 'readingMinutes', 'content'];
const CATS = new Set(['wildberries', 'ozon', 'inventory', 'finance']);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function esc(v) {
  // JSON.stringify даёт валидный JS-литерал строки/массива с экранированием —
  // безопасно от backtick и от доллара-со-скобкой.
  return JSON.stringify(v);
}

function toEntry(g, dateStr) {
  const lines = [
    `    slug: ${esc(g.slug)},`,
    `    title: ${esc(g.title)},`,
    `    description: ${esc(g.description)},`,
    `    keywords: ${esc(g.keywords)},`,
    `    publishedAt: ${esc(dateStr)},`,
    `    category: ${esc(g.category)},`,
    `    readingMinutes: ${Number(g.readingMinutes)},`,
    `    tags: ${esc(g.tags || [])},`,
    `    related: ${esc(g.related || [])},`,
    `    content: ${esc(g.content)},`,
  ];
  return `  {\n${lines.join('\n')}\n  },`;
}

function parseCheck(newSrc) {
  // Финальная страховка: убедиться, что итоговый posts.ts парсится как массив
  // и slug'и уникальны — до записи и git. Собираем CommonJS во временный файл.
  const tmp = join(tmpdir(), `posts_check_${process.pid}.cjs`);
  const js = newSrc.replace(/import type[^\n]*\n/, '').replace(/export const posts:[^=]*=/, 'const posts =') + '\nmodule.exports = posts;';
  writeFileSync(tmp, js);
  const req = createRequire(import.meta.url);
  delete req.cache[tmp];
  const parsed = req(tmp);
  if (!Array.isArray(parsed)) throw new Error('posts.ts после вставки не распарсился в массив');
  const slugs = parsed.map((p) => p.slug);
  if (new Set(slugs).size !== slugs.length) throw new Error('после вставки появились дубли slug');
  return parsed.length;
}

function validate(g) {
  for (const f of REQUIRED) if (g[f] === undefined || g[f] === null || g[f] === '') throw new Error(`гайд ${g.slug || '?'}: нет поля ${f}`);
  if (!CATS.has(g.category)) throw new Error(`гайд ${g.slug}: плохая категория ${g.category}`);
  const c = g.content;
  if (c.includes('`')) throw new Error(`гайд ${g.slug}: обратная кавычка в content`);
  if (c.includes('${')) throw new Error(`гайд ${g.slug}: доллар-со-скобкой в content`);
}

function main() {
  if (!existsSync(QUEUE_PATH)) { console.log(`Очередь ${QUEUE_PATH} не найдена — нечего публиковать.`); return; }
  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  if (!Array.isArray(queue) || queue.length === 0) { console.log('Очередь пуста — бэклог исчерпан. Нужны новые темы.'); return; }

  let src = readFileSync(POSTS_PATH, 'utf8');
  const publishedSlugs = new Set([...src.matchAll(/^\s{4}slug:\s*["']([^"']+)["']/gm)].map((m) => m[1]));

  const batch = [];
  while (batch.length < N && queue.length) {
    const g = queue.shift();
    if (publishedSlugs.has(g.slug)) { console.log(`пропуск (уже опубликован): ${g.slug}`); continue; }
    validate(g);
    batch.push(g);
  }
  if (batch.length === 0) { console.log('Нет новых гайдов к публикации.'); return; }

  const dateStr = today();
  const block = batch.map((g) => toEntry(g, dateStr)).join('\n') + '\n';
  const idx = src.lastIndexOf('];');
  if (idx === -1) throw new Error('в posts.ts не найдена закрывающая ];');
  if (!src.slice(0, idx).trimEnd().endsWith('},')) throw new Error('неожиданная структура перед ]; в posts.ts');
  const newSrc = src.slice(0, idx) + block + '];\n';

  const slugs = batch.map((g) => g.slug);
  console.log(`Публикуем ${batch.length}: ${slugs.join(', ')}`);
  console.log(`В очереди останется: ${queue.length}`);

  const total = parseCheck(newSrc);
  console.log(`Проверка парсинга ок: всего гайдов после вставки — ${total}`);

  if (DRY) { console.log('\n[DRY_RUN] Вставляемый блок:\n' + block); return; }

  writeFileSync(POSTS_PATH, newSrc);
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 1) + '\n');

  if (NO_GIT) { console.log('[NO_GIT] Файлы записаны, git пропущен.'); return; }

  // Отдельные -m дают чистые абзацы без буквальных \n в заголовке.
  const subject = `feat(web): +${batch.length} SEO-гайда — ${slugs.join(', ')}`;
  const body = 'Автопубликация из очереди контента.';
  const trailer = 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>';
  const run = (cmd) => execSync(cmd, { cwd: REPO, stdio: 'inherit' });
  run('git add apps/web/lib/news/posts.ts apps/web/lib/news/queue.json');
  run(`git commit -m ${JSON.stringify(subject)} -m ${JSON.stringify(body)} -m ${JSON.stringify(trailer)}`);
  // ретраи пуша при сетевых сбоях
  let ok = false;
  for (const wait of [0, 2, 4, 8, 16]) {
    try { if (wait) execSync(`sleep ${wait}`); run('git push origin main'); ok = true; break; }
    catch (e) { console.error(`push не удался, повтор через ${wait * 2 || 2}s`); }
  }
  if (!ok) throw new Error('git push не удался после ретраев');
  console.log('Опубликовано и запушено в main.');
}

main();
