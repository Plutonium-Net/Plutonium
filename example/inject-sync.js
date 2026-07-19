/**
 * inject-sync.js
 * Run from the repo root: node example/inject-sync.js
 *
 * Inserts <script src="/js/sync.js"></script> as the first element inside
 * <head> of every HTML file in example/games/, skipping files that already
 * have it.
 */

const fs   = require('fs');
const path = require('path');

const GAMES_DIR = path.join(__dirname, 'games');
const INJECT    = '<script src="/js/sync.js"></script>';

const files = fs.readdirSync(GAMES_DIR).filter(f => f.endsWith('.html'));
let patched = 0;

for (const file of files) {
  const filepath = path.join(GAMES_DIR, file);
  let html = fs.readFileSync(filepath, 'utf8');

  if (html.includes(INJECT)) {
    console.log(`[skip]  ${file} — already injected`);
    continue;
  }

  // Insert immediately after the opening <head> tag (case-insensitive)
  const patched_html = html.replace(/<head([^>]*)>/i, `<head$1>\n${INJECT}`);

  if (patched_html === html) {
    // No <head> tag found — prepend to file
    fs.writeFileSync(filepath, `${INJECT}\n` + html, 'utf8');
    console.log(`[prepend] ${file} — no <head>, prepended`);
  } else {
    fs.writeFileSync(filepath, patched_html, 'utf8');
    console.log(`[patch] ${file}`);
  }
  patched++;
}

console.log(`\nDone — ${patched} file(s) patched, ${files.length - patched} skipped.`);
