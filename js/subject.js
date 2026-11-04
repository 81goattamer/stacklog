import { store } from './app-store.js';
import { GRAY, PALETTE, sortedCategories } from './calc.js';
import { t } from './i18n.js';
import { h, icon, iconButton, actionMenu, blobUrl, bookMark, colorDot, confirmDialog, empty, formatDuration, openSheet, subjectCover, toast } from './ui.js';
import { colorSwatches, field, selectField, seg } from './fields.js';
import { pickImage } from './images.js';
import { openTodoForm, todoListCard } from './todo-form.js';
import { recordRow } from './record-form.js';
import { recordFromSubject } from './views/record.js';

// ---- 科目の追加・編集（POP-13） ----

export function openSubjectForm(id = null) {
  const cur = id ? store.get('subjects', id) : null;
  const f = { name: cur?.name ?? '', categoryId: cur?.categoryId ?? null, iconImage: cur?.iconImage ?? null, color: cur?.color ?? null };
  let err = '';
  const sheet = openSheet({
    title: t(id ? 'subject.edit' : 'subject.add'),
    render: () => {
      const preview = h('div', { class: 'cover cover-edit' },
        f.iconImage ? h('img', { src: blobUrl(f.iconImage), alt: '' }) : bookMark(previewColor(f, cur), 36));
      const choose = () => pickImage((blob) => { f.iconImage = blob; sheet.refresh(); }, () => toast(t('subject.imageError')));
      const save = () => {
        const r = id ? store.updateSubject(id, colorField(f, cur)) : store.addSubject(f);
        if (r.ok) sheet.close();
        else {
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
  const sheet = openSheet({
    title: store.get('subjects', id)?.name,
    full: true,
    headerRight: () => iconButton('more', t('common.menu'), () => actionMenu(store.get('subjects', id).name, [
      { label: t('common.edit'), icon: 'edit', onClick: () => openSubjectForm(id) },
      { label: t('common.delete'), icon: 'trash', danger: true, onClick: () => openSubjectDelete(id, () => sheet.close()) },
    ])),
    render: (api) => {
      const s = store.get('subjects', id);
      if (!s) {
        api.close();
        return h('div');
      }
      api.setTitle(s.name);
      const todos = store.state.todos.filter((x) => x.subjectId === id && x.completedAt == null);
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
export function openSubjectDelete(id, onDone = () => {}) {
  const s = store.get('subjects', id);
  actionMenu(t('subject.deleteTitle', { name: s.name }), [
    {
      label: t('subject.hide'),
      desc: t('subject.hideDesc'),
      icon: 'layers',
      onClick: () => {
        store.hideSubject(id);
        onDone();
      },
    },
    {
      label: t('subject.purge'),
      desc: t('subject.purgeDesc'),
      icon: 'trash',
      danger: true,
      onClick: () => confirmPurge(id, onDone),
    },
  ]);
}

async function confirmPurge(id, onDone = () => {}) {
  const s = store.get('subjects', id);
  if (await confirmDialog({ message: t('subject.purgeConfirm', { name: s.name }), okLabel: t('subject.purge'), danger: true })) {
    onDone();
    store.purgeSubject(id);
  }
}

// ---- カテゴリ管理（SCR-11, POP-12） ----

export function openCategoryManager() {
  openSheet({
    title: t('category.title'),
    full: true,
    headerRight: () => iconButton('plus', t('category.add'), () => openCategoryForm()),
    render: () => {
      const cats = sortedCategories(store.state);
      const hidden = store.state.subjects.filter((s) => s.hiddenAt != null).sort((a, b) => b.hiddenAt - a.hiddenAt);
      return h('div', {},
        cats.length
          ? h('div', { class: 'card list outlined' }, cats.map((c) => h('div', { class: 'manage-row' },
            colorDot(c.themeColor),
            h('button', { type: 'button', class: 'grow manage-name', onClick: () => openCategoryForm(c.id) }, c.name),
            iconButton('trash', t('common.delete'), async () => {
              if (await confirmDialog({ message: t('category.deleteConfirm', { name: c.name }), okLabel: t('common.delete'), danger: true })) store.deleteCategory(c.id);
            }, 'danger'))))
          : empty(t('category.empty'), 'tag'),
        h('div', { class: 'section-head' }, h('h3', {}, t('category.hidden'))),
        hidden.length
          ? h('div', { class: 'card list outlined' }, hidden.map((s) => h('div', { class: 'manage-row' },
            colorDot(s.color),
            h('span', { class: 'grow manage-name' }, s.name),
            h('button', { type: 'button', class: 'text-btn', onClick: () => store.restoreSubject(s.id) }, t('category.restore')),
            iconButton('trash', t('subject.purge'), () => confirmPurge(s.id), 'danger'))))
          : h('p', { class: 'muted small pad' }, t('category.hiddenEmpty')));
    },
  });
}

function openCategoryForm(id = null) {
  const cur = id ? store.get('categories', id) : null;
  const f = { name: cur?.name ?? '', themeColor: cur?.themeColor ?? PALETTE[store.state.categories.length % PALETTE.length] };
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
      }, t('common.save'))),
  });
}
