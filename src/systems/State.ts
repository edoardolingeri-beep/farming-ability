import balance from '../data/balance.json';
import map from '../data/map.json';

export type ItemType = keyof typeof balance.items;
export const ITEM_TYPES = Object.keys(balance.items) as ItemType[];

export interface GameState {
  version: 3;
  /** Chosen on first launch. */
  profile: { name: string; nation: string } | null;
  coins: number;
  /** Lifetime coins collected: drives levels and the leaderboard score. */
  earned: number;
  /** Items in the player's arms, bottom to top. */
  carry: ItemType[];
  shelf: Record<ItemType, number>;
  /** Coins waiting on the money spot next to the till. */
  moneyPile: number;
  /** Coins already paid into each upgrade pad. */
  padPaid: Record<string, number>;
  unlocked: string[];
  /** Per field, per plot: epoch ms when it was last cut (0 = ripe). Growth runs on wall-clock time, so it continues while the game is closed. */
  plots: Record<string, number[]>;
  /** Wheat waiting in the mill, flour ready to collect, and when milling last advanced. */
  mill: { input: number; output: number; updatedAt: number };
  savedAt: number;
}

export const BALANCE = balance;
export const GROW_MS = balance.wheat.growSeconds * 1000;
export const MILL_MS = balance.mill.secondsPerSack * 1000;

export function newGame(): GameState {
  const plots: Record<string, number[]> = {};
  for (const f of map.fields) plots[f.id] = new Array(f.cols * f.rows).fill(0);
  return {
    version: 3,
    profile: null,
    coins: balance.startCoins,
    earned: 0,
    carry: [],
    shelf: { wheat: 0, flour: 0 },
    moneyPile: 0,
    padPaid: {},
    unlocked: [],
    plots,
    mill: { input: 0, output: 0, updatedAt: Date.now() },
    savedAt: Date.now(),
  };
}

/** 0..1 growth of a plot. */
export function plotProgress(cutAt: number, now: number) {
  return cutAt === 0 ? 1 : Math.min(1, Math.max(0, (now - cutAt) / GROW_MS));
}

/** Level (1-based) for a lifetime-earnings total, plus progress toward the next one. */
export function levelInfo(earned: number) {
  const t = balance.levels;
  let level = 1;
  while (level < t.length && earned >= t[level]) level++;
  const from = t[level - 1], to = t[level] ?? from;
  return { level, from, to, progress: to > from ? (earned - from) / (to - from) : 1, max: level >= t.length };
}

/** Advances milling by wall-clock time (also covers time spent with the game closed). */
export function advanceMill(state: GameState, now: number) {
  const m = state.mill;
  if (m.input === 0 || m.output >= balance.mill.outputCapacity) {
    m.updatedAt = now;
    return 0;
  }
  const done = Math.min(Math.floor((now - m.updatedAt) / MILL_MS), m.input, balance.mill.outputCapacity - m.output);
  if (done > 0) {
    m.input -= done;
    m.output += done;
    m.updatedAt += done * MILL_MS;
  }
  return done;
}

/** Country code to flag emoji (regional indicator letters). */
export function flag(code: string) {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
