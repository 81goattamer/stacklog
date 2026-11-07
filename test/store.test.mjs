import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, memoryRepo, recordsCsv, candidateTodos, visibleSubjects, dataUrlToBlob } from '../js/store.js';
import { GRAY, PALETTE } from '../js/calc.js';

const at = (s) => new Date(s).getTime();

function setup(start = '2026-11-04T12:00:00') {
  const clock = { t: at(start) };
  const ops = [];
  const repo = { ...memoryRepo(), write: (o) => ops.push(...o) };
  const st = new Store({ repo, now: () => clock.t });
  return { st, clock, ops };
}

test('new subject takes the category color; uncategorized is gray', () => {
  const { st } = setup();
  const cat = st.addCategory({ name: '語学', themeColor: PALETTE[0] }).id;
  const a = st.get('subjects', st.addSubject({ categoryId: cat, name: '英語' }).id);
  const b = st.get('subjects', st.addSubject({ name: '数学' }).id);
  assert.equal(a.color, PALETTE[0]);
  assert.equal(a.status, 'studying');
  assert.equal(b.color, GRAY);
});

test('category color change only reaches subjects whose color was never changed', () => {
  const { st } = setup();
  const cat = st.addCategory({ name: 'c', themeColor: PALETTE[0] }).id;
  const kept = st.addSubject({ categoryId: cat, name: 'a' }).id;
  const custom = st.addSubject({ categoryId: cat, name: 'b' }).id;
  st.updateSubject(custom, { color: PALETTE[5] });
  st.updateCategory(cat, { name: 'c', themeColor: PALETTE[3] });
  assert.equal(st.get('subjects', kept).color, PALETTE[3]);
  assert.equal(st.get('subjects', custom).color, PALETTE[5]);
});

test('moving a subject keeps its color, then it follows the new category (Q11)', () => {
  const { st } = setup();
  const c1 = st.addCategory({ name: '1', themeColor: PALETTE[0] }).id;
  const c2 = st.addCategory({ name: '2', themeColor: PALETTE[1] }).id;
  const s = st.addSubject({ categoryId: c1, name: 'a' }).id;
  st.updateSubject(s, { categoryId: c2 });
  assert.equal(st.get('subjects', s).color, PALETTE[0]);
  st.updateCategory(c2, { name: '2', themeColor: PALETTE[2] });
  assert.equal(st.get('subjects', s).color, PALETTE[2]);
});

test('reset color follows the category again (Q12)', () => {
  const { st } = setup();
  const c = st.addCategory({ name: '1', themeColor: PALETTE[0] }).id;
  const s = st.addSubject({ categoryId: c, name: 'a' }).id;
  st.updateSubject(s, { color: PALETTE[4] });
  st.resetSubjectColor(s);
  assert.equal(st.get('subjects', s).color, PALETTE[0]);
  assert.equal(st.get('subjects', s).colorCustomized, false);
});

test('categories can be moved up and down, ends are ignored', () => {
  const { st } = setup();
  const [a, b, c] = ['A', 'B', 'C'].map((name) => st.addCategory({ name, themeColor: PALETTE[0] }).id);
  const order = () => [...st.state.categories].sort((x, y) => x.sortOrder - y.sortOrder).map((x) => x.name).join('');
  st.moveCategory(c, -1);
  assert.equal(order(), 'ACB');
  st.moveCategory(a, 1);
  assert.equal(order(), 'CAB');
  st.moveCategory(c, -1);
  st.moveCategory(b, 1);
  assert.equal(order(), 'CAB');
  st.deleteCategory(a);
  st.moveCategory(b, -1);
  assert.equal(order(), 'BC');
});

test('deleting a category moves subjects to no category and keeps their color', () => {
  const { st } = setup();
  const c = st.addCategory({ name: '1', themeColor: PALETTE[0] }).id;
  const s = st.addSubject({ categoryId: c, name: 'a' }).id;
  st.deleteCategory(c);
  assert.equal(st.get('subjects', s).categoryId, null);
  assert.equal(st.get('subjects', s).color, PALETTE[0]);
});

