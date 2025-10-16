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
  const [lastRatio, setLastRatio] = useState<number | undefined>(undefined);
  const [lastDistance, setLastDistance] = useState<number | undefined>(undefined);
  const [username, setUsername] = useState<string>('');
  type LBEntry = { name: string; best: number };
  const [leaderboard, setLeaderboard] = useState<LBEntry[]>([]);
  const [roundEndsAt, setRoundEndsAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [roundBest, setRoundBest] = useState<number | undefined>(undefined);
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
    const savedName = localStorage.getItem('username');
    if (savedName) setUsername(savedName);
    // Load leaderboard from server API
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((arr: LBEntry[]) => { if (Array.isArray(arr)) setLeaderboard(arr); })
      .catch(() => {});
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
    // Track best distance during the active round
    setRoundBest((prev) => (prev == null || distance > prev ? distance : prev));
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
    if (distance != null && scaleMax) {
      const r = Math.max(0, Math.min(1, distance / scaleMax));
      setRatio(r);
      setLastRatio(r);
      setLastDistance(distance);
    }
  }, [distance, scaleMax]);

  // Persist username changes
  useEffect(() => {
    if (username) localStorage.setItem('username', username);
  }, [username]);

  const myBest = useMemo(() => {
    if (!username.trim()) return undefined;
    const entry = leaderboard.find((e) => e.name.toLowerCase() === username.trim().toLowerCase());
    return entry?.best;
  }, [leaderboard, username]);

  // When the prompt changes, reset last-known values
  useEffect(() => {
    setLastRatio(undefined);
    setLastDistance(undefined);
    setRatio(0);
    // Start a new 10-second round
    const ends = Date.now() + 10_000;
    setRoundEndsAt(ends);
    setTimeLeft(ends - Date.now());
    setRoundBest(undefined);
  }, [promptIndex]);

  // Round timer tick
  useEffect(() => {
    if (!roundEndsAt) return;
    const id = setInterval(() => {
      const left = Math.max(0, roundEndsAt - Date.now());
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [roundEndsAt]);

  // Submit score to server on round end (triggered when timeLeft hits 0)
  useEffect(() => {
    if (roundEndsAt === null) return;
    if (timeLeft > 0) return;
    // Mark round handled
    setRoundEndsAt(null);
    if (username.trim() && roundBest != null && Number.isFinite(roundBest)) {
      fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username.trim(), score: roundBest })
      })
        .then((r) => r.json())
        .then((arr: LBEntry[]) => { if (Array.isArray(arr)) setLeaderboard(arr); })
        .catch(() => {});
    }
  }, [timeLeft, roundEndsAt, roundBest, username]);

  return (
    <main className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">WordDistance Game</h1>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-300">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-lg bg-gray-900 border border-white/10 px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-600"
              placeholder="Enter your name"
            />
          </label>
        </div>
        <p className="text-gray-400 mt-2">Find the word that's least closely related to the given word</p>
        <div className="text-right text-sm text-gray-400 mt-2">
          <div>Your best: {myBest?.toFixed(3) ?? (best?.toFixed(3) ?? '—')}</div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="card lg:col-span-2">
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
                disabled={!username.trim() || roundEndsAt === null}
              />
              <datalist id="token-list">
                {(useStore.getState().candidate ?? data.tokens.map((_, i) => i))
                  .slice(0, 5000)
                  .map((i) => (
                    <option key={i} value={data.tokens[i]} />
                  ))}
              </datalist>
              <div className="mt-2 text-sm text-gray-400">
                {username.trim() ? (
                  roundEndsAt ? (
                    <>Time left: {(timeLeft / 1000).toFixed(1)}s</>
                  ) : (
                    <>Round over. Press Next for a new word.</>
                  )
                ) : (
                  <>Enter a username to play.</>
                )}
              </div>
            </label>

            <div className="mt-6">
              <div className="text-gray-300 mb-2">Distance</div>
              <div className="w-full flex justify-center">
                {(() => {
                  const hasAny = (distance != null && scaleMax) || lastRatio != null;
                  const shownRatio = distance != null && scaleMax ? ratio : (lastRatio ?? 0);
                  const shownDistance = distance != null ? distance : lastDistance;
                  if (!hasAny || shownRatio <= 0) {
                    return (
                      <div className="text-sm text-gray-500">Type a word to measure distance…</div>
                    );
                  }
                  return (
                    <div
                      className="relative"
                      style={{ width: `${(shownRatio * 100).toFixed(1)}%`, transition: 'width 300ms ease-out' }}
                    >
                      <div className="h-5 rounded-full bg-brand-600" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-xs font-medium text-white/90">
                          {shownDistance != null ? `${shownDistance.toFixed(3)} units` : ''}
                        </span>
                      </div>
                      <div
                        className="absolute -top-6 left-0 text-sm text-gray-300 max-w-[14rem] truncate"
                        title={data.tokens[promptIndex]}
                      >
                        {data.tokens[promptIndex]}
                      </div>
                      <div
                        className="absolute -top-6 right-0 text-sm text-gray-300 max-w-[14rem] truncate text-right"
                        title={guess || '—'}
                      >
                        {guess || '—'}
                      </div>
                    </div>
                  );
                })()}
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

        <aside className="card">
          <h2 className="text-lg font-semibold mb-3">Top 10</h2>
          {leaderboard.length === 0 ? (
            <div className="text-sm text-gray-500">No scores yet. Be the first!</div>
          ) : (
            <ol className="space-y-2">
              {leaderboard.slice(0, 10).map((e, i) => (
                <li key={e.name + i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-5">{i + 1}.</span>
                    <span
                      className={clsx(
                        "truncate max-w-[10rem]",
                        username.trim() && e.name.trim().toLowerCase() === username.trim().toLowerCase() && "text-brand-400"
                      )}
                      title={e.name}
                    >
                      {e.name}
                    </span>
                  </div>
                  <span className="tabular-nums">{e.best.toFixed(3)}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      <footer className="mt-8 text-center text-xs text-gray-500">
        Offline-ready PWA. Sample embeddings included for demo.
      </footer>
    </main>
  );
}
