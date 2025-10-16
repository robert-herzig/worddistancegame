// Converts GloVe text file to tokens.json and embeddings.bin (Float32) with meta.json
// Usage: place glove.6B.50d.txt in the data/ folder, then run:
//   npm run prepare:embeddings
// Output: public/embeddings/glove50/{tokens.json, embeddings.bin, meta.json}

/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const input = path.join(dataDir, 'glove.6B.50d.txt');
const outDir = path.join(root, 'public', 'embeddings', 'glove50');

async function main() {
  if (!fs.existsSync(input)) {
    console.error('Missing input:', input);
    console.error('Download glove.6B.zip from https://nlp.stanford.edu/data/glove.6B.zip');
    console.error('Extract glove.6B.50d.txt to the data/ folder and re-run.');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const rl = readline.createInterface({
    input: fs.createReadStream(input),
    crlfDelay: Infinity
  });

  const tokens = [];
  let dims = 0;
  let count = 0;
  const binPath = path.join(outDir, 'embeddings.bin');
  const binStream = fs.createWriteStream(binPath, { flags: 'w' });

  console.time('convert');
  for await (const line of rl) {
    if (!line) continue;
    const parts = line.trim().split(/\s+/);
    const token = parts.shift();
    if (!token) continue;
    const vec = parts.map(Number);
    if (!dims) dims = vec.length;
    // Write floats to binary stream
    const f32 = new Float32Array(vec);
    const buf = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
    binStream.write(buf);
    tokens.push(token);
    count++;
    if (count % 50000 === 0) console.log(`Processed ${count} tokens...`);
  }
  await new Promise((res) => binStream.end(res));
  console.timeEnd('convert');

  fs.writeFileSync(path.join(outDir, 'tokens.json'), JSON.stringify(tokens));
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ dims, count, format: 'fp32' }));
  console.log('Wrote:', {
    tokens: path.join(outDir, 'tokens.json'),
    embeddings: binPath,
    meta: path.join(outDir, 'meta.json')
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
