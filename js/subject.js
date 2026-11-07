import { store } from './app-store.js';
import { GRAY, defaultCategoryColor, sortedCategories, visibleTodos } from './calc.js';
import { t } from './i18n.js';
import { h, icon, iconButton, actionMenu, blobUrl, bookMark, colorDot, confirmDialog, formatDuration, openSheet, subjectCover, toast } from './ui.js';
import { colorSwatches, field, selectField, seg } from './fields.js';
import { pickImage } from './images.js';
import { openTodoForm, todoListCard } from './todo-form.js';
import { recordRow } from './record-form.js';
import { recordFromSubject } from './views/record.js';

// ---- 科目の追加・編集（POP-13） ----

export function openSubjectForm(id = null, { categoryId = null, onAdded = null } = {}) {
  const cur = id ? store.get('subjects', id) : null;
  const f = { name: cur?.name ?? '', categoryId: cur?.categoryId ?? categoryId, iconImage: cur?.iconImage ?? null, color: cur?.color ?? null };
  let err = '';
  const sheet = openSheet({
    title: t(id ? 'subject.edit' : 'subject.add'),
    render: () => {
      const preview = h('div', { class: 'cover cover-edit' },
        f.iconImage ? h('img', { src: blobUrl(f.iconImage), alt: '' }) : bookMark(previewColor(f, cur), 36));
      const choose = () => pickImage((blob) => { f.iconImage = blob; sheet.refresh(); }, () => toast(t('subject.imageError')));
      const save = () => {
        const r = id ? store.updateSubject(id, colorField(f, cur)) : store.addSubject(f);
        if (r.ok) {
          sheet.close();
          if (!id) onAdded?.();
        } else {
          err = t('common.required');
          sheet.refresh();
        }
      };
      return h('div', { class: 'form' },
        field(t('field.subjectName'), h('input', { class: 'input', value: f.name, onInput: (e) => { f.name = e.target.value; } })),
        field(t('field.category'), selectField(f.categoryId, sortedCategories(store.state), t('category.none'), (v) => { f.categoryId = v; sheet.refresh(); })),
        field(t('field.icon'), h('div', { class: 'icon-field' },
          h('button', { type: 'button', class: 'cover-btn', 'aria-label': t('subject.imageChoose'), onClick: choose }, preview),
          h('div', { class: 'icon-actions' },
            h('button', { type: 'button', class: 'text-btn', onClick: choose }, t(f.iconImage ? 'subject.imageChange' : 'subject.imageChoose')),
            f.iconImage ? h('button', { type: 'button', class: 'text-btn danger-text', onClick: () => { f.iconImage = null; sheet.refresh(); } }, t('subject.imageRemove')) : null))),
        id ? field(t('field.color'),
          colorSwatches(f.color, (c) => { f.color = c; sheet.refresh(); }),
          cur.colorCustomized || f.color !== cur.color
            ? h('button', {
              type: 'button',
              class: 'text-btn left',
              onClick: () => {
                store.resetSubjectColor(id);
                f.color = store.get('subjects', id).color;
                sheet.refresh();
              },
            }, t('subject.resetColor'))
            : null) : null,
        err ? h('p', { class: 'error' }, err) : null,
        h('button', { type: 'button', class: 'btn primary block', onClick: save }, t('common.save')));
    },
  });
}

function previewColor(f, cur) {
  if (cur) return f.color;
  return f.categoryId ? store.get('categories', f.categoryId)?.themeColor ?? GRAY : GRAY;
}

// 色は変わったときだけ渡す（渡すと「変更した」扱いになる）
function colorField(f, cur) {
  const { color, ...rest } = f;
  return color === cur.color ? rest : f;
}

// ---- 科目詳細（SCR-14） ----

