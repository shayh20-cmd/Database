/* ─────────────────────────────────────────────────────────────
   i18n.js — runtime Hebrew ⇄ English translation + RTL/LTR flip
   Shared by: home_dashboard.html, planning_dashboard.html,
              project_hub.html

   REQUIRES i18n-dict.js to be loaded FIRST (provides window.I18N_HE_EN).

   Adds a floating language-toggle button (top corner) and
   translates all rendered text via a MutationObserver, so the
   precompiled React apps need no source changes.
   Pages may tune the button position with:
     :root { --lang-toggle-top: <px>; --lang-toggle-end: <px>; }
   ───────────────────────────────────────────────────────────── */
(function () {
'use strict';

var LS_KEY = 'appLang';
var HE_RX = /[֐-׿]/;
var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];

/* Containers that render user-entered data (task titles, project names, notes).
   Their contents are NEVER translated: a project someone named in Hebrew is a
   proper noun and should stay Hebrew even in English mode.
   When adding a component that renders stored data, add its class here — or put
   data-i18n-skip on the element. */
var USER_DATA_SEL = '.name-text,.cmt,.proj-name,.sb-proj-btn';

/* ── Dictionary (loaded from i18n-dict.js) ── */
var HE_EN = window.I18N_HE_EN;
if (!HE_EN) {
  console.error('[i18n] i18n-dict.js must be loaded before i18n.js — translation disabled.');
  return;
}

/* ── Engine ── */
var lang = 'he';
try { lang = localStorage.getItem(LS_KEY) === 'en' ? 'en' : 'he'; } catch (e) {}

/* A page may pin its language by setting window.I18N_FORCE_LANG before this
   script loads. Used by project_hub.en.html, which is an English-only copy.
   Deliberately does NOT write localStorage: these pages share an origin, so
   persisting the choice here would silently flip the Hebrew originals too.
   A pinned page gets no toggle button — there is nothing to toggle to. */
var pinned = false;
if (window.I18N_FORCE_LANG === 'en' || window.I18N_FORCE_LANG === 'he') {
  lang = window.I18N_FORCE_LANG;
  pinned = true;
}

var RX = null;
function buildRegex() {
  var keys = Object.keys(HE_EN).sort(function (a, b) { return b.length - a.length; });
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  RX = new RegExp('(?<![\\u0590-\\u05FF])(?:' + keys.map(esc).join('|') + ')(?![\\u0590-\\u05FF])', 'g');
}
function tr(s) {
  return s.replace(RX, function (m) { return HE_EN.hasOwnProperty(m) ? HE_EN[m] : m; });
}

/* A page holding only demo data may ask for that data to be translated too, by
   setting window.I18N_TRANSLATE_USER_DATA before this script loads. Used by
   project_hub.en.html, whose task titles and project names are seed content
   rather than anything a person typed. Never set this on a page with real data:
   a project somebody named in Hebrew is a proper noun. */
var SKIP_SEL = '#lang-toggle,[data-i18n-skip],[contenteditable="true"],script,style' +
  (window.I18N_TRANSLATE_USER_DATA ? '' : ',' + USER_DATA_SEL);

function skip(node) {
  var el = node.nodeType === 3 ? node.parentElement : node;
  if (!el) return false;
  if (el.closest && el.closest(SKIP_SEL)) return true;
  var tag = el.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT';
}

function passText(n) {
  if (skip(n)) return;
  if (lang === 'en') {
    var v = n.nodeValue;
    if (v === n.__i18nOut) return;
    if (!HE_RX.test(v)) { n.__i18nHe = n.__i18nOut = undefined; return; }
    var out = tr(v);
    n.__i18nHe = v; n.__i18nOut = out;
    if (out !== v) n.nodeValue = out;
  } else if (n.__i18nHe !== undefined) {
    if (n.nodeValue === n.__i18nOut) n.nodeValue = n.__i18nHe;
    n.__i18nHe = n.__i18nOut = undefined;
  }
}

function passEl(el) {
  if (!el.getAttribute || skip(el)) return;
  for (var i = 0; i < ATTRS.length; i++) {
    var a = ATTRS[i];
    var v = el.getAttribute(a);
    if (v == null) continue;
    if (lang === 'en') {
      var st = el.__i18nA || (el.__i18nA = {});
      if (st[a] && v === st[a].out) continue;
      if (!HE_RX.test(v)) { delete st[a]; continue; }
      var out = tr(v);
      st[a] = { he: v, out: out };
      if (out !== v) el.setAttribute(a, out);
    } else {
      var st2 = el.__i18nA;
      if (st2 && st2[a]) {
        if (v === st2[a].out) el.setAttribute(a, st2[a].he);
        delete st2[a];
      }
    }
  }
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { passText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 11 && root.nodeType !== 9) return;
  if (root.nodeType === 1) passEl(root);
  var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
  var n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) passText(n); else passEl(n);
  }
}

