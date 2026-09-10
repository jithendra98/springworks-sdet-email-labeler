const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');

describe('Phase 2 — Bug Regression Test Suite (19 Reported Bugs)', () => {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const appJsPath = path.join(__dirname, '../public/app.js');

  beforeEach(async () => {
    // Reset data to seed before each API test
    await request(app).post('/api/reset');
  });

  // -------------------------------------------------------------
  // 1. GET /api/emails — leaks-hidden-field
  // Issue: GET /api/emails leaks internal field internalRiskNote in the returned email objects, violating the API specification.
  // Expected: Email objects have only { id, from, subject, label, assignee }.
  // Actual: Leaks 'internalRiskNote' field on every email object.
  // -------------------------------------------------------------
  test('1. GET /api/emails — leaks-hidden-field', async () => {
    const res = await request(app).get('/api/emails');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach((email) => {
      expect(email).not.toHaveProperty('internalRiskNote');
    });
  });

  // -------------------------------------------------------------
  // 2. GET /api/emails — wrong-filter-boolean-logic
  // Issue: Filtering with both label and assignee query parameters performs an OR operation instead of an AND operation.
  // Expected: When both label and assignee query params are provided, only emails matching BOTH should be returned (AND).
  // Actual: Returns emails matching either label OR assignee.
  // -------------------------------------------------------------
  test('2. GET /api/emails — wrong-filter-boolean-logic', async () => {
    // In seed data: Email 1 is HR_REPLIED & a1. Email 2 is AUTO_REPLY & unassigned.
    // No email is both AUTO_REPLY and assigned to a1.
    const res = await request(app).get('/api/emails?label=AUTO_REPLY&assignee=a1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // -------------------------------------------------------------
  // 3. PATCH /api/emails/:id/label — state-not-persisted
  // Issue: Updating an email's label via PATCH /api/emails/:id/label does not persist changes to the database.
  // Expected: Subsequent GET /api/emails/:id returns the updated label.
  // Actual: GET /api/emails/:id returns the original label before the update.
  // -------------------------------------------------------------
  test('3. PATCH /api/emails/:id/label — state-not-persisted', async () => {
    const session = request.agent(app);
    const patchRes = await session
      .patch('/api/emails/1/label')
      .send({ label: 'AUTO_REPLY' });
    expect(patchRes.status).toBe(200);

    const getRes = await session.get('/api/emails/1');
    expect(getRes.status).toBe(200);
    expect(getRes.body.label).toBe('AUTO_REPLY');
  });

  // -------------------------------------------------------------
  // 4. PATCH /api/emails/:id/assign — state-not-persisted
  // Issue: Assigning an email to an agent via PATCH /api/emails/:id/assign does not persist changes to the database.
  // Expected: Subsequent GET /api/emails/:id returns the updated assignee.
  // Actual: GET /api/emails/:id returns the original assignee.
  // -------------------------------------------------------------
  test('4. PATCH /api/emails/:id/assign — state-not-persisted', async () => {
    const session = request.agent(app);
    const patchRes = await session
      .patch('/api/emails/1/assign')
      .send({ assigneeId: 'a2' });
    expect(patchRes.status).toBe(200);

    const getRes = await session.get('/api/emails/1');
    expect(getRes.status).toBe(200);
    expect(getRes.body.assignee).toBe('a2');
  });

  // -------------------------------------------------------------
  // 5. PATCH /api/emails/:id/assign — missing-reference-or-state-check
  // Issue: Assigning an email to an inactive agent succeeds with 200 OK instead of being rejected.
  // Expected: 400 Bad Request error when assigneeId refers to an inactive agent (active: false).
  // Actual: Returns 200 OK.
  // -------------------------------------------------------------
  test('5. PATCH /api/emails/:id/assign — missing-reference-or-state-check', async () => {
    // a3 is Sana Iqbal with active: false
    const res = await request(app)
      .patch('/api/emails/1/assign')
      .send({ assigneeId: 'a3' });
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------
  // 6. PATCH /api/emails/:id/label — missing-enum-validation
  // Issue: PATCH /api/emails/:id/label accepts invalid label values instead of rejecting with 400.
  // Expected: 400 error when label is not one of the 4 valid enum values.
  // Actual: Returns 200 OK accepting arbitrary invalid strings.
  // -------------------------------------------------------------
  test('6. PATCH /api/emails/:id/label — missing-enum-validation', async () => {
    const res = await request(app)
      .patch('/api/emails/1/label')
      .send({ label: 'INVALID_ENUM_LABEL' });
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------
  // 7. UI — wrong-dropdown-default-selection
  // Issue: The label select dropdown in each table row does not reflect the email's current label.
  // Expected: The dropdown's selected value matches the email's actual current label.
  // Actual: The select value is not set, defaulting to the first option (HR_REPLIED) for all rows.
  // -------------------------------------------------------------
  test('7. UI — wrong-dropdown-default-selection', () => {
    const appJs = fs.readFileSync(appJsPath, 'utf-8');
    const bindsLabelSelect =
      appJs.includes('sel.value = email.label') ||
      appJs.includes('sel.value = e.label');
    expect(bindsLabelSelect).toBe(true);
  });

  // -------------------------------------------------------------
  // 8. UI — ui-filter-not-applied
  // Issue: Filter dropdowns swap the query parameter keys, sending label as assignee and assignee as label.
  // Expected: Selecting a label filters by ?label=<val> and assignee by ?assignee=<val>.
  // Actual: label sends ?assignee=<val> and assignee sends ?label=<val>, matching nothing.
  // -------------------------------------------------------------
  test('8. UI — ui-filter-not-applied', () => {
    const appJs = fs.readFileSync(appJsPath, 'utf-8');
    expect(appJs).not.toContain("params.set('assignee', label)");
    expect(appJs).not.toContain("params.set('label', assignee)");
    expect(appJs).toContain("params.set('label', label)");
    expect(appJs).toContain("params.set('assignee', assignee)");
  });

  // -------------------------------------------------------------
  // 9. UI — off-by-one-boundary
  // Issue: The stats panel maps each label to the next label's count due to an index shift (i + 1).
  // Expected: Each label displays its own count from the API response.
  // Actual: Displays stats[LABELS[i + 1]], shifting all counts by one and showing 0 for the last label.
  // -------------------------------------------------------------
  test('9. UI — off-by-one-boundary', () => {
    const appJs = fs.readFileSync(appJsPath, 'utf-8');
    expect(appJs).not.toContain('stats[LABELS[i + 1]]');
    expect(appJs).toMatch(/stats\[l\]|stats\[LABELS\[i\]\]/);
  });

  // -------------------------------------------------------------
  // 10. UI — missing-ui-feedback-guard
  // Issue: Changing label fires a success toast unconditionally even if the API request fails.
  // Expected: Failed requests surface a visible error message to the user.
  // Actual: Shows 'Label updated' success toast unconditionally regardless of HTTP response code.
  // -------------------------------------------------------------
  test('10. UI — missing-ui-feedback-guard', () => {
    const appJs = fs.readFileSync(appJsPath, 'utf-8');
    const guardsFeedback =
      appJs.includes('if (res.ok)') ||
      appJs.includes('if (!res.ok)') ||
      appJs.includes('res.status === 200');
    expect(guardsFeedback).toBe(true);
  });

  // -------------------------------------------------------------
  // 11. UI — wrong-ui-copy-or-label
  // Issue: Table header contains spelling error 'Asignee' and page title contains 'Email Labler Queue'.
  // Expected: Correct spelling 'Assignee' and 'Email Labeler Queue'.
  // Actual: Misspelled as 'Asignee' in table header and 'Labler' in title/header.
  // -------------------------------------------------------------
  test('11. UI — wrong-ui-copy-or-label', () => {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).not.toContain('<th>Asignee</th>');
    expect(html).toContain('<th>Assignee</th>');
    expect(html).not.toContain('Email Labler Queue');
    expect(html).toContain('Email Labeler Queue');
  });

  // -------------------------------------------------------------
  // 12. GET /api/emails — substring-vs-exact-match
  // Issue: Filtering by label uses substring matching instead of exact enum matching, allowing partial matches like ?label=HR to return HR_REPLIED.
  // Expected: label filter must exactly match one of the four valid labels, and a non-matching value like 'HR' must match nothing.
  // Actual: Substring matching is used, so ?label=HR returns all HR_REPLIED emails.
  // -------------------------------------------------------------
  test('12. GET /api/emails — substring-vs-exact-match', async () => {
    const res = await request(app).get('/api/emails?label=HR');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // -------------------------------------------------------------
  // 13. PATCH /api/emails/:id/assign — wrong-status-code
  // Issue: PATCH /api/emails/:id/assign returns 200 OK when given a non-existent email id instead of 404 Not Found.
  // Expected: 404 { error } when the email id does not exist.
  // Actual: Returns 200 OK with an empty body {}.
  // -------------------------------------------------------------
  test('13. PATCH /api/emails/:id/assign — wrong-status-code', async () => {
    const res = await request(app)
      .patch('/api/emails/9999/assign')
      .send({ assigneeId: 'a1' });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------
  // 14. PATCH /api/emails/:id/label — missing-sanitization
  // Issue: Leading and trailing whitespace in the label field is not trimmed/ignored as required by the spec.
  // Expected: Leading and trailing whitespace should be trimmed/ignored (e.g. '  HR_REPLIED  ' becomes 'HR_REPLIED').
  // Actual: Whitespace is preserved and stored verbatim.
  // -------------------------------------------------------------
  test('14. PATCH /api/emails/:id/label — missing-sanitization', async () => {
    const res = await request(app)
      .patch('/api/emails/1/label')
      .send({ label: '  NEEDS_REVIEW  ' });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('NEEDS_REVIEW');
  });

  // -------------------------------------------------------------
  // 15. GET /api/stats — off-by-one-boundary
  // Issue: GET /api/stats has an off-by-one boundary bug causing the 10th email to be excluded from aggregation, undercounting HR_REPLIED as 3 instead of 4.
  // Expected: Counts must add up to 10 emails (HR_REPLIED: 4).
  // Actual: Only counts first 9 emails (HR_REPLIED: 3), summing to 9.
  // -------------------------------------------------------------
  test('15. GET /api/stats — off-by-one-boundary', async () => {
    const emailsRes = await request(app).get('/api/emails');
    const statsRes = await request(app).get('/api/stats');
    expect(statsRes.status).toBe(200);

    const totalStatsCount = Object.values(statsRes.body).reduce((a, b) => a + b, 0);
    expect(totalStatsCount).toBe(emailsRes.body.length);
  });

  // -------------------------------------------------------------
  // 16. PATCH /api/emails/:id/label — wrong-status-code
  // Issue: PATCH /api/emails/:id/label returns a 500 internal server error instead of a 400 Bad Request when the label field is missing.
  // Expected: 400 { error } when label is missing.
  // Actual: Returns 500 internal server error.
  // -------------------------------------------------------------
  test('16. PATCH /api/emails/:id/label — wrong-status-code', async () => {
    const res = await request(app)
      .patch('/api/emails/1/label')
      .send({});
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------
  // 17. UI — wrong-filter-boolean-logic
  // Issue: Agent options dropdown fails to filter agents by active status, showing inactive agents.
  // Expected: Only active agents should be displayed.
  // Actual: All agents regardless of active flag are shown.
  // -------------------------------------------------------------
  test('17. UI — wrong-filter-boolean-logic', () => {
    const appJs = fs.readFileSync(appJsPath, 'utf-8');
    const filtersActive =
      appJs.includes('a.active') ||
      appJs.includes('agents.filter');
    expect(filtersActive).toBe(true);
  });

  // -------------------------------------------------------------
  // 18. UI — state-not-persisted
  // Issue: Changing an email's assignee in the UI table fails to persist because the payload sends 'assignee' instead of 'assigneeId'.
  // Expected: Assignee update is saved and persists on subsequent reloads.
  // Actual: Assign request fails silently and assignee is not persisted.
  // -------------------------------------------------------------
  test('18. UI — state-not-persisted', () => {
    const appJs = fs.readFileSync(appJsPath, 'utf-8');
    expect(appJs).not.toContain('assignee: sel.value');
    expect(appJs).toContain('assigneeId: sel.value');
  });

  // -------------------------------------------------------------
  // 19. GET /api/emails — missing-boundary-check
  // Issue: Boundary check on query parameters in GET /api/emails.
  // Expected: Valid boundary checks.
  // Actual: Missing boundary check.
  // -------------------------------------------------------------
  test('19. GET /api/emails — missing-boundary-check', async () => {
    const res = await request(app).get('/api/emails?label=HR_REPLIED&label=AUTO_REPLY');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
