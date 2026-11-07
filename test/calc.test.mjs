import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRAY, PALETTE, addDays, calendarColors, categoryShares, computeSession, dayDiff, dayKey, defaultCategoryColor, examStudySeconds, isDateKey, overdueDays,
  periodRange, sortTodos, streak, studySeries, studyShareText, timeAxisMax, todoBadge, visibleTodos, weekStartKey,
} from '../js/calc.js';

const at = (s) => new Date(s).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const rec = (day, sec, subjectId = null, startAt = at(`${day}T12:00:00`)) => ({ dayKey: day, studySeconds: sec, subjectId, startAt });

test('palette has 14 distinct colors and defaults go through all of them', () => {
  assert.equal(new Set(PALETTE).size, 14);
  assert.equal(new Set(PALETTE.map((_, i) => defaultCategoryColor(i))).size, 14);
  assert.equal(defaultCategoryColor(14), defaultCategoryColor(0));
});

test('dayKey switches at 4am', () => {
  assert.equal(dayKey(at('2026-11-04T03:59:00')), '2026-11-03');
  assert.equal(dayKey(at('2026-11-04T04:00:00')), '2026-11-04');
  assert.equal(dayKey(at('2026-01-01T01:00:00')), '2025-12-31');
});

test('date helpers', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dayDiff('2026-03-01', '2026-02-27'), 2);
  assert.equal(weekStartKey('2026-11-04', 'sun'), '2026-11-01');
  assert.equal(weekStartKey('2026-11-04', 'mon'), '2026-11-02');
  assert.equal(weekStartKey('2026-11-01', 'mon'), '2026-10-26');
  assert.equal(isDateKey('2026-02-30'), false);
  assert.equal(isDateKey('2026-02-28'), true);
});

test('streak follows the three states', () => {
  const now = at('2026-11-04T12:00:00');
  const need = 30 * 60;
  assert.deepEqual(streak([], 30, now), { kind: 'none', n: 0 });
  assert.deepEqual(streak([rec('2026-11-04', need)], 30, now), { kind: 'active', n: 1 });
  assert.deepEqual(streak([rec('2026-11-03', need), rec('2026-11-02', need)], 30, now), { kind: 'pending', n: 3 });
  assert.deepEqual(streak([rec('2026-11-04', need), rec('2026-11-03', need), rec('2026-11-01', need)], 30, now), { kind: 'active', n: 2 });
  assert.deepEqual(streak([rec('2026-11-02', need)], 30, now), { kind: 'none', n: 0 });
  // 1日の合計で判定する。足りない日は数えない
  assert.deepEqual(streak([rec('2026-11-04', need / 2), rec('2026-11-04', need / 2)], 30, now), { kind: 'active', n: 1 });
  assert.deepEqual(streak([rec('2026-11-04', need - 1)], 30, now), { kind: 'none', n: 0 });
});

test('calendar color: longest subject, ties go to the earlier one, gray for no subject', () => {
  const state = {
    subjects: [{ id: 'a', color: '#aaaaaa' }, { id: 'b', color: '#bbbbbb' }],
    records: [
      rec('2026-11-01', 60, 'a'), rec('2026-11-01', 120, 'b'),
      rec('2026-11-02', 60, 'b', 200), rec('2026-11-02', 60, 'a', 100),
      rec('2026-11-03', 60, null),
      rec('2026-11-04', 10, 'a'), rec('2026-11-04', 999, null),
    ],
  };
  const c = calendarColors(state);
  assert.equal(c.get('2026-11-01'), '#bbbbbb');
  assert.equal(c.get('2026-11-02'), '#aaaaaa');
  assert.equal(c.get('2026-11-03'), GRAY);
  assert.equal(c.get('2026-11-04'), '#aaaaaa');
  assert.equal(c.has('2026-11-05'), false);
});

