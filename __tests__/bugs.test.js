const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');

describe('Phase 2 — Bug Regression Test Suite', () => {
  // Reset demo store before each test to guarantee test isolation
  beforeEach(async () => {
    await request(app).post('/api/reset');
  });

  describe('API Defects', () => {
    // 1. BUG-07-12: GET /api/emails — leaks-hidden-field
    test('BUG-07-12: GET /api/emails should not leak internal sensitive field internalRiskNote', async () => {
      const res = await request(app).get('/api/emails');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      res.body.forEach((email) => {
        expect(email).not.toHaveProperty('internalRiskNote');
      });
    });

    // 2. BUG-07-08: GET /api/emails — wrong-filter-boolean-logic
    test('BUG-07-08: GET /api/emails should combine label and assignee with AND logic (not OR)', async () => {
      // In seed data: Email 1 is HR_REPLIED & a1. Email 2 is AUTO_REPLY & unassigned.
      // No email is both AUTO_REPLY and assigned to a1.
      const res = await request(app).get('/api/emails?label=AUTO_REPLY&assignee=a1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    // 3. BUG-07-16: PATCH /api/emails/:id/label — state-not-persisted
    test('BUG-07-16: PATCH /api/emails/:id/label updates should persist on subsequent GET requests', async () => {
      const session = request.agent(app);
      const patchRes = await session
        .patch('/api/emails/1/label')
        .send({ label: 'AUTO_REPLY' });
      expect(patchRes.status).toBe(200);

      const getRes = await session.get('/api/emails/1');
      expect(getRes.status).toBe(200);
      expect(getRes.body.label).toBe('AUTO_REPLY');
    });

    // 4. BUG-07-15: PATCH /api/emails/:id/assign — state-not-persisted
    test('BUG-07-15: PATCH /api/emails/:id/assign updates should persist on subsequent GET requests', async () => {
      const session = request.agent(app);
      const patchRes = await session
        .patch('/api/emails/1/assign')
        .send({ assigneeId: 'a2' });
      expect(patchRes.status).toBe(200);

      const getRes = await session.get('/api/emails/1');
      expect(getRes.status).toBe(200);
      expect(getRes.body.assignee).toBe('a2');
    });

    // 5. BUG-07-11: PATCH /api/emails/:id/assign — missing-reference-or-state-check
    test('BUG-07-11: PATCH /api/emails/:id/assign should reject assigning inactive agent with 400', async () => {
      // a3 is Sana Iqbal with active: false
      const res = await request(app)
        .patch('/api/emails/1/assign')
        .send({ assigneeId: 'a3' });
      expect(res.status).toBe(400);
    });

    // 6. BUG-07-02: PATCH /api/emails/:id/label — missing-enum-validation
    test('BUG-07-02: PATCH /api/emails/:id/label should reject invalid enum label with 400', async () => {
      const res = await request(app)
        .patch('/api/emails/1/label')
        .send({ label: 'INVALID_ENUM_LABEL' });
      expect(res.status).toBe(400);
    });

    // 7. BUG-07-09: GET /api/emails — substring-vs-exact-match
    test('BUG-07-09: GET /api/emails label filter should require exact match, not substring match', async () => {
      // 'HR' is a substring of 'HR_REPLIED' but not a valid label
      const res = await request(app).get('/api/emails?label=HR');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    // 8. BUG-07-04: PATCH /api/emails/:id/assign — wrong-status-code
    test('BUG-07-04: PATCH /api/emails/:id/assign with non-existent id should return 404', async () => {
      const res = await request(app)
        .patch('/api/emails/9999/assign')
        .send({ assigneeId: 'a1' });
      expect(res.status).toBe(404);
    });

    // 9. BUG-07-03: PATCH /api/emails/:id/label — missing-sanitization
    test('BUG-07-03: PATCH /api/emails/:id/label should trim leading and trailing whitespace', async () => {
      const res = await request(app)
        .patch('/api/emails/1/label')
        .send({ label: '  NEEDS_REVIEW  ' });
      expect(res.status).toBe(200);
      expect(res.body.label).toBe('NEEDS_REVIEW');
    });

    // 10. BUG-07-01: GET /api/stats — off-by-one-boundary
    test('BUG-07-01: GET /api/stats total counts should equal the total number of emails in database', async () => {
      const emailsRes = await request(app).get('/api/emails');
      const statsRes = await request(app).get('/api/stats');
      expect(statsRes.status).toBe(200);

      const totalStatsCount = Object.values(statsRes.body).reduce((a, b) => a + b, 0);
      expect(totalStatsCount).toBe(emailsRes.body.length);
    });

    // 11. BUG-07-10: PATCH /api/emails/:id/label — wrong-status-code
    test('BUG-07-10: PATCH /api/emails/:id/label with missing label body should return 400 Bad Request', async () => {
      const res = await request(app)
        .patch('/api/emails/1/label')
        .send({});
      expect(res.status).toBe(400);
    });

    // 12. BUG-07-17: GET /api/emails — missing-boundary-check
    test('BUG-07-17: GET /api/emails query params should have proper boundary checks and not crash with 500 on duplicate query params', async () => {
      const res = await request(app).get('/api/emails?label=HR_REPLIED&label=AUTO_REPLY');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('UI & Client Code Defects', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8');
    const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf-8');

    // 13. BUG-07-05: UI — wrong-ui-copy-or-label
    test('BUG-07-05: HTML table header and title should have correct spelling without typos', () => {
      expect(html).not.toContain('<th>Asignee</th>');
      expect(html).toContain('<th>Assignee</th>');
      expect(html).not.toContain('Email Labler Queue');
      expect(html).toContain('Email Labeler Queue');
    });

    // 14. BUG-07-13: UI — wrong-dropdown-default-selection
    test('BUG-07-13: Table row label dropdown must bind to the current email label', () => {
      // In app.js, renderTable must set the select value to email.label
      const bindsLabelSelect =
        appJs.includes('sel.value = email.label') ||
        appJs.includes('sel.value = e.label') ||
        appJs.includes('selected');
      expect(bindsLabelSelect).toBe(true);
    });

    // 15. BUG-07-14: UI — ui-filter-not-applied
    test('BUG-07-14: loadEmails must not swap label and assignee query parameters', () => {
      expect(appJs).not.toContain("params.set('assignee', label)");
      expect(appJs).not.toContain("params.set('label', assignee)");
      expect(appJs).toContain("params.set('label', label)");
      expect(appJs).toContain("params.set('assignee', assignee)");
    });

    // 16. BUG-07-21: UI — off-by-one-boundary
    test('BUG-07-21: loadStats must map each label to its own count, not index-shifted i + 1', () => {
      expect(appJs).not.toContain('stats[LABELS[i + 1]]');
      expect(appJs).toMatch(/stats\[l\]|stats\[LABELS\[i\]\]/);
    });

    // 17. BUG-07-06: UI — missing-ui-feedback-guard
    test('BUG-07-06: onLabelChange must check res.ok before showing success toast', () => {
      const checksResponseStatus =
        appJs.includes('if (res.ok)') ||
        appJs.includes('if (!res.ok)') ||
        appJs.includes('res.status === 200');
      expect(checksResponseStatus).toBe(true);
    });

    // 18. BUG-07-19: UI — wrong-filter-boolean-logic
    test('BUG-07-19: agentOptionsHtml must filter to only offer active agents', () => {
      const filtersActive =
        appJs.includes('a.active') ||
        appJs.includes('agents.filter');
      expect(filtersActive).toBe(true);
    });

    // 19. BUG-07-07: UI — state-not-persisted
    test('BUG-07-07: onAssignChange must send assigneeId (not assignee) in the request body', () => {
      expect(appJs).not.toContain('assignee: sel.value');
      expect(appJs).toContain('assigneeId: sel.value');
    });
  });
});
