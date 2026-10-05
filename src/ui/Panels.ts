import nations from '../data/nations.json';
import { flag } from '../systems/State';
import type { Leaderboard } from '../systems/Leaderboard';

const fmt = new Intl.NumberFormat('it-IT');
const nationName = (code: string) => nations.find((n) => n.code === code)?.name ?? code;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Guesses the player's country from the browser language (it-IT → IT). */
function guessNation() {
  for (const l of navigator.languages ?? [navigator.language]) {
    const region = l.split('-')[1]?.toUpperCase();
    if (region && nations.some((n) => n.code === region)) return region;
  }
  const lang = (navigator.language || 'it').slice(0, 2).toLowerCase();
  const byLang: Record<string, string> = { it: 'IT', es: 'ES', fr: 'FR', de: 'DE', en: 'GB', pt: 'PT', nl: 'NL', pl: 'PL', ro: 'RO', el: 'GR', sv: 'SE', ja: 'JP', ko: 'KR', zh: 'CN', tr: 'TR' };
  return byLang[lang] ?? 'IT';
}

/** First-launch card: pick a farmer name and a nation. */
export function askProfile(parent: HTMLElement): Promise<{ name: string; nation: string }> {
  return new Promise((resolve) => {
    const overlay = el('div', 'modal interactive');
    const card = el('div', 'modal-card');
    card.append(el('h2', '', 'Benvenuto in fattoria!'));

    const label = el('label', 'field-label', 'Come ti chiami?');
    label.htmlFor = 'farmer-name';
    const input = el('input', 'name-input');
    input.id = 'farmer-name';
    input.maxLength = 14;
    input.placeholder = 'Il tuo nome';
    input.setAttribute('autocomplete', 'nickname');
    card.append(label, input);

    card.append(el('div', 'field-label', 'Per quale nazione giochi?'));
    const grid = el('div', 'nation-grid');
    let chosen = guessNation();
    const buttons = new Map<string, HTMLButtonElement>();
    for (const n of nations) {
      const b = el('button', 'nation-btn');
      b.type = 'button';
      b.append(el('span', 'flag', flag(n.code)), el('span', 'nation-name', n.name));
      b.addEventListener('click', () => {
        chosen = n.code;
        buttons.forEach((x, code) => x.classList.toggle('on', code === chosen));
      });
      buttons.set(n.code, b);
      grid.append(b);
    }
    buttons.get(chosen)?.classList.add('on');
    card.append(grid);

    const go = el('button', 'btn orange', 'Inizia!');
    go.type = 'button';
    const finish = () => {
      const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 14);
      if (!name) {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        input.focus();
        return;
      }
      overlay.remove();
      resolve({ name, nation: chosen });
    };
    go.addEventListener('click', finish);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    card.append(go);
    overlay.append(card);
    parent.append(overlay);
    requestAnimationFrame(() => buttons.get(chosen)?.scrollIntoView({ block: 'center' }));
  });
}

/** Leaderboard sheet with a players tab and a nations tab, updating live. */
export function openLeaderboard(parent: HTMLElement, lb: Leaderboard) {
  const overlay = el('div', 'modal interactive');
  const card = el('div', 'modal-card board');
  const head = el('div', 'board-head');
  head.append(el('h2', '', 'Classifica'));
  const close = el('button', 'close-btn', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Chiudi');
  head.append(close);
  card.append(head);

  const tabs = el('div', 'tabs');
  const tPlayers = el('button', 'tab on', 'Giocatori');
  const tNations = el('button', 'tab', 'Nazioni');
  tabs.append(tPlayers, tNations);
  card.append(tabs);
  const list = el('div', 'board-list');
  const note = el('p', 'board-note');
  card.append(list, note);
  overlay.append(card);
  parent.append(overlay);

  let tab: 'players' | 'nations' = 'players';
  const medal = (i: number) => (i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1));

  const render = () => {
    list.replaceChildren();
    if (tab === 'players') {
      lb.players().slice(0, 100).forEach((r, i) => {
        const row = el('div', `board-row${r.me ? ' me' : ''}`);
        row.append(
          el('span', 'rank', medal(i)),
          el('span', 'flag', r.nation ? flag(r.nation) : ''),
          el('span', 'who', r.me ? `${r.name} (tu)` : r.name),
          el('span', 'lvl', `Lv ${r.level}`),
          el('span', 'pts', fmt.format(r.score)),
        );
        list.append(row);
      });
    } else {
      lb.nations().forEach((n, i) => {
        const row = el('div', 'board-row');
        row.append(
          el('span', 'rank', medal(i)),
          el('span', 'flag', flag(n.nation)),
          el('span', 'who', nationName(n.nation)),
          el('span', 'lvl', `${n.players} ${n.players === 1 ? 'giocatore' : 'giocatori'}`),
          el('span', 'pts', fmt.format(n.score)),
        );
        list.append(row);
      });
    }
    if (!lb.online) note.textContent = `${lb.offlineReason} Per ora vedi solo il tuo punteggio.`;
    else if (!lb.canSubmit) note.textContent = 'Puoi vedere la classifica, ma per entrarci chiedi al proprietario del gioco di invitarti come Editor.';
    else note.textContent = 'Punti = monete guadagnate in totale. La nazione somma i punti dei suoi giocatori.';
  };
  render();
  const off = lb.onChange(render);

  const select = (t: typeof tab) => {
    tab = t;
    tPlayers.classList.toggle('on', t === 'players');
    tNations.classList.toggle('on', t === 'nations');
    render();
  };
  tPlayers.addEventListener('click', () => select('players'));
  tNations.addEventListener('click', () => select('nations'));
  const shut = () => { off(); overlay.remove(); };
  close.addEventListener('click', shut);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) shut(); });
}

/** A card pinned to the bottom of the screen explaining a pad (what it does, what it needs). */
export class InfoCard {
  private card = el('div', 'info-card');
  private key = '';

  constructor(parent: HTMLElement) {
    this.card.style.display = 'none';
    parent.append(this.card);
  }

  show(key: string, title: string, body: string, footer: string, locked: boolean) {
    if (key === this.key) return;
    this.key = key;
    this.card.replaceChildren();
    const h = el('div', 'info-title');
    if (locked) h.append(el('span', 'lock', '🔒'));
    h.append(title);
    this.card.append(h, el('p', '', body));
    if (footer) this.card.append(el('p', `info-foot${locked ? ' locked' : ''}`, footer));
    this.card.style.display = '';
    this.card.classList.remove('in');
    void this.card.offsetWidth;
    this.card.classList.add('in');
  }

  hide() {
    if (!this.key) return;
    this.key = '';
    this.card.style.display = 'none';
  }
}
