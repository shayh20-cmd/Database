'use strict';
/* One-click installers for the filing helper (tools/file-helper) and the mail scanner (tools/mail-scan),
   downloaded from Project Hub's Settings by signed-in people only.

   Each download is a .cmd built per request, like the quick-access installer (tools/quick-access/ProjectHub-Setup.cmd):
   a few lines of cmd that hand the file to PowerShell, then the PowerShell after the #PS-START marker. That part
   carries the tool's files as base64, writes them to a temporary folder (a .ps1 always with its UTF-8 BOM, which
   Windows PowerShell 5.1 needs to read Hebrew) and runs the tool's own install or uninstall script from there with
   -Gui, so the repo install and this one share the same logic. The hub's address is the one the request came to.
   No key is ever put in the file: the installer asks for it. */
const fs = require('fs');
const path = require('path');

const INSTALLERS = {
  // quick access (tools/quick-access/ProjectHub-Setup.cmd): its three Start menu shortcuts, the right-click entries
  // and the icons' folder. Other shortcuts in the Start menu's "Project Hub" folder (the mail scanner's) stay.
  '/ProjectHub-Uninstall.cmd': {
    dir: 'tools/quick-access', title: 'Project Hub - גישה מהירה',
    files: [],
    run: [
      "$programs = Join-Path ([Environment]::GetFolderPath('Programs')) 'Project Hub'",
      "  foreach ($n in 'Project Hub', 'Project Hub - משימה חדשה', 'Project Hub - עדכון למשימה') { Remove-Item -LiteralPath (Join-Path $programs \"$n.lnk\") -Force -ErrorAction SilentlyContinue }",
      "  if ((Test-Path -LiteralPath $programs) -and -not (Get-ChildItem -LiteralPath $programs -Force)) { Remove-Item -LiteralPath $programs -Force }",
      "  Remove-Item 'HKCU:\\Software\\Classes\\DesktopBackground\\Shell\\ProjectHubTask', 'HKCU:\\Software\\Classes\\Directory\\Background\\shell\\ProjectHubTask' -Recurse -Force -ErrorAction SilentlyContinue",
      "  Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'Programs\\ProjectHub') -Recurse -Force -ErrorAction SilentlyContinue"
    ].join('\r\n'),
    done: 'הגישה המהירה הוסרה מהמחשב.`n`nQuick access was removed from this computer.'
  },
  '/ProjectHub-FileHelper-Setup.cmd': {
    dir: 'tools/file-helper', title: 'Project Hub - תיוק מהיר',
    files: ['FileHelper.Core.ps1', 'FileHelper-Agent.ps1', 'Run-Task.ps1', 'run-file-helper-agent.vbs', 'Install-FileHelper.ps1'],
    run: "& (Join-Path $stage 'Install-FileHelper.ps1') -Hub $Site -Gui"
  },
  '/ProjectHub-FileHelper-Uninstall.cmd': {
    dir: 'tools/file-helper', title: 'Project Hub - תיוק מהיר',
    files: ['Uninstall-FileHelper.ps1'],
    run: "& (Join-Path $stage 'Uninstall-FileHelper.ps1')",
    done: 'עוזר התיוק הוסר מהמחשב. תיבת הייצוא והקבצים שבה נשארו.`n`nThe filing helper was removed from this computer. The export inbox and the files in it were kept.'
  },
  '/ProjectHub-MailScan-Setup.cmd': {
    dir: 'tools/mail-scan', title: 'Project Hub - סריקת מייל',
    files: ['Scan-Mail.ps1', 'run-hidden.vbs', 'Install-MailScan.ps1'],
    // the Start menu shortcut's icon: the public quick-access cube, when it can be fetched
    icon: true,
    run: "& (Join-Path $stage 'Install-MailScan.ps1') -Hub $Site -Local -Gui"
  },
  '/ProjectHub-MailScan-Uninstall.cmd': {
    dir: 'tools/mail-scan', title: 'Project Hub - סריקת מייל',
    files: ['Uninstall-MailScan.ps1'],
    run: "& (Join-Path $stage 'Uninstall-MailScan.ps1')",
    done: 'סריקת המייל הוסרה מהמחשב. כדי לבטל גם את המפתח בשרת: הגדרות ← תוסף Outlook וסריקת מייל ← בטל מפתח.`n`nMail scan was removed from this computer. To revoke the key on the server too: Settings → Outlook add-in and mail scan → Revoke key.'
  }
};

