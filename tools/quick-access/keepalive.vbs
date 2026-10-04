' Project Hub keep-awake: one quiet request to the site, so Azure's free tier doesn't put it to
' sleep between uses (waking it takes seconds to half a minute). Run by the scheduled task that
' Install-QuickAccess.ps1 registers; wscript runs it with no window at all.
On Error Resume Next
Dim site
site = "https://kkarc-hub.azurewebsites.net"
If WScript.Arguments.Count > 0 Then site = WScript.Arguments(0)
Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
x.setTimeouts 10000, 10000, 90000, 90000
x.open "GET", site & "/health", False
x.send
