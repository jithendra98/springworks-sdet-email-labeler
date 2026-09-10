const express = require('express');
const path = require('path');
const { LABELS, makeSeed } = require('./data');
const { perStudentStore } = require('./isolation');

const app = express();

// ---- CORS: allow cross-origin API testing (Hoppscotch web, Postman web, etc.) ----
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---- Access gate: HTTP Basic Auth. Disabled unless ACCESS_PASSWORD is set. Rotate/clear
// ACCESS_PASSWORD in the Render dashboard to make the link dead instantly (env var change
// auto-redeploys). Share as https://<any-username>:<password>@<host>/ for a one-click link. ----
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || null;
app.use((req, res, next) => {
  if (!ACCESS_PASSWORD) return next();
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  const decoded = encoded ? Buffer.from(encoded, 'base64').toString() : '';
  const pass = decoded.split(':')[1];
  if (scheme !== 'Basic' || pass !== ACCESS_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="SV QA Challenge"');
    return res.status(401).send('Auth required. Ask the interviewer for the link.');
  }
  next();
});

app.use(express.json());
app.use(perStudentStore(makeSeed));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3007;

// ---- Fix-track gate: hide /spec once Phase 2 (Fix Track) opens ----
// Polls the scoreboard's public flag, cached ~20s. ponytail: fail-open — if the
// scoreboard is unreachable we keep the spec visible so a blip never breaks Phase 1.
const SCOREBOARD_URL = (process.env.SCOREBOARD_URL || 'https://sv-qa-scoreboard.onrender.com').replace(/\/+$/, '');
let _ftCache = { open: false, at: 0 };
async function fixTrackOpen() {
  if (typeof fetch !== 'function') return false;
  if (Date.now() - _ftCache.at < 20000) return _ftCache.open;
  try {
    const r = await fetch(SCOREBOARD_URL + '/api/fix-track');
    const j = await r.json();
    _ftCache = { open: j && j.open === true, at: Date.now() };
  } catch (e) { /* keep last value; default closed = spec visible */ }
  return _ftCache.open;
}


// Helper to ensure public contract without leaking internal fields
function sanitizeEmail(e) {
  if (!e) return null;
  return {
    id: e.id,
    from: e.from,
    subject: e.subject,
    label: e.label,
    assignee: e.assignee
  };
}

// GET /api/emails?label=&assignee=
app.get('/api/emails', (req, res) => {
  const { label, assignee } = req.query;
  const labelStr = Array.isArray(label) ? label[0] : label;
  const assigneeStr = Array.isArray(assignee) ? assignee[0] : assignee;
  let result = req.store.emails;

  if (labelStr || assigneeStr) {
    result = req.store.emails.filter((e) => {
      let labelMatch = false;
      if (labelStr) {
        const validLabel = LABELS.find((l) => l.toUpperCase() === labelStr.trim().toUpperCase());
        labelMatch = validLabel ? e.label.toUpperCase() === validLabel.toUpperCase() : false;
      }
      const assigneeMatch = assigneeStr ? e.assignee === assigneeStr : false;

      // FIXED: Combined filters require AND logic
      if (labelStr && assigneeStr) return labelMatch && assigneeMatch;
      if (labelStr) return labelMatch;
      return assigneeMatch;
    });
  }

  // FIXED: sanitize to avoid leaking internal fields
  res.json(result.map(sanitizeEmail));
});

app.get('/api/emails/:id', (req, res) => {
  const email = req.store.emails.find((e) => e.id === Number(req.params.id));
  if (!email) return res.status(404).json({ error: 'Email not found' });
  res.json(sanitizeEmail(email));
});

app.get('/api/agents', (req, res) => {
  res.json(req.store.agents);
});

// GET /api/stats - counts per label
app.get('/api/stats', (req, res) => {
  const stats = {};
  LABELS.forEach((l) => { stats[l] = 0; });
  // FIXED: loop through all emails up to length (not length - 1)
  for (let i = 0; i < req.store.emails.length; i++) {
    stats[req.store.emails[i].label] += 1;
  }
  res.json(stats);
});

