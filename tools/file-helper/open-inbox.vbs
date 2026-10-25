' Opens the hub's export inbox window for a projecthub-inbox: link (the helper's notification), with no console window.
' Registered by Install-FileHelper.ps1 as the link's handler (HKCU). Only a link of the form the helper makes
' (projecthub-inbox: and a URL-encoded address: letters, digits and % . _ ~ -) is passed on; Open-Inbox.ps1 then checks
' that the address is the hub's own before a browser opens it.
Dim sh, ps1, link, re
If WScript.Arguments.Count < 1 Then WScript.Quit 1
link = WScript.Arguments(0)
Set re = New RegExp
re.Pattern = "^projecthub-inbox:[A-Za-z0-9%._~-]+/?$"
re.IgnoreCase = True
If Not re.Test(link) Then WScript.Quit 1
Set sh = CreateObject("WScript.Shell")
ps1 = Replace(WScript.ScriptFullName, WScript.ScriptName, "Open-Inbox.ps1")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """ -Link """ & link & """", 0, False
