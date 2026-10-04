// Project Hub quick access in Chrome: a right-click item on any page and the toolbar button open the compact quick window (?quick=new|update) as a small popup.
// The selected text (or the page title) becomes the task's title and the page/link its note.
// On an open mail (Outlook on the web, Gmail) the page goes in as a linked mail instead, for both
// a new task and an update.
const BASE = 'https://kkarc-hub.azurewebsites.net/project_hub_01';
const MAIL_HOST = /(^|\.)(outlook\.(office|office365|live)\.com|outlook\.cloud\.microsoft|mail\.google\.com)$/;
const isMail = u => { try { return MAIL_HOST.test(new URL(u).hostname); } catch { return false; } };

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ph-new', title: 'משימה חדשה ב-Project Hub', contexts: ['page', 'selection', 'link', 'image'] });
    chrome.contextMenus.create({ id: 'ph-update', title: 'עדכון למשימה ב-Project Hub', contexts: ['page', 'selection'] });
  });
});

function openQuick(kind, { title = '', link = '' } = {}) {
  const q = new URLSearchParams({ quick: kind });
  const t = title.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (t) q.set('title', t);
  if (link && !link.startsWith(BASE)) q.set(isMail(link) ? 'mail' : 'link', link);
  chrome.windows.create({ url: `${BASE}?${q}`, type: 'popup', width: 470, height: 560 });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const kind = info.menuItemId === 'ph-update' ? 'update' : 'new';
  // update: the selection searches for the task; new: it is the task's name
  const title = info.selectionText || (kind === 'new' && !info.linkUrl ? (tab && tab.title) || '' : '');
  const page = (tab && tab.url) || '';
  const link = kind === 'new' ? info.linkUrl || info.srcUrl || page : isMail(page) ? page : '';
  openQuick(kind, { title, link });
});

chrome.action.onClicked.addListener(() => openQuick('new'));
