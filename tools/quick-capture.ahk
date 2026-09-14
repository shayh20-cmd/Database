#Requires AutoHotkey v2.0
; Project Hub — quick capture.
; Ctrl+Shift+Space opens the capture window, or closes it if it is already open.

CAPTURE_URL := "http://localhost:3403/capture.html"
WIN_TITLE   := "לכידה מהירה"        ; must match <title> in capture.html
BROWSER     := "msedge.exe"          ; ships with Windows 11; chrome.exe works the same

^+Space:: {
    if WinExist(WIN_TITLE) {
        WinClose(WIN_TITLE)
        return
    }
    ; --app= gives a chromeless window instead of a browser tab
    Run BROWSER ' --app=' CAPTURE_URL ' --window-size=235,310'
    if WinWait(WIN_TITLE, , 4)
        WinActivate(WIN_TITLE)
    else
        TrayTip "לכידה מהירה", "החלון לא נפתח — האם השרת פועל על פורט 3403?", 3
}
