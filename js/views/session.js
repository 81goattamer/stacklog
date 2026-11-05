// 記録中の画面（SCR-24, SCR-25）と終了画面（SCR-27）
import { store, subjectName } from '../app-store.js';
import { computeSession, formatClock, sortByDue } from '../calc.js';
import { candidateTodos, visibleSubjects } from '../store.js';
import { t } from '../i18n.js';
import { h, icon, iconButton, actionMenu, confirmDialog, formatDuration, toast } from '../ui.js';
import { datetimeField, durationField, field, selectField, toggled } from '../fields.js';
import { goTab } from '../nav.js';
import { dueLabel, todoRow } from '../todo-form.js';
import { resetRecordView } from './record.js';

// 1秒ごとに数字だけ書き換える処理。再描画のたびに登録し直す
const tickers = new Set();

export function clearTickers() {
  tickers.clear();
}

// 時計の更新。区切りを越えて終わったら store から再描画される
export function tickSession() {
  if (!store.state.activeSession) return;
  if (store.syncSession()) return;
  for (const fn of tickers) fn();
}

// ---- 画面を点けたままにする（ポモドーロの実行中だけ） ----

let wakeLock = null;
let wakeRequesting = false;
export async function syncWakeLock() {
  const a = store.state.activeSession;
  const want = a?.mode === 'pomodoro' && a.status !== 'ended' && document.visibilityState === 'visible';
  if (!want) {
    const cur = wakeLock;
    wakeLock = null;
    await cur?.release?.().catch(() => {});
    return;
  }
  if (wakeLock || wakeRequesting || !navigator.wakeLock) return;
  wakeRequesting = true;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    // 省電力モードなどで断られたら、そのまま続ける
  } finally {
    wakeRequesting = false;
  }
}

// ---- 共通 ----

async function confirmDiscard() {
  const ok = await confirmDialog({ message: t('run.discardConfirm'), okLabel: t('common.yes'), cancelLabel: t('common.no'), danger: true });
  if (!ok) return;
  resetRecordView();
  store.discardSession();
  goTab('shelf');
  toast(t('record.discarded'));
}

// 画面に出す todo: 選んだもの → 科目の未完了のもの → 記録中に完了にしたもの（REC-40）
function sessionTodos(a) {
  const subjectId = a.result ? a.result.subjectId : a.subjectId;
  const ids = new Set([
    ...a.selectedTodoIds,
    ...a.completedTodoIds,
    ...(a.result?.todoIds ?? []),
    ...candidateTodos(store.state, subjectId).map((x) => x.id),
  ]);
  return sortByDue([...ids].map((id) => store.get('todos', id)).filter(Boolean));
}

function subjectLine(id) {
  return h('p', { class: 'run-subject' }, id ? subjectName(id) : t('subject.none'));
}

function closeBtn() {
  return iconButton('close', t('common.delete'), confirmDiscard, 'close-run');
}

// ---- 実行中 ----

export function renderSession(root) {
  const a = store.state.activeSession;
  if (a.status === 'ended') root.replaceChildren(...endScreen(a));
  else root.replaceChildren(...(a.mode === 'pomodoro' ? pomodoroScreen(a) : stopwatchScreen(a)));
}

