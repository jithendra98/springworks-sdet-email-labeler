const LABELS = ['HR_REPLIED', 'AUTO_REPLY', 'TICKETING_BOT', 'NEEDS_REVIEW'];
let agents = [];

async function loadAgents() {
  const res = await fetch('/api/agents');
  agents = await res.json();
  const sel = document.getElementById('filter-assignee');
  agents.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    sel.appendChild(opt);
  });
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const stats = await res.json();
  const grid = document.getElementById('stats-grid');
  // BUG: off-by-one index shift - each label is paired with the *next*
  // label's count instead of its own (the last label has nothing to shift
  // into and shows 0).
  grid.innerHTML = LABELS.map((l, i) => `<div class="stat"><span class="stat-label">${l}</span><span class="stat-count">${stats[LABELS[i + 1]] ?? 0}</span></div>`).join('');
}

async function loadEmails() {
  const label = document.getElementById('filter-label').value;
  const assignee = document.getElementById('filter-assignee').value;
  const params = new URLSearchParams();
  // BUG: query param keys are swapped - the label value is sent under the
  // `assignee` key and vice versa, so either filter alone always matches
  // nothing (server compares label text against agent ids and agent ids
  // against label text).
  if (label) params.set('assignee', label);
  if (assignee) params.set('label', assignee);

  const res = await fetch(`/api/emails?${params.toString()}`);
  const emails = await res.json();
  renderTable(emails);
}

function agentOptionsHtml() {
  // BUG: this should only offer active agents, but it lists every agent
  // regardless of the `active` flag.
  return ['<option value="">Unassigned</option>']
    .concat(agents.map((a) => `<option value="${a.id}">${a.name}</option>`))
    .join('');
}

function labelOptionsHtml() {
  return LABELS.map((l) => `<option value="${l}">${l}</option>`).join('');
}

function renderTable(emails) {
  const body = document.getElementById('inbox-body');
  body.innerHTML = emails.map((e) => `
    <tr data-id="${e.id}">
      <td>${e.from}</td>
      <td>${e.subject}</td>
      <td>
        <select class="label-select" data-id="${e.id}">${labelOptionsHtml()}</select>
      </td>
      <td>
        <select class="assign-select" data-id="${e.id}">${agentOptionsHtml()}</select>
      </td>
    </tr>
  `).join('');

  // BUG: the label <select> is never given a `.value` reflecting the
  // email's current label, so it always shows the first option
  // (HR_REPLIED) regardless of the actual label.

  // Wire up the assign dropdown to reflect the current assignee at least.
  body.querySelectorAll('.assign-select').forEach((sel) => {
    const id = Number(sel.dataset.id);
    const email = emails.find((e) => e.id === id);
    if (email) sel.value = email.assignee || '';
  });

  body.querySelectorAll('.label-select').forEach((sel) => {
    sel.addEventListener('change', () => onLabelChange(sel));
  });
  body.querySelectorAll('.assign-select').forEach((sel) => {
    sel.addEventListener('change', () => onAssignChange(sel));
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

async function onLabelChange(sel) {
  const id = sel.dataset.id;
  const res = await fetch(`/api/emails/${id}/label`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: sel.value })
  });
  // BUG: toast fires unconditionally - even a non-2xx response still
  // shows "Label updated" instead of surfacing the error.
  showToast('Label updated');
  await loadEmails();
  // BUG: stats panel is never refreshed after a label change, so it goes
  // stale until the page is manually reloaded.
}

async function onAssignChange(sel) {
  const id = sel.dataset.id;
  // BUG: request body key is `assignee`, but the API expects `assigneeId`
  // (that's the name of the field on the *response* email object - easy to
  // confuse). The server destructures `assigneeId` from the body, gets
  // `undefined`, and the assign silently no-ops.
  const res = await fetch(`/api/emails/${id}/assign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignee: sel.value || null })
  });
  showToast('Assignee updated');
  await loadEmails();
}

document.getElementById('filter-label').addEventListener('change', loadEmails);
document.getElementById('filter-assignee').addEventListener('change', loadEmails);

async function init() {
  await loadAgents();
  await loadStats();
  await loadEmails();
}

init();

// Testing utility — not part of the app under test.
document.getElementById('reset-data-btn').addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST' });
  await loadStats();
  await loadEmails();
  showToast('Data reset');
});
