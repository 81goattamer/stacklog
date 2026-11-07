import { store } from '../app-store.js';
import { sortTodos, sortedCategories, visibleTodos } from '../calc.js';
import { t } from '../i18n.js';
import { h, icon, colorDot, empty } from '../ui.js';
import { openTodoForm, todoRow } from '../todo-form.js';
import { settingsButton } from '../nav.js';

const view = { sort: 'due', showOpen: true, showDone: false };
const SORTS = [['due', 'todo.sortDue'], ['category', 'todo.sortCategory'], ['newest', 'todo.sortNewest'], ['oldest', 'todo.sortOldest']];

function rowOf(todo) {
  return todoRow(todo, { onToggle: () => store.setTodoDone(todo.id, todo.completedAt == null) });
}

// カテゴリ毎のとき、見出しを入れて分ける
function grouped(rows) {
  const s = store.state;
  const groups = [
    ...sortedCategories(s).map((c) => ({ key: c.id, name: c.name, color: c.themeColor })),
    { key: 'none', name: t('category.none') },
    { key: 'unset', name: t('subject.none') },
  ];
  const keyOf = (todo) => {
    const sub = todo.subjectId ? store.get('subjects', todo.subjectId) : null;
    return !sub ? 'unset' : sub.categoryId ?? 'none';
  };
  return groups.map((g) => {
    const list = rows.filter((x) => keyOf(x) === g.key);
    if (!list.length) return null;
    return h('section', { class: 'group' },
      h('h2', { class: 'group-label with-dot' }, g.color ? colorDot(g.color) : null, g.name),
      h('div', { class: 'card list' }, list.map(rowOf)));
  });
}

export function renderTodos(root) {
  const rows = sortTodos(store.state, visibleTodos(store.state.todos, view, Date.now()), view.sort);
  const chip = (label, on, onClick) => h('button', {
    type: 'button',
    class: `sort-chip ${on ? 'on' : ''}`,
    'aria-pressed': on ? 'true' : 'false',
    onClick: () => { onClick(); renderTodos(root); },
  }, label);
  root.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', {}, t('todo.title')), settingsButton()),
    h('div', { class: 'sort-bar' }, SORTS.map(([key, label]) => chip(t(label), view.sort === key, () => { view.sort = key; }))),
    h('div', { class: 'sort-bar filter' },
      chip(t('todo.filterOpen'), view.showOpen, () => { view.showOpen = !view.showOpen; }),
      chip(t('todo.filterDone'), view.showDone, () => { view.showDone = !view.showDone; })),
    !rows.length
      ? empty(t('todo.empty'), 'checklist')
      : view.sort === 'category'
        ? h('div', {}, grouped(rows))
        : h('div', { class: 'card list' }, rows.map(rowOf)),
    h('div', { class: 'fab-space' }),
    // 追加ボタンは本棚の記録ボタンと同じ右下に置く
    h('button', {
      type: 'button',
      class: 'fab',
      'aria-label': t('todo.add'),
      title: t('todo.add'),
      onClick: () => openTodoForm(),
    }, icon('plus', { size: 28 })));
}
