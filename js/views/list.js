import { store } from '../app-store.js';
import {
  addDays, calendarColors, categoryShares, dayKey, periodRange, streak, studySeries, timeAxisMax, weekStartKey, weekdayOf,
} from '../calc.js';
import { t } from '../i18n.js';
import { h, icon, iconButton, colorDot, empty, formatDate, formatDuration, openSheet, textOn } from '../ui.js';
import { seg } from '../fields.js';
import { barChart, donutChart } from '../chart.js';
import { recordRow } from '../record-form.js';
import { attemptResult, attemptsOf, openExamDetail, openExamForm, openMilestoneList } from '../exam.js';
import { settingsButton } from '../nav.js';

const view = { tab: 'calendar', calOffset: 0, period: 'week', offset: 0, timeline: 50 };
let rootEl = null;
const rerender = () => renderList(rootEl);

export function renderList(root) {
  rootEl = root;
  const body = { calendar: calendarTab, data: dataTab, exams: examsTab }[view.tab]();
  root.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', {}, t('list.title')), settingsButton()),
    streakBanner(),
    seg([['calendar', t('list.calendar')], ['data', t('list.data')], ['exams', t('list.exams')]], view.tab, (v) => {
      view.tab = v;
      rerender();
    }, 'wide'),
    body);
}

function streakBanner() {
  const s = streak(store.state.records, store.state.settings.streakMinMinutes, Date.now());
  return h('div', { class: `streak ${s.kind}` }, icon('flame', { size: 20, fill: s.kind === 'active' }), h('span', {}, t(`streak.${s.kind}`, { n: s.n })));
}

// ---- カレンダー ----

function periodNav(label, onMove) {
  return h('div', { class: 'period-nav' },
    iconButton('back', t('cal.prev'), () => onMove(-1)),
    h('div', { class: 'period-label' }, label),
    iconButton('chevron', t('cal.next'), () => onMove(1)));
}

function calendarTab() {
  const today = dayKey(Date.now());
  const [y0, m0] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y0, m0 - 1 + view.calOffset, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth() + 1;
  const monthKey = `${y}-${String(m).padStart(2, '0')}`;
  const start = weekStartKey(`${monthKey}-01`, store.state.settings.weekStart);
  const colors = calendarColors(store.state);
  const examDays = new Set(store.state.examAttempts.map((a) => a.date));

  const heads = Array.from({ length: 7 }, (_, i) => h('div', { class: 'cal-head' }, t(`day.${weekdayOf(addDays(start, i))}`)));
  const cells = [];
  for (let k = start; k.slice(0, 7) <= monthKey || cells.length % 7; k = addDays(k, 1)) {
    if (k.slice(0, 7) !== monthKey) {
      cells.push(h('div', { class: 'cal-cell blank' }));
      continue;
    }
    const color = colors.get(k);
    const key = k;
    cells.push(h('button', {
      type: 'button',
      class: `cal-cell ${k === today ? 'today' : ''}`,
      style: color ? { background: color, color: textOn(color) } : null,
      'aria-label': formatDate(k),
      onClick: () => openDayDetail(key),
    }, h('span', {}, Number(k.slice(8))), examDays.has(k) ? h('span', { class: 'cal-exam' }, icon('file', { size: 12 })) : null));
  }
  return h('div', {},
    periodNav(t('cal.month', { y, m }), (d) => { view.calOffset += d; rerender(); }),
    h('div', { class: 'calendar' }, heads, cells));
}

function openDayDetail(key) {
  const [, m, d] = key.split('-').map(Number);
  openSheet({
    title: t('cal.dayTitle', { m, d }),
    render: () => {
      const records = store.state.records.filter((r) => r.dayKey === key).sort((a, b) => a.startAt - b.startAt);
      const attempts = store.state.examAttempts.filter((a) => a.date === key);
      const total = records.reduce((x, r) => x + r.studySeconds, 0);
      if (!records.length && !attempts.length) return h('p', { class: 'muted pad center' }, t('cal.noData'));
      return h('div', {},
        records.length ? h('p', { class: 'sub' }, t('data.total', { time: formatDuration(total) })) : null,
        records.length ? h('div', { class: 'card list outlined' }, records.map(recordRow)) : null,
        attempts.length ? h('div', { class: 'section-head' }, h('h3', {}, t('cal.dayExams'))) : null,
        attempts.length ? h('div', { class: 'card list outlined' }, attempts.map((a) => {
          const exam = store.get('exams', a.examId);
          return h('div', { class: 'list-row' }, icon('file', { size: 18 }), h('span', { class: 'grow' }, exam.name), h('span', { class: 'attempt-result' }, attemptResult(exam, a)));
        })) : null);
    },
  });
}

// ---- データ ----

