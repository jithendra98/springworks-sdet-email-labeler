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
  // FIXED: map each label to its own count
  grid.innerHTML = LABELS.map((l) => `<div class="stat"><span class="stat-label">${l}</span><span class="stat-count">${stats[l] ?? 0}</span></div>`).join('');
}

async function loadEmails() {
  const label = document.getElementById('filter-label').value;
  const assignee = document.getElementById('filter-assignee').value;
  const params = new URLSearchParams();
  // FIXED: correct query param keys
  if (label) params.set('label', label);
  if (assignee) params.set('assignee', assignee);

  const res = await fetch(`/api/emails?${params.toString()}`);
  const emails = await res.json();
  renderTable(emails);
}

function agentOptionsHtml() {
  // FIXED: filter to only include active agents
  return ['<option value="">Unassigned</option>']
    .concat(agents.filter((a) => a.active).map((a) => `<option value="${a.id}">${a.name}</option>`))
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

  // FIXED: bind current label value to select dropdown
  body.querySelectorAll('.label-select').forEach((sel) => {
    const id = Number(sel.dataset.id);
    const email = emails.find((e) => e.id === id);
    if (email) sel.value = email.label;
    sel.addEventListener('change', () => onLabelChange(sel));
  });

  // Wire up the assign dropdown to reflect the current assignee
  body.querySelectorAll('.assign-select').forEach((sel) => {
    const id = Number(sel.dataset.id);
    const email = emails.find((e) => e.id === id);
    if (email) sel.value = email.assignee || '';
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
  // FIXED: check response status and refresh stats panel
  if (res.ok) {
    showToast('Label updated');
    await loadEmails();
    await loadStats();
  } else {
    showToast('Failed to update label');
  }
}

async function onAssignChange(sel) {
  const id = sel.dataset.id;
  // FIXED: send assigneeId instead of assignee
  const res = await fetch(`/api/emails/${id}/assign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigneeId: sel.value || null })
  });
  if (res.ok) {
    showToast('Assignee updated');
    await loadEmails();
  } else {
    showToast('Failed to update assignee');
  }
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