app.patch('/api/emails/:id/label', (req, res) => {
  const email = req.store.emails.find((e) => e.id === Number(req.params.id));
  if (!email) return res.status(404).json({ error: 'Email not found' });

  const { label } = req.body;
  // FIXED: Validate missing label
  if (!label || typeof label !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid label' });
  }

  // FIXED: Trim whitespace and validate enum
  const trimmed = label.trim().toUpperCase();
  if (!LABELS.includes(trimmed)) {
    return res.status(400).json({ error: 'Invalid label' });
  }

  email.label = trimmed;
  // FIXED: Persist update in store and do not clear assignee
  const idx = req.store.emails.findIndex((e) => e.id === email.id);
  req.store.emails[idx] = { ...email };

  res.json(sanitizeEmail(req.store.emails[idx]));
});

app.patch('/api/emails/:id/assign', (req, res) => {
  const idx = req.store.emails.findIndex((e) => e.id === Number(req.params.id));
  // FIXED: Return 404 for unknown email id
  if (idx === -1) return res.status(404).json({ error: 'Email not found' });

  const { assigneeId } = req.body;
  // FIXED: Check agent existence and active status
  const agent = req.store.agents.find((a) => a.id === assigneeId);
  if (!agent || !agent.active) {
    return res.status(400).json({ error: 'Unknown or inactive agent' });
  }

  // FIXED: Persist changes back into store
  req.store.emails[idx].assignee = assigneeId;
  res.json(sanitizeEmail(req.store.emails[idx]));
});

// --- Test-harness endpoints (tooling for the hiring exercise, not part of
// the app under test — do not report bugs against these). ---
const fs = require('fs');

app.post('/api/reset', (req, res) => {
  req.resetStore();
  res.json({ ok: true });
});

