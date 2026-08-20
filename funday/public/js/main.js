import { initScrollReveal, initScrollCue } from './animations.js';
import { renderActivityCards } from './activities-view.js';
import { renderVoteForm } from './vote-view.js';
import { initCursorTrail } from './cursor-trail.js';
import { initHeroRain } from './hero-rain.js';
import { initLeafTrail } from './leaf-trail.js';
import { initResultsFinale } from './results-finale.js';
import { initResultsFeed } from './results-view.js';

document.addEventListener('DOMContentLoaded', () => {
  // This page is one scroll-driven sequence, so a browser-restored mid-page position on
  // reload would drop the reader into the middle of it with the earlier beats skipped.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // Both renders must run before initLeafTrail: it measures each .lit-card to size the
  // outline it draws on them, so the cards need their real content first.
  renderActivityCards();
  renderVoteForm();
  initCursorTrail();
  initHeroRain();
  initResultsFinale(initLeafTrail());
  initResultsFeed();
  initScrollReveal();
  initScrollCue();
});
