// Converts data/english_top20k_words.txt into public/wordlists/top20k.json
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const workspace = root; // workspace is already .../test
const src = path.join(workspace, 'data', 'english_top20k_words.txt');
// fallback if file lives directly under data/ at repo root
const alt = path.join(root, 'data', 'english_top20k_words.txt');
const input = fs.existsSync(src) ? src : alt;
const outDir = path.join(workspace, 'public', 'wordlists');
const outFile = path.join(outDir, 'top20k.json');

if (!fs.existsSync(input)) {
  console.error('Wordlist not found at:', src, 'or', alt);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const text = fs.readFileSync(input, 'utf-8');
let lines = text.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(Boolean);
// Remove the top 100 most frequent words (assumed to be the first 100 lines)
if (lines.length > 100) {
  lines = lines.slice(100);
}
// Remove words of length <= 3
lines = lines.filter(w => w.length > 3);
// De-duplicate while preserving order
const seen = new Set();
const filtered = [];
for (const w of lines) {
  if (!seen.has(w)) { seen.add(w); filtered.push(w); }
}
fs.writeFileSync(outFile, JSON.stringify(filtered));
console.log('Wrote wordlist:', outFile, `(${filtered.length} words)`);