test('hide keeps records and todos; restore brings it back', () => {
  const { st, clock } = setup();
  const s = st.addSubject({ name: 'a' }).id;
  st.addTodo({ subjectId: s, content: 't' });
  st.addManualRecord({ subjectId: s, startAt: clock.t, studySeconds: 600 });
  st.hideSubject(s);
  assert.equal(visibleSubjects(st.state).length, 0);
  assert.equal(st.state.records.length, 1);
  assert.equal(st.state.todos.length, 1);
  st.restoreSubject(s);
  assert.equal(visibleSubjects(st.state, 'studying').length, 1);
});

test('purge removes records, todos and links', () => {
  const { st, clock } = setup();
  const s = st.addSubject({ name: 'a' }).id;
  const other = st.addSubject({ name: 'b' }).id;
  const todo = st.addTodo({ subjectId: s, content: 't' }).id;
  st.addManualRecord({ subjectId: s, startAt: clock.t, studySeconds: 600 });
  const keep = st.addManualRecord({ subjectId: other, todoIds: [todo], startAt: clock.t, studySeconds: 600 }).id;
  const exam = st.saveExam({ name: 'TOEIC', hasScore: true, subjectIds: [s, other] }).id;
  st.purgeSubject(s);
  assert.equal(st.get('subjects', s), null);
  assert.equal(st.state.todos.length, 0);
  assert.deepEqual(st.state.records.map((r) => r.id), [keep]);
  assert.deepEqual(st.get('records', keep).todoIds, []);
  assert.deepEqual(st.get('exams', exam).subjectIds, [other]);
});

test('candidate todos: subject only when chosen, all open ones otherwise', () => {
  const { st } = setup();
  const s = st.addSubject({ name: 'a' }).id;
  const t1 = st.addTodo({ subjectId: s, content: '1' }).id;
  st.addTodo({ content: '2' });
  const t3 = st.addTodo({ content: '3' }).id;
  st.setTodoDone(t3, true);
  assert.deepEqual(candidateTodos(st.state, s).map((t) => t.id), [t1]);
  assert.equal(candidateTodos(st.state, null).length, 2);
});

test('manual record computes dayKey at the 4am boundary and completes todos', () => {
  const { st } = setup();
  const t = st.addTodo({ content: 't' }).id;
  const id = st.addManualRecord({ todoIds: [t], startAt: at('2026-11-04T03:59:00'), studySeconds: 3600 }).id;
  assert.equal(st.get('records', id).dayKey, '2026-11-03');
  assert.equal(st.get('records', id).mode, 'manual');
  assert.notEqual(st.get('todos', t).completedAt, null);
  st.updateRecord(id, { startAt: at('2026-11-04T04:00:00'), studySeconds: 60, breakSeconds: 0 });
  assert.equal(st.get('records', id).dayKey, '2026-11-04');
  assert.equal(st.addManualRecord({ startAt: at('2026-11-04T04:00:00'), studySeconds: 0 }).error, 'time');
});

test('deleting a record keeps todo completion (Q4)', () => {
  const { st, clock } = setup();
  const t = st.addTodo({ content: 't' }).id;
  const id = st.addManualRecord({ todoIds: [t], startAt: clock.t, studySeconds: 60 }).id;
  st.deleteRecord(id);
  assert.notEqual(st.get('todos', t).completedAt, null);
});

