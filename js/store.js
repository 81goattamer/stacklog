// Stacklog のデータ層。DOMに依存しないので Node からもテストできる。
import { GRAY, computeSession, dayKey, isDateKey, sortedCategories, sortedSubjects } from './calc.js';

export const SCHEMA_VERSION = 1;
export const TABLES = ['categories', 'subjects', 'todos', 'records', 'exams', 'milestones', 'examAttempts'];
export const SESSION_ID = 'current';
export const SETTINGS_ID = 'app';

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function defaultSettings() {
  return {
    id: SETTINGS_ID,
    language: 'auto',
    theme: 'auto',
    streakMinMinutes: 30,
    weekStart: 'sun',
    lastPomodoro: { studyMin: 25, breakMin: 5, sets: 4 },
  };
}

function emptyTables() {
  return Object.fromEntries(TABLES.map((name) => [name, []]));
}

// 保存先。ブラウザでは IndexedDB を使う実装を渡す（db.js）
export function memoryRepo() {
  return {
    tables: { ...emptyTables(), settings: [], activeSession: [] },
    write() {},
    onError: null,
  };
}

const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const isCount = (v) => Number.isFinite(v) && v >= 0;

// ---- バックアップの形を整える ----

// 読み込んだデータの形を整え、壊れた参照を取り除く。画像の変換は呼び出し側で済ませておく
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('invalid');
  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v) => (typeof v === 'string' ? v : '');
  const ms = (v) => (Number.isFinite(v) ? v : null);
  const seen = new Set();
  const idOk = (v) => typeof v === 'string' && v !== '' && !seen.has(v) && seen.add(v);
  const common = (x, i = 0) => ({ createdAt: ms(x.createdAt) ?? i, updatedAt: ms(x.updatedAt) ?? ms(x.createdAt) ?? i });
  const s = emptyTables();

  arr(raw.categories).forEach((c, i) => {
    if (!idOk(c?.id) || !str(c.name).trim()) return;
    s.categories.push({
      id: c.id,
      name: str(c.name).trim(),
      themeColor: isHex(c.themeColor) ? c.themeColor : GRAY,
      sortOrder: Number.isFinite(c.sortOrder) ? c.sortOrder : i,
      ...common(c, i),
    });
  });
  const has = (name, id) => s[name].some((x) => x.id === id);

  arr(raw.subjects).forEach((x, i) => {
    if (!idOk(x?.id) || !str(x.name).trim()) return;
    s.subjects.push({
      id: x.id,
      categoryId: has('categories', x.categoryId) ? x.categoryId : null,
      name: str(x.name).trim(),
      color: isHex(x.color) ? x.color : GRAY,
      colorCustomized: !!x.colorCustomized,
      iconImage: x.iconImage instanceof Blob ? x.iconImage : null,
      status: ['waiting', 'studying', 'finished'].includes(x.status) ? x.status : 'studying',
      hiddenAt: ms(x.hiddenAt),
      sortOrder: Number.isFinite(x.sortOrder) ? x.sortOrder : i,
      ...common(x, i),
    });
  });

  arr(raw.todos).forEach((x, i) => {
    if (!idOk(x?.id) || !str(x.content).trim()) return;
    s.todos.push({
      id: x.id,
      subjectId: has('subjects', x.subjectId) ? x.subjectId : null,
      content: str(x.content).trim(),
      dueAt: ms(x.dueAt),
      completedAt: ms(x.completedAt),
      ...common(x, i),
    });
  });

  arr(raw.records).forEach((x, i) => {
    if (!idOk(x?.id) || !Number.isFinite(x.startAt)) return;
    if (!isCount(x.studySeconds) || !isCount(x.breakSeconds ?? 0)) return;
    s.records.push({
      id: x.id,
      subjectId: has('subjects', x.subjectId) ? x.subjectId : null,
      todoIds: [...new Set(arr(x.todoIds).filter((t) => has('todos', t)))],
      mode: ['pomodoro', 'stopwatch', 'manual'].includes(x.mode) ? x.mode : 'manual',
      startAt: x.startAt,
      studySeconds: Math.round(x.studySeconds),
      breakSeconds: Math.round(x.breakSeconds ?? 0),
      memo: str(x.memo),
      dayKey: dayKey(x.startAt),
      ...common(x, i),
    });
  });

  arr(raw.exams).forEach((x, i) => {
    if (!idOk(x?.id) || !str(x.name).trim()) return;
    const hasScore = x.hasScore !== false;
    s.exams.push({
      id: x.id,
      name: str(x.name).trim(),
      hasScore,
      maxScore: hasScore && isCount(x.maxScore) ? x.maxScore : null,
      sections: hasScore
        ? arr(x.sections).filter((c) => typeof c?.id === 'string' && str(c.name).trim())
          .map((c) => ({ id: c.id, name: str(c.name).trim(), maxScore: isCount(c.maxScore) ? c.maxScore : 0 }))
        : [],
      hasPassFail: !hasScore || !!x.hasPassFail,
      favorite: !!x.favorite,
      iconImage: x.iconImage instanceof Blob ? x.iconImage : null,
      subjectIds: [...new Set(arr(x.subjectIds).filter((id) => has('subjects', id)))],
      ...common(x, i),
    });
  });

  arr(raw.examAttempts).forEach((x, i) => {
    if (!idOk(x?.id) || !isDateKey(x.date)) return;
    const exam = s.exams.find((e) => e.id === x.examId);
    if (!exam) return;
    const scores = {};
    for (const c of exam.sections) if (isCount(x.sectionScores?.[c.id])) scores[c.id] = x.sectionScores[c.id];
    s.examAttempts.push({
      id: x.id,
      examId: x.examId,
      date: x.date,
      targetMilestoneIds: arr(x.targetMilestoneIds).filter((m) => typeof m === 'string'),
      totalScore: exam.hasScore && isCount(x.totalScore) ? x.totalScore : null,
      sectionScores: scores,
      passed: exam.hasPassFail && typeof x.passed === 'boolean' ? x.passed : null,
      ...common(x, i),
    });
  });

  arr(raw.milestones).forEach((x, i) => {
    if (!idOk(x?.id) || !str(x.content).trim() || !has('exams', x.examId)) return;
    const attempt = s.examAttempts.find((a) => a.id === x.achievedAttemptId && a.examId === x.examId);
    s.milestones.push({
      id: x.id,
      examId: x.examId,
      content: str(x.content).trim(),
      achievedDate: attempt ? attempt.date : null,
      achievedAttemptId: attempt ? attempt.id : null,
      sortOrder: Number.isFinite(x.sortOrder) ? x.sortOrder : i,
      ...common(x, i),
    });
  });
  for (const a of s.examAttempts) {
    a.targetMilestoneIds = [...new Set(a.targetMilestoneIds.filter((id) => s.milestones.some((m) => m.id === id && m.examId === a.examId)))];
  }

  const rs = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const def = defaultSettings();
  const lp = rs.lastPomodoro ?? {};
  s.settings = {
    id: SETTINGS_ID,
    language: ['auto', 'ja', 'en'].includes(rs.language) ? rs.language : def.language,
    theme: ['auto', 'light', 'dark'].includes(rs.theme) ? rs.theme : def.theme,
    streakMinMinutes: Number.isFinite(rs.streakMinMinutes) && rs.streakMinMinutes >= 1 ? rs.streakMinMinutes : def.streakMinMinutes,
    weekStart: rs.weekStart === 'mon' ? 'mon' : 'sun',
    lastPomodoro: Number.isFinite(lp.studyMin) && Number.isFinite(lp.breakMin) && Number.isFinite(lp.sets)
      ? { studyMin: lp.studyMin, breakMin: lp.breakMin, sets: lp.sets }
      : def.lastPomodoro,
  };
  return s;
}

