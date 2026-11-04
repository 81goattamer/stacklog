// 記録タブ。記録中はタイマーの画面（session.js）、それ以外は 科目 → todo → モード の順に進む
import { store } from '../app-store.js';
import { sortByDue } from '../calc.js';
import { candidateTodos, visibleSubjects } from '../store.js';
import { t } from '../i18n.js';
import { h, icon, iconButton, closeAllSheets, empty, formatDateTime, subjectCover, toast } from '../ui.js';
import { checkList, datetimeField, durationField, field, selectField, toggled } from '../fields.js';
import { goTab } from '../nav.js';
import { renderSession } from './session.js';

const HOME = { step: 'subject', subjectId: null, todoIds: [], fromDetail: false, manual: null, pomoError: '' };
let view = { ...HOME };

export function resetRecordView() {
  view = { ...HOME };
}

// 科目詳細の「記録する」（SHELF-32）。科目を決めた状態でモード選択へ進む
export function recordFromSubject(subjectId) {
  closeAllSheets();
  if (store.state.activeSession) toast(t('run.alreadyActive'));
  else view = { ...HOME, step: 'mode', subjectId, fromDetail: true };
  goTab('record');
}

function go(step) {
  view.step = step;
  rerender();
}

let rootEl = null;
function rerender() {
  renderRecord(rootEl);
  window.scrollTo(0, 0);
}

function stepHead(title, backTo) {
  return h('header', { class: 'page-head' },
    backTo ? iconButton('back', t('common.back'), backTo) : null,
    h('h1', { class: backTo ? 'sub-title' : '' }, title));
}

export function renderRecord(root) {
  rootEl = root;
  if (store.state.activeSession) {
    renderSession(root);
    return;
  }
  if (view.subjectId && !store.get('subjects', view.subjectId)) view = { ...HOME };
  const steps = { subject: stepSubject, todo: stepTodo, mode: stepMode, pomodoro: stepPomodoro, stopwatch: stepStopwatch, manual: stepManual };
  root.replaceChildren(...steps[view.step]());
}

function stepSubject() {
  const subjects = visibleSubjects(store.state, 'studying');
  const pick = (id) => {
    view.subjectId = id;
    view.todoIds = [];
    go('todo');
  };
  return [
    stepHead(t('record.title')),
    h('p', { class: 'step-label' }, t('record.chooseSubject')),
    subjects.length
      ? h('div', { class: 'card list' }, subjects.map((s) => h('button', { type: 'button', class: 'list-row', onClick: () => pick(s.id) },
        subjectCover(s, 'cover-small', 20),
        h('span', { class: 'grow' }, s.name),
        icon('chevron', { size: 16 }))))
      : h('p', { class: 'muted small pad' }, t('record.noStudying')),
    h('button', { type: 'button', class: 'btn block skip-btn', onClick: () => pick(null) }, t('record.noSubject')),
  ];
}

function stepTodo() {
  const todos = sortByDue(candidateTodos(store.state, view.subjectId));
  return [
    stepHead(t('record.chooseTodo'), () => go('subject')),
    todos.length
      ? h('div', { class: 'card pad-card' }, checkList(todos.map((x) => ({
        id: x.id,
        name: x.content,
        sub: x.dueAt != null ? formatDateTime(x.dueAt) : null,
      })), view.todoIds, (id) => { view.todoIds = toggled(view.todoIds, id); rerender(); }))
      : empty(t('record.noTodos'), 'checklist'),
    h('button', { type: 'button', class: 'btn primary block next-btn', onClick: () => go('mode') }, t('common.next')),
  ];
}

function stepMode() {
  const back = view.fromDetail ? () => { view = { ...HOME }; goTab('shelf'); } : () => go('todo');
  const start = (mode) => {
    view.manual = null;
    view.pomo = null;
    view.pomoError = '';
    go(mode);
  };
  return [
    stepHead(t('record.chooseMode'), back),
    h('div', { class: 'card list' }, [['pomodoro', 'timer'], ['stopwatch', 'play'], ['manual', 'edit']].map(([mode, ic]) => h('button', {
      type: 'button',
      class: 'list-row mode-row',
      onClick: () => start(mode),
    }, h('span', { class: 'mode-icon' }, icon(ic, { size: 20 })),
    h('span', { class: 'grow' }, h('strong', {}, t(`mode.${mode}`)), h('small', { class: 'sub block' }, t(`mode.${mode}Desc`))),
    icon('chevron', { size: 16 })))),
  ];
}