test('pomodoro session ends by itself and links selected and completed todos (Q2)', () => {
  const { st, clock } = setup();
  const s = st.addSubject({ name: 'a' }).id;
  const sel = st.addTodo({ subjectId: s, content: 'sel' }).id;
  const done = st.addTodo({ subjectId: s, content: 'done' }).id;
  st.startSession({ mode: 'pomodoro', subjectId: s, selectedTodoIds: [sel], pomodoro: { studyMin: 10, breakMin: 5, sets: 2 } });
  assert.deepEqual(st.state.settings.lastPomodoro, { studyMin: 10, breakMin: 5, sets: 2 });
  st.toggleSessionTodo(done);
  clock.t += 26 * 60_000;
  assert.equal(st.syncSession(), true);
  const a = st.state.activeSession;
  assert.equal(a.status, 'ended');
  assert.equal(a.result.studySeconds, 20 * 60);
  assert.equal(a.result.breakSeconds, 5 * 60);
  assert.deepEqual(a.result.todoIds, [sel, done]);
  assert.equal(st.saveSession().ok, true);
  assert.equal(st.state.activeSession, null);
  assert.equal(st.state.records[0].mode, 'pomodoro');
});

test('discarding reverts only todos completed during the session', () => {
  const { st } = setup();
  const before = st.addTodo({ content: 'before' }).id;
  st.setTodoDone(before, true);
  const during = st.addTodo({ content: 'during' }).id;
  st.startSession({ mode: 'stopwatch' });
  st.toggleSessionTodo(during);
  st.discardSession();
  assert.equal(st.state.activeSession, null);
  assert.equal(st.get('todos', during).completedAt, null);
  assert.notEqual(st.get('todos', before).completedAt, null);
  assert.equal(st.state.records.length, 0);
});

test('session survives a reload from what was written', () => {
  const { st, clock, ops } = setup();
  st.startSession({ mode: 'stopwatch' });
  clock.t += 60_000;
  st.sessionEvent('pause');
  const last = ops.filter((o) => o.table === 'activeSession').at(-1);
  const repo = memoryRepo();
  repo.tables.activeSession = [structuredClone(last.row)];
  const st2 = new Store({ repo, now: () => clock.t });
  assert.equal(st2.state.activeSession.status, 'paused');
});

test('only one session at a time; result edits are kept', () => {
  const { st, clock } = setup();
  st.startSession({ mode: 'stopwatch' });
  assert.equal(st.startSession({ mode: 'stopwatch' }).error, 'active');
  clock.t += 120_000;
  st.sessionEvent('stop');
  st.updateResult({ studySeconds: 30 }, { silent: true });
  st.saveSession();
  assert.equal(st.state.records[0].studySeconds, 30);
});

test('exam: total is summed from sections, limits are checked, milestones track achievement', () => {
  const { st } = setup();
  const exam = st.saveExam({
    name: 'TOEIC',
    hasScore: true,
    maxScore: 990,
    hasPassFail: false,
    sections: [{ id: 'L', name: 'L', maxScore: 495 }, { id: 'R', name: 'R', maxScore: 495 }],
    milestones: [{ content: '800点' }, { content: '900点' }],
  }).id;
  const [m1, m2] = st.state.milestones.map((m) => m.id);
  const a = st.addAttempt({ examId: exam, date: '2026-12-01', targetMilestoneIds: [m1, m2] }).id;
  assert.equal(st.updateAttempt(a, { date: '2026-12-01', sectionScores: { L: 500 } }).error, 'score');
  st.updateAttempt(a, { date: '2026-12-01', sectionScores: { L: 400, R: 410 }, achievedIds: [m1] });
  const row = st.get('examAttempts', a);
  assert.equal(row.totalScore, 810);
  assert.equal(st.get('milestones', m1).achievedDate, '2026-12-01');
  assert.equal(st.get('milestones', m2).achievedDate, null);

  // 達成済みは次の受験で選べない
  const b = st.addAttempt({ examId: exam, date: '2027-01-01', targetMilestoneIds: [m1, m2] }).id;
  assert.deepEqual(st.get('examAttempts', b).targetMilestoneIds, [m2]);

  // 日付を変えると達成日も変わる
  st.updateAttempt(a, { date: '2026-12-02', sectionScores: { L: 400, R: 410 }, achievedIds: [m1] });
  assert.equal(st.get('milestones', m1).achievedDate, '2026-12-02');

  st.deleteAttempt(a);
  assert.equal(st.get('milestones', m1).achievedDate, null);

  st.deleteExam(exam);
  assert.equal(st.state.milestones.length, 0);
  assert.equal(st.state.examAttempts.length, 0);
});

