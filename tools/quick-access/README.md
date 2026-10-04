# Project Hub — quick access

A compact window for adding a task or an update without opening the whole app:
`https://kkarc-hub.azurewebsites.net/project_hub_01?quick=new` (or `?quick=update`).
Optional prefills: `title=`, `link=`, `folder=`.

## 1. Keyboard (anywhere in Windows) and right-click on the desktop / in folders

Run once, per user (no admin rights):

```powershell
powershell -ExecutionPolicy Bypass -File tools\quick-access\Install-QuickAccess.ps1
```

- **Ctrl+Alt+Q** (one hand): opens a new task; the **עדכון למשימה** tab at the top switches to
  adding an update. A different key: `-Hotkey "CTRL+ALT+A"` (or a function key, `-Hotkey F9`).
- Right-click the desktop or the empty area inside a folder → **משימה חדשה ב-Project Hub**
  (inside a folder the folder's path goes into the task's note). On Windows 11 it's under
  *Show more options*.
- Remove with `Uninstall-QuickAccess.ps1`.

## 2. Taskbar

Open Project Hub in Chrome → menu ⋮ → *Cast, save and share* → *Install page as app*
(or the install icon in the address bar) → right-click its taskbar icon → *Pin to taskbar*.
Right-clicking the pinned icon shows **משימה חדשה · עדכון למשימה · המשימות שלי**.

## 3. Right-click inside Chrome

`chrome://extensions` → turn on *Developer mode* → *Load unpacked* → pick
`tools\quick-access\chrome-extension`. Then right-click any page, selection or link →
**משימה חדשה ב-Project Hub** (the selection becomes the title, the page/link the note) or
**עדכון למשימה ב-Project Hub**. The toolbar button opens a new task too
(Ctrl+Alt+Q works inside Chrome as well).

All three open the Azure site with the browser's own sign-in.
