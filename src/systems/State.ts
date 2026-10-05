import balance from '../data/balance.json';
import map from '../data/map.json';

export interface GameState {
  version: 2;
  coins: number;
  /** Wheat bundles in the player's arms. */
  carry: number;
  /** Wheat bundles on the shop shelf. */
  shelf: number;
  /** Coins waiting on the money spot next to the till. */
  moneyPile: number;
  /** Coins already paid into each upgrade pad. */
  padPaid: Record<string, number>;
  unlocked: string[];
  /** Per field, per plot: epoch ms when it was last cut (0 = ripe). Growth runs on wall-clock time, so it continues while the game is closed. */
  plots: Record<string, number[]>;
  savedAt: number;
}

export const BALANCE = balance;
export const GROW_MS = balance.wheat.growSeconds * 1000;

export function newGame(): GameState {
  const plots: Record<string, number[]> = {};
  for (const f of map.fields) plots[f.id] = new Array(f.cols * f.rows).fill(0);
  return {
    version: 2,
    coins: balance.startCoins,
    carry: 0,
    shelf: 0,
    moneyPile: 0,
    padPaid: {},
    unlocked: [],
    plots,
    savedAt: Date.now(),
  };
}

/** 0..1 growth of a plot. */
export function plotProgress(cutAt: number, now: number) {
  return cutAt === 0 ? 1 : Math.min(1, Math.max(0, (now - cutAt) / GROW_MS));
}
