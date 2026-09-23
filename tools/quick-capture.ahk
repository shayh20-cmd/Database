#Requires AutoHotkey v2.0
#SingleInstance Force
; Project Hub — quick capture.
; Alt+Q opens the capture window, or closes it if it is already open.

CAPTURE_URL := "http://localhost:3403/capture.html"
WIN_TITLE   := "לכידה מהירה"        ; must match <title> in capture.html
BROWSER     := "msedge.exe"          ; ships with Windows 11; chrome.exe works the same
WIN_W       := 470                   ; window size — set after opening, because Edge
WIN_H       := 600                  ; ignores --window-size once it remembers a size

; SC010 is the physical Q key — matched by position so it also fires on the
; Hebrew layout, where the same key types /.
!SC010::ToggleCapture()

ToggleCapture() {
    if WinExist(WIN_TITLE) {
        WinClose(WIN_TITLE)
        return
    }
    ; --app= gives a chromeless window instead of a browser tab
    Run BROWSER ' --app=' CAPTURE_URL
    if WinWait(WIN_TITLE, , 4) {
        ; Edge restores its remembered bounds a moment after the window appears,
        ; overriding an early move — so keep applying the size until it sticks.
        Loop 20 {
            WinMove(, , WIN_W, WIN_H, WIN_TITLE)
            Sleep 100
            WinGetPos(, , &w, &h, WIN_TITLE)
            if (A_Index > 3 && w = WIN_W && h = WIN_H)
                break
        }
        WinActivate(WIN_TITLE)
    } else
        TrayTip "לכידה מהירה", "החלון לא נפתח — האם השרת פועל על פורט 3403?", 3
}
