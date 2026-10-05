/**
 * Shared leaderboard. When the game runs inside its claude.ai Artifact with
 * the `db` capability, every player writes one row at `scores/<their id>` and
 * everyone reads the whole collection. Anywhere else (GitHub Pages, offline)
 * it falls back to showing just this device's own row.
 */

export interface ScoreRow {
  id: string;
  name: string;
  nation: string;
  score: number;
  level: number;
  me?: boolean;
}

export interface NationRow {
  nation: string;
  score: number;
  players: number;
}

// Minimal shapes of the capability namespaces we use.
type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = { set(d: Record<string, unknown>): Promise<void> };
type Query = { orderBy(f: string, d?: 'asc' | 'desc'): Query; limit(n: number): Query; onSnapshot(next: (s: { docs: Snap[] }) => void, err?: (e: unknown) => void): () => void };
type DB = { doc(p: string): DocRef; collection(p: string): Query };
type User = { id(): Promise<string | null>; can?(name: string): Promise<boolean | null> };
type ClaudeWindow = { claude?: { use(name: string): Promise<unknown> } };

export class Leaderboard {
  /** True once rows are syncing with other players. */
  online = false;
  /** Reason shown when offline. */
  offlineReason = 'La classifica online funziona nella versione del gioco su claude.ai.';
  rows: ScoreRow[] = [];
  private db: DB | null = null;
  private myId: string | null = null;
  private canWrite = true;
  private lastSent = '';
  private sending = false;
  private listeners = new Set<() => void>();
  private local: ScoreRow = { id: 'me', name: '', nation: 'IT', score: 0, level: 1, me: true };

  async init() {
    const c = (window as unknown as ClaudeWindow).claude;
    if (!c?.use) return;
    try {
      const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [DB | null, User | null];
      if (!db || !user) {
        this.offlineReason = 'Accedi a claude.ai per vedere la classifica online.';
        return;
      }
      this.myId = await user.id();
      if (!this.myId) return;
      this.canWrite = (await user.can?.('data.write')) !== false;
      this.db = db;
      this.online = true;
      db.collection('scores').orderBy('score', 'desc').limit(500).onSnapshot(
        (snap) => {
          this.rows = snap.docs
            .filter((d) => d.exists)
            .map((d) => {
              const v = d.data() as Partial<ScoreRow>;
              return {
                id: d.id,
                name: String(v.name ?? 'Contadino').slice(0, 16),
                nation: String(v.nation ?? '').slice(0, 2),
                score: Number(v.score) || 0,
                level: Number(v.level) || 1,
                me: d.id === this.myId,
              };
            });
          this.emit();
        },
        () => {
          this.online = false;
          this.offlineReason = 'Classifica online non raggiungibile in questo momento.';
          this.emit();
        },
      );
    } catch {
      // stay offline
    }
  }

  /** Whether this viewer's score can reach the shared board. */
  get canSubmit() {
    return this.online && this.canWrite;
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  /** Records the latest score; writes only when it changed and one write at a time. */
  async submit(name: string, nation: string, score: number, level: number) {
    this.local = { ...this.local, name, nation, score, level };
    if (!this.db || !this.myId || !this.canWrite || this.sending) return;
    const key = `${name}|${nation}|${score}|${level}`;
    if (key === this.lastSent) return;
    this.sending = true;
    try {
      await this.db.doc(`scores/${this.myId}`).set({ name, nation, score, level, updatedAt: Date.now() });
      this.lastSent = key;
    } catch {
      // Viewers below Contributor can read but not write: keep playing, just don't sync.
      this.canWrite = false;
      this.emit();
    } finally {
      this.sending = false;
    }
  }

  /** Players, best first, always including this player. */
  players(): ScoreRow[] {
    if (!this.online) return [this.local];
    const rows = this.rows.some((r) => r.me) ? this.rows : [...this.rows, this.local];
    return [...rows].sort((a, b) => b.score - a.score);
  }

  /** Nations ranked by the summed score of their players. */
  nations(): NationRow[] {
    const map = new Map<string, NationRow>();
    for (const r of this.players()) {
      if (!r.nation) continue;
      const n = map.get(r.nation) ?? { nation: r.nation, score: 0, players: 0 };
      n.score += r.score;
      n.players++;
      map.set(r.nation, n);
    }
    return [...map.values()].sort((a, b) => b.score - a.score);
  }
}
