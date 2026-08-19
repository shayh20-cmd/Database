import { initScrollReveal, initScrollCue } from './animations.js';
import { renderActivityCards } from './activities-view.js';
import { renderVoteForm } from './vote-view.js';
import { initCursorTrail } from './cursor-trail.js';
import { initHeroRain } from './hero-rain.js';
import { initLeafTrail } from './leaf-trail.js';

document.addEventListener('DOMContentLoaded', () => {
  // Both renders must run before initLeafTrail: it measures each .lit-card to size the
  // outline it draws on them, so the cards need their real content first.
  renderActivityCards();
  renderVoteForm();
  initCursorTrail();
  initHeroRain();
  initLeafTrail();
  initScrollReveal();
  initScrollCue();
});
