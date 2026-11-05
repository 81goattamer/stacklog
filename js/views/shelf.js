import { store } from '../app-store.js';
import { sortedCategories } from '../calc.js';
import { visibleSubjects } from '../store.js';
import { t } from '../i18n.js';
import { h, icon, iconButton, colorDot, empty, subjectCover } from '../ui.js';
import { seg } from '../fields.js';
import { confirmPurge, openCategoryForm, openSubjectDelete, openSubjectDetail, openSubjectForm } from '../subject.js';
import { openRecord } from './record.js';

const view = { status: 'studying', editing: false };
let rootEl = null;
const rerender = () => renderShelf(rootEl);

function subjectName(s) {
  return h('span', { class: 'shelf-name' }, s.name);
}

function subjectTile(s) {
  if (!view.editing) {
    return h('button', { type: 'button', class: 'shelf-item', onClick: () => openSubjectDetail(s.id) }, subjectCover(s), subjectName(s));
  }
  return h('div', { class: 'shelf-item' },
    h('button', {
      type: 'button',
      class: 'shelf-tile',
      'aria-label': `${t('subject.edit')}: ${s.name}`,
      onClick: () => openSubjectForm(s.id),
    }, subjectCover(s), subjectName(s)),
    h('button', {
      type: 'button',
      class: 'cover-x',
      'aria-label': `${t('common.delete')}: ${s.name}`,
      onClick: () => openSubjectDelete(s.id),
    }, icon('close', { size: 14 })));
}

function addTile(categoryId) {
  return h('button', {
    type: 'button',
    class: 'shelf-item',
    onClick: () => openSubjectForm(null, {
      categoryId,
      // 追加した科目は「勉強中」になるので、見える場所へ移る
      onAdded: () => {
        view.status = 'studying';
        rerender();
      },
    }),
  },
  h('div', { class: 'cover cover-add' }, icon('plus', { size: 28 })),
  h('span', { class: 'shelf-name' }, t('subject.add')));
}

function groupHead(g) {
  if (!view.editing) {
    if (!store.state.categories.length) return null;
    return h('h2', { class: 'group-label with-dot' }, g.color ? colorDot(g.color) : null, g.name);
  }
  // 編集中は名前を2倍の大きさにする。カテゴリなしは押せない
  if (!g.id) return h('h2', { class: 'group-label with-dot big' }, g.name);
  return h('h2', { class: 'group-label big' },
    h('button', {
      type: 'button',
      class: 'with-dot category-btn',
      onClick: () => openCategoryForm(g.id),
    }, colorDot(g.color), g.name, icon('edit', { size: 18 })));
}

// カテゴリの順に並べ、カテゴリなしは最後。編集中は科目がないカテゴリも出す
function shelfGroups(subjects) {
  const groups = [
    ...sortedCategories(store.state).map((c) => ({ id: c.id, name: c.name, color: c.themeColor })),
    { id: null, name: t('category.none') },
  ];
  return groups.map((g) => {
    const list = subjects.filter((s) => s.categoryId === g.id);
    if (!list.length && !view.editing) return null;
    return h('section', { class: 'shelf-group' },
      groupHead(g),
      h('div', { class: 'shelf' }, list.map(subjectTile), view.editing ? addTile(g.id) : null));
  });
}

function hiddenSection() {
  const hidden = store.state.subjects.filter((s) => s.hiddenAt != null).sort((a, b) => b.hiddenAt - a.hiddenAt);
  if (!hidden.length) return null;
  return h('section', { class: 'shelf-hidden' },
    h('h2', { class: 'group-label' }, t('category.hidden')),
    h('div', { class: 'card list' }, hidden.map((s) => h('div', { class: 'manage-row' },
      colorDot(s.color),
      h('span', { class: 'grow manage-name' }, s.name),
      h('button', { type: 'button', class: 'text-btn', onClick: () => store.restoreSubject(s.id) }, t('category.restore')),
      iconButton('trash', t('subject.purge'), () => confirmPurge(s.id), 'danger')))));
}

export function renderShelf(root) {
  rootEl = root;
  const subjects = visibleSubjects(store.state, view.status);
  const show = subjects.length || view.editing;
  root.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', {}, t('shelf.title'))),
    seg(['waiting', 'studying', 'finished'].map((v) => [v, t(`status.${v}`)]), view.status, (v) => {
      view.status = v;
      rerender();
    }, 'wide'),
    show ? h('div', {}, shelfGroups(subjects)) : empty(t('shelf.empty')),
    h('div', { class: 'shelf-foot' },
      view.editing ? h('button', { type: 'button', class: 'btn block', onClick: () => openCategoryForm() }, icon('plus', { size: 18 }), t('category.add')) : null,
      view.editing ? hiddenSection() : null,
      h('button', {
        type: 'button',
        class: `btn block ${view.editing ? 'primary' : ''}`,
        'aria-pressed': view.editing ? 'true' : 'false',
        onClick: () => {
          view.editing = !view.editing;
          rerender();
        },
      }, t(view.editing ? 'shelf.done' : 'shelf.edit'))),
    view.editing ? null : h('button', {
      type: 'button',
      class: 'fab',
      'aria-label': t('shelf.record'),
      title: t('shelf.record'),
      onClick: openRecord,
    }, icon('plus', { size: 28 })));
}
