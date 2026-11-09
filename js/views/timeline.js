import { store, subjectName } from '../app-store.js';
import { dayKey, timelineDays, weekdayOf } from '../calc.js';
import { t } from '../i18n.js';
import { h, icon, empty, formatClockTime, formatDate, formatDuration, setChildren } from '../ui.js';
import { recordRow } from '../record-form.js';
import { openTodoMenu } from '../todo-form.js';
import { settingsButton } from '../nav.js';
import { streakBanner } from '../streak.js';

// 勉強した記録と完了した todo を、勉強日ごとに区切って新しい順に並べる（LIST-22）。多いときは30日ずつ出す
const view = { limit: 30 };

// 完了した todo の1行。タップで編集・削除
function doneTodoRow(todo) {
  const name = todo.subjectId ? subjectName(todo.subjectId) : '';
  return h('button', { type: 'button', class: 'record-row timeline-todo', onClick: () => openTodoMenu(todo.id) },
    h('span', { class: 'check on small-check' }, icon('check', { size: 12 })),
    h('div', { class: 'grow' },
      h('div', { class: 'timeline-todo-text' }, todo.content),
      h('div', { class: 'sub' }, name ? `${name} · ` : '', t('timeline.todoDone', { time: formatClockTime(todo.completedAt) }))));
}

function daySection(d) {
  // 同じ日に完了した todo は別の行で出すので、記録の行には書かない
  const sameDay = (todo) => todo.completedAt != null && dayKey(todo.completedAt) === d.day;
  return h('section', { class: 'timeline-day' },
    h('h2', { class: 'timeline-date' },
      h('span', { class: 'grow' }, formatDate(d.day), h('span', { class: 'timeline-weekday' }, t('timeline.weekday', { w: t(`day.${weekdayOf(d.day)}`) }))),
      d.studySeconds ? h('span', { class: 'timeline-total' }, formatDuration(d.studySeconds)) : null),
    h('div', { class: 'card list' }, d.items.map((it) => (it.type === 'record'
      ? recordRow(it.row, { timeOnly: true, skipTodo: sameDay })
      : doneTodoRow(it.row)))));
}

export function renderTimeline(root) {
  const days = timelineDays(store.state);
  setChildren(root,
    h('header', { class: 'page-head' }, h('h1', {}, t('tab.timeline')), settingsButton()),
    streakBanner(),
    days.length ? days.slice(0, view.limit).map(daySection) : empty(t('timeline.empty'), 'calendar'),
    days.length > view.limit
      ? h('button', { type: 'button', class: 'btn block next-btn', onClick: () => { view.limit += 30; renderTimeline(root); } }, t('common.more'))
      : null);
}
