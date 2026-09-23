# The project hub on Azure

One shared copy of `project_hub_01.html` at `https://<name>.azurewebsites.net`, behind
Microsoft sign-in. Anyone with a work account in the firm's Entra directory opens the
address, signs in, and edits the same project as everyone else.

This is the first, minimal deployment (2026-09-17). The fuller design — several
projects, Blob Storage with versions, a managed identity instead of a secret — is in
`docs/superpowers/specs/2026-09-17-azure-deployment-design.md` and stays the target.

## What runs there

The same `tools/local-server/server.js` that serves the page locally, started with
`SITE_MODE=cloud`:

| | locally | on Azure |
|---|---|---|
| documents | `data/` in the repo | `/home/data` on the web app — kept across restarts and redeploys |
| who you are | `LOCAL_USER_NAME` (default שי הרשקוביץ) | the signed-in Microsoft account, matched by email to the office staff list |
| served | every file under the root | pages only; `/health` and the sign-in page are open, everything else needs sign-in |
| snipping (`/api/snip`) | works | absent |

Sign-in is App Service authentication ("Easy Auth") with an app registration in the
firm's directory. Easy Auth lets anonymous requests through, and the server is the gate: without a
session a page request is redirected to the sign-in page (`login.html`) and an API call
gets 401. The sign-in page's button starts Microsoft sign-in (`/.auth/login/aad`) with the
typed email as `login_hint`. With a session, the server reads the name and email from the
`X-MS-CLIENT-PRINCIPAL` header; the page matches the email to the staff list to know who
you are (roles, ownership, profile), and activity-log entries are signed with the name. The server
refuses to start in cloud mode unless App Service reports authentication on.

## Seeing each other's changes

Every save names the version it started from (`If-Match`); the server refuses a stale
one with 412, and the page re-reads, merges three ways and retries — so two people
saving at once both keep their changes. A tab also checks the server every 30 seconds
and on focus; when someone else has saved, their version is merged into the screen and
a blue bar says who saved. Undo is cleared at that point, since it restores whole
snapshots and would quietly remove a colleague's change.

## First deployment

Requirements on your machine: PowerShell 7, the Azure CLI signed in to the firm's
subscription (`az login`), Node with the server's dependencies installed
(`cd tools\local-server; npm install`).

```powershell
.\Deploy-Azure.ps1 -Name kkarc-hub
```

The name becomes the address and must be unique across Azure. The script creates a
resource group `project-hub`, a free Linux plan, the web app, the app registration
and its secret, turns sign-in on, deploys the page and the server, then checks that
`/health` answers, `/` redirects to the sign-in page and the data API refuses without a session. Registering the application needs an
account allowed to do so in the directory; if yours is not, the script says so.

To start with the demo project rather than an empty one, upload the JSON from the
machine that has it:

```powershell
.\Deploy-Azure.ps1 -Name kkarc-hub -Seed C:\Users\Omega\Database\data\project_hub_01.json
```

Attachments (pasted screenshots, Outlook messages) are not carried over by the seed.

## Redeploying

Run the same command again. Everything that exists is reused; only the code is
redeployed. Documents under `/home/data` are untouched. For a page or server change
once the site exists, `-CodeOnly` skips the resource steps: every configuration write
restarts the app, and the free tier allows 15 restarts an hour — past that, Azure
disables the site (and its logs) until the hour turns.

## Where things are, when something is wrong

- Logs: `az webapp log tail --name <name> --resource-group project-hub`
- The documents: `az webapp ssh --name <name> --resource-group project-hub`, then
  `ls /home/data`
- The sign-in secret lives in the app setting `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET`
  and expires two years after the first deployment. To issue a new one, delete that app
  setting in the portal and run the script again.
- Someone cannot sign in: they need an account in the firm's directory. The
  registration is single tenant, so personal Microsoft accounts and other
  organisations are refused by Microsoft before reaching the site.
- Free tier: the first request after a quiet spell waits 20–40 seconds while the app
  starts, and the plan has 60 CPU-minutes a day. `-Sku B1` removes both.

## Not in this deployment

The capture window, the planning dashboard, the spec creator and the home view's
portfolio cards. Several projects side by side. Restoring an earlier version of a
project.