test('pass/fail only exam forces hasPassFail and has no score', () => {
  const { st } = setup();
  const id = st.saveExam({ name: '英検', hasScore: false, hasPassFail: false, maxScore: 100, sections: [{ name: 'x', maxScore: 1 }] }).id;
  const e = st.get('exams', id);
  assert.equal(e.hasPassFail, true);
  assert.equal(e.maxScore, null);
  assert.deepEqual(e.sections, []);
  const a = st.addAttempt({ examId: id, date: '2026-12-01' }).id;
  st.updateAttempt(a, { date: '2026-12-01', passed: true, totalScore: 50 });
  assert.equal(st.get('examAttempts', a).passed, true);
  assert.equal(st.get('examAttempts', a).totalScore, null);
});

async function populated() {
  const ctx = setup();
  const { st, clock } = ctx;
  const cat = st.addCategory({ name: '語学', themeColor: PALETTE[0] }).id;
  const png = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=');
  const sub = st.addSubject({ categoryId: cat, name: '英語', iconImage: png }).id;
  const todo = st.addTodo({ subjectId: sub, content: '単語' }).id;
  st.addManualRecord({ subjectId: sub, todoIds: [todo], startAt: clock.t, studySeconds: 600 });
  const exam = st.saveExam({ name: 'TOEIC', hasScore: true, maxScore: 990, milestones: [{ content: '800' }], subjectIds: [sub] }).id;
  st.addAttempt({ examId: exam, date: '2026-12-01', targetMilestoneIds: [st.state.milestones[0].id] });
  st.setSettings({ streakMinMinutes: 45 });
  return ctx;
}

test('backup round trip keeps every table and the image', async () => {
  const { st } = await populated();
  const text = JSON.stringify(await st.exportData());
  const { st: st2 } = setup();
  st2.importOverwrite(st2.parseBackup(text));
  for (const name of ['categories', 'todos', 'records', 'exams', 'milestones', 'examAttempts']) {
    assert.deepEqual(st2.state[name], st.state[name], name);
  }
  assert.equal(st2.state.settings.streakMinMinutes, 45);
  const blob = st2.state.subjects[0].iconImage;
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, st.state.subjects[0].iconImage.size);
});

test('backup excludes the active session; overwrite keeps it', async () => {
  const { st } = await populated();
  st.startSession({ mode: 'stopwatch' });
  const obj = await st.exportData();
  assert.equal('activeSession' in obj.data, false);
  st.importOverwrite(st.parseBackup(JSON.stringify(obj)));
  assert.notEqual(st.state.activeSession, null);
});

test('merge: file wins for the same id, device-only data stays', async () => {
  const { st } = await populated();
  const text = JSON.stringify(await st.exportData());
  const subject = st.state.subjects[0];
  st.updateSubject(subject.id, { name: '端末の変更' });
  const local = st.addTodo({ content: '端末だけ' }).id;
  st.importMerge(st.parseBackup(text));
  assert.equal(st.get('subjects', subject.id).name, '英語');
  assert.notEqual(st.get('todos', local), null);
  assert.equal(st.state.subjects.length, 1);
});

test('bad backups are rejected and leave data alone', async () => {
  const { st } = await populated();
  assert.throws(() => st.parseBackup('{'));
  assert.throws(() => st.parseBackup(JSON.stringify({ app: 'other', schemaVersion: 1, data: {} })));
  assert.throws(() => st.parseBackup(JSON.stringify({ app: 'Stacklog', schemaVersion: 99, data: {} })), /newer/);
  assert.equal(st.state.subjects.length, 1);
});

