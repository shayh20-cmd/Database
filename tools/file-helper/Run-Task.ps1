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
      if ($target) { Start-Process explorer.exe -ArgumentList ('"' + $target + '"'); $res = @{ opened = $true } }
      else { $res = @{ missing = $true } }
    }
    'file' {
      $root = Resolve-ProjectsRoot $cfg
      if (-not (Get-ProjectDir $root $task.folder)) { $res = @{ missing = $true } }
      else {
        # only the files the plan files are downloaded, each as "<n>"
        $tmp = Join-Path ([IO.Path]::GetTempPath()) ('ProjectHub-filing-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
        New-Item -ItemType Directory -Path $tmp | Out-Null
        $wanted = @(@($task.plan.files) | Where-Object { $null -ne $_.dest } | ForEach-Object { [int]$_.n } | Sort-Object -Unique)
        foreach ($n in $wanted) { Invoke-WebRequest -UseBasicParsing -TimeoutSec 300 -Uri ($base + '/file/' + $n) -OutFile (Join-Path $tmp ([string]$n)) }
        $res = Invoke-FileTask $root $task $tmp
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
