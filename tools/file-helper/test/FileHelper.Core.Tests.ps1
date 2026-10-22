<# Tests for FileHelper.Core.ps1, without Pester.
   Run: powershell -NoProfile -ExecutionPolicy Bypass -File tools\file-helper\test\FileHelper.Core.Tests.ps1
   Saved as UTF-8 with BOM. #>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\FileHelper.Core.ps1')
$script:pass = 0; $script:fail = 0
function Check([string]$What, [bool]$Ok) { if ($Ok) { $script:pass++ } else { $script:fail++; Write-Host "FAIL: $What" } }
function New-TempDir { $d = Join-Path ([IO.Path]::GetTempPath()) ('fh-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8)); New-Item -ItemType Directory -Path $d | Out-Null; return $d }
function Throws([scriptblock]$Block) { try { & $Block; return $false } catch { return $true } }

# relative paths
Check 'rel: backslashes' ((ConvertTo-RelPath 'CONS\יועצים\') -eq 'CONS/יועצים')
Check 'rel: empty is the project folder' ((ConvertTo-RelPath '') -eq '')
foreach ($bad in '../x', 'a/../b', '/abs', 'C:/x', 'a//b', 'a/b?', 'a/b.') { Check "rel: $bad" ($null -eq (ConvertTo-RelPath $bad)) }

$root = New-TempDir
try {
  # the project's folders
  foreach ($d in 'CONS\S\plans\S-plans-v01', 'CONS\S\plans\S-plans-v02', 'CONS\S\plans\S-plans-@ver', 'CONS\S\plans\S-updated-PDF', 'CONS\S\docs', 'יועצים') { New-Item -ItemType Directory -Force -Path (Join-Path $root $d) | Out-Null }
  Set-Content -Path (Join-Path $root 'CONS\S\plans\S-updated-PDF\old.pdf') -Value 'old'
  Set-Content -Path (Join-Path $root 'CONS\S\docs\a.pdf') -Value 'a'

  Check 'inside: resolves' ((Resolve-InProject $root 'CONS/S') -eq (Join-Path $root 'CONS\S'))
  Check 'inside: refuses ..' (Throws { Resolve-InProject $root '../x' })

  $tree = Get-FolderTree $root
  Check 'tree: relative, "/" between names' ($tree -contains 'CONS/S/plans/S-plans-v02')
  Check 'tree: Hebrew names' ($tree -contains 'יועצים')
  Check 'tree: parents before children' ([array]::IndexOf($tree, 'CONS') -lt [array]::IndexOf($tree, 'CONS/S'))
  Check 'tree: depth limit' (-not ((Get-FolderTree $root 2) -contains 'CONS/S/plans'))
  Check 'tree: count limit' ((Get-FolderTree $root 5 3).Count -eq 3)

  # versions
  $v = Get-VersionInfo 'S-plans-v02'
  Check 'version: prefix and number' ($v.Prefix -eq 'S-plans-v' -and $v.Number -eq 2)
  Check 'version: not one' ($null -eq (Get-VersionInfo 'S-plans-@ver'))
  Check 'version: siblings in order' (((@(Get-VersionSiblings (Join-Path $root 'CONS\S\plans') 'S-plans-v')) -join ',') -eq 'S-plans-v01,S-plans-v02')

  # free names
  Check 'free name: as is' ((Get-FreeName (Join-Path $root 'CONS\S\docs') 'b.pdf') -eq 'b.pdf')
  Check 'free name: (2)' ((Get-FreeName (Join-Path $root 'CONS\S\docs') 'a.pdf') -eq 'a (2).pdf')

  # modes: Claude said a new version; "existing" is the highest there; back restores Claude's plan
  $claude = [pscustomobject]@{
    files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/S/plans/S-plans-v03' })
    steps = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/S/plans/S-plans-v03'; from = ''; to = '' },
              [pscustomobject]@{ op = 'move-contents'; path = ''; from = 'CONS/S/plans/S-updated-PDF'; to = 'CONS/S/plans/S-plans-@ver' })
    mode = 'new-version'; why = ''
  }
  $old = Set-PlanMode $root $claude 'existing'
  Check 'mode existing: highest folder' ($old.files[0].dest -eq 'CONS/S/plans/S-plans-v02')
  Check 'mode existing: only the refresh step stays' (((@($old.steps) | ForEach-Object { $_.op }) -join ',') -eq 'move-contents')
  $back = Set-PlanMode $root $claude 'new-version'
  Check 'mode back: Claude''s plan' ($back.files[0].dest -eq 'CONS/S/plans/S-plans-v03' -and @($back.steps).Count -eq 2)
  # Claude said existing; "new-version" is the next number, made first
  $claude2 = [pscustomobject]@{ files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/S/plans/S-plans-v02' }); steps = @(); mode = 'existing'; why = '' }
  $nv = Set-PlanMode $root $claude2 'new-version'
  Check 'mode new: next number' ($nv.files[0].dest -eq 'CONS/S/plans/S-plans-v03')
  Check 'mode new: mkdir' (((@($nv.steps) | ForEach-Object { $_.op + ' ' + $_.path }) -join ',') -eq 'mkdir CONS/S/plans/S-plans-v03')

  # what the window lists
  $lines = Get-PlanLines $claude
  Check 'lines: steps then copies' ($lines.Count -eq 3 -and $lines[2] -like '*K.pdf*CONS\S\plans\S-plans-v03*')

  # carrying out a plan
  $src = New-TempDir
  Set-Content -Path (Join-Path $src '0') -Value 'new K'
  Set-Content -Path (Join-Path $src '1') -Value 'new a'
  $plan = [pscustomobject]@{
    files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/S/plans/S-plans-v03' }, [pscustomobject]@{ n = 1; name = 'a.pdf'; dest = 'CONS/S/docs' }, [pscustomobject]@{ n = 2; name = 'skip.pdf'; dest = $null })
    steps = $claude.steps; mode = 'new-version'; why = ''
  }
  $r = Invoke-FilingPlan $root $plan $src
  Check 'run: no error' ($null -eq $r.error)
  Check 'run: copied' (Test-Path (Join-Path $root 'CONS\S\plans\S-plans-v03\K.pdf'))
  Check 'run: never overwrites' ((Get-Content (Join-Path $root 'CONS\S\docs\a.pdf')) -eq 'a' -and (Test-Path (Join-Path $root 'CONS\S\docs\a (2).pdf')))
  Check 'run: refresh moved the old files' ((Test-Path (Join-Path $root 'CONS\S\plans\S-plans-@ver\old.pdf')) -and -not (Test-Path (Join-Path $root 'CONS\S\plans\S-updated-PDF\old.pdf')))
  Check 'run: reports what it did' (((@($r.files) | ForEach-Object { $_.savedAs }) -join ',') -eq 'K.pdf,a (2).pdf')
  # a bad path anywhere: nothing at all is done
  $bad = [pscustomobject]@{ files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/new' }); steps = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/made'; from = ''; to = '' }, [pscustomobject]@{ op = 'mkdir'; path = '../out'; from = ''; to = '' }); mode = 'existing'; why = '' }
  Check 'run: a bad path throws' (Throws { Invoke-FilingPlan $root $bad $src })
  Check 'run: ...before anything' (-not (Test-Path (Join-Path $root 'CONS\made')))
  # a move onto a folder that is there: stops, says what was done
  $clash = [pscustomobject]@{ files = @(); steps = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/x1'; from = ''; to = '' }, [pscustomobject]@{ op = 'move'; path = ''; from = 'CONS/S/docs'; to = 'יועצים' }); mode = 'existing'; why = '' }
  $r2 = Invoke-FilingPlan $root $clash $src
  Check 'run: stops on a clash' ($r2.error -and @($r2.steps).Count -eq 1)
  Remove-Item -LiteralPath $src -Recurse -Force

  # where the projects folder is, from Folder Manager's list
  $fm = Join-Path $root 'projects.json'
  $p1 = Join-Path $root 'CONS'
  [IO.File]::WriteAllText($fm, (@{ projects = @(@{ alpha = 'TASC'; path = (Join-Path $p1 'S') }, @{ alpha = 'RLSC'; path = ((Join-Path $p1 'docs') -replace '\\', '/') }) } | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
  Check 'root: most projects sit there' ((Find-ProjectsRoot $fm) -eq $p1)
  Check 'root: no list' ($null -eq (Find-ProjectsRoot (Join-Path $root 'none.json')))
  $cands = Find-ProjectFolder $p1 'TASC' 'Tel Aviv School' $fm
  Check 'project folder: from Folder Manager by code' ($cands[0] -eq 'S')

  # the job's token, as the agent passes it on a command line
  Check 'token: plain' (Test-HelperToken ('a' * 43))
  Check 'token: refuses anything else' (-not (Test-HelperToken 'abc" & calc'))
  Check 'token: refuses empty' (-not (Test-HelperToken ''))

  # the personal key, kept with DPAPI
  $keyPath = Join-Path $root 'cfg\file-helper.key'
  Check 'key: none yet' ($null -eq (Read-HelperKey $keyPath))
  Save-HelperKey 'pho_test123' $keyPath
  Check 'key: round trip' ((Read-HelperKey $keyPath) -eq 'pho_test123')
  Check 'key: not stored in plain text' (-not ((Get-Content -Raw $keyPath) -match 'pho_test123'))

  # config
  $cfgPath = Join-Path $root 'cfg\file-helper.json'
  $c = Get-HelperConfig $cfgPath
  Check 'config: default hub' ($c.hub -eq 'https://kkarc-hub.azurewebsites.net' -and $c.projectsRoot -eq '')
  $c.projectsRoot = 'P:\@Omicron Projects'; Save-HelperConfig $c $cfgPath
  Check 'config: saved' ((Get-HelperConfig $cfgPath).projectsRoot -eq 'P:\@Omicron Projects')

  # texts
  $script:Lang = 'en'
  Check 'text: English' ((T 'ביטול') -eq 'Cancel')
  Check 'text: slots' ((T 'העתקת {f} אל {d}' @{ f = 'K.pdf'; d = 'X' }) -eq 'Copy K.pdf to X')
  $script:Lang = 'he'
  Check 'text: Hebrew' ((T 'ביטול') -eq 'ביטול')
} finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "$script:pass passed, $script:fail failed"
exit ([int]($script:fail -gt 0))