test('backup repairs broken references', () => {
  const { st } = setup();
  const data = st.parseBackup(JSON.stringify({
    app: 'Stacklog',
    schemaVersion: 1,
    data: {
      subjects: [{ id: 's', name: 'a', categoryId: 'gone' }, { id: 's', name: 'dup' }],
      todos: [{ id: 't', content: 'x', subjectId: 'gone' }],
      records: [{ id: 'r', subjectId: 'gone', todoIds: ['t', 'gone'], startAt: at('2026-11-04T12:00:00'), studySeconds: 60 }, { id: 'bad', startAt: 'x' }],
    },
  }));
  assert.equal(data.subjects.length, 1);
  assert.equal(data.subjects[0].categoryId, null);
  assert.equal(data.todos[0].subjectId, null);
  assert.deepEqual(data.records.map((r) => r.id), ['r']);
  assert.deepEqual(data.records[0].todoIds, ['t']);
  assert.equal(data.records[0].dayKey, '2026-11-04');
});

test('writes are grouped per commit and carry timestamps', () => {
  const { st, ops, clock } = setup();
  const id = st.addSubject({ name: 'a' }).id;
  assert.equal(ops.at(-1).table, 'subjects');
  assert.equal(ops.at(-1).row.createdAt, clock.t);
  clock.t += 1000;
  st.updateSubject(id, { name: 'b' });
  assert.equal(st.get('subjects', id).updatedAt, clock.t);
  assert.notEqual(st.get('subjects', id).createdAt, clock.t);
});

test('csv quotes cells, neutralizes formulas and has a BOM', () => {
  const { st, clock } = setup();
  const s = st.addSubject({ name: '=SUM(A1),"x"' }).id;
  st.addManualRecord({ subjectId: s, startAt: clock.t, studySeconds: 60 });
  const csv = recordsCsv(st.state, {
    header: ['d', 's', 'n', 'c', 't', 'st', 'b', 'm'],
    modeLabel: (m) => m,
    formatStart: () => '12:00',
  });
  assert.ok(csv.startsWith('﻿d,s,n'));
  assert.ok(csv.includes(`"'=SUM(A1),""x"""`));
});

test('memo is kept from the end screen, editable, exported and repaired', async () => {
  const { st, clock } = setup();
  st.startSession({ mode: 'stopwatch' });
  clock.t += 60_000;
  st.sessionEvent('stop');
  assert.equal(st.state.activeSession.result.memo, '');
  st.updateResult({ memo: ' 斉次方程式 ' }, { silent: true });
  const id = st.saveSession().id;
  assert.equal(st.get('records', id).memo, '斉次方程式');
  const r = st.get('records', id);
  st.updateRecord(id, { ...r, memo: '書き直し' });
  assert.equal(st.get('records', id).memo, '書き直し');
  const data = st.parseBackup(JSON.stringify(await st.exportData()));
  assert.equal(data.records[0].memo, '書き直し');
  const old = st.parseBackup(JSON.stringify({ app: 'Stacklog', schemaVersion: 1, data: { records: [{ id: 'r', startAt: clock.t, studySeconds: 60 }] } }));
  assert.equal(old.records[0].memo, '');
  const csv = recordsCsv(st.state, { header: ['h'], modeLabel: (m) => m, formatStart: () => '' });
  assert.ok(csv.includes('書き直し'));
});

test('exam favorite and square icon are saved and survive a backup', async () => {
  const { st } = setup();
  const icon = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=');
  const id = st.saveExam({ name: 'TOEIC', hasScore: true, favorite: true, iconImage: icon }).id;
  assert.equal(st.get('exams', id).favorite, true);
  assert.equal(st.get('exams', id).iconImage.size, icon.size);
  const data = st.parseBackup(JSON.stringify(await st.exportData()));
  assert.equal(data.exams[0].favorite, true);
  assert.equal(data.exams[0].iconImage.type, 'image/png');
  st.saveExam({ id, name: 'TOEIC', hasScore: true, favorite: false, iconImage: null });
  assert.equal(st.get('exams', id).favorite, false);
  assert.equal(st.get('exams', id).iconImage, null);
});
