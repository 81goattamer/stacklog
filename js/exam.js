import { store } from './app-store.js';
import { dayDiff, examStudySeconds } from './calc.js';
import { uid, visibleSubjects } from './store.js';
import { t } from './i18n.js';
import { h, icon, iconButton, actionMenu, blobUrl, colorDot, confirmDialog, empty, formatDate, formatDuration, openSheet, toast, todayKey } from './ui.js';
import { pickImage } from './images.js';
import { checkList, dateField, field, parseNumber, seg, switchRow, toggled } from './fields.js';
import { lineChart } from './chart.js';
import { openSubjectMilestones, subjectMilestones } from './subject.js';

export function milestonesOf(examId) {
  return store.state.milestones.filter((m) => m.examId === examId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function attemptsOf(examId) {
  return store.state.examAttempts.filter((a) => a.examId === examId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// 受験記録の結果の短い表示
// empty: 結果が未登録のときの表示（null なら何も出さない）
export function attemptResult(exam, a, { empty = t('exam.pending') } = {}) {
  const parts = [];
  if (exam.hasScore && a.totalScore != null) parts.push(exam.maxScore != null ? `${a.totalScore} / ${exam.maxScore}` : String(a.totalScore));
  if (exam.hasPassFail && a.passed != null) parts.push(t(a.passed ? 'exam.pass' : 'exam.fail'));
  return parts.length ? parts.join(' · ') : empty;
}

// ---- 試験の作成・編集（POP-35） ----

// 試験のアイコン。画像がなければ試験のマークを出す
export function examIcon(exam, cls = '') {
  return h('div', { class: `exam-icon ${cls}` },
    exam.iconImage ? h('img', { src: blobUrl(exam.iconImage), alt: '', draggable: 'false' }) : icon('file', { size: 22 }));
}

// 正方形のアイコン画像を選ぶ欄
function iconPicker(blob, onChange) {
  const choose = () => pickImage(onChange, () => toast(t('subject.imageError')), 1);
  return h('div', { class: 'icon-field' },
    h('button', { type: 'button', class: 'cover-btn', 'aria-label': t('subject.imageChoose'), onClick: choose },
      examIcon({ iconImage: blob }, 'exam-icon-edit')),
    h('div', { class: 'icon-actions' },
      h('button', { type: 'button', class: 'text-btn', onClick: choose }, t(blob ? 'subject.imageChange' : 'subject.imageChoose')),
      blob ? h('button', { type: 'button', class: 'text-btn danger-text', onClick: () => onChange(null) }, t('subject.imageRemove')) : null));
}

export function openExamForm(id = null) {
  const cur = id ? store.get('exams', id) : null;
  const f = {
    id,
    name: cur?.name ?? '',
    hasScore: cur?.hasScore ?? true,
    maxScore: cur?.maxScore ?? null,
    sections: structuredClone(cur?.sections ?? []),
    hasPassFail: cur?.hasPassFail ?? false,
    subjectIds: [...(cur?.subjectIds ?? [])],
    milestones: id ? milestonesOf(id).map((m) => ({ id: m.id, content: m.content })) : [],
    favorite: cur?.favorite ?? false,
    iconImage: cur?.iconImage ?? null,
  };
  let err = '';
  const sheet = openSheet({
    title: t(id ? 'exam.edit' : 'exam.add'),
    full: true,
    // 右上の星で大事な試験にする（保存したときに反映）
    headerRight: (api) => h('button', {
      type: 'button',
      class: `icon-btn fav ${f.favorite ? 'on' : ''}`,
      'aria-label': t('exam.favorite'),
      'aria-pressed': f.favorite ? 'true' : 'false',
      title: t('exam.favorite'),
      onClick: () => { f.favorite = !f.favorite; api.refreshHead(); },
    }, icon('star', { fill: f.favorite })),
    render: () => {
      const subjects = visibleSubjects(store.state);
      for (const sid of f.subjectIds) {
        const s = store.get('subjects', sid);
        if (s && !subjects.includes(s)) subjects.push(s);
      }
      const save = () => {
        const max = parseNumber(f.maxText ?? f.maxScore);
        if (Number.isNaN(max) || (max != null && max < 0)) {
          err = t('exam.scoreInvalid');
          sheet.refresh();
          return;
        }
        const r = store.saveExam({ ...f, maxScore: max });
        if (r.ok) sheet.close();
        else {
          err = t('common.required');
          sheet.refresh();
        }
      };
      return h('div', { class: 'form' },
        field(t('exam.name'), h('input', { class: 'input', value: f.name, placeholder: t('exam.namePlaceholder'), onInput: (e) => { f.name = e.target.value; } })),
        field(t('field.icon'), iconPicker(f.iconImage, (blob) => { f.iconImage = blob; sheet.refresh(); })),
        switchRow(t('exam.hasScore'), f.hasScore, (v) => {
          f.hasScore = v;
          if (!v) f.hasPassFail = true;
          sheet.refresh();
        }),
        f.hasScore ? field(t('exam.maxScore'), h('input', {
          class: 'input',
          type: 'number',
          inputmode: 'decimal',
          min: 0,
          value: f.maxText ?? (f.maxScore == null ? '' : String(f.maxScore)),
          onInput: (e) => { f.maxText = e.target.value; },
        })) : null,
        f.hasScore ? field(t('exam.sections'),
          f.sections.map((c, i) => h('div', { class: 'section-row' },
            h('input', { class: 'input grow', value: c.name, placeholder: t('exam.sectionName'), onInput: (e) => { c.name = e.target.value; } }),
            h('input', { class: 'input num', type: 'number', inputmode: 'decimal', min: 0, value: String(c.maxScore ?? ''), placeholder: t('exam.sectionMax'), 'aria-label': t('exam.sectionMax'), onInput: (e) => { c.maxScore = Number(e.target.value) || 0; } }),
            iconButton('close', t('common.delete'), () => { f.sections.splice(i, 1); sheet.refresh(); }, 'danger'))),
          h('button', { type: 'button', class: 'text-btn left', onClick: () => { f.sections.push({ id: uid(), name: '', maxScore: 0 }); sheet.refresh(); } }, `＋ ${t('exam.sections')}`)) : null,
        switchRow(t('exam.hasPassFail'), f.hasPassFail, (v) => { f.hasPassFail = v; sheet.refresh(); }, !f.hasScore),
        field(t('exam.milestones'),
          f.milestones.map((m, i) => h('div', { class: 'section-row' },
            h('input', { class: 'input grow', value: m.content, placeholder: t('exam.milestoneNew'), onInput: (e) => { m.content = e.target.value; } }),
            iconButton('close', t('common.delete'), () => { f.milestones.splice(i, 1); sheet.refresh(); }, 'danger'))),
          h('button', { type: 'button', class: 'text-btn left', onClick: () => { f.milestones.push({ content: '' }); sheet.refresh(); } }, `＋ ${t('exam.milestones')}`)),
        field(t('exam.subjects'), subjects.length
          ? checkList(subjects.map((s) => ({ id: s.id, name: s.name })), f.subjectIds, (sid) => { f.subjectIds = toggled(f.subjectIds, sid); sheet.refresh(); })
          : h('p', { class: 'muted small' }, t('exam.noSubjects'))),
        err ? h('p', { class: 'error' }, err) : null,
        h('button', { type: 'button', class: 'btn primary block', onClick: save }, t('common.save')));
    },
  });
}

// ---- 試験詳細（SCR-36） ----

export function openExamDetail(id) {
  let metric = 'total';
  const sheet = openSheet({
    title: store.get('exams', id)?.name,
    full: true,
    headerRight: () => iconButton('more', t('common.menu'), () => actionMenu(store.get('exams', id).name, [
      { label: t('common.edit'), icon: 'edit', onClick: () => openExamForm(id) },
      {
        label: t('common.delete'),
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const exam = store.get('exams', id);
          if (await confirmDialog({ message: t('exam.deleteConfirm', { name: exam.name }), okLabel: t('common.delete'), danger: true })) {
            sheet.close();
            store.deleteExam(id);
          }
        },
      },
    ])),
    render: (api) => {
      const exam = store.get('exams', id);
      if (!exam) {
        api.close();
        return h('div');
      }
      api.setTitle(exam.name);
      if (!exam.sections.some((c) => c.id === metric)) metric = 'total';
      const attempts = attemptsOf(id);
      const milestones = milestonesOf(id);
      const linked = exam.subjectIds.map((sid) => store.get('subjects', sid)).filter(Boolean);
      return h('div', {},
        exam.hasScore ? scoreBlock(exam, attempts, metric, (v) => { metric = v; api.refresh(); }) : null,
        h('div', { class: 'stat card' },
          h('div', { class: 'sub' }, t('exam.studyTotal')),
          h('div', { class: 'stat-value' }, formatDuration(examStudySeconds(store.state, exam))),
          linked.length ? h('div', { class: 'sub linked' }, linked.map((s) => h('span', { class: 'linked-item' }, colorDot(s.color), s.name))) : null),
        h('div', { class: 'section-head' },
          h('h3', {}, t(exam.hasScore ? 'exam.attempts' : 'exam.results')),
          iconButton('plus', t('exam.attemptAdd'), () => openAttemptAdd(id))),
        attempts.length
          ? h('div', { class: 'card list outlined' }, attempts.map((a) => h('button', { type: 'button', class: 'list-row', onClick: () => openAttemptDetail(a.id) },
            h('span', { class: 'grow' }, formatDate(a.date), a.date > todayKey() ? h('small', { class: 'sub block' }, countdown(a.date)) : null),
            h('span', { class: 'attempt-result' }, attemptResult(exam, a)),
            icon('chevron', { size: 16 }))))
          : h('p', { class: 'muted small pad' }, t('exam.noAttempts')),
        h('div', { class: 'section-head' }, h('h3', {}, t('exam.milestones'))),
        milestones.length
          ? h('div', { class: 'card list outlined' }, orderMilestones(milestones).map((m) => milestoneRow(m)))
          : h('p', { class: 'muted small pad' }, t('exam.noMilestones')));
    },
  });
}

function countdown(date) {
  return t('exam.daysLeft', { n: dayDiff(date, todayKey()) });
}

function scoreBlock(exam, attempts, metric, onMetric) {
  const scoreOf = (a) => (metric === 'total' ? a.totalScore : a.sectionScores[metric] ?? null);
  const points = attempts.filter((a) => scoreOf(a) != null).reverse().map((a) => ({
    date: a.date,
    score: scoreOf(a),
    label: `${formatDate(a.date)}  ${scoreOf(a)}`,
  }));
  const max = metric === 'total' ? exam.maxScore : exam.sections.find((c) => c.id === metric)?.maxScore;
  return h('div', { class: 'chart-card card' },
    h('div', { class: 'chart-title' }, t('exam.trend')),
    exam.sections.length
      ? seg([['total', t('exam.total')], ...exam.sections.map((c) => [c.id, c.name])], metric, onMetric, 'small')
      : null,
    points.length
      ? lineChart(points, { max: max || null, shortDate: (d) => formatDate(d) })
      : h('p', { class: 'muted small pad' }, t('exam.noScores')));
}

export function orderMilestones(list) {
  return [...list.filter((m) => !m.achievedDate), ...list.filter((m) => m.achievedDate)];
}

export function milestoneRow(m, onClick = null) {
  const done = !!m.achievedDate;
  const body = [
    h('span', { class: `gem ${done ? 'on' : ''}` }, icon('gem', { size: 16 })),
    h('span', { class: 'grow' }, m.content, done ? h('small', { class: 'sub block' }, t('exam.achievedOn', { date: formatDate(m.achievedDate) })) : null),
  ];
  return onClick
    ? h('button', { type: 'button', class: 'list-row', onClick }, ...body, icon('chevron', { size: 16 }))
    : h('div', { class: 'list-row' }, ...body);
}

// ---- 受験記録 ----

function openAttemptAdd(examId) {
  const f = { date: todayKey(), targetMilestoneIds: [] };
  let err = '';
  const sheet = openSheet({
    title: t('exam.attemptAdd'),
    render: () => {
      const open = milestonesOf(examId).filter((m) => !m.achievedDate);
      return h('div', { class: 'form' },
        field(t('exam.date'), dateField(f.date, (v) => { f.date = v; })),
        field(t('exam.targets'), open.length
          ? checkList(open.map((m) => ({ id: m.id, name: m.content })), f.targetMilestoneIds, (id) => { f.targetMilestoneIds = toggled(f.targetMilestoneIds, id); sheet.refresh(); })
          : h('p', { class: 'muted small' }, t('exam.noTargets'))),
        err ? h('p', { class: 'error' }, err) : null,
        h('button', {
          type: 'button',
          class: 'btn primary block',
          onClick: () => {
            const r = store.addAttempt({ examId, ...f });
            if (r.ok) sheet.close();
            else {
              err = t('exam.dateInvalid');
              sheet.refresh();
            }
          },
        }, t('common.add')));
    },
  });
}

// 結果の登録（POP-38）
function openAttemptDetail(id) {
  const a = store.get('examAttempts', id);
  const exam = store.get('exams', a.examId);
  const achievedNow = store.state.milestones.filter((m) => m.achievedAttemptId === id).map((m) => m.id);
  const f = {
    date: a.date,
    targetMilestoneIds: [...a.targetMilestoneIds],
    achievedIds: achievedNow,
    sectionText: Object.fromEntries(exam.sections.map((c) => [c.id, a.sectionScores[c.id] == null ? '' : String(a.sectionScores[c.id])])),
    totalText: a.totalScore == null ? '' : String(a.totalScore),
    passed: a.passed,
  };
  let err = '';
  const parseAll = () => {
    const sectionScores = {};
    for (const c of exam.sections) {
      const v = parseNumber(f.sectionText[c.id]);
      if (Number.isNaN(v)) return null;
      if (v != null) sectionScores[c.id] = v;
    }
    const totalScore = parseNumber(f.totalText);
    if (Number.isNaN(totalScore)) return null;
    return { sectionScores, totalScore };
  };
  const sheet = openSheet({
    title: t('exam.attemptDetail'),
    full: true,
    render: () => {
      // 選べるのは未達成のものと、この受験で達成したもの
      const options = milestonesOf(a.examId).filter((m) => !m.achievedAttemptId || m.achievedAttemptId === id);
      const sum = () => {
        const p = parseAll();
        const vals = p ? Object.values(p.sectionScores) : [];
        return vals.length ? vals.reduce((x, y) => x + y, 0) : '—';
      };
      const totalEl = h('div', { class: 'sub' }, t('exam.totalAuto', { n: sum() }));
      return h('div', { class: 'form' },
        field(t('exam.date'), dateField(f.date, (v) => { f.date = v; })),
        exam.hasScore && exam.sections.length
          ? field(t('exam.score'),
            exam.sections.map((c) => h('label', { class: 'score-row' },
              h('span', { class: 'grow' }, c.name, h('small', { class: 'sub' }, ` / ${c.maxScore}`)),
              h('input', {
                class: 'input num',
                type: 'number',
                inputmode: 'decimal',
                min: 0,
                max: c.maxScore,
                value: f.sectionText[c.id],
                onInput: (e) => {
                  f.sectionText[c.id] = e.target.value;
                  totalEl.textContent = t('exam.totalAuto', { n: sum() });
                },
              }))),
            totalEl)
          : null,
        exam.hasScore && !exam.sections.length
          ? field(`${t('exam.score')}${exam.maxScore != null ? ` / ${exam.maxScore}` : ''}`, h('input', {
            class: 'input',
            type: 'number',
            inputmode: 'decimal',
            min: 0,
            value: f.totalText,
            onInput: (e) => { f.totalText = e.target.value; },
          }))
          : null,
        exam.hasPassFail
          ? field(t('exam.passFail'), seg([['unset', t('exam.unset')], ['pass', t('exam.pass')], ['fail', t('exam.fail')]],
            f.passed == null ? 'unset' : f.passed ? 'pass' : 'fail',
            (v) => { f.passed = v === 'unset' ? null : v === 'pass'; sheet.refresh(); }, 'wide'))
          : null,
        field(t('exam.targets'), options.length
          ? h('div', { class: 'pick-list' }, options.map((m) => {
            const target = f.targetMilestoneIds.includes(m.id);
            const done = f.achievedIds.includes(m.id);
            return h('div', { class: 'target-row' },
              h('button', {
                type: 'button',
                class: 'pick-row',
                role: 'checkbox',
                'aria-checked': target ? 'true' : 'false',
                onClick: () => {
                  f.targetMilestoneIds = toggled(f.targetMilestoneIds, m.id);
                  if (!f.targetMilestoneIds.includes(m.id)) f.achievedIds = f.achievedIds.filter((x) => x !== m.id);
                  sheet.refresh();
                },
              }, h('span', { class: `check ${target ? 'on' : ''}` }, target ? icon('check', { size: 14 }) : null), h('span', { class: 'grow' }, m.content)),
              target ? h('label', { class: 'achieved' },
                h('input', { type: 'checkbox', checked: done, onChange: (e) => { f.achievedIds = e.target.checked ? [...f.achievedIds, m.id] : f.achievedIds.filter((x) => x !== m.id); } }),
                t('exam.achieved')) : null);
          }))
          : h('p', { class: 'muted small' }, t('exam.noTargets'))),
        err ? h('p', { class: 'error' }, err) : null,
        h('button', {
          type: 'button',
          class: 'btn primary block',
          onClick: () => {
            const p = parseAll();
            const r = p ? store.updateAttempt(id, { ...f, ...p }) : { ok: false, error: 'score' };
            if (r.ok) sheet.close();
            else {
              err = t(r.error === 'date' ? 'exam.dateInvalid' : 'exam.scoreInvalid');
              sheet.refresh();
            }
          },
        }, t('common.save')),
        h('button', {
          type: 'button',
          class: 'btn danger block',
          onClick: async () => {
            if (await confirmDialog({ message: t('exam.attemptDeleteConfirm'), okLabel: t('common.delete'), danger: true })) {
              sheet.close();
              store.deleteAttempt(id);
            }
          },
        }, t('common.delete')));
    },
  });
}

// ---- マイルストーン一覧（SCR-39） ----

export function openMilestoneList() {
  openSheet({
    title: t('exam.gem'),
    full: true,
    render: () => {
      // 試験のものを先に、続けて科目のものを出す
      const groups = [
        ...store.state.exams.map((e) => ({ name: e.name, list: milestonesOf(e.id), open: () => openExamDetail(e.id) })),
        ...visibleSubjects(store.state).map((s) => ({ name: s.name, color: s.color, list: subjectMilestones(s.id), open: () => openSubjectMilestones(s.id) })),
      ].filter((g) => g.list.length);
      if (!groups.length) return empty(t('exam.noMilestones'), 'gem');
      return h('div', {}, groups.map((g) => h('section', { class: 'group' },
        h('h3', { class: 'group-label with-dot' }, g.color ? colorDot(g.color) : null, g.name),
        h('div', { class: 'card list outlined' }, orderMilestones(g.list).map((m) => milestoneRow(m, g.open))))));
    },
  });
}