/* document.title — has no DOM node, so skip() cannot reach it. A page whose
   title is user data (e.g. project_hub.html, whose title IS the project name)
   opts out with data-i18n-skip-title on <html>. Pages whose title is UI chrome
   leave the attribute off and translate normally. */
var titleHe = null;
function applyTitle() {
  if (document.documentElement.hasAttribute('data-i18n-skip-title')) return;
  if (lang === 'en') {
    if (titleHe == null) titleHe = document.title;
    if (HE_RX.test(titleHe)) document.title = tr(titleHe);
  } else if (titleHe != null) {
    document.title = titleHe;
  }
}

/* ── Toggle button ── */
var btn = null;
function makeButton() {
  var css = document.createElement('style');
  css.textContent =
    '#lang-toggle{position:fixed;top:var(--lang-toggle-top,12px);inset-inline-end:var(--lang-toggle-end,16px);' +
    'z-index:99999;display:inline-flex;align-items:center;gap:6px;padding:5px 13px;font-size:12px;font-weight:700;' +
    'font-family:Heebo,system-ui,sans-serif;color:#1E1F21;background:#fff;border:1px solid #D0D2D6;border-radius:20px;' +
    'cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.10);transition:all .15s ease;line-height:1.4;}' +
    '#lang-toggle:hover{background:#F4F5F7;border-color:#9EA2A9;box-shadow:0 2px 8px rgba(0,0,0,.14);}' +
    '#lang-toggle .lt-globe{font-size:13px;line-height:1;}';
  document.head.appendChild(css);
  btn = document.createElement('button');
  btn.id = 'lang-toggle';
  btn.type = 'button';
  btn.setAttribute('data-i18n-skip', '');
  btn.addEventListener('click', function () { setLang(lang === 'en' ? 'he' : 'en'); });
  document.body.appendChild(btn);
  paintButton();
}
function paintButton() {
  if (!btn) return;
  btn.innerHTML = '<span class="lt-globe">🌐</span><span>' + (lang === 'en' ? 'עברית' : 'English') + '</span>';
  btn.title = lang === 'en' ? 'החלף לעברית' : 'Switch to English';
}

function applyDir() {
  var html = document.documentElement;
  if (lang === 'en') { html.dir = 'ltr'; html.lang = 'en'; }
  else { html.dir = 'rtl'; html.lang = 'he'; }
}

function setLang(l) {
  lang = l === 'en' ? 'en' : 'he';
  try { localStorage.setItem(LS_KEY, lang); } catch (e) {}
  applyDir();
  applyTitle();
  paintButton();
  walk(document.body);
}

/* ── Observer ── */
function startObserver() {
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') passText(m.target);
      else if (m.type === 'attributes') passEl(m.target);
      else if (m.type === 'childList') {
        for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
    }
  });
  mo.observe(document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ATTRS
  });
}

/* ── Boot ── */
function boot() {
  buildRegex();
  applyDir();
  if (!pinned) makeButton();
  applyTitle();
  walk(document.body);
  startObserver();
  /* React 18 createRoot renders async — re-run once shortly after load */
  setTimeout(function () { applyTitle(); walk(document.body); }, 60);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
})();
