import { store } from './app-store.js';
import { todoBadge } from './calc.js';
import { detectLang, setLang, t } from './i18n.js';
import { initKeyboard } from './keyboard.js';
import { setNavHandler } from './nav.js';
import { h, icon, refreshSheets, closeAllSheets, toast } from './ui.js';
import { renderShelf } from './views/shelf.js';
import { renderRecord } from './views/record.js';
import { renderList } from './views/list.js';
import { renderTodos } from './views/todos.js';
import { renderSettings } from './views/settings.js';
import { renderExams } from './views/exams.js';
import { renderTimeline } from './views/timeline.js';
import { clearTickers, openDraftDialog, sessionBanner, syncWakeLock, tickSession } from './views/session.js';

// ナビの並びは左から 試験・todo・本棚・データ・タイムライン。記録は本棚の記録ボタン、設定は各画面の右上の歯車から開く
const TABS = [
  { id: 'exams', icon: 'file', render: renderExams },
  { id: 'todo', icon: 'checklist', render: renderTodos },
  { id: 'shelf', icon: 'shelf', render: renderShelf },
  { id: 'list', icon: 'calendar', render: renderList },
  { id: 'timeline', icon: 'list', render: renderTimeline },
  { id: 'record', render: renderRecord },
  { id: 'settings', render: renderSettings },
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
const scroller = document.querySelector('#scroller');

// 設定を閉じたときに戻る画面
let returnTo = 'shelf';

function goTab(id) {
  if (id === current) {
    render();
    return;
  }
  if (id === 'settings') returnTo = current === 'record' ? 'shelf' : current;
  current = id;
  try { sessionStorage.setItem('stacklog:tab', current); } catch { /* 無視 */ }
  closeAllSheets();
  render();
  scroller.scrollTo(0, 0);
}
setNavHandler(goTab, () => goTab(returnTo));

function navBadge(tabId, badge) {
  if (tabId !== 'todo') return null;
  const n = badge.red || badge.normal;
  return n ? h('span', { class: `nav-badge ${badge.red ? 'red' : ''}` }, n) : null;
}

function renderNav() {
  const badge = todoBadge(store.state.todos, Date.now());
  // 記録・設定の画面にいるときは、開いた元の画面を選択中として見せる
  const active = current === 'record' ? 'shelf' : current === 'settings' ? returnTo : current;
  navEl.replaceChildren(...TABS.filter((tab) => tab.icon).map((tab) => h('button', {
    type: 'button',
    class: `tab ${tab.id === active ? 'on' : ''}`,
    'aria-current': tab.id === active ? 'page' : null,
    onClick: () => {
      if (tab.id === current) scroller.scrollTo({ top: 0, behavior: 'smooth' });
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
  const y = scroller.scrollTop;
  clearTickers();
  TABS.find((x) => x.id === current).render(viewEl);
  if (current !== 'record') {
    const banner = sessionBanner();
    if (banner) viewEl.prepend(banner);
  }
  renderNav();
  scroller.scrollTop = y;
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
initKeyboard();

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

// 新しい版の確認。公開中の version.js と、今動いている版を比べる
async function checkUpdate() {
  if (location.protocol === 'file:' || document.querySelector('.update-bar')) return;
  try {
    const res = await fetch(`./version.js?t=${Date.now()}`, { cache: 'no-store' });
    const latest = /APP_VERSION\s*=\s*'([^']+)'/.exec(await res.text())?.[1];
    if (res.ok && latest && latest !== self.APP_VERSION) {
      document.body.append(h('button', { type: 'button', class: 'update-bar', onClick: () => location.reload() },
        icon('download', { size: 18 }), t('update.available')));
    }
  } catch {
    // オフラインなら何もしない
  }
}
checkUpdate();

// 画面に戻ったら、時刻の差から計算し直す（TECH-01）。新しい版も確かめる
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    store.syncSession();
    render();
    checkUpdate();
  } else {
    syncWakeLock();
  }
});

navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
