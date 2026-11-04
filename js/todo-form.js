import { store, subjectName } from './app-store.js';
import { overdueDays, sortByDue } from './calc.js';
import { visibleSubjects } from './store.js';
import { t } from './i18n.js';
import { h, icon, iconButton, openSheet, actionMenu, confirmDialog, formatDateTime } from './ui.js';
import { datetimeField, field, selectField } from './fields.js';

// 追加・編集（POP-41）
export function openTodoForm({ id = null, subjectId = null } = {}) {
  const cur = id ? store.get('todos', id) : null;
  const f = { subjectId: cur?.subjectId ?? subjectId, content: cur?.content ?? '', dueAt: cur?.dueAt ?? null };
  let err = '';
  const sheet = openSheet({
    title: t(id ? 'todo.edit' : 'todo.add'),
    render: () => {
      const options = visibleSubjects(store.state);
      const current = f.subjectId ? store.get('subjects', f.subjectId) : null;
      if (current && !options.includes(current)) options.push(current);
      const save = () => {
        const r = id ? store.updateTodo(id, f) : store.addTodo(f);
        if (r.ok) sheet.close();
        else {
          err = t('common.required');
          sheet.refresh();
        }
      };
      return h('div', { class: 'form' },
        field(t('field.subject'), selectField(f.subjectId, options, t('subject.none'), (v) => { f.subjectId = v; })),
        field(t('field.due'), datetimeField(f.dueAt, (v) => { f.dueAt = v; }, { clearable: true })),
        field(t('field.content'), h('input', {
          class: 'input',
          value: f.content,
          enterkeyhint: 'done',
          onInput: (e) => { f.content = e.target.value; },
          onKeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) save(); },
        })),
        err ? h('p', { class: 'error' }, err) : null,
        h('button', { type: 'button', class: 'btn primary block', onClick: save }, t('common.save')));
    },
  });
}

export function openTodoMenu(id) {
  const todo = store.get('todos', id);
  if (!todo) return;
  actionMenu(todo.content, [
    { label: t('common.edit'), icon: 'edit', onClick: () => openTodoForm({ id }) },
    {
      label: t('common.delete'),
      icon: 'trash',
      danger: true,
      onClick: async () => {
        if (await confirmDialog({ message: t('todo.deleteConfirm', { name: todo.content }), okLabel: t('common.delete'), danger: true })) store.deleteTodo(id);
      },
    },
  ]);
}

// 締め切りの表示。期限切れは何日過ぎたかも出す（TODO-20）
export function dueLabel(todo) {
  if (todo.dueAt == null) return null;
  const n = overdueDays(todo, Date.now());
  return h('span', { class: `due ${n != null ? 'over' : ''}` },
    formatDateTime(todo.dueAt),
    n != null ? ` · ${n > 0 ? t('todo.overdue', { n }) : t('todo.overdueToday')}` : null);
}

// todo の1行。onToggle で完了を切り替える。menu を付けると右端に … を出す
export function todoRow(todo, { onToggle, menu = true, showSubject = true, extra = null }) {
  const done = todo.completedAt != null;
  const name = showSubject && todo.subjectId ? subjectName(todo.subjectId) : '';
  return h('div', { class: `todo-row ${done ? 'done' : ''}` },
    h('button', {
      type: 'button',
      class: `check big ${done ? 'on' : ''}`,
      role: 'checkbox',
      'aria-checked': done ? 'true' : 'false',
      'aria-label': `${t('todo.toggle')}: ${todo.content}`,
      onClick: onToggle,
    }, done ? icon('check', { size: 14 }) : null),
    h('div', { class: 'grow todo-text' },
      h('div', { class: 'todo-content' }, todo.content),
      name || todo.dueAt != null
        ? h('div', { class: 'todo-sub' }, name ? h('span', {}, name) : null, dueLabel(todo))
        : null),
    extra,
    menu ? iconButton('more', t('common.menu'), () => openTodoMenu(todo.id), 'row-more') : null);
}

export function todoListCard(todos, opts = {}) {
  return h('div', { class: 'card list' }, sortByDue(todos).map((x) => todoRow(x, {
    onToggle: () => store.setTodoDone(x.id, x.completedAt == null),
    ...opts,
  })));
}