// a Host header goes into the file inside single quotes, so only a plain host[:port] is accepted
const HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

function build(spec, name, root, site) {
  const CRLF = '\r\n';
  const blocks = spec.files.map(f => {
    const b64 = fs.readFileSync(path.join(root, spec.dir, f)).toString('base64');
    return "  '" + f + "' = '" + b64 + "'";
  });
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    "$Site = '" + site + "'",
    'Add-Type -AssemblyName System.Windows.Forms',
    'function Say($text, $kind = \'Information\') {',
    '  $opts = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign',
    "  [System.Windows.Forms.MessageBox]::Show($text, '" + spec.title + "', 'OK', $kind, 'Button1', $opts) | Out-Null",
    '}',
    '# the files of ' + spec.dir + ', as base64',
    '$files = [ordered]@{',
    ...blocks,
    '}',
    "$stage = Join-Path ([IO.Path]::GetTempPath()) ('ProjectHub-' + [guid]::NewGuid().ToString('N'))",
    'try {',
    '  New-Item -ItemType Directory -Force -Path $stage | Out-Null',
    '  foreach ($k in $files.Keys) {',
    '    $bytes = [Convert]::FromBase64String($files[$k])',
    '    # a .ps1 keeps its UTF-8 BOM: Windows PowerShell 5.1 reads Hebrew only that way',
    "    if ($k -like '*.ps1' -and -not ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)) { $bytes = [byte[]](0xEF, 0xBB, 0xBF) + $bytes }",
    '    [IO.File]::WriteAllBytes((Join-Path $stage $k), $bytes)',
    '  }',
    ...(spec.icon ? [
      '  try {',
      '    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
      "    Invoke-WebRequest \"$Site/qa-app.ico\" -OutFile (Join-Path $stage 'project-hub-cube.ico') -UseBasicParsing",
      '  } catch { }'
    ] : []),
    '  ' + spec.run,
    ...(spec.done ? ['  Say "' + spec.done + '"'] : []),
    '}',
    'catch {',
    '  Say ("הפעולה לא הושלמה:`n" + $_.Exception.Message + "`n`nThis did not finish.") \'Error\'',
    '}',
    'finally {',
    '  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue',
    '}'
  ];
  const head = [
    '@echo off',
    'rem ' + name + ' - Project Hub, for the current Windows user (no admin rights needed).',
    'rem Downloaded from Project Hub (Settings). Double-click to run; run the setup again to update.',
    'rem Made for ' + site + '. The PowerShell below the #PS marker does the work; cmd stops at "exit /b" and never reads it.',
    'set "PH_SETUP=%~f0"',
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$s=[IO.File]::ReadAllText($env:PH_SETUP,[Text.Encoding]::UTF8); Invoke-Expression $s.Substring($s.IndexOf('#PS' + '-START') + 9)\"",
    'exit /b',
    '#PS-START'
  ];
  return Buffer.from(head.concat(ps).join(CRLF) + CRLF, 'utf8');
}

module.exports = function createInstallers({ STATIC_ROOT, SITE_MODE }) {
  const siteOf = req => {
    const host = String(req.headers.host || '');
    if (!HOST.test(host)) return null;
    const proto = SITE_MODE === 'cloud' || (req.socket && req.socket.encrypted) ? 'https' : (req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http');
    return proto + '://' + host;
  };
  /* Called after the sign-in gate: a visitor without a session never gets here. */
  function handle(req, res, url, sendJson) {
    const spec = INSTALLERS[url.pathname];
    if (!spec) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') { sendJson(res, 405, { error: 'Method not allowed' }); return true; }
    const site = siteOf(req);
    if (!site) { sendJson(res, 400, { error: 'Bad host' }); return true; }
    let body;
    try { body = build(spec, url.pathname.slice(1), STATIC_ROOT, site); } catch (e) { sendJson(res, 404, { error: 'Not found' }); return true; }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="' + url.pathname.slice(1) + '"'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }
  return { handle, build: (p, site) => build(INSTALLERS[p], p.slice(1), STATIC_ROOT, site), INSTALLERS };
};
