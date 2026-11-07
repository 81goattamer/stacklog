// 記録の画面。記録中はタイマーの画面（session.js）、それ以外は1画面で
// 上から 記録モード → 科目 → todo → モードごとの設定 を選んで始める
import { store } from '../app-store.js';
import { sortByDue } from '../calc.js';
import { candidateTodos, visibleSubjects } from '../store.js';
import { t } from '../i18n.js';
import { h, icon, iconButton, closeAllSheets, formatDateTime, toast, setChildren } from '../ui.js';
import { checkList, datetimeField, durationField, field, selectField, seg, toggled } from '../fields.js';
import { goTab } from '../nav.js';
import { renderSession } from './session.js';

const MODES = ['pomodoro', 'stopwatch', 'manual'];
let lastMode = 'pomodoro';

// pinnedSubjectId: 科目詳細から来たときの科目。「勉強中」でなくても選べるようにする
const fresh = (subjectId = null) => ({ mode: lastMode, subjectId, pinnedSubjectId: subjectId, todoIds: [], pomo: null, manual: null, err: '' });
let view = fresh();

export function resetRecordView() {
  view = fresh();
}

// 本棚の記録ボタン。記録中ならその画面に戻り、そうでなければ最初から始める
export function openRecord() {
  if (!store.state.activeSession) view = fresh();
  goTab('record');
}

// 科目詳細の「記録する」（SHELF-32）。科目を決めた状態で開く
export function recordFromSubject(subjectId) {
  closeAllSheets();
  if (store.state.activeSession) toast(t('run.alreadyActive'));
  else view = fresh(subjectId);
  goTab('record');
}

let rootEl = null;
function rerender() {
  renderRecord(rootEl);
}

export function renderRecord(root) {
  rootEl = root;
  if (store.state.activeSession) {
    renderSession(root);
    return;
  }
  if (view.subjectId && !store.get('subjects', view.subjectId)) view = fresh();
  setChildren(root, recordForm());
}

function recordForm() {
  const v = view;
  const subjects = visibleSubjects(store.state, 'studying');
  const pinned = v.pinnedSubjectId ? store.get('subjects', v.pinnedSubjectId) : null;
  if (pinned && pinned.hiddenAt == null && !subjects.includes(pinned)) subjects.push(pinned);
  const todos = sortByDue(candidateTodos(store.state, v.subjectId));
  v.todoIds = v.todoIds.filter((id) => todos.some((x) => x.id === id));
  return [
    h('header', { class: 'page-head' },
      iconButton('back', t('common.back'), () => goTab('shelf')),
      h('h1', { class: 'sub-title' }, t('record.title'))),
    seg(MODES.map((m) => [m, t(`mode.${m}`)]), v.mode, (m) => {
      v.mode = m;
      lastMode = m;
      v.err = '';
      rerender();
    }, 'wide'),
    h('div', { class: 'form card pad-card' },
      field(t('field.subject'), selectField(v.subjectId, subjects, t('subject.none'), (id) => {
        v.subjectId = id;
        v.todoIds = [];
        rerender();
      })),
      field(t(v.mode === 'manual' ? 'manual.todos' : 'field.todo'), todos.length
        ? checkList(todos.map((x) => ({ id: x.id, name: x.content, sub: x.dueAt != null ? formatDateTime(x.dueAt) : null })),
          v.todoIds, (id) => { v.todoIds = toggled(v.todoIds, id); rerender(); })
        : h('p', { class: 'muted small' }, t('record.noTodos')))),
    ...{ pomodoro: pomodoroPanel, stopwatch: stopwatchPanel, manual: manualPanel }[v.mode](),
  ];
}

function startButton(onClick, label = t('pomo.start')) {
  return h('button', { type: 'button', class: 'btn primary block next-btn', onClick }, icon('play', { size: 18, fill: true }), label);
}

function errorLine() {
  return view.err ? h('p', { class: 'error' }, view.err) : null;
}

function pomodoroPanel() {
  view.pomo ??= { ...store.state.settings.lastPomodoro };
  const f = view.pomo;
  const num = (key, label, min) => field(label, h('input', {
    class: 'input',
    type: 'number',
    inputmode: 'numeric',
    min,
    step: 1,
    value: String(f[key]),
    onInput: (e) => { f[key] = Number(e.target.value); },
  }));
  return [
    h('div', { class: 'card pad-card mode-panel' },
      h('div', { class: 'pomo-grid' },
        num('studyMin', t('pomo.study'), 1),
        num('breakMin', t('pomo.break'), 0),
        num('sets', t('pomo.sets'), 1)),
      errorLine()),
    startButton(() => {
      const ok = Number.isInteger(f.sets) && f.sets >= 1 && f.sets <= 50 && f.studyMin >= 1 && f.studyMin <= 1440 && f.breakMin >= 0 && f.breakMin <= 1440;
      if (!ok) {
        view.err = t('pomo.invalid');
        rerender();
        return;
      }
      const next = { subjectId: view.subjectId, selectedTodoIds: view.todoIds };
      view = fresh();
      store.startSession({ mode: 'pomodoro', ...next, pomodoro: f });
    }),
  ];
}

function stopwatchPanel() {
  return [
    startButton(() => {
      const next = { subjectId: view.subjectId, selectedTodoIds: view.todoIds };
      view = fresh();
      store.startSession({ mode: 'stopwatch', ...next });
    }),
  ];
}

function manualPanel() {
  if (!view.manual) {
    const study = 30 * 60;
    view.manual = { studySeconds: study, startAt: Date.now() - study * 1000, startTouched: false };
  }
  const f = view.manual;
  const startBox = h('div', {});
  const fillStart = () => startBox.replaceChildren(datetimeField(f.startAt, (v) => { f.startAt = v; f.startTouched = true; }));
  fillStart();
  return [
    h('div', { class: 'form card pad-card mode-panel' },
      field(t('field.study'), durationField(f.studySeconds, (v) => {
        f.studySeconds = v;
        // 開始時刻を自分で変えるまでは、現在時刻から逆算する（REC-31）
        if (!f.startTouched) {
          f.startAt = Date.now() - v * 1000;
          fillStart();
        }
      })),
      field(t('field.startAt'), startBox),
      errorLine()),
    h('button', {
      type: 'button',
      class: 'btn primary block next-btn',
      onClick: () => {
        if (!(f.studySeconds > 0) || !Number.isFinite(f.startAt)) {
          view.err = t(Number.isFinite(f.startAt) ? 'error.time' : 'error.startAt');
          rerender();
          return;
        }
        const payload = { subjectId: view.subjectId, todoIds: view.todoIds, startAt: f.startAt, studySeconds: f.studySeconds, breakSeconds: 0 };
        view = fresh();
        store.addManualRecord(payload);
        goTab('shelf');
        toast(t('record.saved'));
      },
    }, t('manual.done')),
  ];
}
