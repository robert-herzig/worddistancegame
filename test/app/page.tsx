'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadEmbeddings, type EmbeddingSet, distanceL2 } from '@/lib/embeddings/loader';
import { create } from 'zustand';
import { clsx } from 'clsx';

type Store = {
  data?: EmbeddingSet;
  promptIndex?: number;
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
    const next = Math.floor(Math.random() * d.tokens.length);
    set({ promptIndex: next, guess: '' });
  },
  setBest: (v) => set({ best: v })
}));

export default function HomePage() {
  const { data, promptIndex, nextPrompt, guess, setGuess, best, setBest } = useStore();
  const [ready, setReady] = useState(false);
  const [dataset, setDataset] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    loadEmbeddings().then((d) => {
      if (!mounted) return;
      useStore.setState({ data: d, promptIndex: Math.floor(Math.random() * d.tokens.length) });
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
                {data.tokens.slice(0, 5000).map((t, i) => (
                  <option key={i} value={t} />
                ))}
              </datalist>
            </label>

            <div className="mt-4">
              <div className="text-gray-300">Distance</div>
              <div className={clsx('text-2xl font-mono', distance == null && 'text-gray-500')}>
                {distance == null ? '—' : distance.toFixed(3)} units
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
