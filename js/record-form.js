import { store, subjectName } from './app-store.js';
import { sortByDue, studyShareText } from './calc.js';
import { visibleSubjects } from './store.js';
import { t } from './i18n.js';
import { h, colorDot, iconButton, openSheet, confirmDialog, toast, formatDateTime, formatDuration } from './ui.js';
import { checkList, datetimeField, durationField, field, memoField, selectField, toggled } from './fields.js';

export function subjectColor(id) {
  return store.get('subjects', id)?.color ?? 'var(--muted)';
}

// 記録の1行。タップで編集・削除（POP-34）
export function recordRow(rec) {
  const todos = rec.todoIds.map((id) => store.get('todos', id)?.content).filter(Boolean);
  return h('button', { type: 'button', class: 'record-row', onClick: () => openRecordEdit(rec.id) },
    colorDot(subjectColor(rec.subjectId)),
    h('div', { class: 'grow' },
      h('div', { class: 'record-title' }, rec.subjectId ? subjectName(rec.subjectId) : t('subject.none')),
      todos.length ? h('div', { class: 'sub' }, todos.join(' / ')) : null,
      h('div', { class: 'sub' }, formatDateTime(rec.startAt))),
    h('span', { class: 'record-time' }, formatDuration(rec.studySeconds)));
}

export function openRecordEdit(id) {
  const cur = store.get('records', id);
  if (!cur) return;
  const f = { subjectId: cur.subjectId, todoIds: [...cur.todoIds], startAt: cur.startAt, studySeconds: cur.studySeconds, breakSeconds: cur.breakSeconds, memo: cur.memo ?? '' };
  let err = '';
  const sheet = openSheet({
    title: t('edit.title'),
    full: true,
    // 左上の×と対称の位置に共有ボタンを置く。共有するのは画面に出ている内容
    headerRight: () => iconButton('share', t('share.button'), () => shareRecord(f)),
    render: () => {
      const options = visibleSubjects(store.state);
      const current = f.subjectId ? store.get('subjects', f.subjectId) : null;
      if (current && !options.includes(current)) options.push(current);
      // 選べる todo: この記録に結びつくものと、未完了のもの（科目を選んだらその科目だけ）
      const todos = sortByDue(store.state.todos.filter((x) => f.todoIds.includes(x.id)
        || (x.completedAt == null && (!f.subjectId || x.subjectId === f.subjectId))));
      return h('div', { class: 'form' },
        field(t('field.subject'), selectField(f.subjectId, options, t('subject.none'), (v) => { f.subjectId = v; sheet.refresh(); })),
        field(t('field.memo'), memoField(f.memo, (v) => { f.memo = v; })),
        field(t('field.startAt'), datetimeField(f.startAt, (v) => { f.startAt = v; })),
        field(t('field.study'), durationField(f.studySeconds, (v) => { f.studySeconds = v; })),
        field(t('field.break'), durationField(f.breakSeconds, (v) => { f.breakSeconds = v; })),
        field(t('field.todo'), todos.length
          ? checkList(todos.map((x) => ({ id: x.id, name: x.content })), f.todoIds, (tid) => { f.todoIds = toggled(f.todoIds, tid); sheet.refresh(); })
          : h('p', { class: 'muted small' }, t('record.noTodos'))),
        err ? h('p', { class: 'error' }, err) : null,
        h('button', {
          type: 'button',
          class: 'btn primary block',
          onClick: () => {
            const r = store.updateRecord(id, f);
            if (r.ok) sheet.close();
            else {
              err = t(r.error === 'startAt' ? 'error.startAt' : 'error.time');
              sheet.refresh();
            }
          },
        }, t('common.save')),
        h('button', {
          type: 'button',
          class: 'btn danger block',
          onClick: async () => {
            if (await confirmDialog({ message: t('edit.deleteConfirm'), okLabel: t('common.delete'), danger: true })) {
              store.deleteRecord(id);
              sheet.close();
              toast(t('edit.deleted'));
            }
          },
        }, t('common.delete')));
    },
  });
}

// 記録を文章にして共有する。共有メニューがない環境ではコピーする
export async function shareRecord(f) {
  const text = studyShareText({
    subject: f.subjectId ? subjectName(f.subjectId) : t('subject.none'),
    startAt: f.startAt,
    studySeconds: f.studySeconds,
    memo: f.memo,
  }, { title: t('share.title'), subject: t('field.subject'), start: t('field.startAt'), study: t('field.study'), sep: t('share.sep') });
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(t('share.copied'));
  } catch {
    toast(t('share.failed'));
  }
}
