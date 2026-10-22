<# Project Hub — filing helper: one task from the pane, run on this PC. Started by the background agent
   (FileHelper-Agent.ps1) with the task's one-time token, which is its only permission: it reads the task, does the disk
   work (pick the project folder / read its tree / open it / file), posts the result and ends. The pane shows the result;
   the only window here is the folder picker of a "pick" task. On any failure the task is cancelled (best effort), so
   the pane does not wait for it, and the error goes to the log. The logic is in FileHelper.Core.ps1.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md
   Saved as UTF-8 with BOM. #>
param([string]$Token)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'FileHelper.Core.ps1')
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-HelperToken $Token)) { Write-HelperLog 'task: not a valid token'; exit 1 }
$cfg = Get-HelperConfig
$base = $cfg.hub.TrimEnd('/') + '/api/filing/' + $Token

function Api([string]$Method, [string]$Sub, $Body) {
  $p = @{ Method = $Method; Uri = ($base + $Sub); UseBasicParsing = $true; TimeoutSec = 60 }
  if ($null -ne $Body) { $p.ContentType = 'application/json; charset=utf-8'; $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress)) }
  $r = Invoke-WebRequest @p
  # Windows PowerShell guesses the charset; the server always sends UTF-8
  $text = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  if ($text.Trim()) { return ($text | ConvertFrom-Json) }
  return $null
}
function StatusOf($Err) { try { return [int]$Err.Exception.Response.StatusCode } catch { return 0 } }

# The agent runs in the background, so Windows may keep a new window behind Outlook (the foreground lock): the picker is
# owned by an invisible, always-on-top window that activates itself when shown. The owner sits at the centre of the
# primary screen (the dialog opens near its owner, so an owner off-screen would take the dialog with it).
function Show-FolderPicker([string]$Start, [string]$Suggested, [string]$Description) {
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  [Windows.Forms.Application]::EnableVisualStyles()
  $wa = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $at = New-Object Drawing.Point(([int]($wa.Left + $wa.Width / 2)), ([int]($wa.Top + $wa.Height / 2)))
  $owner = New-Object Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; FormBorderStyle = 'None'; Opacity = 0; StartPosition = 'Manual'; MinimumSize = (New-Object Drawing.Size(1, 1)); Size = (New-Object Drawing.Size(1, 1)); Location = $at }
  $owner.Add_Shown({ $this.Activate() })
  $owner.Show()
  $owner.Activate()
  try {
    $d = New-Object Windows.Forms.FolderBrowserDialog
    $d.Description = $Description
    $d.ShowNewFolderButton = $false
    if ($Suggested) { $d.SelectedPath = $Suggested } elseif ($Start) { $d.SelectedPath = $Start }
    if ($d.ShowDialog($owner) -eq [Windows.Forms.DialogResult]::OK -and $d.SelectedPath) { return $d.SelectedPath }
    return $null
  } finally { $owner.Close(); $owner.Dispose() }
}

