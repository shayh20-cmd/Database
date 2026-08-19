import { ACTIVITIES } from './data.js';
import { aggregateVotes } from './results.js';

const Chart = window.Chart;
const gsap = window.gsap;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const BAR_COLOR = '#c3ddb2';
const BAR_COLOR_LEADING = '#237a33';
const TEXT_COLOR = '#6b6b68';
const GRID_COLOR = '#ececea';

// Stand-in until votes come from the live feed, so the frame can be designed and
// reviewed with realistic numbers. Replaced wholesale by the real vote documents.
const SAMPLE_VOTES = [
  ...Array.from({ length: 9 }, () => ({ activityId: 'tlvshow' })),
  ...Array.from({ length: 6 }, () => ({ activityId: 'cooking' })),
  ...Array.from({ length: 4 }, () => ({ activityId: 'molet' })),
  ...Array.from({ length: 2 }, () => ({ activityId: 'print' })),
];

let chart = null;

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

export function renderResults(votes = SAMPLE_VOTES) {
  const canvas = document.getElementById('results-chart');
  if (!canvas || !Chart) return;

  const rows = aggregateVotes(votes, ACTIVITIES);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const leading = Math.max(...rows.map((row) => row.count));
  // Ties all read as leading, which is the honest way to show them.
  const colors = rows.map((row) =>
    row.count > 0 && row.count === leading ? BAR_COLOR_LEADING : BAR_COLOR
  );

  countUp(document.getElementById('results-total'), total);

  if (chart) {
    chart.data.labels = rows.map((row) => row.name);
    chart.data.datasets[0].data = rows.map((row) => row.count);
    chart.data.datasets[0].backgroundColor = colors;
    chart._rows = rows;
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
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (item) => {
              const row = (chart && chart._rows ? chart._rows : rows)[item.dataIndex];
              return `${row.count} הצבעות · ${row.percent}%`;
            },
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
  chart._rows = rows;
}
