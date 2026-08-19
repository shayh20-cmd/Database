import { initScrollReveal, initScrollCue } from './animations.js';
import { renderActivityCards } from './activities-view.js';
import { initCursorTrail } from './cursor-trail.js';
import { initHeroRain } from './hero-rain.js';
import { initLeafTrail } from './leaf-trail.js';

document.addEventListener('DOMContentLoaded', () => {
  renderActivityCards();
  initCursorTrail();
  initHeroRain();
  initLeafTrail();
  initScrollReveal();
  initScrollCue();
});