function hoursTick(sec) {
  const hours = sec / 3600;
  if (hours >= 1 || sec === 0) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  return `${Math.round(sec / 60)}m`;
}

function seriesLabels(period, range) {
  const shortDay = (k) => t('data.dayLabel', { m: Number(k.slice(5, 7)), d: Number(k.slice(8)) });
  if (period === 'week') {
    return {
      title: t('data.weekRange', { from: formatDate(range.from), to: formatDate(range.to) }),
      label: (k) => t(`day.${weekdayOf(k)}`),
      long: shortDay,
      every: 1,
    };
  }
  if (period === 'month') {
    return {
      title: t('cal.month', { y: range.from.slice(0, 4), m: Number(range.from.slice(5, 7)) }),
      label: (k) => Number(k.slice(8)),
      long: shortDay,
      every: 5,
    };
  }
  return {
    title: t('data.yearMonth', { y: range.from.slice(0, 4) }),
    label: (k) => Number(k.slice(5)),
    long: (k) => t('data.monthLabel', { m: Number(k.slice(5)) }),
    every: 1,
  };
}

function dataTab() {
  const s = store.state;
  const range = periodRange(view.period, view.offset, s.settings.weekStart, Date.now());
  const labels = seriesLabels(view.period, range);
  const series = studySeries(s.records, view.period, range);
  const total = series.reduce((a, r) => a + r.seconds, 0);
  const totalText = t('data.total', { time: formatDuration(total) });
  const shares = categoryShares(s, range);
  const nameOf = (row) => (row.key === 'none' ? t('category.none') : row.key === 'unset' ? t('data.unset') : row.name);
  const percent = (v) => `${Math.round((v / total) * 100)}%`;

  const timeline = [...s.records].sort((a, b) => b.startAt - a.startAt);
  return h('div', {},
    seg([['week', t('data.week')], ['month', t('data.month')], ['year', t('data.year')]], view.period, (v) => {
      view.period = v;
      view.offset = 0;
      rerender();
    }, 'wide small'),
    periodNav(labels.title, (d) => { view.offset += d; rerender(); }),
    h('section', { class: 'chart-card card' },
      h('h3', { class: 'chart-title' }, t('data.trend')),
      total
        ? barChart(series.map((r) => ({
          label: labels.label(r.key),
          value: r.seconds,
          readout: `${labels.long(r.key)}  ${formatDuration(r.seconds)}`,
        })), { top: timeAxisMax(Math.max(...series.map((r) => r.seconds))), tickLabel: hoursTick, defaultText: totalText, labelEvery: labels.every })
        : h('p', { class: 'muted small pad center' }, t('data.noData'))),
    h('section', { class: 'chart-card card' },
      h('h3', { class: 'chart-title' }, t('data.share')),
      shares.length
        ? h('div', { class: 'share' },
          donutChart(shares.map((r) => ({ color: r.color, value: r.seconds, title: `${nameOf(r)} ${percent(r.seconds)}` })), { ariaLabel: t('data.share') }),
          h('div', { class: 'legend' }, shares.map((r) => h('div', { class: 'legend-row' },
            colorDot(r.color),
            h('span', { class: 'grow ellipsis' }, nameOf(r)),
            h('span', { class: 'legend-time' }, formatDuration(r.seconds)),
            h('span', { class: 'legend-pct' }, percent(r.seconds))))))
        : h('p', { class: 'muted small pad center' }, t('data.noData'))),
    h('div', { class: 'section-head' }, h('h3', {}, t('data.timeline'))),
    timeline.length
      ? h('div', { class: 'card list' }, timeline.slice(0, view.timeline).map(recordRow))
      : h('p', { class: 'muted small pad' }, t('data.noRecords')),
    timeline.length > view.timeline
      ? h('button', { type: 'button', class: 'btn block next-btn', onClick: () => { view.timeline += 50; rerender(); } }, t('common.more'))
      : null);
}

// ---- 試験 ----

function examsTab() {
  const exams = store.state.exams;
  return h('div', {},
    h('div', { class: 'section-head' },
      h('h3', {}, t('exam.title')),
      h('div', { class: 'head-actions' },
        iconButton('gem', t('exam.gem'), openMilestoneList),
        iconButton('plus', t('exam.add'), () => openExamForm()))),
    exams.length
      ? h('div', { class: 'card list' }, exams.map((e) => {
        const latest = attemptsOf(e.id)[0];
        return h('button', { type: 'button', class: 'list-row', onClick: () => openExamDetail(e.id) },
          icon('file', { size: 20 }),
          h('span', { class: 'grow' }, e.name, latest ? h('small', { class: 'sub block' }, `${formatDate(latest.date)} · ${attemptResult(e, latest)}`) : null),
          icon('chevron', { size: 16 }));
      }))
      : empty(t('exam.empty'), 'file'));
}
