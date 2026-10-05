import config from '../data/config.json';
import crops from '../data/crops.json';
import map from '../data/map.json';

export type CropId = keyof typeof crops;
export type ItemId = CropId;

export interface FieldState {
  crop: CropId | null;
  /** Epoch ms. Growth is derived from wall-clock time, so it continues while the game is closed. */
  plantedAt: number;
}

export interface GameState {
  version: 1;
  coins: number;
  inventory: Partial<Record<ItemId, number>>;
  fields: FieldState[];
  savedAt: number;
}

export const CROPS = crops;

export function newGame(): GameState {
  return {
    version: 1,
    coins: config.startCoins,
    inventory: {},
    fields: map.fields.map(() => ({ crop: null, plantedAt: 0 })),
    savedAt: Date.now(),
  };
}

export function growMs(crop: CropId) {
  return CROPS[crop].growSeconds * 1000;
}

/** 0..1 growth of a field at time `now`, or null if empty. */
export function fieldProgress(f: FieldState, now: number): number | null {
  if (!f.crop) return null;
  return Math.min(1, Math.max(0, (now - f.plantedAt) / growMs(f.crop)));
}
