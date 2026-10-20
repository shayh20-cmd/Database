' Runs Scan-Mail.ps1 with no console window (the scheduled task would flash one). Arguments: the hub's address,
' and optionally "now" for a manual scan (adds -Now: no scan-hours check, and a word when nothing is new).
' Waits for the scan (last argument True), so the task's IgnoreNew and 15-minute limit apply to it.
Dim sh, ps1, hub, extra
Set sh = CreateObject("WScript.Shell")
ps1 = Replace(WScript.ScriptFullName, WScript.ScriptName, "Scan-Mail.ps1")
hub = "https://kkarc-hub.azurewebsites.net"
If WScript.Arguments.Count > 0 Then hub = WScript.Arguments(0)
extra = ""
If WScript.Arguments.Count > 1 Then
  If LCase(WScript.Arguments(1)) = "now" Then extra = " -Now"
End If
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """ -Hub """ & hub & """" & extra, 0, True
