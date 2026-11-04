import { store } from '../app-store.js';
import { sortedCategories } from '../calc.js';
import { visibleSubjects } from '../store.js';
import { t } from '../i18n.js';
import { h, icon, iconButton, colorDot, empty, subjectCover } from '../ui.js';
import { seg } from '../fields.js';
import { openCategoryManager, openSubjectDetail, openSubjectForm } from '../subject.js';

const view = { status: 'studying' };

// カテゴリごとに分ける。カテゴリの順に並べ、カテゴリなしは最後。科目がないカテゴリは出さない
function shelfGroups(subjects) {
  const groups = [
    ...sortedCategories(store.state).map((c) => ({ id: c.id, name: c.name, color: c.themeColor })),
    { id: null, name: t('category.none') },
  ];
  return groups.map((g) => {
    const list = subjects.filter((s) => s.categoryId === g.id);
    if (!list.length) return null;
    return h('section', { class: 'shelf-group' },
      store.state.categories.length ? h('h2', { class: 'group-label with-dot' }, g.color ? colorDot(g.color) : null, g.name) : null,
      h('div', { class: 'shelf' }, list.map((s) => h('button', {
        type: 'button',
        class: 'shelf-item',
        onClick: () => openSubjectDetail(s.id),
      }, subjectCover(s), h('span', { class: 'shelf-name' }, s.name)))));
  });
}

export function renderShelf(root) {
  const subjects = visibleSubjects(store.state, view.status);
  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('h1', {}, t('shelf.title')),
      iconButton('tag', t('shelf.categories'), openCategoryManager)),
    seg(['waiting', 'studying', 'finished'].map((v) => [v, t(`status.${v}`)]), view.status, (v) => {
      view.status = v;
      renderShelf(root);
    }, 'wide'),
    subjects.length ? h('div', {}, shelfGroups(subjects)) : empty(t('shelf.empty')),
    h('button', {
      type: 'button',
      class: 'fab',
      'aria-label': t('shelf.add'),
      title: t('shelf.add'),
      onClick: () => openSubjectForm(),
    }, icon('plus', { size: 28 })));
}
