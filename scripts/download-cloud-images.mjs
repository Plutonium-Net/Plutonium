#!/usr/bin/env node
/**
 * scripts/download-cloud-images.mjs
 *
 * Downloads every cover image from examples/cloud.json into img/cloud/
 * using the game_key as the filename, preserving the original extension.
 * Then rewrites examples/cloud.json in-place so every "image" and "cover"
 * field points to the local path  img/cloud/<game_key>.<ext>
 *
 * Usage:
 *   node scripts/download-cloud-images.mjs
 *
 * Options (env vars):
 *   CONCURRENCY=8   parallel downloads (default 6)
 *   SKIP_EXISTING=1 skip files already present on disk (default: on)
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT        = join(__dirname, '..');
const JSON_PATH   = join(ROOT, 'examples', 'cloud.json');
const IMG_DIR     = join(ROOT, 'img', 'cloud');
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '6', 10);
const SKIP_EXIST  = process.env.SKIP_EXISTING !== '0';

// ── helpers ──────────────────────────────────────────────────────────────────

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/** Derive local extension from the remote URL (keeps .jpg/.png/.webp/.jpeg) */
function extFrom(url) {
  const raw = extname(new URL(url).pathname).toLowerCase();
  return raw || '.jpg';
}

/** Download one URL to destPath, returns 'ok' | 'skip' | 'fail:<msg>' */
async function downloadOne(url, destPath) {
  if (SKIP_EXIST && await exists(destPath)) return 'skip';

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Plutonium-img-downloader/1.0)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) return `fail:HTTP ${res.status}`;

  await pipeline(res.body, createWriteStream(destPath));
  return 'ok';
}

/** Run tasks with bounded concurrency */
async function pool(tasks, limit) {
  const results = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ── main ─────────────────────────────────────────────────────────────────────

const games = JSON.parse(await readFile(JSON_PATH, 'utf8'));
await mkdir(IMG_DIR, { recursive: true });

console.log(`\n⬇  Downloading images for ${games.length} games → img/cloud/\n`);

let ok = 0, skipped = 0, failed = 0;

const tasks = games.map((game) => async () => {
  const url  = game.image || game.cover;
  const ext  = extFrom(url);
  const file = game.game_key.toLowerCase() + ext;
  const dest = join(IMG_DIR, file);

  const result = await downloadOne(url, dest).catch(e => `fail:${e.message}`);

  const localPath = 'img/cloud/' + file;
  const pad = ' '.repeat(Math.max(0, 12 - game.game_key.length));

  if (result === 'ok') {
    console.log(`  ✔  ${game.game_key}${pad}${localPath}`);
    ok++;
  } else if (result === 'skip') {
    console.log(`  –  ${game.game_key}${pad}(already exists)`);
    skipped++;
  } else {
    console.error(`  ✘  ${game.game_key}${pad}[${result}]  ${url}`);
    failed++;
    return;  // keep remote URL for failed entries
  }

  // Rewrite paths in the game object
  game.image = localPath;
  game.cover = localPath;
});

await pool(tasks, CONCURRENCY);

// ── write updated JSON ────────────────────────────────────────────────────────

await writeFile(JSON_PATH, JSON.stringify(games, null, 4), 'utf8');

console.log(`
Done.
  ✔  Downloaded : ${ok}
  –  Skipped    : ${skipped}
  ✘  Failed     : ${failed}

examples/cloud.json has been updated with local image paths.
`);

if (failed > 0) process.exit(1);