# Same foreground lock for the "open" task: Explorer started from this hidden process opens behind Outlook. Find the
# Explorer window showing the folder (one that was already open is reused) and bring it forward: restore if minimised,
# a lone ALT press releases the lock, then SetForegroundWindow. Best effort: never throws.
function Find-ExplorerWindow([string]$Path) {
  $want = $Path.TrimEnd('\')
  try {
    $shell = New-Object -ComObject Shell.Application
    foreach ($w in @($shell.Windows())) {
      try {
        if ($w.FullName -notlike '*\explorer.exe') { continue }
        $p = [string]$w.Document.Folder.Self.Path
        if ($p -and $p.TrimEnd('\') -ieq $want) { return $w }
      } catch { }
    }
  } catch { }
  return $null
}
function Show-FolderInFront([string]$Path) {
  try {
    if (-not ('PhFront' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class PhFront {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@
    }
    $win = Find-ExplorerWindow $Path
    if (-not $win) {
      if (Test-Path -LiteralPath $Path -PathType Leaf) { Start-Process explorer.exe -ArgumentList ('"' + $Path + '"'); return }
      Start-Process explorer.exe -ArgumentList ('"' + $Path + '"')
      $deadline = (Get-Date).AddSeconds(5)
      while (-not $win -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 150; $win = Find-ExplorerWindow $Path }
    }
    if (-not $win) { return }
    $h = [IntPtr][int]$win.HWND
    if ([PhFront]::IsIconic($h)) { [void][PhFront]::ShowWindow($h, 9) }
    [PhFront]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [PhFront]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [void][PhFront]::BringWindowToTop($h)
    [void][PhFront]::SetForegroundWindow($h)
  } catch { try { Write-HelperLog ('open: could not bring the folder forward: ' + $_.Exception.Message) } catch { } }
}

# ── a file task's attachments, from classic Outlook on this PC (read only: nothing is moved, marked or sent) ──
# Outlook is reached as the mail scanner does (Scan-Mail.ps1): New-Object attaches to the running Outlook, or starts it
# in the background when it is not running. The email is found by its Internet message id in the Inbox, Sent Items and
# then every other mail folder of the mailbox (where the conversation may have been moved), else by subject + received
# time (±2 minutes) + sender. The choices are in FileHelper.Core.ps1; this is only the COM.
function Get-OutlookSmtp($m) {
  try { if ($m.SenderEmailType -eq 'EX' -and $m.Sender) { $u = $m.Sender.GetExchangeUser(); if ($u) { return [string]$u.PrimarySmtpAddress } } } catch { }
  try { return [string]$m.SenderEmailAddress } catch { return '' }
}
function Get-OutlookMailFolders($Ns, [int]$Max = 400) {
  # Inbox and Sent Items first, then the mailbox's other mail folders (breadth first, at most $Max)
  $inbox = $Ns.GetDefaultFolder(6); $sent = $Ns.GetDefaultFolder(5)
  $out = New-Object System.Collections.ArrayList
  [void]$out.Add($inbox); [void]$out.Add($sent)
  $seen = @{ ([string]$inbox.EntryID) = $true; ([string]$sent.EntryID) = $true }
  $queue = New-Object System.Collections.Queue
  try { $queue.Enqueue($inbox.Parent) } catch { }
  while ($queue.Count -and $out.Count -lt $Max) {
    $f = $queue.Dequeue()
    try { $subs = @($f.Folders) } catch { continue }
    foreach ($s in $subs) {
      try {
        $queue.Enqueue($s)
        if ($s.DefaultItemType -ne 0 -or $seen.ContainsKey([string]$s.EntryID)) { continue }  # olMailItem folders only
        $seen[[string]$s.EntryID] = $true
        [void]$out.Add($s)
      } catch { }
    }
  }
  return ,$out
}
function Find-OutlookMail($Ns, $Mail) {
  $folders = Get-OutlookMailFolders $Ns
  if ($Mail.internetMessageId) {
    $q = Get-MessageIdFilter ([string]$Mail.internetMessageId)
    foreach ($f in $folders) { try { $it = $f.Items.Find($q); if ($it) { return $it } } catch { } }
  }
  $at = ConvertTo-LocalTime ([string]$Mail.received)
  if ($null -eq $at) { return $null }
  $q = Get-ReceivedFilter $at
  foreach ($f in $folders) {
    try {
      foreach ($it in $f.Items.Restrict($q)) {
        try {
          if ($it.Class -ne 43) { continue }   # olMail
          if (Test-MailMatch ([pscustomobject]@{ Subject = [string]$it.Subject; Received = [datetime]$it.ReceivedTime; From = (Get-OutlookSmtp $it) }) $Mail) { return $it }
        } catch { }
      }
    } catch { }
  }
  return $null
}
function Save-OutlookFiles($Mail, $Wanted, [string]$Dir) {
  # saves each wanted file as "<n>" in $Dir; returns the n of every file it could not save
  $all = @($Wanted | ForEach-Object { [int]$_.n })
  try {
    $ol = New-Object -ComObject Outlook.Application
    $ns = $ol.GetNamespace('MAPI')
    $item = Find-OutlookMail $ns $Mail
  } catch { Write-HelperLog ('outlook: ' + $_.Exception.Message); return $all }
  if (-not $item) { Write-HelperLog 'outlook: the email is not in Outlook on this PC'; return $all }
  $avail = @(for ($i = 1; $i -le $item.Attachments.Count; $i++) {
    $a = $item.Attachments.Item($i)
    if ($a.Type -eq 1) { [pscustomobject]@{ Index = $i; FileName = [string]$a.FileName; Size = [long]$a.Size } }   # olByValue
  })
  $map = Get-AttachmentMatch $avail $Wanted
  $missing = New-Object System.Collections.Generic.List[int]
  foreach ($n in $all) {
    if (-not $map.ContainsKey($n)) { $missing.Add($n); continue }
    try { $item.Attachments.Item($map[$n]).SaveAsFile((Join-Path $Dir ([string]$n))) }
    catch { Write-HelperLog ('outlook: saving ' + $n + ': ' + $_.Exception.Message); $missing.Add($n) }
  }
  Write-HelperLog ('outlook: saved {0} of {1}' -f ($all.Count - $missing.Count), $all.Count)
  return $missing.ToArray()  # unrolled: the caller collects it with @()
}

$tmp = $null
$kind = '?'
try {
  $task = Api 'GET' '' $null
  $kind = [string]$task.kind
  $script:Lang = if ($task.lang -eq 'en') { 'en' } else { 'he' }
  if (-not (Test-TaskKind $kind)) { throw "Unknown task kind: $kind" }
  switch ($kind) {
    'pick' {
      $label = (@($task.project.code, $task.project.name) | Where-Object { $_ }) -join ' '
      $desc = T 'בחר את התיקייה הראשית של הפרויקט {p}' @{ p = $label }
      $res = Invoke-PickTask $cfg $task { param($Start, $Suggested) Show-FolderPicker $Start $Suggested $desc }
    }
    'tree' { $res = Get-TreeResult (Resolve-ProjectsRoot $cfg) $task.folder }
    'open' {
      $target = Get-OpenTarget (Resolve-ProjectsRoot $cfg) $task.folder ([string]$task.rel)
      if ($target) { Show-FolderInFront $target; $res = @{ opened = $true } }
      else { $res = @{ missing = $true } }
    }
    'file' {
      $root = Resolve-ProjectsRoot $cfg
      if (-not (Get-ProjectDir $root $task.folder)) { $res = @{ missing = $true } }
      else {
        # only the files the plan files, each as "<n>": from Outlook on this PC first; what it cannot give is asked of
        # the pane (needUpload: nothing is filed now, the pane uploads them and confirms again); the rest is downloaded
        $tmp = Join-Path ([IO.Path]::GetTempPath()) ('ProjectHub-filing-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
        New-Item -ItemType Directory -Path $tmp | Out-Null
        $needed = Get-NeededFiles $task
        $local = @($needed | Where-Object { $_.source -eq 'outlook' })
        $ask = @()
        if ($local.Count) { $ask = @(Save-OutlookFiles $task.mail $local $tmp) }
        if ($ask.Count) { $res = @{ needUpload = [int[]]$ask } }
        else {
          foreach ($x in @($needed | Where-Object { $_.source -ne 'outlook' })) { Invoke-WebRequest -UseBasicParsing -TimeoutSec 300 -Uri ($base + '/file/' + $x.n) -OutFile (Join-Path $tmp ([string]$x.n)) }
          $res = Invoke-FileTask $root $task $tmp
        }
      }
    }
  }
  [void](Api 'POST' '/result' $res)
  Write-HelperLog ("task {0}: {1}" -f $kind, (($res.Keys | Sort-Object) -join ','))
} catch {
  # an expired task is gone already; anything else is cancelled, so the pane does not wait for it
  $code = StatusOf $_
  Write-HelperLog ("task {0} failed ({1}): {2}" -f $kind, $code, $_.Exception.Message)
  if ($code -ne 410) { try { [void](Api 'POST' '/cancel' @{}) } catch {} }
  exit 1
} finally {
  if ($tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
