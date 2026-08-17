import { initScrollReveal, initScrollCue } from './animations.js';
import { renderActivityCards } from './activities-view.js';

document.addEventListener('DOMContentLoaded', () => {
  renderActivityCards();
  initScrollReveal();
  initScrollCue();
});
