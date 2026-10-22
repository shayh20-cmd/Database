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

  # where the projects folder is, from Folder Manager's list
  $fm = Join-Path $root 'projects.json'
  $p1 = Join-Path $root 'CONS'
  [IO.File]::WriteAllText($fm, (@{ projects = @(@{ alpha = 'TASC'; path = (Join-Path $p1 'S') }, @{ alpha = 'RLSC'; path = ((Join-Path $p1 'docs') -replace '\\', '/') }) } | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
  Check 'root: most projects sit there' ((Find-ProjectsRoot $fm) -eq $p1)
  Check 'root: no list' ($null -eq (Find-ProjectsRoot (Join-Path $root 'none.json')))
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
  Check 'config: default hub' ($c.hub -eq 'https://kkarc-hub.azurewebsites.net' -and $c.projectsRoot -eq '')
  $c.projectsRoot = 'P:\@Omicron Projects'; Save-HelperConfig $c $cfgPath
  Check 'config: saved' ((Get-HelperConfig $cfgPath).projectsRoot -eq 'P:\@Omicron Projects')

  # ── the tasks ──
  # a projects folder with two projects, and another one elsewhere
  $projects = Join-Path $root 'Projects'
  foreach ($d in '2026-05-20-26 - Tel Aviv School\CONS\S', '2026-01-01-01 - Other', 'Elsewhere\2030-01-01 - Far') { New-Item -ItemType Directory -Force -Path (Join-Path $projects $d) | Out-Null }
  $school = '2026-05-20-26 - Tel Aviv School'
  $noFm = Join-Path $root 'no-fm.json'
  $tcfgPath = Join-Path $root 'cfg\task.json'
  $task = [pscustomobject]@{ kind = 'pick'; lang = 'he'; project = [pscustomobject]@{ id = 'p1'; code = 'TASC'; name = 'Tel Aviv School' }; folder = '' }

  # pick: the picker starts in the projects folder with the best guess, and the leaf comes back
  $seen = @{}
  $tcfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = $projects }
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) $seen.start = $Start; $seen.suggested = $Suggested; return (Join-Path $projects $school) } $noFm $tcfgPath
  Check 'pick: starts in the projects folder' ($seen.start -eq $projects)
  Check 'pick: suggests the project by name' ($seen.suggested -eq (Join-Path $projects $school))
  Check 'pick: the folder name' ($res.picked -eq $school -and -not $res.cancelled)
  Check 'pick: inside the projects folder, nothing saved' (-not (Test-Path -LiteralPath $tcfgPath) -and $tcfg.projectsRoot -eq $projects)
  # the folder the project already has is the suggestion
  $task2 = [pscustomobject]@{ kind = 'pick'; lang = 'he'; project = [pscustomobject]@{ id = 'p1'; code = 'ZZZ'; name = 'Nothing' }; folder = '2026-01-01-01 - Other' }
  [void](Invoke-PickTask $tcfg $task2 { param($Start, $Suggested) $seen.suggested2 = $Suggested; return $null } $noFm $tcfgPath)
  Check 'pick: the current folder is suggested' ($seen.suggested2 -eq (Join-Path $projects '2026-01-01-01 - Other'))
  # a folder inside a project: the project's folder is the first folder under the projects folder, which stays
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return (Join-Path $projects "$school\CONS\S") } $noFm $tcfgPath
  Check 'pick: below a project, the project folder' ($res.picked -eq $school -and -not $res.cancelled)
  Check 'pick: below a project, projectsRoot stays' ($tcfg.projectsRoot -eq $projects -and -not (Test-Path -LiteralPath $tcfgPath))
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return ((Join-Path $projects 'ELSEWHERE\2030-01-01 - Far') + '\') } $noFm $tcfgPath
  Check 'pick: two levels down, the first folder (any case)' ($res.picked -eq 'ELSEWHERE' -and $tcfg.projectsRoot -eq $projects)
  # the projects folder itself is no project: refused as cancelled, nothing changes
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return $projects } $noFm $tcfgPath
  Check 'pick: the projects folder itself is refused' ($res.cancelled -eq $true -and -not $res.picked -and $tcfg.projectsRoot -eq $projects -and -not (Test-Path -LiteralPath $tcfgPath))
  # picked outside the projects folder: the projects folder of this PC moves to the pick's parent, and is saved
  $other = Join-Path $root 'Other Projects'
  New-Item -ItemType Directory -Force -Path (Join-Path $other '2030-01-01 - Far') | Out-Null
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return (Join-Path $other '2030-01-01 - Far') } $noFm $tcfgPath
  Check 'pick: outside, the folder name' ($res.picked -eq '2030-01-01 - Far')
  Check 'pick: outside, projectsRoot moves' ($tcfg.projectsRoot -eq $other -and (Get-HelperConfig $tcfgPath).projectsRoot -eq $other)
  # cancelled
  $tcfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = $projects }
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) return $null } $noFm $tcfgPath
  Check 'pick: cancelled' ($res.cancelled -eq $true -and -not $res.picked)
  # no projects folder known yet: no start, and the first pick sets it
  Remove-Item -LiteralPath $tcfgPath -ErrorAction SilentlyContinue
  $tcfg = [pscustomobject]@{ hub = 'https://x'; projectsRoot = '' }
  $res = Invoke-PickTask $tcfg $task { param($Start, $Suggested) $seen.start3 = $Start; $seen.suggested3 = $Suggested; return (Join-Path $projects $school) } $noFm $tcfgPath
  Check 'pick: no projects folder yet, no start' (-not $seen.start3 -and -not $seen.suggested3)
  Check 'pick: no projects folder yet, the first pick sets it' ($res.picked -eq $school -and (Get-HelperConfig $tcfgPath).projectsRoot -eq $projects)
  # a drive's root is no project folder
  Check 'pick: a drive root throws' (Throws { Invoke-PickTask $tcfg $task { param($Start, $Suggested) return 'C:\' } $noFm $tcfgPath })

  # tree
  $res = Get-TreeResult $projects $school
  Check 'tree task: the folders' ((@($res.tree) -contains 'CONS/S') -and -not $res.missing)
  Check 'tree task: missing folder' ((Get-TreeResult $projects 'No Such').missing -eq $true)
  Check 'tree task: no projects folder' ((Get-TreeResult '' $school).missing -eq $true)
  Check 'tree task: no project folder' ((Get-TreeResult $projects '').missing -eq $true)
  Check 'tree task: a path is no folder name' ((Get-TreeResult $projects '..').missing -eq $true -and (Get-TreeResult $projects "$school/CONS").missing -eq $true)

  # open
  Check 'open: the project folder' ((Get-OpenTarget $projects $school '') -eq (Join-Path $projects $school))
  Check 'open: a folder inside' ((Get-OpenTarget $projects $school 'CONS/S') -eq (Join-Path $projects "$school\CONS\S"))
  Check 'open: missing project' ($null -eq (Get-OpenTarget $projects 'No Such' ''))
  Check 'open: missing folder inside' ($null -eq (Get-OpenTarget $projects $school 'CONS/none'))
  Check 'open: outside is refused' (Throws { Get-OpenTarget $projects $school '../2026-01-01-01 - Other' })

  # file
  $src = New-TempDir
  Set-Content -Path (Join-Path $src '0') -Value 'K'
  $ftask = [pscustomobject]@{ kind = 'file'; folder = $school; files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; size = 2 })
    plan = [pscustomobject]@{ files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/S/v01' }); steps = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/S/v01'; from = ''; to = '' }); mode = 'new-version' } }
  $res = Invoke-FileTask $projects $ftask $src
  Check 'file: filed' ((Test-Path (Join-Path $projects "$school\CONS\S\v01\K.pdf")) -and -not $res.error -and -not $res.missing)
  Check 'file: reports the files' (@($res.files).Count -eq 1 -and @($res.files)[0].dest -eq 'CONS/S/v01' -and @($res.files)[0].savedAs -eq 'K.pdf')
  $ftask.folder = 'No Such'
  Check 'file: missing folder' ((Invoke-FileTask $projects $ftask $src).missing -eq $true)
  $ftask.folder = $school
  $ftask.plan = [pscustomobject]@{ files = @([pscustomobject]@{ n = 0; name = 'K.pdf'; dest = 'CONS/new' }); steps = @([pscustomobject]@{ op = 'mkdir'; path = 'CONS/made'; from = ''; to = '' }, [pscustomobject]@{ op = 'mkdir'; path = '../out'; from = ''; to = '' }); mode = 'existing' }
  $res = Invoke-FileTask $projects $ftask $src
  Check 'file: a bad path is an error' ($res.error -and @($res.files).Count -eq 0 -and -not $res.missing)
  Check 'file: ...and nothing was done' (-not (Test-Path (Join-Path $projects "$school\CONS\made")) -and -not (Test-Path (Join-Path $projects "$school\CONS\new")))
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
