export type EmbeddingSet = {
  tokens: string[];
  dims: number;
  vectors: Float32Array; // length = tokens.length * dims
  index: Map<string, number>;
};

export function buildIndex(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) m.set(tokens[i].toLowerCase(), i);
  return m;
}

export function vectorAt(set: EmbeddingSet, row: number): Float32Array {
  const start = row * set.dims;
  return set.vectors.subarray(start, start + set.dims);
}

export function distanceL2(set: EmbeddingSet, a: number, b: number): number {
  const va = vectorAt(set, a);
  const vb = vectorAt(set, b);
  let acc = 0;
  for (let i = 0; i < set.dims; i++) {
    const d = va[i] - vb[i];
    acc += d * d;
  }
  return Math.sqrt(acc);
}

type Meta = { dims: number; count: number; format: 'fp32' | 'int8' };

async function loadJSONEmbeddings(base: string): Promise<EmbeddingSet> {
  const [tokens, matrix] = await Promise.all([
    fetch(`${base}/tokens.json`).then((r) => r.json() as Promise<string[]>),
    fetch(`${base}/embeddings.json`).then((r) => r.json() as Promise<number[][]>)
  ]);
  const dims = matrix[0]?.length ?? 0;
  const vectors = new Float32Array(tokens.length * dims);
  for (let i = 0; i < tokens.length; i++) vectors.set(matrix[i], i * dims);
  return { tokens, dims, vectors, index: buildIndex(tokens) };
}

async function loadBinaryEmbeddings(base: string, meta: Meta): Promise<EmbeddingSet> {
  const tokens = await fetch(`${base}/tokens.json`).then((r) => r.json() as Promise<string[]>);
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const vectors = await new Promise<Float32Array>((resolve) => {
    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (data?.type === 'loaded') {
        const buf = data.vectors?.buffer as ArrayBuffer;
        resolve(new Float32Array(buf));
        worker.terminate();
      }
    };
    worker.postMessage({ type: 'load-binary', urlBin: `${base}/embeddings.bin`, dims: meta.dims, count: meta.count });
  });
  return { tokens, dims: meta.dims, vectors, index: buildIndex(tokens) };
}

async function pickBase(): Promise<string> {
  // Prefer large glove50 set if available, else sample
  try {
    const res = await fetch('/embeddings/glove50/meta.json', { method: 'GET' });
    if (res.ok) return '/embeddings/glove50';
  } catch {}
  return '/embeddings/sample';
}

export async function loadEmbeddings(): Promise<EmbeddingSet> {
  const base = await pickBase();
  let meta: Meta | undefined;
  try {
    meta = await fetch(`${base}/meta.json`).then((r) => r.json() as Promise<Meta>);
  } catch {}
  if (!meta) return loadJSONEmbeddings(base);
  if (meta.format === 'fp32') {
    try {
      const head = await fetch(`${base}/embeddings.bin`, { method: 'HEAD' });
      if (head.ok) return loadBinaryEmbeddings(base, meta);
    } catch {}
  }
  return loadJSONEmbeddings(base);
}
