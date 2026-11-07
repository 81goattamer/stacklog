import { store } from '../app-store.js';
import { t } from '../i18n.js';
import { h, icon, iconButton, empty, formatDate, setChildren } from '../ui.js';
import { attemptResult, attemptsOf, openExamDetail, openExamForm, openMilestoneList } from '../exam.js';
import { settingsButton } from '../nav.js';
import { streakBanner } from '../streak.js';

// 試験の一覧（SCR-32）
export function renderExams(root) {
  const exams = store.state.exams;
  setChildren(root,
    h('header', { class: 'page-head' },
      h('h1', {}, t('exam.title')),
      iconButton('gem', t('exam.gem'), openMilestoneList),
      settingsButton()),
    streakBanner(),
    exams.length
      ? h('div', { class: 'card list' }, exams.map((e) => {
        const latest = attemptsOf(e.id)[0];
        return h('button', { type: 'button', class: 'list-row', onClick: () => openExamDetail(e.id) },
          icon('file', { size: 20 }),
          h('span', { class: 'grow' }, e.name, latest ? h('small', { class: 'sub block' }, `${formatDate(latest.date)} · ${attemptResult(e, latest)}`) : null),
          icon('chevron', { size: 16 }));
      }))
      : empty(t('exam.empty'), 'file'),
    h('div', { class: 'fab-space' }),
    // 追加ボタンは本棚の記録ボタンと同じ右下に置く
    h('button', {
      type: 'button',
      class: 'fab',
      'aria-label': t('exam.add'),
      title: t('exam.add'),
      onClick: () => openExamForm(),
    }, icon('plus', { size: 28 })));
}
