import { ACTIVITIES } from './data.js';
import { aggregateVotes } from './results.js';
import { db } from './firebase-init.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const Chart = window.Chart;
const gsap = window.gsap;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const BAR_COLOR = '#c3ddb2';
const BAR_COLOR_LEADING = '#237a33';
const TEXT_COLOR = '#6b6b68';
const GRID_COLOR = '#ececea';

// A whole-office sweep for one activity would be 28 names; past this many the tooltip
// grows taller than a phone screen, so the tail is summarised instead.
const MAX_TOOLTIP_NAMES = 12;

let chart = null;
let currentRows = [];
let latestVotes = [];
// Guards against building the chart before the results frame's reveal has actually
// asked for it — see renderResults()/initResultsFeed() below.
let readyToRender = false;

function votesLabel(count) {
  return count === 1 ? 'הצבעה אחת' : `${count} הצבעות`;
}

function tooltipLines(index) {
  const row = currentRows[index];
  if (!row) return '';
  if (row.count === 0) return 'אין הצבעות עדיין';

  const lines = [`${votesLabel(row.count)} · ${row.percent}%`, ''];
  lines.push(...row.voters.slice(0, MAX_TOOLTIP_NAMES));
  const hidden = row.voters.length - MAX_TOOLTIP_NAMES;
  if (hidden > 0) lines.push(`ועוד ${hidden}…`);
  return lines;
}

function countUp(el, to) {
  if (!el) return;
  if (prefersReducedMotion || !gsap) {
    el.textContent = String(to);
    return;
  }
  const counter = { value: Number(el.dataset.value) || 0 };
  gsap.to(counter, {
    value: to,
    duration: 1,
    ease: 'power2.out',
    onUpdate: () => {
      el.textContent = String(Math.round(counter.value));
    },
  });
  el.dataset.value = String(to);
}

function draw() {
  const canvas = document.getElementById('results-chart');
  if (!canvas || !Chart) return;

  const rows = aggregateVotes(latestVotes, ACTIVITIES);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const leading = Math.max(...rows.map((row) => row.count));
  // Ties all read as leading, which is the honest way to show them.
  const colors = rows.map((row) =>
    row.count > 0 && row.count === leading ? BAR_COLOR_LEADING : BAR_COLOR
  );

  countUp(document.getElementById('results-total'), total);
  currentRows = rows;

  if (chart) {
    chart.data.labels = rows.map((row) => row.name);
    chart.data.datasets[0].data = rows.map((row) => row.count);
    chart.data.datasets[0].backgroundColor = colors;
    chart.update();
    return;
  }

  chart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.name),
      datasets: [
        {
          data: rows.map((row) => row.count),
          backgroundColor: colors,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.6,
          maxBarThickness: 96,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: prefersReducedMotion ? false : { duration: 900, easing: 'easeOutQuart' },
      layout: { padding: { top: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          rtl: true,
          textDirection: 'rtl',
          backgroundColor: '#0b0b0a',
          padding: 12,
          displayColors: false,
          bodySpacing: 5,
          bodyFont: { family: 'Assistant, system-ui, sans-serif', size: 13 },
          titleFont: { family: 'Assistant, system-ui, sans-serif', size: 13, weight: '700' },
          titleMarginBottom: 8,
          callbacks: {
            label: (item) => tooltipLines(item.dataIndex),
          },
        },
      },
      scales: {
        x: {
          // The page is RTL, so the categories should read right-to-left too — matching
          // the order the activity cards appear in.
          reverse: true,
          grid: { display: false },
          border: { color: GRID_COLOR },
          ticks: { color: TEXT_COLOR, font: { family: 'Assistant, system-ui, sans-serif', size: 13 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: GRID_COLOR, drawTicks: false },
          border: { display: false },
          ticks: {
            precision: 0,
            stepSize: 1,
            color: TEXT_COLOR,
            font: { family: 'Assistant, system-ui, sans-serif', size: 12 },
            padding: 8,
          },
        },
      },
    },
  });
}

// Called once, at the moment the results frame is actually revealed (from the leaf
// burst, or the plain scroll-into-view fallback) — see results-finale.js. Bars grow in
// and the total counts up on cue with that reveal rather than behind a hidden frame.
// Live updates that arrive before this has run are cached (see onSnapshot below) and
// drawn without animation the moment it does; updates after just redraw in place.
export function renderResults() {
  readyToRender = true;
  draw();
}

// Starts listening immediately on page load — independent of renderResults() above —
// so the very first paint already reflects real data instead of a placeholder, and so
// results keep updating live in any tab left open on this frame.
export function initResultsFeed() {
  const errorMessage = document.getElementById('results-error');

  onSnapshot(
    collection(db, 'votes'),
    (snapshot) => {
      if (errorMessage) errorMessage.hidden = true;
      latestVotes = snapshot.docs.map((docSnapshot) => docSnapshot.data());
      if (readyToRender) draw();
    },
    () => {
      if (errorMessage) errorMessage.hidden = false;
    }
  );
}