function pomodoroScreen(a) {
  const R = 118;
  const LEN = 2 * Math.PI * R;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 260 260');
  svg.classList.add('ring');
  const track = document.createElementNS(ns, 'circle');
  const bar = document.createElementNS(ns, 'circle');
  for (const c of [track, bar]) {
    c.setAttribute('cx', 130);
    c.setAttribute('cy', 130);
    c.setAttribute('r', R);
  }
  track.setAttribute('class', 'ring-track');
  bar.setAttribute('stroke-dasharray', LEN);
  svg.append(track, bar);

  const phase = h('div', { class: 'ring-phase' });
  const big = h('div', { class: 'clock-big' });
  const small = h('div', { class: 'clock-small' });
  const setLabel = h('div', { class: 'ring-set' });
  const paused = a.status === 'paused';
  const skipBtn = h('button', { type: 'button', class: 'btn primary', onClick: () => store.sessionEvent('skipBreak') }, icon('skip', { size: 18 }), t('pomo.skip'));

  const update = () => {
    const c = computeSession(store.state.activeSession, Date.now());
    big.textContent = formatClock(c.leftMs);
    small.textContent = t('pomo.totalLeft', { time: formatClock(c.totalLeftMs) });
    phase.textContent = paused ? t('run.paused') : t(c.phase === 'study' ? 'pomo.phaseStudy' : 'pomo.phaseBreak');
    setLabel.textContent = t('pomo.set', { set: c.set, sets: c.sets });
    bar.setAttribute('class', `ring-bar ${c.phase === 'break' ? 'is-break' : ''}`);
    bar.setAttribute('stroke-dashoffset', LEN * (1 - c.leftMs / c.segmentMs));
    skipBtn.hidden = c.phase !== 'break';
  };
  update();
  tickers.add(update);

  return [
    h('header', { class: 'page-head' }, h('h1', { class: 'sub-title' }, t('mode.pomodoro')), closeBtn()),
    subjectLine(a.subjectId),
    h('div', { class: 'ring-wrap' }, svg, h('div', { class: 'ring-center' }, phase, big, small, setLabel)),
    h('div', { class: 'run-actions' },
      skipBtn,
      h('button', { type: 'button', class: 'btn', onClick: () => store.sessionEvent(paused ? 'resume' : 'pause') },
        icon(paused ? 'play' : 'pause', { size: 18 }), t(paused ? 'run.resume' : 'run.pause')),
      h('button', { type: 'button', class: 'btn', onClick: () => store.sessionEvent('stop') }, icon('stop', { size: 18 }), t('run.stop'))),
    runningTodos(a),
  ];
}

function stopwatchScreen(a) {
  const big = h('div', { class: 'clock-big' });
  const small = h('div', { class: 'clock-small' });
  const paused = a.status === 'paused';
  const update = () => {
    const c = computeSession(store.state.activeSession, Date.now());
    big.textContent = formatClock(c.studyMs);
    small.textContent = t('run.breakTime', { time: formatClock(c.breakMs) });
  };
  update();
  tickers.add(update);
  return [
    h('header', { class: 'page-head' }, h('h1', { class: 'sub-title' }, t('mode.stopwatch')), closeBtn()),
    subjectLine(a.subjectId),
    h('div', { class: `run-clock ${paused ? 'is-paused' : ''}` }, big, small, paused ? h('div', { class: 'ring-phase' }, t('run.paused')) : null),
    h('div', { class: 'run-actions' },
      h('button', { type: 'button', class: 'btn', onClick: () => store.sessionEvent(paused ? 'resume' : 'pause') },
        icon(paused ? 'play' : 'pause', { size: 18 }), t(paused ? 'run.resume' : 'run.pause')),
      h('button', { type: 'button', class: 'btn primary', onClick: () => store.sessionEvent('stop') }, icon('stop', { size: 18 }), t('run.finish'))),
    runningTodos(a),
  ];
}

function runningTodos(a) {
  const todos = sessionTodos(a);
  if (!todos.length) return null;
  return h('section', {},
    h('div', { class: 'section-head' }, h('h3', {}, t('field.todo'))),
    h('div', { class: 'card list' }, todos.map((x) => todoRow(x, {
      onToggle: () => store.toggleSessionTodo(x.id),
      menu: false,
      showSubject: !a.subjectId,
    }))));
}

// ---- 終了画面 ----

