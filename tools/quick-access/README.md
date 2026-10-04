# Project Hub — quick access

A compact window for adding a task or an update without opening the whole app:
`https://kkarc-hub.azurewebsites.net/project_hub_01?quick=new` (or `?quick=update`).
Optional prefills: `title=`, `link=`, `folder=`.

## 1. Keyboard (anywhere in Windows) and right-click on the desktop / in folders

Run once, per user (no admin rights). The shortcuts take their icons from this folder, so run it
from where the repo will stay (moving the folder later means running it again):

```powershell
powershell -ExecutionPolicy Bypass -File tools\quick-access\Install-QuickAccess.ps1
```

- **Ctrl+Alt+Q** (one hand): opens a new task; the **עדכון למשימה** tab at the top switches to
  adding an update. A different key: `-Hotkey "CTRL+ALT+A"` (or a function key, `-Hotkey F9`).
- Right-click the desktop or the empty area inside a folder → **משימה חדשה ב-Project Hub**
  (inside a folder the folder's path goes into the task's note). On Windows 11 it's under
  *Show more options*.
- A hidden scheduled task, **Project Hub keep-awake**, pings the site every 10 minutes,
  Sunday–Thursday 07:00–19:00, so Azure's free tier doesn't put it to sleep (a sleeping site
  takes seconds to half a minute to open). It runs only while this computer is on.
- Remove with `Uninstall-QuickAccess.ps1` (it removes the scheduled task too).

## 2. Taskbar

After the install above: Start → search **Project Hub** → right-click **Project Hub - משימה חדשה** →
*Pin to taskbar*. (The search also finds **Project Hub**, the whole app, and
**Project Hub - עדכון למשימה**.)
The button carries the Project Hub icon with a green **+** and opens the quick window (its tab
switches to an update). Windows doesn't let a script pin to the taskbar, so this step is by hand.

Optionally, for the whole app: open Project Hub in Chrome → menu ⋮ → *Cast, save and share* →
*Install page as app* → pin it; right-clicking that icon shows **משימה חדשה · עדכון למשימה · המשימות שלי**.

## 3. Right-click inside Chrome

`chrome://extensions` → turn on *Developer mode* → *Load unpacked* → pick
`tools\quick-access\chrome-extension`. Then right-click any page, selection or link →
**משימה חדשה ב-Project Hub** (the selection becomes the title, the page/link the note) or
**עדכון למשימה ב-Project Hub**. The toolbar button opens a new task too
(Ctrl+Alt+Q works inside Chrome as well).

All three open the Azure site with the browser's own sign-in.