test('periods and series', () => {
  const now = at('2026-11-04T12:00:00');
  assert.deepEqual(periodRange('week', 0, 'sun', now), { from: '2026-11-01', to: '2026-11-07' });
  assert.deepEqual(periodRange('week', -1, 'mon', now), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(periodRange('month', 0, 'sun', now), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(periodRange('month', -11, 'sun', now), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(periodRange('year', -1, 'sun', now), { from: '2025-01-01', to: '2025-12-31' });

  const records = [rec('2026-11-02', 60), rec('2026-11-02', 30), rec('2026-10-31', 999), rec('2026-03-05', 5)];
  const week = studySeries(records, 'week', { from: '2026-11-01', to: '2026-11-07' });
  assert.equal(week.length, 7);
  assert.equal(week[1].seconds, 90);
  const year = studySeries(records, 'year', { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(year.length, 12);
  assert.equal(year[2].seconds, 5);
  assert.equal(year[10].seconds, 90);
});

test('time axis uses round steps and always fits the value', () => {
  assert.equal(timeAxisMax(0), 1200);
  assert.equal(timeAxisMax(6300), 7200);
  assert.equal(timeAxisMax(7201), 14400);
  assert.equal(timeAxisMax(10_000_000), 10_080_000);
});

test('category shares keep no-category and no-subject apart (Q9)', () => {
  const state = {
    categories: [{ id: 'c', name: '語学', themeColor: '#111111' }, { id: 'empty', name: 'x', themeColor: '#222222' }],
    subjects: [{ id: 'a', categoryId: 'c' }, { id: 'b', categoryId: null }],
    records: [rec('2026-11-01', 10, 'a'), rec('2026-11-01', 20, 'b'), rec('2026-11-01', 30, null), rec('2026-01-01', 40, 'a')],
  };
  assert.deepEqual(categoryShares(state, { from: '2026-11-01', to: '2026-11-30' }).map((r) => [r.key, r.seconds]), [['c', 10], ['none', 20], ['unset', 30]]);
});

test('exam study time sums linked subjects over all time', () => {
  const state = { records: [rec('2020-01-01', 10, 'a'), rec('2026-01-01', 20, 'b'), rec('2026-01-01', 40, 'c'), rec('2026-01-01', 80, null)] };
  assert.equal(examStudySeconds(state, { subjectIds: ['a', 'b'] }), 30);
});

test('todo badge', () => {
  const now = at('2026-11-04T12:00:00');
  const t = (h, extra = {}) => ({ dueAt: now + h * HOUR, completedAt: null, ...extra });
  assert.deepEqual(todoBadge([t(100), { dueAt: null, completedAt: null }, t(1, { completedAt: 1 })], now), { red: 0, normal: 0, app: 0 });
  assert.deepEqual(todoBadge([t(50), t(72)], now), { red: 0, normal: 2, app: 2 });
  assert.deepEqual(todoBadge([t(-5), t(24), t(50)], now), { red: 2, normal: 0, app: 3 });
});

test('overdue days count by the 4am boundary', () => {
  const now = at('2026-11-04T05:00:00');
  assert.equal(overdueDays({ dueAt: at('2026-11-04T04:30:00'), completedAt: null }, now), 0);
  assert.equal(overdueDays({ dueAt: at('2026-11-04T03:30:00'), completedAt: null }, now), 1);
  assert.equal(overdueDays({ dueAt: at('2026-11-05T03:30:00'), completedAt: null }, now), null);
  assert.equal(overdueDays({ dueAt: null, completedAt: null }, now), null);
});

test('todo visibility filter', () => {
  const now = at('2026-11-04T12:00:00');
  const open = { id: 'open', completedAt: null };
  const today = { id: 'today', completedAt: at('2026-11-04T05:00:00') };
  const old = { id: 'old', completedAt: at('2026-11-04T03:00:00') };
  const ids = (f) => visibleTodos([open, today, old], f, now).map((x) => x.id);
  assert.deepEqual(ids({ showOpen: true, showDone: false }), ['open', 'today']);
  assert.deepEqual(ids({ showOpen: false, showDone: true }), ['today', 'old']);
  assert.deepEqual(ids({ showOpen: true, showDone: true }), ['open', 'today', 'old']);
  assert.deepEqual(ids({ showOpen: false, showDone: false }), []);
});

test('todo sorting', () => {
  const state = {
    categories: [{ id: 'c1', sortOrder: 0 }, { id: 'c2', sortOrder: 1 }],
    subjects: [{ id: 's1', categoryId: 'c2' }, { id: 's2', categoryId: 'c1' }, { id: 's3', categoryId: null }],
  };
  const todos = [
    { id: 'none', subjectId: null, dueAt: 1, createdAt: 1 },
    { id: 'noDue', subjectId: 's1', dueAt: null, createdAt: 2 },
    { id: 'late', subjectId: 's1', dueAt: 50, createdAt: 3 },
    { id: 'first', subjectId: 's2', dueAt: 90, createdAt: 4 },
    { id: 'plain', subjectId: 's3', dueAt: 2, createdAt: 5 },
  ];
  const ids = (s) => sortTodos(state, todos, s).map((x) => x.id);
  assert.deepEqual(ids('due'), ['none', 'plain', 'late', 'first', 'noDue']);
  assert.deepEqual(ids('category'), ['first', 'late', 'noDue', 'plain', 'none']);
  assert.deepEqual(ids('newest'), ['plain', 'first', 'late', 'noDue', 'none']);
  assert.deepEqual(ids('oldest'), ['none', 'noDue', 'late', 'first', 'plain']);
});

function pomo(events, cfg = { studyMin: 25, breakMin: 5, sets: 2 }) {
  return { mode: 'pomodoro', pomodoro: cfg, events: events.map(([type, at]) => ({ type, at })) };
}

test('pomodoro advances while away and the last set has no break', () => {
  const s = pomo([['start', 0]]);
  let c = computeSession(s, 10 * MIN);
  assert.equal(c.phase, 'study');
  assert.equal(c.set, 1);
  assert.equal(c.leftMs, 15 * MIN);
  assert.equal(c.totalLeftMs, 45 * MIN);
  c = computeSession(s, 27 * MIN);
  assert.equal(c.phase, 'break');
  assert.equal(c.leftMs, 3 * MIN);
  c = computeSession(s, 30 * MIN);
  assert.equal(c.phase, 'study');
  assert.equal(c.set, 2);
  c = computeSession(s, 100 * MIN);
  assert.equal(c.ended, true);
  assert.equal(c.endedAt, 55 * MIN);
  assert.equal(c.studyMs, 50 * MIN);
  assert.equal(c.breakMs, 5 * MIN);
});

test('pause counts as break and pushes the end back', () => {
  const s = pomo([['start', 0], ['pause', 10 * MIN], ['resume', 20 * MIN]]);
  const c = computeSession(s, 25 * MIN);
  assert.equal(c.phase, 'study');
  assert.equal(c.leftMs, 10 * MIN);
  assert.equal(c.studyMs, 15 * MIN);
  assert.equal(c.breakMs, 10 * MIN);
  const paused = computeSession(pomo([['start', 0], ['pause', 10 * MIN]]), 500 * MIN);
  assert.equal(paused.ended, false);
  assert.equal(paused.paused, true);
  assert.equal(paused.leftMs, 15 * MIN);
});

test('skipBreak starts the next study right away and is ignored during study', () => {
  const s = pomo([['start', 0], ['skipBreak', 26 * MIN]]);
  const c = computeSession(s, 27 * MIN);
  assert.equal(c.phase, 'study');
  assert.equal(c.set, 2);
  assert.equal(c.leftMs, 24 * MIN);
  assert.equal(c.breakMs, 1 * MIN);
  const ignored = computeSession(pomo([['start', 0], ['skipBreak', 5 * MIN]]), 6 * MIN);
  assert.equal(ignored.set, 1);
  assert.equal(ignored.studyMs, 6 * MIN);
});

test('stop ends at that moment', () => {
  const c = computeSession(pomo([['start', 0], ['stop', 7 * MIN]]), 60 * MIN);
  assert.equal(c.ended, true);
  assert.equal(c.endedAt, 7 * MIN);
  assert.equal(c.studyMs, 7 * MIN);
});

test('zero-length break is skipped', () => {
  const c = computeSession(pomo([['start', 0]], { studyMin: 10, breakMin: 0, sets: 2 }), 15 * MIN);
  assert.equal(c.set, 2);
  assert.equal(c.breakMs, 0);
  assert.equal(c.studyMs, 15 * MIN);
});

test('stopwatch: running is study, paused is break', () => {
  const events = [['start', 0], ['pause', 5 * MIN], ['resume', 7 * MIN]].map(([type, t]) => ({ type, at: t }));
  const c = computeSession({ mode: 'stopwatch', pomodoro: null, events }, 10 * MIN);
  assert.equal(c.studyMs, 8 * MIN);
  assert.equal(c.breakMs, 2 * MIN);
  assert.equal(c.ended, false);
  const stopped = computeSession({ mode: 'stopwatch', pomodoro: null, events: [...events, { type: 'stop', at: 10 * MIN }] }, 99 * MIN);
  assert.equal(stopped.ended, true);
  assert.equal(stopped.studyMs, 8 * MIN);
});

test('share text follows the requested format', () => {
  const L = { title: '勉強記録', subject: '科目', start: '開始時刻', study: '勉強時間', sep: '　' };
  const text = studyShareText({ subject: '微分積分学', startAt: at('2026-11-04T17:23:00'), studySeconds: 48 * 60 + 59, memo: '斉次方程式の解き方をパターン別で勉強した。\n' }, L);
  assert.equal(text, '勉強記録\n科目　微分積分学\n開始時刻　17:23\n勉強時間　00:48\n斉次方程式の解き方をパターン別で勉強した。');
  const noMemo = studyShareText({ subject: '英語', startAt: at('2026-11-04T09:05:00'), studySeconds: 125 * 60, memo: '  ' }, L);
  assert.equal(noMemo, '勉強記録\n科目　英語\n開始時刻　09:05\n勉強時間　02:05');
});
