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
$script:LogPath = Join-Path $root 'file-helper.log'   # never the real log
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

  # free names
  Check 'free name: as is' ((Get-FreeName (Join-Path $root 'CONS\S\docs') 'b.pdf') -eq 'b.pdf')
  Check 'free name: (2)' ((Get-FreeName (Join-Path $root 'CONS\S\docs') 'a.pdf') -eq 'a (2).pdf')

  # carrying out a plan
  $refresh = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/S/plans/S-plans-v03'; from = ''; to = '' },
               [pscustomobject]@{ op = 'move-contents'; path = ''; from = 'CONS/S/plans/S-updated-PDF'; to = 'CONS/S/plans/S-plans-@ver' })
  $src = New-TempDir
  Set-Content -Path (Join-Path $src '0') -Value 'new K'
  Set-Content -Path (Join-Path $src '1') -Value 'new a'
  $plan = [pscustomobject]@{
    files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/S/plans/S-plans-v03' }, [pscustomobject]@{ n = 1; name = 'a.pdf'; dest = 'CONS/S/docs' }, [pscustomobject]@{ n = 2; name = 'skip.pdf'; dest = $null })
    steps = $refresh; mode = 'new-version'
  }
  $r = Invoke-FilingPlan $root $plan $src
  Check 'run: no error' ($null -eq $r.error)
  Check 'run: copied' (Test-Path (Join-Path $root 'CONS\S\plans\S-plans-v03\K.pdf'))
  Check 'run: never overwrites' ((Get-Content (Join-Path $root 'CONS\S\docs\a.pdf')) -eq 'a' -and (Test-Path (Join-Path $root 'CONS\S\docs\a (2).pdf')))
  Check 'run: refresh moved the old files' ((Test-Path (Join-Path $root 'CONS\S\plans\S-plans-@ver\old.pdf')) -and -not (Test-Path (Join-Path $root 'CONS\S\plans\S-updated-PDF\old.pdf')))
  Check 'run: reports what it did' (((@($r.files) | ForEach-Object { $_.savedAs }) -join ',') -eq 'K.pdf,a (2).pdf')
  # a bad path anywhere: nothing at all is done
  $bad = [pscustomobject]@{ files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/new' }); steps = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/made'; from = ''; to = '' }, [pscustomobject]@{ op = 'mkdir'; path = '../out'; from = ''; to = '' }); mode = 'existing' }
  Check 'run: a bad path throws' (Throws { Invoke-FilingPlan $root $bad $src })
  Check 'run: ...before anything' (-not (Test-Path (Join-Path $root 'CONS\made')))
  # a move onto a folder that is there: stops, says what was done
  $clash = [pscustomobject]@{ files = @(); steps = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/x1'; from = ''; to = '' }, [pscustomobject]@{ op = 'move'; path = ''; from = 'CONS/S/docs'; to = 'יועצים' }); mode = 'existing' }
  $r2 = Invoke-FilingPlan $root $clash $src
  Check 'run: stops on a clash' ($r2.error -and @($r2.steps).Count -eq 1)
  Remove-Item -LiteralPath $src -Recurse -Force

  # the project's folder, guessed from Folder Manager's list
  $fm = Join-Path $root 'projects.json'
  $p1 = Join-Path $root 'CONS'
  [IO.File]::WriteAllText($fm, (@{ projects = @(@{ alpha = 'TASC'; path = (Join-Path $p1 'S') }, @{ alpha = 'RLSC'; path = ((Join-Path $p1 'docs') -replace '\\', '/') }) } | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
  $cands = Find-ProjectFolder $p1 'TASC' 'Tel Aviv School' $fm
  Check 'project folder: from Folder Manager by code' ($cands[0] -eq 'S')

  # the task's token, as the agent passes it on a command line
  Check 'token: plain' (Test-HelperToken ('a' * 43))
  Check 'token: refuses anything else' (-not (Test-HelperToken 'abc" & calc'))
  Check 'token: refuses empty' (-not (Test-HelperToken ''))
  Check 'kind: known' ((Test-TaskKind 'pick') -and (Test-TaskKind 'tree') -and (Test-TaskKind 'open') -and (Test-TaskKind 'file'))
  Check 'kind: anything else' (-not (Test-TaskKind 'job') -and -not (Test-TaskKind ''))

  # the personal key, kept with DPAPI
  $keyPath = Join-Path $root 'cfg\file-helper.key'
  Check 'key: none yet' ($null -eq (Read-HelperKey $keyPath))
  Save-HelperKey 'pho_test123' $keyPath
  Check 'key: round trip' ((Read-HelperKey $keyPath) -eq 'pho_test123')
  Check 'key: not stored in plain text' (-not ((Get-Content -Raw $keyPath) -match 'pho_test123'))

  # config
  $cfgPath = Join-Path $root 'cfg\file-helper.json'
  $c = Get-HelperConfig $cfgPath
  Check 'config: default hub' ($c.hub -eq 'https://kkarc-hub.azurewebsites.net' -and $c.projectsRoot -eq '' -and $c.roots.Count -eq 0)
  $c.projectsRoot = 'P:\@Omicron Projects'; $c.roots['@Nu Projects'] = '\\Nu\n\@Nu Projects'; Save-HelperConfig $c $cfgPath
  $c2 = Get-HelperConfig $cfgPath
  Check 'config: saved' ($c2.projectsRoot -eq 'P:\@Omicron Projects' -and $c2.roots['@nu projects'] -eq '\\Nu\n\@Nu Projects')

  # ── the project roots: "@<Name> Projects" at the top of every drive (temp folders stand in for the drives) ──
  $drvA = Join-Path $root 'drvA'; $drvB = Join-Path $root 'drvB'; $share = Join-Path $root 'share'
  $alpha = Join-Path $drvA '@Alpha Projects'; $kappa = Join-Path $drvA '@Kappa projects'; $omicron = Join-Path $drvB '@Omicron Projects'
  $nu = Join-Path $share 'Nu Archive'
  $school = '2026-05-20-26 - Tel Aviv School'
  foreach ($d in "$school\CONS\S", '2026-01-01-01 - Other', 'Elsewhere\2030-01-01 - Far', 'Same Name') { New-Item -ItemType Directory -Force -Path (Join-Path $omicron $d) | Out-Null }
  foreach ($d in 'K-100 - Kappa One', 'Same Name') { New-Item -ItemType Directory -Force -Path (Join-Path $kappa $d) | Out-Null }
  foreach ($d in 'A-1 - Alpha One') { New-Item -ItemType Directory -Force -Path (Join-Path $alpha $d) | Out-Null }
  foreach ($d in 'N-1 - Nu One') { New-Item -ItemType Directory -Force -Path (Join-Path $nu $d) | Out-Null }
  New-Item -ItemType Directory -Force -Path (Join-Path $drvA 'not a root'), (Join-Path $drvA '@Alpha Projects backup') | Out-Null
  $drives = @($drvA, $drvB, (Join-Path $root 'no-such-drive'))
  $rcfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = ''; roots = @{} }
  $roots = Get-ProjectRoots $rcfg -Drives $drives
  Check 'roots: every "@* projects" at a drive top, any case' ((@($roots.Keys) -join ',') -eq '@Alpha Projects,@Kappa projects,@Omicron Projects')
  Check 'roots: name to full path' ($roots['@kappa PROJECTS'] -eq $kappa -and $roots['@Omicron Projects'] -eq $omicron)
  $rcfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = (Join-Path $root 'Legacy Projects'); roots = @{ 'Nu Archive' = $nu; 'Gone' = (Join-Path $root 'gone') } }
  New-Item -ItemType Directory -Force -Path $rcfg.projectsRoot | Out-Null
  $roots = Get-ProjectRoots $rcfg -Drives $drives
  Check 'roots: plus the saved ones and the legacy one, when reachable' ((@($roots.Keys) -join ',') -eq '@Alpha Projects,@Kappa projects,@Omicron Projects,Nu Archive,Legacy Projects')
  Check 'roots: one wanted' ((Get-ProjectRoots $rcfg -Drives $drives -Want '@kappa projects')['@Kappa projects'] -eq $kappa)

  # resolving a project's folder: by its root's name, else (stored before roots) the legacy root, else a single match
  $lcfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = $omicron; roots = @{ 'Nu Archive' = $nu } }
  Check 'resolve: by root name' ((Resolve-ProjectDir $lcfg '@Kappa projects' 'K-100 - Kappa One' $drives) -eq (Join-Path $kappa 'K-100 - Kappa One'))
  Check 'resolve: root name without case' ((Resolve-ProjectDir $lcfg '@KAPPA PROJECTS' 'K-100 - Kappa One' $drives) -eq (Join-Path $kappa 'K-100 - Kappa One'))
  Check 'resolve: a saved root' ((Resolve-ProjectDir $lcfg 'Nu Archive' 'N-1 - Nu One' $drives) -eq (Join-Path $nu 'N-1 - Nu One'))
  Check 'resolve: not in that root' ($null -eq (Resolve-ProjectDir $lcfg '@Alpha Projects' 'K-100 - Kappa One' $drives))
  Check 'resolve: a root this PC does not have' ($null -eq (Resolve-ProjectDir $lcfg '@Tau Projects' 'K-100 - Kappa One' $drives))
  Check 'resolve: no root, the legacy root' ((Resolve-ProjectDir $lcfg '' $school $drives) -eq (Join-Path $omicron $school))
  Check 'resolve: no root, the legacy root first' ((Resolve-ProjectDir $lcfg '' 'Same Name' $drives) -eq (Join-Path $omicron 'Same Name'))
  $kcfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = $kappa; roots = @{} }
  Check 'resolve: no root, found in the one root that has it' ((Resolve-ProjectDir $kcfg '' $school $drives) -eq (Join-Path $omicron $school))
  $ncfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = ''; roots = @{} }
  Check 'resolve: no root, in two roots: missing' ($null -eq (Resolve-ProjectDir $ncfg '' 'Same Name' $drives))
  Check 'resolve: a path is no folder name' ($null -eq (Resolve-ProjectDir $lcfg '@Omicron Projects' "$school/CONS" $drives) -and $null -eq (Resolve-ProjectDir $lcfg '@Omicron Projects' '..' $drives))
  Check 'resolve: nothing' ($null -eq (Resolve-ProjectDir $lcfg '@Omicron Projects' '' $drives))

  # ── the tasks ──
  $noFm = Join-Path $root 'no-fm.json'
  $tcfgPath = Join-Path $root 'cfg\task.json'
  $task = [pscustomobject]@{ kind = 'pick'; lang = 'he'; project = [pscustomobject]@{ id = 'p1'; code = 'TASC'; name = 'Tel Aviv School' }; folder = ''; root = '' }

  # pick: no root yet, the picker starts in the legacy root with the best guess; the folder and its root come back
  $seen = @{}
  $tcfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = $omicron; roots = @{} }
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) $seen.start = $Start; $seen.suggested = $Suggested; return (Join-Path $omicron $school) } $noFm $tcfgPath $drives
  Check 'pick: starts in the legacy root' ($seen.start -eq $omicron)
  Check 'pick: suggests the project by name' ($seen.suggested -eq (Join-Path $omicron $school))
  Check 'pick: the folder name and its root' ($res.picked -eq $school -and $res.root -eq '@Omicron Projects' -and -not $res.cancelled)
  Check 'pick: inside a root, nothing saved' (-not (Test-Path -LiteralPath $tcfgPath) -and $tcfg.projectsRoot -eq $omicron)
  # the project's own root and folder: the picker starts there, with the folder suggested
  $task2 = [pscustomobject]@{ kind = 'pick'; lang = 'he'; project = [pscustomobject]@{ id = 'p1'; code = 'ZZZ'; name = 'Nothing' }; folder = 'K-100 - Kappa One'; root = '@kappa projects' }
  [void](Invoke-PickTask $tcfg $task2 { param($Start, $Suggested) $seen.start2 = $Start; $seen.suggested2 = $Suggested; return $null } $noFm $tcfgPath $drives)
  Check 'pick: starts in the project''s root' ($seen.start2 -eq $kappa)
  Check 'pick: the current folder is suggested' ($seen.suggested2 -eq (Join-Path $kappa 'K-100 - Kappa One'))
  # under another root than the legacy one: that root, and the legacy root stays
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return (Join-Path $kappa 'K-100 - Kappa One\sub') } $noFm $tcfgPath $drives
  Check 'pick: under root K while legacy is O' ($res.picked -eq 'K-100 - Kappa One' -and $res.root -eq '@Kappa projects')
  Check 'pick: ...the legacy root stays, nothing saved' ($tcfg.projectsRoot -eq $omicron -and -not (Test-Path -LiteralPath $tcfgPath))
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return (Join-Path $omicron "$school\CONS\S") } $noFm $tcfgPath $drives
  Check 'pick: below a project, the project folder' ($res.picked -eq $school -and $res.root -eq '@Omicron Projects')
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return ((Join-Path $omicron 'ELSEWHERE\2030-01-01 - Far') + '\') } $noFm $tcfgPath $drives
  Check 'pick: two levels down, the first folder (any case)' ($res.picked -eq 'ELSEWHERE' -and $res.root -eq '@Omicron Projects')
  # a root itself is no project: refused as cancelled, nothing changes
  foreach ($r in $omicron, $alpha) {
    $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return $r } $noFm $tcfgPath $drives
    Check "pick: a root itself is refused ($r)" ($res.cancelled -eq $true -and -not $res.picked -and -not (Test-Path -LiteralPath $tcfgPath))
  }
  # outside every root: the parent becomes a saved root by its name; the legacy root and the other roots stay
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return (Join-Path $nu 'N-1 - Nu One') } $noFm $tcfgPath $drives
  Check 'pick: outside, the folder and the parent''s name' ($res.picked -eq 'N-1 - Nu One' -and $res.root -eq 'Nu Archive')
  $saved = Get-HelperConfig $tcfgPath
  Check 'pick: outside, the parent is saved as a root' ($saved.roots['Nu Archive'] -eq $nu -and $tcfg.roots['Nu Archive'] -eq $nu)
  Check 'pick: outside, the legacy root stays' ($tcfg.projectsRoot -eq $omicron -and $saved.projectsRoot -eq $omicron)
  Check 'pick: outside, then resolved by that root' ((Resolve-ProjectDir $tcfg 'Nu Archive' 'N-1 - Nu One' $drives) -eq (Join-Path $nu 'N-1 - Nu One'))
  # once saved, a pick under it is inside that root; the saved root itself is refused
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return (Join-Path $nu 'N-1 - Nu One\docs') } $noFm $tcfgPath $drives
  Check 'pick: under a saved root' ($res.picked -eq 'N-1 - Nu One' -and $res.root -eq 'Nu Archive')
  Check 'pick: a saved root itself is refused' ((Invoke-PickTask $tcfg $task { param($Start, $Suggested) return $nu } $noFm $tcfgPath $drives).cancelled -eq $true)
  # cancelled
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return $null } $noFm $tcfgPath $drives
  Check 'pick: cancelled' ($res.cancelled -eq $true -and -not $res.picked)
  # no legacy root and no project root: the first root found
  $ecfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = '' }
  [void](Invoke-PickTask $ecfg $task { param($Start, $Suggested) $seen.start3 = $Start; return $null } $noFm $tcfgPath $drives)
  Check 'pick: no root known, starts in the first one found' ($seen.start3 -eq $alpha)
  [void](Invoke-PickTask $ecfg $task { param($Start, $Suggested) $seen.start4 = $Start; return $null } $noFm $tcfgPath @())
  Check 'pick: no roots at all, no start' ($seen.start4 -eq '')
  # a drive's root (or a folder right on it) is no project folder
  Check 'pick: a drive root throws' (Throws { Invoke-PickTask $ecfg $task { param($Start, $Suggested) return 'C:\' } $noFm $tcfgPath $drives })
  Check 'pick: a folder on a drive root throws' (Throws { Invoke-PickTask $ecfg $task { param($Start, $Suggested) return 'C:\Windows' } $noFm $tcfgPath $drives })

  # a root found by its name but not among the roots read so far (a share without a drive letter; here: made after the
  # drive was read): saved, so the next task finds it
  $late = Join-Path $drvA '@Late projects'
  New-Item -ItemType Directory -Force -Path (Join-Path $late 'L-1 - Late One') | Out-Null
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return (Join-Path $late 'L-1 - Late One\docs') } $noFm $tcfgPath $drives
  Check 'pick: a root not read before' ($res.picked -eq 'L-1 - Late One' -and $res.root -eq '@Late projects')
  Check 'pick: ...is saved' ((Get-HelperConfig $tcfgPath).roots['@Late projects'] -eq $late)
  Check 'pick: ...and resolves' ((Resolve-ProjectDir $tcfg '@Late projects' 'L-1 - Late One' $drives) -eq (Join-Path $late 'L-1 - Late One'))
  # a name that already stands for another folder on this PC: refused, nothing saved, a line in the log
  $before = (Get-Content -Raw -LiteralPath $tcfgPath)
  $copy = Join-Path $root 'Backup\@Kappa projects'
  New-Item -ItemType Directory -Force -Path (Join-Path $copy 'K-100 - Kappa One') | Out-Null
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return (Join-Path $copy 'K-100 - Kappa One') } $noFm $tcfgPath $drives
  Check 'pick: the name of a found root, elsewhere: refused' ($res.cancelled -eq $true -and -not $res.picked)
  $copy2 = Join-Path $root 'Other\Nu Archive'
  New-Item -ItemType Directory -Force -Path (Join-Path $copy2 'N-1 - Nu One') | Out-Null
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return (Join-Path $copy2 'N-1 - Nu One') } $noFm $tcfgPath $drives
  Check 'pick: the name of a saved root, elsewhere: refused' ($res.cancelled -eq $true -and -not $res.picked)
  Check 'pick: ...nothing saved, nothing overwritten' ((Get-Content -Raw -LiteralPath $tcfgPath) -eq $before -and $tcfg.roots['Nu Archive'] -eq $nu)
  Check 'pick: ...and said in the log' ((Get-Content -Raw -LiteralPath $script:LogPath) -match 'pick refused')
  Check 'pick: ...the project still resolves to its own folder' ((Resolve-ProjectDir $tcfg '@Kappa projects' 'K-100 - Kappa One' $drives) -eq (Join-Path $kappa 'K-100 - Kappa One'))
  # a legacy projectsRoot that an old pick set to a project's own folder inside a root: the root wins
  $pcfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = (Join-Path $kappa 'K-100 - Kappa One'); roots = @{} }
  New-Item -ItemType Directory -Force -Path (Join-Path $kappa 'K-100 - Kappa One\sub') | Out-Null
  $res = Invoke-PickTask $pcfg $task { param($Start, $Suggested) return (Join-Path $kappa 'K-100 - Kappa One\sub') } $noFm $tcfgPath $drives
  Check 'pick: a legacy root inside a root is no root' ($res.picked -eq 'K-100 - Kappa One' -and $res.root -eq '@Kappa projects')
  # a config as a hashtable
  Check 'config: roots of a hashtable' ((Get-ConfigRoots @{ roots = @{ 'A Projects' = 'X:\A Projects' } })['a projects'] -eq 'X:\A Projects')

  # a drive that does not answer: left out after the timeout, never waited for again in this process, and the no-root
  # search does not guess while it is missing
  $keep = $script:ReadRoot
  $script:ReadRoot = [scriptblock]::Create('param([string]$Path, [string]$Name) if ($Path -like ''*slow*'') { Start-Sleep -Seconds 5 }; ' + $keep.ToString())
  Reset-ProjectRoots
  $slowDrives = @($drvA, (Join-Path $root 'slow-drive'))
  $ocfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = ''; roots = @{} }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $roots = Get-ProjectRoots $ocfg -Drives $slowDrives -TimeoutMs 400
  $first = $sw.ElapsedMilliseconds
  Check 'timeout: the drives that answered' ($roots.Contains('@Kappa projects') -and $script:RootsIncomplete -and $first -ge 350 -and $first -lt 3000)
  $sw.Restart()
  [void](Get-ProjectRoots $ocfg -Drives $slowDrives -TimeoutMs 400)
  [void](Get-ProjectRoots $ocfg -Drives $slowDrives -Want '@Nothing projects' -TimeoutMs 400)
  Check 'timeout: never waited for again' ($sw.ElapsedMilliseconds -lt 300)
  Check 'timeout: no root, a single match is not trusted' ($null -eq (Resolve-ProjectDir $ocfg '' 'A-1 - Alpha One' $slowDrives))
  Check 'timeout: by root name still works' ((Resolve-ProjectDir $ocfg '@Alpha Projects' 'A-1 - Alpha One' $slowDrives) -eq (Join-Path $alpha 'A-1 - Alpha One'))
  Check 'no timeout: no root, the single match' ((Resolve-ProjectDir $ocfg '' 'A-1 - Alpha One' @($drvA)) -eq (Join-Path $alpha 'A-1 - Alpha One'))
  $script:ReadRoot = $keep
  Reset-ProjectRoots

  # tree (the folder resolved by Resolve-ProjectDir; $null when it is not on this PC)
  $sdir = Join-Path $omicron $school
  $res = Get-TreeResult $sdir
  Check 'tree task: the folders' ((@($res.tree) -contains 'CONS/S') -and -not $res.missing)
  Check 'tree task: missing' ((Get-TreeResult $null).missing -eq $true -and (Get-TreeResult '').missing -eq $true)

  # open
  Check 'open: the project folder' ((Get-OpenTarget $sdir '') -eq $sdir)
  Check 'open: a folder inside' ((Get-OpenTarget $sdir 'CONS/S') -eq (Join-Path $sdir 'CONS\S'))
  Check 'open: missing project' ($null -eq (Get-OpenTarget $null ''))
  Check 'open: missing folder inside' ($null -eq (Get-OpenTarget $sdir 'CONS/none'))
  Check 'open: outside is refused' (Throws { Get-OpenTarget $sdir '../2026-01-01-01 - Other' })

  # file
  $src = New-TempDir
  Set-Content -Path (Join-Path $src '0') -Value 'K'
  $ftask = [pscustomobject]@{ kind = 'file'; folder = $school; root = '@Omicron Projects'; files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; size = 2 })
    plan = [pscustomobject]@{ files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/S/v01' }); steps = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/S/v01'; from = ''; to = '' }); mode = 'new-version' } }
  $res = Invoke-FileTask $sdir $ftask $src
  Check 'file: filed' ((Test-Path (Join-Path $sdir 'CONS\S\v01\K.pdf')) -and -not $res.error -and -not $res.missing)
  Check 'file: reports the files' (@($res.files).Count -eq 1 -and @($res.files)[0].dest -eq 'CONS/S/v01' -and @($res.files)[0].savedAs -eq 'K.pdf')
  Check 'file: missing folder' ((Invoke-FileTask $null $ftask $src).missing -eq $true)
  $ftask.plan = [pscustomobject]@{ files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/new' }); steps = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/made'; from = ''; to = '' }, [pscustomobject]@{ op = 'mkdir'; path = '../out'; from = ''; to = '' }); mode = 'existing' }
  $res = Invoke-FileTask $sdir $ftask $src
  Check 'file: a bad path is an error' ($res.error -and @($res.files).Count -eq 0 -and -not $res.missing)
  Check 'file: ...and nothing was done' (-not (Test-Path (Join-Path $sdir 'CONS\made')) -and -not (Test-Path (Join-Path $sdir 'CONS\new')))
  Remove-Item -LiteralPath $src -Recurse -Force

  # the files of a file task: from Outlook on this PC, or from the server
  $ntask = [pscustomobject]@{
    files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; size = 1200; source = 'outlook' }, [pscustomobject]@{ n = 1; name = 'mail.eml'; size = 10; source = 'upload' },
              [pscustomobject]@{ n = 2; name = 'skip.pdf'; size = 5; source = 'outlook' }, [pscustomobject]@{ n = 3; name = 'old.pdf'; size = 7 })
    plan = [pscustomobject]@{ files = @([pscustomobject]@{ n = 1; name = 'mail.eml'; dest = '' }, [pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS' },
                                        [pscustomobject]@{ n = 2; name = 'skip.pdf'; dest = $null }, [pscustomobject]@{ n = 3; name = 'old.pdf'; dest = 'CONS' }, [pscustomobject]@{ n = 9; name = 'ghost'; dest = 'CONS' }) }
  }
  $need = Get-NeededFiles $ntask
  Check 'needed: only what the plan files, in order' ((($need | ForEach-Object { $_.n }) -join ',') -eq '0,1,3')
  Check 'needed: where each comes from' ((($need | ForEach-Object { $_.source }) -join ',') -eq 'outlook,upload,upload')
  Check 'needed: name and size' ($need[0].name -eq 'K.pdf' -and $need[0].size -eq 1200)
  Check 'needed: one file' (@(Get-NeededFiles ([pscustomobject]@{ files = @([pscustomobject]@{ n = 0; name = 'a'; size = 1; source = 'outlook' }); plan = [pscustomobject]@{ files = @([pscustomobject]@{ n = 0; dest = 'X' }) } })).Count -eq 1)

  # matching the wanted files to the email's attachments in Outlook
  $avail = @([pscustomobject]@{ Index = 1; FileName = 'image001.png'; Size = 3000 }, [pscustomobject]@{ Index = 2; FileName = 'K-101.PDF'; Size = 120400 },
             [pscustomobject]@{ Index = 3; FileName = 'scan.pdf'; Size = 5000 }, [pscustomobject]@{ Index = 4; FileName = 'scan.pdf'; Size = 9100 },
             [pscustomobject]@{ Index = 5; FileName = 'same.pdf'; Size = 100 }, [pscustomobject]@{ Index = 6; FileName = 'same.pdf'; Size = 100 })
  $m = Get-AttachmentMatch $avail @([pscustomobject]@{ n = 0; name = 'k-101.pdf'; size = 120000 })
  Check 'match: by name, without case' ($m.Count -eq 1 -and $m[0] -eq 2)
  $m = Get-AttachmentMatch $avail @([pscustomobject]@{ n = 4; name = 'scan.pdf'; size = 9000 }, [pscustomobject]@{ n = 5; name = 'scan.pdf'; size = 5050 })
  Check 'match: the same name, by the closest size' ($m[4] -eq 4 -and $m[5] -eq 3)
  $m = Get-AttachmentMatch $avail @([pscustomobject]@{ n = 0; name = 'same.pdf'; size = 100 }, [pscustomobject]@{ n = 1; name = 'same.pdf'; size = 100 }, [pscustomobject]@{ n = 2; name = 'same.pdf'; size = 100 })
  Check 'match: the same name and size, in order, each once' ($m[0] -eq 5 -and $m[1] -eq 6 -and -not $m.ContainsKey(2))
  $m = Get-AttachmentMatch $avail @([pscustomobject]@{ n = 3; name = 'none.pdf'; size = 1 })
  Check 'match: missing' ($m.Count -eq 0)
  Check 'match: nothing in Outlook' ((Get-AttachmentMatch @() @([pscustomobject]@{ n = 0; name = 'a'; size = 1 })).Count -eq 0)

  # finding the email in Outlook
  Check 'filter: message id' ((Get-MessageIdFilter "<a'b@x>") -eq '@SQL="http://schemas.microsoft.com/mapi/proptag/0x1035001F" = ''<a''''b@x>''')
  $at = Get-Date -Year 2026 -Month 10 -Day 22 -Hour 10 -Minute 15 -Second 30
  $rf = Get-ReceivedFilter $at
  Check 'filter: received window' ($rf -eq ("[ReceivedTime] >= '" + $at.AddMinutes(-3).ToString('g') + "' AND [ReceivedTime] <= '" + $at.AddMinutes(3).ToString('g') + "'"))
  $utc = $at.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  Check 'time: ISO to local' ((ConvertTo-LocalTime $utc) -eq $at.AddTicks(-($at.Ticks % 10000)))
  Check 'time: none' ($null -eq (ConvertTo-LocalTime ''))
  $mail = [pscustomobject]@{ subject = 'תכנית קונסטרוקציה'; received = $utc; from = 'dani@eng.co.il' }
  Check 'mail: same' (Test-MailMatch ([pscustomobject]@{ Subject = 'תכנית קונסטרוקציה '; Received = $at.AddSeconds(90); From = 'Dani@Eng.co.il' }) $mail)
  Check 'mail: too far' (-not (Test-MailMatch ([pscustomobject]@{ Subject = 'תכנית קונסטרוקציה'; Received = $at.AddMinutes(3); From = 'dani@eng.co.il' }) $mail))
  Check 'mail: other subject' (-not (Test-MailMatch ([pscustomobject]@{ Subject = 'RE: תכנית קונסטרוקציה'; Received = $at; From = 'dani@eng.co.il' }) $mail))
  Check 'mail: other sender' (-not (Test-MailMatch ([pscustomobject]@{ Subject = 'תכנית קונסטרוקציה'; Received = $at; From = 'x@y' }) $mail))
  $mail.from = ''
  Check 'mail: sender unknown' (Test-MailMatch ([pscustomobject]@{ Subject = 'תכנית קונסטרוקציה'; Received = $at; From = 'x@y' }) $mail)
  $mail.received = ''
  Check 'mail: no time, no match' (-not (Test-MailMatch ([pscustomobject]@{ Subject = 'תכנית קונסטרוקציה'; Received = $at; From = 'x@y' }) $mail))

  # texts
  $script:Lang = 'en'
  Check 'text: English' ((T 'בחר את התיקייה הראשית של הפרויקט {p}' @{ p = 'TASC' }) -eq 'Choose the main folder of project TASC')
  $script:Lang = 'he'
  Check 'text: Hebrew' ((T 'בחר את התיקייה הראשית של הפרויקט {p}' @{ p = 'TASC' }) -eq 'בחר את התיקייה הראשית של הפרויקט TASC')
} finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "$script:pass passed, $script:fail failed"
exit ([int]($script:fail -gt 0))
