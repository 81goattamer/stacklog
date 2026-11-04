import { store } from './app-store.js';
import { todoBadge } from './calc.js';
import { detectLang, setLang, t } from './i18n.js';
import { setNavHandler } from './nav.js';
import { h, icon, refreshSheets, closeAllSheets, toast } from './ui.js';
import { renderShelf } from './views/shelf.js';
import { renderRecord } from './views/record.js';
import { renderList } from './views/list.js';
import { renderTodos } from './views/todos.js';
import { renderSettings } from './views/settings.js';
import { clearTickers, openDraftDialog, sessionBanner, syncWakeLock, tickSession } from './views/session.js';

const TABS = [
  { id: 'shelf', icon: 'shelf', render: renderShelf },
  { id: 'record', icon: 'timer', render: renderRecord },
  { id: 'list', icon: 'calendar', render: renderList },
  { id: 'todo', icon: 'checklist', render: renderTodos },
  { id: 'settings', icon: 'gear', render: renderSettings },
];

let current = 'shelf';
try {
  const saved = sessionStorage.getItem('stacklog:tab');
  if (TABS.some((x) => x.id === saved)) current = saved;
} catch {
  // 保存できない環境では初期タブのまま
}

const viewEl = document.querySelector('#view');
const navEl = document.querySelector('#nav');

function goTab(id) {
  if (id === current) {
    render();
    return;
  }
  current = id;
  try { sessionStorage.setItem('stacklog:tab', current); } catch { /* 無視 */ }
  closeAllSheets();
  render();
  window.scrollTo(0, 0);
}
setNavHandler(goTab);

function navBadge(tabId, badge) {
  if (tabId !== 'todo') return null;
  const n = badge.red || badge.normal;
  return n ? h('span', { class: `nav-badge ${badge.red ? 'red' : ''}` }, n) : null;
}

function renderNav() {
  const badge = todoBadge(store.state.todos, Date.now());
  navEl.replaceChildren(...TABS.map((tab) => h('button', {
    type: 'button',
    class: `tab ${tab.id === current ? 'on' : ''}`,
    'aria-current': tab.id === current ? 'page' : null,
    onClick: () => {
      if (tab.id === current) window.scrollTo({ top: 0, behavior: 'smooth' });
      else goTab(tab.id);
    },
  }, h('span', { class: 'tab-icon' }, icon(tab.icon, { size: 24 }), navBadge(tab.id, badge)), h('span', {}, t(`tab.${tab.id}`)))));
  // ホーム画面のアイコンのバッジ（TODO-12）
  if (badge.app) navigator.setAppBadge?.(badge.app).catch(() => {});
  else navigator.clearAppBadge?.().catch(() => {});
}

// 設定のテーマを反映する。自動のときは OS の設定に任せる
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m) => {
    const dark = theme === 'dark' || (theme === 'auto' && m.media.includes('dark'));
    m.content = dark ? '#000000' : '#f2f2f7';
  });
}

function render() {
  const st = store.state.settings;
  setLang(st.language === 'auto' ? detectLang() : st.language);
  applyTheme(st.theme);
  const y = window.scrollY;
  clearTickers();
  TABS.find((x) => x.id === current).render(viewEl);
  if (current !== 'record') {
    const banner = sessionBanner();
    if (banner) viewEl.prepend(banner);
  }
  renderNav();
  window.scrollTo(0, y);
  syncWakeLock();
}

// 変更は1回の操作が終わってからまとめて反映する
let pending = false;
store.subscribe(() => {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    render();
    refreshSheets();
  });
});

store.repo.onError = () => toast(t('storage.error'));

// 起動時の復元（TECH-02）。記録中なら記録タブへ、終了画面のままなら下書きとして確認する
const session = store.state.activeSession;
const hadDraft = session?.status === 'ended';
if (session && !hadDraft) current = 'record';
store.syncSession();
render();
if (hadDraft) openDraftDialog();

setInterval(() => {
  if (document.visibilityState === 'visible') tickSession();
}, 1000);

// 締め切りが近づくとバッジが変わるので、1分ごとに数え直す
setInterval(() => {
  if (document.visibilityState === 'visible') renderNav();
}, 60_000);

// 画面に戻ったら、時刻の差から計算し直す（TECH-01）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    store.syncSession();
    render();
  } else {
    syncWakeLock();
  }
});

navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
