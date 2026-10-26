' Starts the filing helper's background agent (FileHelper-Agent.ps1) with no console window.
' Run by the scheduled task "Project Hub filing helper" (every 5 minutes and at sign-in), by the Startup shortcut at
' every Windows sign-in, and by Install-FileHelper.ps1 right after installing. It only launches the agent (Run, hidden,
' no wait) and returns at once, so the task ends immediately; the agent's mutex makes an extra start exit by itself.
Dim sh, ps1
Set sh = CreateObject("WScript.Shell")
ps1 = Replace(WScript.ScriptFullName, WScript.ScriptName, "FileHelper-Agent.ps1")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