export function openSubjectDetail(id) {
  openSheet({
    title: store.get('subjects', id)?.name,
    full: true,
    render: (api) => {
      const s = store.get('subjects', id);
      if (!s) {
        api.close();
        return h('div');
      }
      api.setTitle(s.name);
      // todo 画面と同じく、完了にしたものもその日（午前4時まで）は灰色で残す（TODO-40）
      const todos = visibleTodos(store.state.todos.filter((x) => x.subjectId === id), { showOpen: true, showDone: false }, Date.now());
      const records = store.state.records.filter((r) => r.subjectId === id).sort((a, b) => b.startAt - a.startAt);
      const total = records.reduce((a, r) => a + r.studySeconds, 0);
      const category = s.categoryId ? store.get('categories', s.categoryId) : null;
      return h('div', {},
        h('div', { class: 'subject-head' },
          subjectCover(s, 'cover-detail', 44),
          h('div', { class: 'grow' },
            h('div', { class: 'subject-name' }, s.name),
            h('div', { class: 'sub subject-cat' }, colorDot(s.color), category?.name ?? t('category.none')),
            h('div', { class: 'sub' }, t('subject.total', { time: formatDuration(total) })))),
        seg(['waiting', 'studying', 'finished'].map((v) => [v, t(`status.${v}`)]), s.status, (v) => store.updateSubject(id, { status: v }), 'wide'),
        h('button', {
          type: 'button',
          class: 'btn primary block record-btn',
          onClick: () => recordFromSubject(id),
        }, icon('timer', { size: 18 }), t('subject.record')),
        h('div', { class: 'section-head' },
          h('h3', {}, t('subject.todos')),
          iconButton('plus', t('todo.add'), () => openTodoForm({ subjectId: id }))),
        todos.length ? todoListCard(todos, { showSubject: false }) : h('p', { class: 'muted small pad' }, t('subject.noTodos')),
        h('div', { class: 'section-head' }, h('h3', {}, t('subject.records'))),
        records.length
          ? h('div', { class: 'card list' }, records.slice(0, 100).map(recordRow))
          : h('p', { class: 'muted small pad' }, t('subject.noRecords')));
    },
  });
}

// 削除方法の選択（DLG-15）
export function openSubjectDelete(id) {
  const s = store.get('subjects', id);
  actionMenu(t('subject.deleteTitle', { name: s.name }), [
    { label: t('subject.purge'), icon: 'trash', danger: true, onClick: () => confirmPurge(id) },
    { label: t('subject.hide'), icon: 'layers', onClick: () => store.hideSubject(id) },
    { label: t('common.cancel'), onClick: () => {} },
  ]);
}

export async function confirmPurge(id) {
  if (await confirmDialog({ message: t('subject.purgeConfirm'), okLabel: t('common.delete'), danger: true })) store.purgeSubject(id);
}

// ---- カテゴリの追加・編集（POP-12） ----

export function openCategoryForm(id = null) {
  const cur = id ? store.get('categories', id) : null;
  const f = { name: cur?.name ?? '', themeColor: cur?.themeColor ?? defaultCategoryColor(store.state.categories.length) };
  let err = '';
  const sheet = openSheet({
    title: t(id ? 'category.edit' : 'category.add'),
    render: () => h('div', { class: 'form' },
      field(t('field.name'), h('input', { class: 'input', value: f.name, onInput: (e) => { f.name = e.target.value; } })),
      field(t('field.color'), colorSwatches(f.themeColor, (c) => { f.themeColor = c; sheet.refresh(); })),
      err ? h('p', { class: 'error' }, err) : null,
      h('button', {
        type: 'button',
        class: 'btn primary block',
        onClick: () => {
          const r = id ? store.updateCategory(id, f) : store.addCategory(f);
          if (r.ok) sheet.close();
          else {
            err = t('common.required');
            sheet.refresh();
          }
        },
      }, t('common.save')),
      id ? h('button', {
        type: 'button',
        class: 'btn danger block',
        onClick: async () => {
          if (await confirmDialog({ message: t('category.deleteConfirm', { name: cur.name }), okLabel: t('common.delete'), danger: true })) {
            sheet.close();
            store.deleteCategory(id);
          }
        },
      }, t('common.delete')) : null),
  });
}
