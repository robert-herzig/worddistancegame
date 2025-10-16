import { promises as fs } from 'fs';
import path from 'path';

export type LeaderboardEntry = { name: string; best: number };

const DATA_DIR = process.env.LEADERBOARD_DIR || path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'leaderboard.json');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const buf = await fs.readFile(FILE_PATH, 'utf8');
    const data = JSON.parse(buf) as LeaderboardEntry[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e && typeof e.name === 'string' && typeof e.best === 'number')
      .sort((a, b) => b.best - a.best);
  } catch (err: any) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return [];
    throw err;
  }
}

async function writeLeaderboard(entries: LeaderboardEntry[]) {
  await ensureDir();
  const tmp = FILE_PATH + '.tmp';
  const json = JSON.stringify(entries, null, 2);
  await fs.writeFile(tmp, json, 'utf8');
  await fs.rename(tmp, FILE_PATH);
}

export async function submitScore(name: string, score: number): Promise<LeaderboardEntry[]> {
  const cleanName = name.trim();
  if (!cleanName) return getLeaderboard();
  if (!Number.isFinite(score)) return getLeaderboard();
  const current = await getLeaderboard();
  const idx = current.findIndex((e) => e.name.toLowerCase() === cleanName.toLowerCase());
  if (idx >= 0) {
    if (score > current[idx].best) current[idx].best = score;
  } else {
    current.push({ name: cleanName, best: score });
  }
  current.sort((a, b) => b.best - a.best);
  await writeLeaderboard(current);
  return current;
}
