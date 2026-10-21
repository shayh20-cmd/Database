'use strict';
/* The Outlook add-in's way in. The task pane (outlook/taskpane.html) carries a personal key
   (Bearer, before the sign-in gate, like the mail scanner); the key is issued to the signed-in
   person at /api/outlook-connection. Every call acts as that person through the connector's own
   tools (mcp.runToolAs), so the add-in sees and writes exactly what Claude would.
   Spec: docs/superpowers/specs/2026-10-21-outlook-addin-design.md */
const fs = require('fs');
const path = require('path');
const createTokens = require('./mail-tokens');

module.exports = function createOutlook(ctx) {
  const { DATA_DIR, STATIC_ROOT, SITE_MODE, LOCAL_USER_NAME, readJson, writeJsonAtomic, sendJson, mcp } = ctx;
  const tokens = createTokens(path.join(DATA_DIR, 'outlook_tokens.json'), { readJson, writeJsonAtomic }, 'pho_');
  const now = () => new Date().toISOString();
  // a key names a person by address ("local" on the local server, where there is none)
  const personOfKey = who => who === 'local' ? { email: null, name: LOCAL_USER_NAME } : { email: who, name: who };
  const baseOf = req => (SITE_MODE === 'cloud' || req.socket.encrypted ? 'https' : (req.headers['x-forwarded-proto'] || 'http')) + '://' + req.headers.host;

  /* The manifest names the server it was downloaded from, so one file serves the local HTTPS
     server and Azure alike. */
  function manifest(req, res) {
    fs.readFile(path.join(STATIC_ROOT, 'outlook', 'manifest.xml'), 'utf8', (err, xml) => {
      if (err) { sendJson(res, 404, { error: 'Not found' }); return; }
      const body = xml.split('{{BASE}}').join(baseOf(req));
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Disposition': 'attachment; filename="project-hub-outlook.xml"' });
      res.end(body);
    });
  }

  const ROUTES = ['/api/outlook/me', '/api/outlook/projects'];

  function run(req, res, url) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const who = tokens.check(m ? m[1].trim() : null, now());
    if (!who) { sendJson(res, 401, { error: 'invalid_key' }); return; }
    if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    const p = personOfKey(who);
    if (url.pathname === '/api/outlook/me') {
      const me = mcp.whoAmI(p.email, p.name);
      sendJson(res, 200, { name: me.name, email: me.email, role: me.role });
      return;
    }
    try {
      sendJson(res, 200, mcp.runToolAs(p.email, p.name, baseOf(req), 'list_projects', {}));
    } catch (e) {
      if (e instanceof mcp.ToolError) { sendJson(res, 400, { error: e.message }); return; }
      throw e;
    }
  }
  function handlePublic(req, res, url) {
    if (url.pathname === '/outlook/manifest.xml' || url.pathname === '/outlook/manifest') { manifest(req, res); return true; }
    if (!ROUTES.includes(url.pathname)) return false;
    try { run(req, res, url); } catch (e) { sendJson(res, 500, { error: e.message }); }
    return true;
  }

  /* ── the key, for the signed-in person ── */
  function handleConnection(req, res, user) {
    const email = user.email ? String(user.email).trim().toLowerCase() : null;
    if (req.method === 'GET') { sendJson(res, 200, { key: tokens.status(email) }); return; }
    if (req.method === 'POST') { sendJson(res, 200, { key: tokens.issue(email, now()) }); return; }
    if (req.method === 'DELETE') { tokens.revoke(email); sendJson(res, 200, { ok: true }); return; }
    sendJson(res, 405, { error: 'Method not allowed' });
  }

  return { handlePublic, handleConnection };
};
