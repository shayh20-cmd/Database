# Project Hub for Outlook

An Outlook add-in (task pane) that reads the email being read and works in Project Hub as the
person, through the connector's tools. Design: `docs/superpowers/specs/2026-10-21-outlook-addin-design.md`.

- `manifest.xml`: the add-in manifest (XML, add-in only). The server fills in `{{BASE}}` with its own
  address when it serves `/outlook/manifest.xml`, so download it from the server it should use.
- `taskpane.html`: the pane, plain JS with Office.js. `/outlook/taskpane?demo` shows a sample email outside Outlook.
- `/outlook_connect` (the root page `outlook_connect.html`, signed in): issues the personal key the pane asks for.
- Server side: `tools/local-server/outlook.js` (`/api/outlook/*` with the key, `/api/outlook-connection` signed in).

## Trying it locally

Outlook loads add-ins over HTTPS only. Once per machine, install the development certificate
(this adds a certificate authority to your Windows trust store, so run it yourself):

```bash
npx office-addin-dev-certs install
```

Then start the server with HTTPS (the `outlook-addin` entry in `.claude/launch.json` does the same):

```bash
node tools/local-server/server.js . --port 3440 --https-port 3443
```

1. Open `https://localhost:3443/outlook_connect`, create a key, copy it, and download the add-in file.
2. In Outlook on the web: open an email → Apps → Add apps → My add-ins → Add a custom add-in → Add from File.
3. Open an email, click Project Hub on its toolbar, and paste the key.

The add-in then appears on the same account in the new Outlook and in classic Outlook too. Remove it
from the same My add-ins screen.