function stepPomodoro() {
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
    stepHead(t('mode.pomodoro'), () => go('mode')),
    h('div', { class: 'form card pad-card' },
      num('studyMin', t('pomo.study'), 1),
      num('breakMin', t('pomo.break'), 0),
      num('sets', t('pomo.sets'), 1),
      view.pomoError ? h('p', { class: 'error' }, view.pomoError) : null),
    h('button', {
      type: 'button',
      class: 'btn primary block next-btn',
      onClick: () => {
        const ok = Number.isInteger(f.sets) && f.sets >= 1 && f.sets <= 50 && f.studyMin >= 1 && f.studyMin <= 1440 && f.breakMin >= 0 && f.breakMin <= 1440;
        if (!ok) {
          view.pomoError = t('pomo.invalid');
          rerender();
          return;
        }
        const next = { subjectId: view.subjectId, selectedTodoIds: view.todoIds };
        view = { ...HOME };
        store.startSession({ mode: 'pomodoro', ...next, pomodoro: f });
      },
    }, icon('play', { size: 18, fill: true }), t('pomo.start')),
  ];
}

function stepStopwatch() {
  return [
    stepHead(t('mode.stopwatch'), () => go('mode')),
    h('div', { class: 'run-clock' }, h('div', { class: 'clock-big' }, '00:00')),
    h('button', {
      type: 'button',
      class: 'btn primary block next-btn',
      onClick: () => {
        const next = { subjectId: view.subjectId, selectedTodoIds: view.todoIds };
        view = { ...HOME };
        store.startSession({ mode: 'stopwatch', ...next });
      },
    }, icon('play', { size: 18, fill: true }), t('pomo.start')),
  ];
}

function stepManual() {
  if (!view.manual) {
    const study = 30 * 60;
    view.manual = { subjectId: view.subjectId, todoIds: [...view.todoIds], studySeconds: study, startAt: Date.now() - study * 1000, startTouched: false, err: '' };
  }
  const f = view.manual;
  const subjects = visibleSubjects(store.state, 'studying');
  const current = f.subjectId ? store.get('subjects', f.subjectId) : null;
  if (current && !subjects.includes(current)) subjects.push(current);
  const todos = sortByDue(candidateTodos(store.state, f.subjectId));
  const startBox = h('div', {});
  const fillStart = () => startBox.replaceChildren(datetimeField(f.startAt, (v) => { f.startAt = v; f.startTouched = true; }));
  fillStart();
  return [
    stepHead(t('mode.manual'), () => go('mode')),
    h('div', { class: 'form card pad-card' },
      field(t('field.subject'), selectField(f.subjectId, subjects, t('subject.none'), (v) => {
        f.subjectId = v;
        f.todoIds = [];
        rerender();
      })),
      field(t('manual.todos'), todos.length
        ? checkList(todos.map((x) => ({ id: x.id, name: x.content })), f.todoIds, (id) => { f.todoIds = toggled(f.todoIds, id); rerender(); })
        : h('p', { class: 'muted small' }, t('record.noTodos'))),
      field(t('field.study'), durationField(f.studySeconds, (v) => {
        f.studySeconds = v;
        // 開始時刻を自分で変えるまでは、現在時刻から逆算する（REC-31）
        if (!f.startTouched) {
          f.startAt = Date.now() - v * 1000;
          fillStart();
        }
      })),
      field(t('field.startAt'), startBox),
      f.err ? h('p', { class: 'error' }, f.err) : null),
    h('button', {
      type: 'button',
      class: 'btn primary block next-btn',
      onClick: () => {
        const payload = { subjectId: f.subjectId, todoIds: f.todoIds, startAt: f.startAt, studySeconds: f.studySeconds, breakSeconds: 0 };
        const check = f.studySeconds > 0 && Number.isFinite(f.startAt);
        if (!check) {
          f.err = t(Number.isFinite(f.startAt) ? 'error.time' : 'error.startAt');
          rerender();
          return;
        }
        view = { ...HOME };
        store.addManualRecord(payload);
        toast(t('record.saved'));
      },
    }, t('manual.done')),
  ];
}
