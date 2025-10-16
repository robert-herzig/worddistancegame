import { describe, it, expect } from 'vitest';
import { buildIndex, distanceL2, type EmbeddingSet } from '@/lib/embeddings/loader';

describe('embeddings distance', () => {
  it('computes L2 distance', () => {
    const tokens = ['a', 'b'];
    const dims = 3;
    const vectors = new Float32Array([
      1, 0, 0,
      0, 1, 0
    ]);
    const set: EmbeddingSet = { tokens, dims, vectors, index: buildIndex(tokens) };
    const d = distanceL2(set, 0, 1);
    expect(d).toBeCloseTo(Math.sqrt(2));
  });
});