// ---- Spec page: render this app's README.md as styled HTML (no external deps) ----
function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  const flushList = (buf, tag) => {
    if (buf.length) {
      out.push('<' + tag + '>' + buf.map((x) => '<li>' + inline(x) + '</li>').join('') + '</' + tag + '>');
      buf.length = 0;
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /-/.test(lines[i + 1]) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const header = cells(line);
      i += 2;
      let t = '<table><thead><tr>' + header.map((h) => '<th>' + inline(h) + '</th>').join('') + '</tr></thead><tbody>';
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        t += '<tr>' + cells(lines[i]).map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>';
        i++;
      }
      out.push(t + '</tbody></table>');
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
    if (/^---+$/.test(line.trim())) { out.push('<hr>'); i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      flushList(buf, 'ul');
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      flushList(buf, 'ol');
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s|```|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]) &&
      !/^\s*\|.*\|\s*$/.test(lines[i])
    ) { para.push(lines[i]); i++; }
    out.push('<p>' + inline(para.join(' ')) + '</p>');
  }
  return out.join('\n');
}

const SPEC_CSS = `
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;background:#f6f7f9;color:#1c2024;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:32px 24px 80px}
.back{display:inline-block;margin-bottom:20px;color:#0b63e5;text-decoration:none;font-size:14px}
.back:hover{text-decoration:underline}
h1{font-size:28px;margin:.4em 0 .3em;line-height:1.25}
h2{font-size:20px;margin:1.6em 0 .4em;padding-bottom:.3em;border-bottom:1px solid #e3e6ea}
h3{font-size:16px;margin:1.3em 0 .3em}
p{margin:.6em 0}
a{color:#0b63e5}
code{background:#eceef1;padding:.12em .4em;border-radius:4px;font-size:.88em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
pre{background:#0f1720;color:#e6edf3;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5}
pre code{background:none;padding:0;color:inherit}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:14px;display:block;overflow-x:auto}
th,td{border:1px solid #dfe3e8;padding:8px 12px;text-align:left;vertical-align:top}
th{background:#eef1f4;font-weight:600}
tr:nth-child(even) td{background:#fafbfc}
ul,ol{margin:.6em 0;padding-left:1.5em}
li{margin:.25em 0}
hr{border:0;border-top:1px solid #e3e6ea;margin:2em 0}
@media (prefers-color-scheme:dark){
 body{background:#0d1117;color:#c9d1d9}
 h2{border-color:#21262d}
 code{background:#1b2028}
 th{background:#161b22}
 th,td{border-color:#21262d}
 tr:nth-child(even) td{background:#0f141a}
 hr{border-color:#21262d}
 .back,a{color:#4c9ffe}
}`;

function reqBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return proto + '://' + req.get('host');
}

app.get('/spec', async (req, res) => {
  if (await fixTrackOpen()) {
    return res
      .status(403)
      .type('html')
      .send('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;max-width:640px;margin:64px auto;padding:0 20px;line-height:1.6"><h2>Spec unavailable during Phase 2</h2><p>The spec is hidden now that the Fix Track is open. Use the app itself and your downloaded bug report to write your tests.</p><p><a href="/">&larr; Back to app</a></p></body>');
  }
  let md = '# Spec unavailable';
  try {
    md = require('fs').readFileSync(require('path').join(__dirname, 'README.md'), 'utf8');
  } catch (e) {}
  md = md.replace(/(https?:\/\/)?localhost:\d+/g, reqBaseUrl(req));
  res
    .type('html')
    .send(
      '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Spec</title><style>' + SPEC_CSS + '</style></head>' +
        '<body><div class="wrap"><a class="back" href="/">← Back to app</a>' +
        renderMarkdown(md) +
        '</div></body></html>'
    );
});

app.get('/openapi.json', (req, res) => {
  const doc = {
    openapi: '3.0.3',
    info: { title: 'Email Labeler Queue API', version: '1.0.0' },
    servers: [{ url: reqBaseUrl(req) }],
    paths: {
      '/api/emails': {
        get: {
          summary: 'List emails, optionally filtered by label and/or assignee (AND)',
          parameters: [
            { name: 'label', in: 'query', required: false, schema: { type: 'string' }, description: 'One of HR_REPLIED, AUTO_REPLY, TICKETING_BOT, NEEDS_REVIEW (case-insensitive)' },
            { name: 'assignee', in: 'query', required: false, schema: { type: 'string' }, description: 'Agent id, e.g. a1' }
          ],
          responses: { '200': { description: 'Array of emails' } }
        }
      },
      '/api/emails/{id}': {
        get: {
          summary: 'Get a single email by id',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '200': { description: 'Email' }, '404': { description: 'Not found' } }
        }
      },
      '/api/agents': {
        get: { summary: 'List all agents', responses: { '200': { description: 'Array of agents' } } }
      },
      '/api/stats': {
        get: { summary: 'Count of emails per label', responses: { '200': { description: 'Label -> count map' } } }
      },
      '/api/emails/{id}/label': {
        patch: {
          summary: "Change an email's label",
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: { label: { type: 'string' } } },
                example: { label: 'HR_REPLIED' }
              }
            }
          },
          responses: { '200': { description: 'Updated email' }, '400': { description: 'Invalid label' }, '404': { description: 'Not found' } }
        }
      },
      '/api/emails/{id}/assign': {
        patch: {
          summary: 'Assign an email to an agent',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: { assigneeId: { type: 'string' } } },
                example: { assigneeId: 'a1' }
              }
            }
          },
          responses: { '200': { description: 'Updated email' }, '400': { description: 'Unknown or inactive agent' }, '404': { description: 'Not found' } }
        }
      },
      '/api/reset': {
        post: { summary: 'Reset demo data to seed (test-harness utility)', responses: { '200': { description: 'OK' } } }
      }
    }
  };
  res.json(doc);
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('handler error:', (err && err.stack) || err);
  if (!res.headersSent) res.status(500).json({ error: 'internal error' });
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`email-labeler-queue listening on port ${PORT}`);
  });
}

module.exports = app;
