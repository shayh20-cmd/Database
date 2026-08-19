import { initScrollReveal, initScrollCue } from './animations.js';
import { renderActivityCards } from './activities-view.js';
import { initCursorTrail } from './cursor-trail.js';

document.addEventListener('DOMContentLoaded', () => {
  renderActivityCards();
  initCursorTrail();
  initScrollReveal();
  initScrollCue();
});
