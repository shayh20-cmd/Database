import { ACTIVITIES } from './data.js';

export function renderActivityCards() {
  const grid = document.getElementById('activities-grid');
  grid.innerHTML = '';
  for (const activity of ACTIVITIES) {
    const card = document.createElement('article');
    card.className = 'lit-card activity-card';
    card.setAttribute('data-reveal-item', '');
    card.innerHTML = `
      <h3>${activity.name}</h3>
      <p class="activity-card__desc">${activity.description}</p>
      <dl class="activity-card__meta">
        <div><dt>זמן</dt><dd>${activity.time}</dd></div>
        <div><dt>מיקום</dt><dd>${activity.location}</dd></div>
      </dl>
      <p class="activity-card__notes">${activity.notes}</p>
      <a class="activity-card__link" href="${activity.link}" target="_blank" rel="noopener noreferrer">לפרטים נוספים ↗</a>
    `;
    grid.appendChild(card);
  }
}
