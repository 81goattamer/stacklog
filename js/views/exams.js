import { store } from '../app-store.js';
import { dayDiff, examSchedule } from '../calc.js';
import { t } from '../i18n.js';
import { h, icon, iconButton, empty, formatDate, setChildren, todayKey } from '../ui.js';
import { attemptResult, attemptsOf, examIcon, openExamDetail, openExamForm, openMilestoneList } from '../exam.js';
import { settingsButton } from '../nav.js';
import { streakBanner } from '../streak.js';

function daysLeft(date, today) {
  const n = dayDiff(date, today);
  return n === 0 ? t('exam.today') : t('exam.daysLeft', { n });
}

// 星を付けた試験のうち、まだ行われていないものの残り日数（試験の近い順）
function countdown(today) {
  const rows = store.state.exams
    .filter((e) => e.favorite)
    .map((e) => ({ e, next: examSchedule(attemptsOf(e.id), today).next }))
    .filter((x) => x.next)
    .sort((a, b) => (a.next.date < b.next.date ? -1 : a.next.date > b.next.date ? 1 : 0));
  if (!rows.length) return null;
  return h('div', { class: 'countdown' }, rows.map(({ e, next }) => h('button', {
    type: 'button',
    class: 'countdown-row',
    onClick: () => openExamDetail(e.id),
  },
  h('span', { class: 'countdown-star' }, icon('star', { size: 18, fill: true })),
  h('span', { class: 'grow' }, h('span', { class: 'countdown-name' }, e.name), h('small', { class: 'sub block' }, formatDate(next.date))),
  h('span', { class: 'countdown-days' }, daysLeft(next.date, today)))));
}

// 1行目に試験名、2行目に次回の試験日と残り日数、3行目に前回の結果。ないものは出さない
function examRow(e, today) {
  const { next, last } = examSchedule(attemptsOf(e.id), today);
  const result = last ? attemptResult(e, last, { empty: null }) : null;
  return h('button', { type: 'button', class: 'list-row exam-row', onClick: () => openExamDetail(e.id) },
    examIcon(e),
    h('span', { class: 'grow' },
      h('span', { class: 'exam-name' }, e.favorite ? h('span', { class: 'exam-fav' }, icon('star', { size: 14, fill: true })) : null, e.name),
      next ? h('small', { class: 'sub block' }, t('exam.nextLine', { date: formatDate(next.date), left: daysLeft(next.date, today) })) : null,
      result ? h('small', { class: 'sub block' }, t('exam.lastLine', { date: formatDate(last.date), result })) : null),
    icon('chevron', { size: 16 }));
}

// 試験の一覧（SCR-32）
export function renderExams(root) {
  const exams = store.state.exams;
  const today = todayKey();
  setChildren(root,
    h('header', { class: 'page-head' },
      h('h1', {}, t('exam.title')),
      iconButton('gem', t('exam.gem'), openMilestoneList),
      settingsButton()),
    streakBanner(),
    countdown(today),
    exams.length
      ? h('div', { class: 'card list' }, exams.map((e) => examRow(e, today)))
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
