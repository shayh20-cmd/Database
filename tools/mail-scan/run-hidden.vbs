' Runs Scan-Mail.ps1 with no console window (the scheduled task would flash one). Argument: the hub's address.
' Waits for the scan (last argument True), so the task's IgnoreNew and 15-minute limit apply to it.
Dim sh, ps1, hub
Set sh = CreateObject("WScript.Shell")
ps1 = Replace(WScript.ScriptFullName, WScript.ScriptName, "Scan-Mail.ps1")
hub = "https://kkarc-hub.azurewebsites.net"
If WScript.Arguments.Count > 0 Then hub = WScript.Arguments(0)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """ -Hub """ & hub & """", 0, True