// ---- 画像と data URL の変換（バックアップ用） ----

export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}`;
}

export function dataUrlToBlob(url) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(url ?? '');
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

// ---- CSV（Q7: 記録だけ） ----

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // 表計算ソフトで式として実行されないようにする
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function recordsCsv(state, { header, modeLabel, formatStart }) {
  const subjects = new Map(state.subjects.map((s) => [s.id, s]));
  const categories = new Map(state.categories.map((c) => [c.id, c.name]));
  const todos = new Map(state.todos.map((t) => [t.id, t.content]));
  const rows = [...state.records].sort((a, b) => a.startAt - b.startAt).map((r) => {
    const sub = r.subjectId ? subjects.get(r.subjectId) : null;
    return [
      r.dayKey,
      formatStart(r.startAt),
      sub?.name ?? '',
      sub?.categoryId ? categories.get(sub.categoryId) ?? '' : '',
      r.todoIds.map((id) => todos.get(id)).filter(Boolean).join(' / '),
      r.memo ?? '',
      r.studySeconds,
      r.breakSeconds,
      modeLabel(r.mode),
    ];
  });
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

// ---- 更新系 ----

export class Store {
  constructor({ repo = memoryRepo(), now = () => Date.now() } = {}) {
    this.repo = repo;
    this.now = now;
    this.listeners = new Set();
    this.pending = [];
    const t = repo.tables;
    this.state = {
      ...emptyTables(),
      ...Object.fromEntries(TABLES.map((name) => [name, t[name] ?? []])),
      settings: { ...defaultSettings(), ...(t.settings?.[0] ?? {}) },
      activeSession: t.activeSession?.[0] ?? null,
    };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get(table, id) {
    return this.state[table].find((x) => x.id === id) ?? null;
  }

  // 変更を1つのトランザクションにまとめて書き、画面に知らせる
  commit({ silent = false } = {}) {
    const ops = this.pending;
    this.pending = [];
    if (ops.length) this.repo.write(ops);
    if (!silent) for (const fn of this.listeners) fn(this.state);
  }

  put(table, row) {
    const t = this.now();
    if (!row.createdAt) row.createdAt = t;
    row.updatedAt = t;
    this.pending.push({ type: 'put', table, row });
  }

  insert(table, row) {
    this.state[table].push(row);
    this.put(table, row);
    return row;
  }

  remove(table, id) {
    this.state[table] = this.state[table].filter((x) => x.id !== id);
    this.pending.push({ type: 'delete', table, id });
  }

  nextOrder(table) {
    return this.state[table].reduce((m, x) => Math.max(m, x.sortOrder + 1), 0);
  }

  // ---- カテゴリ ----

  addCategory({ name, themeColor }) {
    const n = String(name ?? '').trim();
    if (!n) return { ok: false, error: 'required' };
    const row = this.insert('categories', { id: uid(), name: n, themeColor, sortOrder: this.nextOrder('categories') });
    this.commit();
    return { ok: true, id: row.id };
  }

  updateCategory(id, { name, themeColor }) {
    const c = this.get('categories', id);
    if (!c) return { ok: false, error: 'missing' };
    const n = String(name ?? '').trim();
    if (!n) return { ok: false, error: 'required' };
    c.name = n;
    c.themeColor = themeColor;
    this.put('categories', c);
    // 色を変えていない科目だけカテゴリの色に合わせる（SHELF-22, Q11）
    for (const s of this.state.subjects) {
      if (s.categoryId === id && !s.colorCustomized && s.color !== themeColor) {
        s.color = themeColor;
        this.put('subjects', s);
      }
    }
    this.commit();
    return { ok: true, id };
  }

  // 並べ替え。step は -1（上へ）か 1（下へ）。端なら何もしない
  moveCategory(id, step) {
    const list = sortedCategories(this.state);
    const i = list.findIndex((c) => c.id === id);
    const j = i + step;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((c, k) => {
      if (c.sortOrder !== k) {
        c.sortOrder = k;
        this.put('categories', c);
      }
    });
    this.commit();
  }

  deleteCategory(id) {
    for (const s of this.state.subjects) {
      if (s.categoryId === id) {
        s.categoryId = null;
        this.put('subjects', s);
      }
    }
    this.remove('categories', id);
    this.commit();
  }

  // ---- 科目 ----

  addSubject({ categoryId = null, name, iconImage = null }) {
    const n = String(name ?? '').trim();
    if (!n) return { ok: false, error: 'required' };
    const cat = categoryId ? this.get('categories', categoryId) : null;
    const row = this.insert('subjects', {
      id: uid(),
      categoryId: cat ? cat.id : null,
      name: n,
      color: cat ? cat.themeColor : GRAY,
      colorCustomized: false,
      iconImage,
      status: 'studying',
      hiddenAt: null,
      sortOrder: this.nextOrder('subjects'),
    });
    this.commit();
    return { ok: true, id: row.id };
  }

  // 色は fields.color を渡したときだけ「変更した」扱いにする。カテゴリを変えても色は保つ（SHELF-25）
  updateSubject(id, fields) {
    const s = this.get('subjects', id);
    if (!s) return { ok: false, error: 'missing' };
    if ('name' in fields) {
      const n = String(fields.name ?? '').trim();
      if (!n) return { ok: false, error: 'required' };
      s.name = n;
    }
    if ('categoryId' in fields) s.categoryId = this.get('categories', fields.categoryId) ? fields.categoryId : null;
    if ('color' in fields && fields.color !== s.color) {
      s.color = fields.color;
      s.colorCustomized = true;
    }
    if ('iconImage' in fields) s.iconImage = fields.iconImage;
    if ('status' in fields) s.status = fields.status;
    this.put('subjects', s);
    this.commit();
    return { ok: true, id };
  }

  // カテゴリの色に戻す（Q12）
  resetSubjectColor(id) {
    const s = this.get('subjects', id);
    if (!s) return;
    s.color = this.get('categories', s.categoryId)?.themeColor ?? GRAY;
    s.colorCustomized = false;
    this.put('subjects', s);
    this.commit();
  }

  hideSubject(id) {
    const s = this.get('subjects', id);
    if (!s) return;
    s.hiddenAt = this.now();
    this.put('subjects', s);
    this.commit();
  }

  restoreSubject(id) {
    const s = this.get('subjects', id);
    if (!s) return;
    s.hiddenAt = null;
    this.put('subjects', s);
    this.commit();
  }

  // 完全に削除（SHELF-42）
  purgeSubject(id) {
    const st = this.state;
    for (const r of st.records.filter((x) => x.subjectId === id)) this.remove('records', r.id);
    const gone = new Set(st.todos.filter((x) => x.subjectId === id).map((x) => x.id));
    for (const tid of gone) this.remove('todos', tid);
    this.dropTodoLinks(gone);
    for (const e of st.exams) {
      if (e.subjectIds.includes(id)) {
        e.subjectIds = e.subjectIds.filter((x) => x !== id);
        this.put('exams', e);
      }
    }
    const a = st.activeSession;
    if (a?.subjectId === id || a?.result?.subjectId === id) {
      if (a.subjectId === id) a.subjectId = null;
      if (a.result?.subjectId === id) a.result.subjectId = null;
      this.putSession();
    }
    this.remove('subjects', id);
    this.commit();
  }

  dropTodoLinks(ids) {
    for (const r of this.state.records) {
      if (r.todoIds.some((t) => ids.has(t))) {
        r.todoIds = r.todoIds.filter((t) => !ids.has(t));
        this.put('records', r);
      }
    }
    const a = this.state.activeSession;
    if (a) {
      a.selectedTodoIds = a.selectedTodoIds.filter((t) => !ids.has(t));
      a.completedTodoIds = a.completedTodoIds.filter((t) => !ids.has(t));
      if (a.result) a.result.todoIds = a.result.todoIds.filter((t) => !ids.has(t));
      this.putSession();
    }
  }

  // ---- todo ----

  addTodo({ subjectId = null, content, dueAt = null }) {
    const c = String(content ?? '').trim();
    if (!c) return { ok: false, error: 'required' };
    const row = this.insert('todos', { id: uid(), subjectId: this.get('subjects', subjectId) ? subjectId : null, content: c, dueAt, completedAt: null });
    this.commit();
    return { ok: true, id: row.id };
  }

  updateTodo(id, { subjectId = null, content, dueAt = null }) {
    const t = this.get('todos', id);
    if (!t) return { ok: false, error: 'missing' };
    const c = String(content ?? '').trim();
    if (!c) return { ok: false, error: 'required' };
    Object.assign(t, { subjectId: this.get('subjects', subjectId) ? subjectId : null, content: c, dueAt });
    this.put('todos', t);
    this.commit();
    return { ok: true, id };
  }

  setTodoDone(id, done) {
    const t = this.get('todos', id);
    if (!t) return;
    t.completedAt = done ? this.now() : null;
    this.put('todos', t);
    this.commit();
  }

  deleteTodo(id) {
    this.remove('todos', id);
    this.dropTodoLinks(new Set([id]));
    this.commit();
  }

  // ---- 記録 ----

  recordFields(f) {
    return {
      subjectId: this.get('subjects', f.subjectId) ? f.subjectId : null,
      todoIds: [...new Set((f.todoIds ?? []).filter((id) => this.get('todos', id)))],
      startAt: f.startAt,
      studySeconds: Math.max(0, Math.round(f.studySeconds)),
      breakSeconds: Math.max(0, Math.round(f.breakSeconds ?? 0)),
      memo: String(f.memo ?? '').trim(),
      dayKey: dayKey(f.startAt),
    };
  }

  validateRecord(f) {
    if (!Number.isFinite(f.startAt)) return { ok: false, error: 'startAt' };
    if (!isCount(f.studySeconds) || !isCount(f.breakSeconds ?? 0)) return { ok: false, error: 'time' };
    return { ok: true };
  }

  // 手入力（REC-30）。選んだ todo は完了にする
  addManualRecord(f) {
    const v = this.validateRecord(f);
    if (!v.ok) return v;
    if (!(f.studySeconds > 0)) return { ok: false, error: 'time' };
    const row = this.insert('records', { id: uid(), mode: 'manual', ...this.recordFields(f) });
    for (const id of row.todoIds) {
      const t = this.get('todos', id);
      if (t.completedAt == null) {
        t.completedAt = this.now();
        this.put('todos', t);
      }
    }
    this.commit();
    return { ok: true, id: row.id };
  }

  updateRecord(id, f) {
    const r = this.get('records', id);
    if (!r) return { ok: false, error: 'missing' };
    const v = this.validateRecord(f);
    if (!v.ok) return v;
    Object.assign(r, this.recordFields(f));
    this.put('records', r);
    this.commit();
    return { ok: true, id };
  }

  // 結びつく todo の完了はそのまま（Q4）
  deleteRecord(id) {
    this.remove('records', id);
    this.commit();
  }

  // ---- 記録中の状態 ----

  putSession() {
    this.pending.push({ type: 'put', table: 'activeSession', row: this.state.activeSession });
  }

  startSession({ mode, subjectId = null, selectedTodoIds = [], pomodoro = null }) {
    if (this.state.activeSession) return { ok: false, error: 'active' };
    this.state.activeSession = {
      id: SESSION_ID,
      status: 'running',
      mode,
      subjectId,
      selectedTodoIds: [...selectedTodoIds],
      completedTodoIds: [],
      pomodoro,
      events: [{ type: 'start', at: this.now() }],
      result: null,
    };
    if (pomodoro) this.state.settings.lastPomodoro = { ...pomodoro };
    this.putSession();
    if (pomodoro) this.pending.push({ type: 'put', table: 'settings', row: this.state.settings });
    this.commit();
    return { ok: true };
  }

  // type: 'pause' | 'resume' | 'skipBreak' | 'stop'
  sessionEvent(type) {
    const a = this.state.activeSession;
    if (!a || a.status === 'ended') return;
    const at = this.now();
    a.events.push({ type, at });
    if (type === 'pause') a.status = 'paused';
    if (type === 'resume') a.status = 'running';
    if (!this.endIfFinished(at)) this.putSession();
    this.commit();
  }

  // 今の時刻で区切りを確認する。終わっていれば終了画面の値を作る。変わったら true
  syncSession() {
    const a = this.state.activeSession;
    if (!a || a.status === 'ended') return false;
    if (!this.endIfFinished(this.now())) return false;
    this.commit();
    return true;
  }

  endIfFinished(at) {
    const a = this.state.activeSession;
    const c = computeSession(a, at);
    if (!c.ended) return false;
    a.status = 'ended';
    a.result = {
      subjectId: a.subjectId,
      todoIds: [...new Set([...a.selectedTodoIds, ...a.completedTodoIds])],
      startAt: c.startAt,
      studySeconds: Math.round(c.studyMs / 1000),
      breakSeconds: Math.round(c.breakMs / 1000),
      memo: '',
    };
    this.putSession();
    return true;
  }

  // 記録中に todo の完了を切り替える。ここで完了にしたものは破棄で元に戻す（REC-42）
  toggleSessionTodo(id) {
    const a = this.state.activeSession;
    const t = this.get('todos', id);
    if (!a || !t) return;
    if (t.completedAt == null) {
      t.completedAt = this.now();
      if (!a.completedTodoIds.includes(id)) a.completedTodoIds.push(id);
      if (a.result && !a.result.todoIds.includes(id)) a.result.todoIds.push(id);
    } else {
      t.completedAt = null;
      a.completedTodoIds = a.completedTodoIds.filter((x) => x !== id);
    }
    this.put('todos', t);
    this.putSession();
    this.commit();
  }

  // 終了画面での修正。入力の途中で画面を作り直さないよう silent を選べる
  updateResult(patch, { silent = false } = {}) {
    const a = this.state.activeSession;
    if (!a?.result) return;
    Object.assign(a.result, patch);
    this.putSession();
    this.commit({ silent });
  }

  saveSession() {
    const a = this.state.activeSession;
    if (!a?.result) return { ok: false, error: 'missing' };
    const v = this.validateRecord(a.result);
    if (!v.ok) return v;
    const row = this.insert('records', { id: uid(), mode: a.mode, ...this.recordFields(a.result) });
    this.clearSession();
    this.commit();
    return { ok: true, id: row.id };
  }

  discardSession() {
    const a = this.state.activeSession;
    if (!a) return;
    for (const id of a.completedTodoIds) {
      const t = this.get('todos', id);
      if (t) {
        t.completedAt = null;
        this.put('todos', t);
      }
    }
    this.clearSession();
    this.commit();
  }

  clearSession() {
    this.state.activeSession = null;
    this.pending.push({ type: 'delete', table: 'activeSession', id: SESSION_ID });
  }

  // ---- 試験 ----

  // f.milestones: [{ id?, content }]。id のあるものは更新し、なくなったものは削除する
  saveExam(f) {
    const name = String(f.name ?? '').trim();
    if (!name) return { ok: false, error: 'required' };
    const hasScore = !!f.hasScore;
    const sections = hasScore
      ? (f.sections ?? []).filter((c) => String(c.name ?? '').trim()).map((c) => ({ id: c.id ?? uid(), name: c.name.trim(), maxScore: Number(c.maxScore) || 0 }))
      : [];
    const fields = {
      name,
      hasScore,
      maxScore: hasScore && isCount(f.maxScore) ? f.maxScore : null,
      sections,
      hasPassFail: !hasScore || !!f.hasPassFail,
      subjectIds: [...new Set((f.subjectIds ?? []).filter((id) => this.get('subjects', id)))],
      favorite: !!f.favorite,
      iconImage: f.iconImage instanceof Blob ? f.iconImage : null,
    };
    let exam = f.id ? this.get('exams', f.id) : null;
    if (exam) {
      Object.assign(exam, fields);
      this.put('exams', exam);
    } else {
      exam = this.insert('exams', { id: uid(), ...fields });
    }

    const keep = new Set();
    let order = 0;
    for (const m of f.milestones ?? []) {
      const content = String(m.content ?? '').trim();
      if (!content) continue;
      const cur = m.id ? this.get('milestones', m.id) : null;
      if (cur) {
        cur.content = content;
        cur.sortOrder = order++;
        this.put('milestones', cur);
        keep.add(cur.id);
      } else {
        const row = this.insert('milestones', { id: uid(), examId: exam.id, content, achievedDate: null, achievedAttemptId: null, sortOrder: order++ });
        keep.add(row.id);
      }
    }
    for (const m of this.state.milestones.filter((x) => x.examId === exam.id && !keep.has(x.id))) this.remove('milestones', m.id);

    // なくなった部門・マイルストーンを受験記録からも除く
    const sectionIds = new Set(sections.map((c) => c.id));
    for (const a of this.state.examAttempts.filter((x) => x.examId === exam.id)) {
      a.targetMilestoneIds = a.targetMilestoneIds.filter((id) => keep.has(id));
      a.sectionScores = Object.fromEntries(Object.entries(a.sectionScores).filter(([k]) => sectionIds.has(k)));
      if (!hasScore) a.totalScore = null;
      else if (sections.length) a.totalScore = sumScores(a.sectionScores);
      if (!fields.hasPassFail) a.passed = null;
      this.put('examAttempts', a);
    }
    this.commit();
    return { ok: true, id: exam.id };
  }

  // マイルストーンと受験記録も一緒に消す（Q5）
  deleteExam(id) {
    for (const m of this.state.milestones.filter((x) => x.examId === id)) this.remove('milestones', m.id);
    for (const a of this.state.examAttempts.filter((x) => x.examId === id)) this.remove('examAttempts', a.id);
    this.remove('exams', id);
    this.commit();
  }

  addAttempt({ examId, date, targetMilestoneIds = [] }) {
    if (!this.get('exams', examId)) return { ok: false, error: 'missing' };
    if (!isDateKey(date)) return { ok: false, error: 'date' };
    const row = this.insert('examAttempts', {
      id: uid(),
      examId,
      date,
      targetMilestoneIds: this.openTargets(examId, targetMilestoneIds),
      totalScore: null,
      sectionScores: {},
      passed: null,
    });
    this.commit();
    return { ok: true, id: row.id };
  }

  openTargets(examId, ids, attemptId = null) {
    return [...new Set(ids)].filter((id) => {
      const m = this.get('milestones', id);
      return m && m.examId === examId && (m.achievedAttemptId == null || m.achievedAttemptId === attemptId);
    });
  }

  // 結果の登録（LIST-51）。f.achievedIds は今回達成にチェックしたマイルストーン
  updateAttempt(id, f) {
    const a = this.get('examAttempts', id);
    if (!a) return { ok: false, error: 'missing' };
    const exam = this.get('exams', a.examId);
    if (!isDateKey(f.date)) return { ok: false, error: 'date' };
    const limit = (v, max) => v == null || (isCount(v) && (max == null || v <= max));
    const scores = {};
    for (const c of exam.sections) {
      const v = f.sectionScores?.[c.id];
      if (v == null) continue;
      if (!limit(v, c.maxScore)) return { ok: false, error: 'score' };
      scores[c.id] = v;
    }
    const total = exam.sections.length ? sumScores(scores) : f.totalScore ?? null;
    if (!limit(total, exam.maxScore)) return { ok: false, error: 'score' };

    a.date = f.date;
    a.targetMilestoneIds = this.openTargets(a.examId, f.targetMilestoneIds ?? a.targetMilestoneIds, id);
    a.sectionScores = scores;
    a.totalScore = exam.hasScore ? total : null;
    a.passed = exam.hasPassFail && typeof f.passed === 'boolean' ? f.passed : null;
    this.put('examAttempts', a);

    const achieved = new Set((f.achievedIds ?? []).filter((m) => a.targetMilestoneIds.includes(m)));
    for (const m of this.state.milestones.filter((x) => x.examId === a.examId)) {
      if (achieved.has(m.id)) {
        m.achievedDate = a.date;
        m.achievedAttemptId = id;
        this.put('milestones', m);
      } else if (m.achievedAttemptId === id) {
        m.achievedDate = null;
        m.achievedAttemptId = null;
        this.put('milestones', m);
      }
    }
    this.commit();
    return { ok: true, id };
  }

  // この受験で達成したマイルストーンは未達成に戻す（Q5）
  deleteAttempt(id) {
    for (const m of this.state.milestones) {
      if (m.achievedAttemptId === id) {
        m.achievedDate = null;
        m.achievedAttemptId = null;
        this.put('milestones', m);
      }
    }
    this.remove('examAttempts', id);
    this.commit();
  }

  // ---- 設定 ----

  setSettings(patch) {
    Object.assign(this.state.settings, patch);
    this.pending.push({ type: 'put', table: 'settings', row: this.state.settings });
    this.commit();
  }

  // ---- バックアップ ----

  async exportData() {
    const data = structuredClone({ ...this.state });
    delete data.activeSession;
    for (const x of [...data.subjects, ...data.exams]) x.iconImage = x.iconImage ? await blobToDataUrl(x.iconImage) : null;
    return { app: 'Stacklog', schemaVersion: SCHEMA_VERSION, exportedAt: new Date(this.now()).toISOString(), data };
  }

  // 失敗したら例外を投げ、データは何も変えない
  parseBackup(text) {
    const obj = JSON.parse(text);
    if (obj?.app !== 'Stacklog' || typeof obj.schemaVersion !== 'number') throw new Error('format');
    if (obj.schemaVersion > SCHEMA_VERSION) throw new Error('newer');
    const raw = obj.data ?? {};
    const withIcons = (list) => (Array.isArray(list) ? list : []).map((x) => ({ ...x, iconImage: dataUrlToBlob(x?.iconImage) }));
    return sanitize({ ...raw, subjects: withIcons(raw.subjects), exams: withIcons(raw.exams) });
  }

  importOverwrite(data) {
    for (const name of TABLES) {
      this.pending.push({ type: 'clear', table: name });
      this.state[name] = data[name];
      for (const row of data[name]) this.pending.push({ type: 'put', table: name, row });
    }
    this.state.settings = data.settings;
    this.pending.push({ type: 'put', table: 'settings', row: data.settings });
    this.commit();
  }

  // id が同じものはファイル側で置き換え、ないものは追加する（SET-13）
  importMerge(data) {
    for (const name of TABLES) {
      const incoming = new Map(data[name].map((row) => [row.id, row]));
      const rest = this.state[name].filter((row) => !incoming.has(row.id));
      this.state[name] = [...rest, ...data[name]];
      for (const row of data[name]) this.pending.push({ type: 'put', table: name, row });
    }
    this.state.settings = data.settings;
    this.pending.push({ type: 'put', table: 'settings', row: data.settings });
    this.commit();
  }
}

function sumScores(scores) {
  const values = Object.values(scores);
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}

// ---- 参照系 ----

// 本棚に並ぶ科目（「表から消す」をしたものを除く）
export function visibleSubjects(state, status = null) {
  return sortedSubjects(state).filter((s) => s.hiddenAt == null && (status == null || s.status === status));
}

// 記録中・手入力で選べる todo（REC-03）。科目を選んだらその科目だけ、選ばなければすべて
export function candidateTodos(state, subjectId) {
  return state.todos.filter((t) => t.completedAt == null && (subjectId ? t.subjectId === subjectId : true));
}
