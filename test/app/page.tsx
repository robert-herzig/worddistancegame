'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadEmbeddings, type EmbeddingSet, distanceL2 } from '@/lib/embeddings/loader';
import { create } from 'zustand';
import { clsx } from 'clsx';

type Store = {
  data?: EmbeddingSet;
  promptIndex?: number;
  candidate?: number[]; // indices of tokens allowed to be prompts (e.g., top20k)
  guess: string;
  setGuess: (s: string) => void;
  nextPrompt: () => void;
  best?: number;
  setBest: (v: number) => void;
};

const useStore = create<Store>((set, get) => ({
  guess: '',
  setGuess: (s) => set({ guess: s }),
  nextPrompt: () => {
    const d = get().data;
    if (!d) return;
    const candidate = get().candidate;
    let next: number;
    if (candidate && candidate.length) {
      next = candidate[Math.floor(Math.random() * candidate.length)];
    } else {
      next = Math.floor(Math.random() * d.tokens.length);
    }
    set({ promptIndex: next, guess: '' });
  },
  setBest: (v) => set({ best: v })
}));

export default function HomePage() {
  const { data, promptIndex, nextPrompt, guess, setGuess, best, setBest } = useStore();
  const [ready, setReady] = useState(false);
  const [dataset, setDataset] = useState<string>('');
  const [scaleMax, setScaleMax] = useState<number | undefined>(undefined);
  const [ratio, setRatio] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      loadEmbeddings(),
      fetch('/wordlists/top20k.json').then((r) => r.json() as Promise<string[]>).catch(() => undefined)
    ]).then(([d, top]) => {
      if (!mounted) return;
      // Filter tokens to those present in the top list if available
      let candidateIndexes: number[] | undefined;
      if (top && Array.isArray(top) && top.length) {
        const topSet = new Set(top.map((w) => w.toLowerCase()));
        candidateIndexes = d.tokens
          .map((t, i) => (topSet.has(t.toLowerCase()) ? i : -1))
          .filter((i) => i >= 0);
      }
      const pi = (() => {
        if (candidateIndexes && candidateIndexes.length) {
          return candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)];
        }
        return Math.floor(Math.random() * d.tokens.length);
      })();
      useStore.setState({ data: d, promptIndex: pi, candidate: candidateIndexes });
      setReady(true);
    });
    const saved = localStorage.getItem('bestDistance');
    if (saved) setBest(parseFloat(saved));
    return () => { mounted = false; };
  }, [setBest]);

  const matchIndex = useMemo(() => {
    if (!data || !guess) return undefined;
    const idx = data.index.get(guess.toLowerCase());
    return idx;
  }, [data, guess]);

  const distance = useMemo(() => {
    if (!data || promptIndex == null || matchIndex == null) return undefined;
    return distanceL2(data, promptIndex, matchIndex);
  }, [data, promptIndex, matchIndex]);

  useEffect(() => {
    if (distance == null) return;
    if (best == null || distance > best) {
      useStore.setState({ best: distance });
      localStorage.setItem('bestDistance', String(distance));
    }
  }, [distance, best]);

  // Estimate a reasonable max distance for this prompt by sampling candidates
  useEffect(() => {
    if (!data || promptIndex == null) return;
    const candidate = useStore.getState().candidate;
    const pool = candidate && candidate.length ? candidate : data.tokens.map((_, i) => i);
    // Build a sampled set excluding the prompt itself
    const poolFiltered = pool.filter((i) => i !== promptIndex);
    const sampleSize = Math.min(1024, poolFiltered.length);
    if (sampleSize <= 0) { setScaleMax(undefined); return; }
    // Simple random sample without replacement
    const picked: number[] = [];
    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor(Math.random() * poolFiltered.length);
      picked.push(poolFiltered[idx]);
      poolFiltered.splice(idx, 1);
    }
    let max = 0;
    for (const i of picked) {
      const d = distanceL2(data, promptIndex, i);
      if (d > max) max = d;
    }
    setScaleMax(max || undefined);
  }, [data, promptIndex]);

  // Update the bar ratio whenever distance or scale changes
  useEffect(() => {
    if (!distance || !scaleMax) {
      setRatio(0);
      return;
    }
    const r = Math.max(0, Math.min(1, distance / scaleMax));
    setRatio(r);
  }, [distance, scaleMax]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">WordDistance Game</h1>
        <div className="text-right text-sm text-gray-400">
          <div>Best: {best?.toFixed(3) ?? '—'}</div>
        </div>
      </header>

      <section className="card">
        {!ready || !data || promptIndex == null ? (
          <div className="text-gray-400">Loading embeddings…</div>
        ) : (
          <div className="space-y-4">
            <div className="text-gray-300">Prompt word</div>
            <div className="text-3xl font-bold">{data.tokens[promptIndex]}</div>

            <label className="block mt-4">
              <span className="text-gray-300">Your guess</span>
              <input
                ref={inputRef}
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                className="mt-2 w-full rounded-lg bg-gray-900 border border-white/10 px-4 py-2 outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Type a word from the dictionary…"
                list="token-list"
              />
              <datalist id="token-list">
                {(useStore.getState().candidate ?? data.tokens.map((_, i) => i))
                  .slice(0, 5000)
                  .map((i) => (
                    <option key={i} value={data.tokens[i]} />
                  ))}
              </datalist>
            </label>

            <div className="mt-6">
              <div className="text-gray-300 mb-2">Distance</div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-300 max-w-[30%] truncate" title={data.tokens[promptIndex]}>
                  {data.tokens[promptIndex]}
                </div>
                <div className="flex-1">
                  <div className="relative h-3 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={clsx(
                        'absolute left-0 top-0 h-full rounded-full transition-[width] duration-300 ease-out',
                        distance == null ? 'bg-gray-700' : 'bg-brand-600'
                      )}
                      style={{ width: `${(ratio * 100).toFixed(1)}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm text-gray-300 max-w-[30%] text-right truncate" title={guess || '—'}>
                  {guess || '—'}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button className="btn" onClick={nextPrompt}>Next</button>
              <button
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 hover:bg-white/10"
                onClick={() => inputRef.current?.focus()}
              >
                Focus input
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className="mt-8 text-center text-xs text-gray-500">
        Offline-ready PWA. Sample embeddings included for demo.
      </footer>
    </main>
  );
}
