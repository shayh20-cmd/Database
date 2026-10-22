' Starts the filing helper's background agent (FileHelper-Agent.ps1) with no console window.
' Run by the Startup shortcut at every Windows sign-in, and by Install-FileHelper.ps1 right after installing.
Dim sh, ps1
Set sh = CreateObject("WScript.Shell")
ps1 = Replace(WScript.ScriptFullName, WScript.ScriptName, "FileHelper-Agent.ps1")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
