import { ACTIVITIES, employeesSortedForDropdown } from './data.js';

// Presentation only: fills in the vote form's controls and tracks the current selection
// so the panels aren't empty boxes. Actually saving the vote (Firestore write, re-vote
// pre-fill, confirmation/error states) is still to come.
export function renderVoteForm() {
  const select = document.getElementById('employee-select');
  const picker = document.getElementById('activity-picker');
  const submit = document.getElementById('vote-submit');
  const form = document.getElementById('vote-form');
  if (!select || !picker || !submit || !form) return;

  select.innerHTML = '<option value="" selected disabled>בחר/י את השם שלך</option>';
  for (const employee of employeesSortedForDropdown()) {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = employee.name;
    select.appendChild(option);
  }

  picker.innerHTML = '';
  for (const activity of ACTIVITIES) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'activity-option';
    option.dataset.activityId = activity.id;
    option.setAttribute('aria-pressed', 'false');
    option.textContent = activity.name;
    picker.appendChild(option);
  }

  let selectedActivityId = null;

  function refreshSubmitState() {
    submit.disabled = !select.value || !selectedActivityId;
  }

  picker.addEventListener('click', (event) => {
    const option = event.target.closest('.activity-option');
    if (!option) return;
    selectedActivityId = option.dataset.activityId;
    for (const button of picker.querySelectorAll('.activity-option')) {
      button.setAttribute('aria-pressed', String(button === option));
    }
    refreshSubmitState();
  });

  select.addEventListener('change', refreshSubmitState);

  form.addEventListener('submit', (event) => {
    // Nothing is persisted yet — saving the vote lands with the Firestore wiring. The
    // preventDefault also stops the form navigating away.
    event.preventDefault();
    if (submit.disabled) return;
    document.dispatchEvent(
      new CustomEvent('funday:vote-submitted', {
        detail: { employeeId: select.value, activityId: selectedActivityId },
      })
    );
  });

  refreshSubmitState();
}
