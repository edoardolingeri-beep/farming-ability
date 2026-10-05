import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import './ui/styles.css';
import { Game } from './Game';
import { wipeSave } from './systems/Save';
import { showSplash } from './ui/Splash';

const VERSION = '0.1.0';

// ?reset in the URL starts a fresh farm (handy while testing).
if (new URLSearchParams(location.search).has('reset')) wipeSave();

const gameEl = document.getElementById('game')!;
const uiEl = document.getElementById('ui')!;

const game = new Game(gameEl, uiEl);
game.start();
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { game: Game }).game = game;

showSplash(uiEl, VERSION).then(() => {
  // Full screen where supported (Android). iOS ignores it; "Add to Home Screen" works there.
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (matchMedia('(pointer: coarse)').matches) {
      (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.())?.catch?.(() => {});
    }
  } catch {
    // ignore
  }
});