function endScreen(a) {
  const f = a.result;
  const bigEl = h('div', { class: 'clock-big' }, formatDuration(f.studySeconds));
  const breakEl = h('div', { class: 'clock-small' }, t('end.break', { time: formatDuration(f.breakSeconds) }));
  const subjects = visibleSubjects(store.state, 'studying');
  const current = f.subjectId ? store.get('subjects', f.subjectId) : null;
  if (current && !subjects.includes(current)) subjects.push(current);
  const todos = sessionTodos(a);
  return [
    h('header', { class: 'page-head' }, h('h1', { class: 'sub-title' }, t('end.title')), closeBtn()),
    h('div', { class: 'run-clock' }, bigEl, breakEl),
    h('div', { class: 'form card pad-card' },
      field(t('field.subject'), selectField(f.subjectId, subjects, t('subject.none'), (v) => store.updateResult({ subjectId: v }))),
      field(t('field.startAt'), datetimeField(f.startAt, (v) => { if (v != null) store.updateResult({ startAt: v }, { silent: true }); })),
      field(t('field.study'), durationField(f.studySeconds, (v) => {
        store.updateResult({ studySeconds: v }, { silent: true });
        bigEl.textContent = formatDuration(v);
      })),
      field(t('field.break'), durationField(f.breakSeconds, (v) => {
        store.updateResult({ breakSeconds: v }, { silent: true });
        breakEl.textContent = t('end.break', { time: formatDuration(v) });
      }))),
    todos.length ? h('section', {},
      h('div', { class: 'section-head' }, h('h3', {}, t('field.todo'))),
      h('p', { class: 'muted small hint' }, t('end.todoHint')),
      h('div', { class: 'card list' }, todos.map((x) => endTodoRow(x, f)))) : null,
    h('button', {
      type: 'button',
      class: 'btn primary block next-btn',
      onClick: () => {
        resetRecordView();
        const r = store.saveSession();
        if (r.ok) goTab('shelf');
        toast(r.ok ? t('record.saved') : t(r.error === 'startAt' ? 'error.startAt' : 'error.time'));
      },
    }, t('end.add')),
  ];
}

function endTodoRow(todo, f) {
  const done = todo.completedAt != null;
  const linked = f.todoIds.includes(todo.id);
  return h('div', { class: `todo-row ${done ? 'done' : ''}` },
    h('button', {
      type: 'button',
      class: `check big ${done ? 'on' : ''}`,
      role: 'checkbox',
      'aria-checked': done ? 'true' : 'false',
      'aria-label': `${t('todo.toggle')}: ${todo.content}`,
      onClick: () => store.toggleSessionTodo(todo.id),
    }, done ? icon('check', { size: 14 }) : null),
    h('button', {
      type: 'button',
      class: 'grow todo-text link-toggle',
      'aria-pressed': linked ? 'true' : 'false',
      onClick: () => store.updateResult({ todoIds: toggled(f.todoIds, todo.id) }),
    },
    h('span', { class: 'todo-content' }, todo.content),
    todo.dueAt != null ? h('span', { class: 'todo-sub' }, dueLabel(todo)) : null),
    linked ? h('span', { class: 'linked-tag' }, t('end.linked')) : null);
}

// ---- 他のタブに出す、記録中のお知らせ ----

export function sessionBanner() {
  const a = store.state.activeSession;
  if (!a) return null;
  const text = h('span', { class: 'grow ellipsis' });
  const clock = h('span', { class: 'banner-clock' });
  const update = () => {
    const cur = store.state.activeSession;
    if (!cur) return;
    const name = cur.subjectId ? subjectName(cur.subjectId) : t('subject.none');
    if (cur.status === 'ended') {
      text.textContent = `${t('end.title')} · ${name}`;
      clock.textContent = '';
      return;
    }
    const c = computeSession(cur, Date.now());
    text.textContent = `${t(cur.status === 'paused' ? 'run.paused' : 'run.inProgress')} · ${name}`;
    clock.textContent = formatClock(cur.mode === 'pomodoro' ? c.leftMs : c.studyMs);
  };
  update();
  tickers.add(update);
  return h('button', { type: 'button', class: 'session-banner', onClick: () => goTab('record') }, icon('timer', { size: 18 }), text, clock);
}

// ---- 起動時の下書きの確認（DLG-01） ----

export function openDraftDialog() {
  actionMenu(t('draft.title'), [
    {
      label: t('draft.save'),
      icon: 'check',
      onClick: () => {
        const r = store.saveSession();
        if (r.ok) toast(t('record.saved'));
      },
    },
    { label: t('draft.edit'), icon: 'edit', onClick: () => goTab('record') },
    {
      label: t('draft.discard'),
      icon: 'trash',
      danger: true,
      onClick: () => {
        store.discardSession();
        toast(t('record.discarded'));
      },
    },
  ]);
}
