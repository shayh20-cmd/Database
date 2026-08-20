import { ACTIVITIES, employeesSortedForDropdown, getEmployeeById } from './data.js';
import { db } from './firebase-init.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

export function renderVoteForm() {
  const select = document.getElementById('employee-select');
  const picker = document.getElementById('activity-picker');
  const submit = document.getElementById('vote-submit');
  const form = document.getElementById('vote-form');
  const errorMessage = document.getElementById('vote-error');
  const confirmationMessage = document.getElementById('vote-confirmation');
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
  // Guards a slower, earlier name-change lookup from clobbering a faster, later one if
  // the person picks a different name again before the first getDoc has resolved.
  let prefillToken = 0;

  function setSelectedActivity(activityId) {
    selectedActivityId = activityId;
    for (const button of picker.querySelectorAll('.activity-option')) {
      button.setAttribute('aria-pressed', String(button.dataset.activityId === activityId));
    }
    refreshSubmitState();
  }

  function refreshSubmitState() {
    submit.disabled = !select.value || !selectedActivityId;
  }

  function hideMessages() {
    errorMessage.hidden = true;
    confirmationMessage.hidden = true;
  }

  picker.addEventListener('click', (event) => {
    const option = event.target.closest('.activity-option');
    if (!option) return;
    hideMessages();
    setSelectedActivity(option.dataset.activityId);
  });

  // Reopening the picker for someone who already voted shows their existing choice
  // rather than a blank form, per the design spec — look their doc up the moment
  // they're selected rather than waiting for submit.
  select.addEventListener('change', () => {
    hideMessages();
    setSelectedActivity(null);
    const employeeId = select.value;
    const token = ++prefillToken;
    if (!employeeId) return;

    getDoc(doc(db, 'votes', employeeId))
      .then((snapshot) => {
        if (token !== prefillToken || !snapshot.exists()) return;
        setSelectedActivity(snapshot.data().activityId);
      })
      .catch(() => {
        // No prefill is not an error worth surfacing here; a genuine save failure is
        // still reported when they submit.
      });
  });

  form.addEventListener('submit', (event) => {
    // Nothing else navigates the page, so this only guards against the default
    // form-submit navigation.
    event.preventDefault();
    if (submit.disabled) return;

    const employee = getEmployeeById(select.value);
    if (!employee) return;

    hideMessages();
    submit.disabled = true;

    // The doc id is the employee id, so voting again always overwrites this same
    // employee's previous choice rather than creating a second vote — that's what makes
    // "one vote per employee, changeable" work without needing auth.
    setDoc(doc(db, 'votes', employee.id), {
      employeeName: employee.name,
      activityId: selectedActivityId,
      updatedAt: serverTimestamp(),
    })
      .then(() => {
        confirmationMessage.hidden = false;
        document.dispatchEvent(
          new CustomEvent('funday:vote-submitted', {
            detail: { employeeId: employee.id, activityId: selectedActivityId },
          })
        );
      })
      .catch(() => {
        // Keep the form filled in rather than clearing the selection, so a retry
        // doesn't make them redo it.
        errorMessage.hidden = false;
        refreshSubmitState();
      });
  });

  refreshSubmitState();
}
