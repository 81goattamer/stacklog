// 保存しない値の計算（設計書4章）。DOMに依存しない純粋関数だけを置く。

export const GRAY = '#8e8e93';
export const GRAY_LIGHT = '#b4b4ba';

// 科目・カテゴリの候補色（Q10）。彩度の高い14色を色相の順に並べている
export const PALETTE = [
  '#ff1f3d', '#ff6a00', '#ffb300', '#ffe100', '#9be000', '#1fd135', '#00d09c',
  '#00c8ea', '#0a84ff', '#2b3fff', '#7a2bff', '#b526ff', '#f01fd0', '#ff2d87',
];

// 新しいカテゴリの初期の色。5つ飛ばしで選び、続けて作っても似た色が並ばないようにする
export function defaultCategoryColor(count) {
  return PALETTE[(count * 5) % PALETTE.length];
}

const HOUR = 3_600_000;
const DAY_START_HOUR = 4;
const p2 = (n) => String(n).padStart(2, '0');

// ---- 日付 ----

export function dateKey(d) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

// 1日の区切りは午前4時（COMMON-03）
export function dayKey(ms) {
  const d = new Date(ms);
  d.setHours(d.getHours() - DAY_START_HOUR);
  return dateKey(d);
}

function keyToUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key, n) {
  const d = new Date(keyToUtc(key) + n * 86_400_000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

export function dayDiff(later, earlier) {
  return Math.round((keyToUtc(later) - keyToUtc(earlier)) / 86_400_000);
}

export function weekdayOf(key) {
  return new Date(keyToUtc(key)).getUTCDay();
}

// key を含む週の最初の日
export function weekStartKey(key, weekStart) {
  const first = weekStart === 'mon' ? 1 : 0;
  return addDays(key, -((weekdayOf(key) - first + 7) % 7));
}

export function isDateKey(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return addDays(s, 0) === s;
}

// ---- ストリーク（4.2） ----

export function studyByDay(records) {
  const map = new Map();
  for (const r of records) map.set(r.dayKey, (map.get(r.dayKey) ?? 0) + r.studySeconds);
  return map;
}

// { kind: 'active' | 'pending' | 'none', n }
export function streak(records, streakMinMinutes, now) {
  const byDay = studyByDay(records);
  const need = streakMinMinutes * 60;
  const studied = (key) => (byDay.get(key) ?? 0) >= need;
  const run = (from) => {
    let n = 0;
    for (let k = from; studied(k); k = addDays(k, -1)) n++;
    return n;
  };
  const today = dayKey(now);
  if (studied(today)) return { kind: 'active', n: run(today) };
  const yesterday = addDays(today, -1);
  if (studied(yesterday)) return { kind: 'pending', n: run(yesterday) + 1 };
  return { kind: 'none', n: 0 };
}

// ---- カレンダー（4.3） ----

// key -> 色。同じ長さなら、その日の最初の記録が早い科目を選ぶ
export function calendarColors(state) {
  const days = new Map();
  for (const r of state.records) {
    if (!days.has(r.dayKey)) days.set(r.dayKey, new Map());
    const m = days.get(r.dayKey);
    const cur = m.get(r.subjectId) ?? { sec: 0, first: Infinity };
    cur.sec += r.studySeconds;
    cur.first = Math.min(cur.first, r.startAt);
    m.set(r.subjectId, cur);
  }
  const subjects = new Map(state.subjects.map((s) => [s.id, s]));
  const out = new Map();
  for (const [key, m] of days) {
    let best = null;
    let bestVal = null;
    for (const [id, v] of m) {
      if (id == null || !subjects.has(id)) continue;
      if (!bestVal || v.sec > bestVal.sec || (v.sec === bestVal.sec && v.first < bestVal.first)) {
        best = id;
        bestVal = v;
      }
    }
    out.set(key, best ? subjects.get(best).color : GRAY);
  }
  return out;
}

// ---- グラフ（4.4） ----

// period: 'week' | 'month' | 'year'、offset: 0 が今の期間、-1 が1つ前
export function periodRange(period, offset, weekStart, now) {
  const today = dayKey(now);
  if (period === 'week') {
    const from = addDays(weekStartKey(today, weekStart), offset * 7);
    return { from, to: addDays(from, 6) };
  }
  const [y, m] = today.split('-').map(Number);
  if (period === 'month') {
    const first = new Date(Date.UTC(y, m - 1 + offset, 1));
    const last = new Date(Date.UTC(y, m + offset, 0));
    const fmt = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
    return { from: fmt(first), to: fmt(last) };
  }
  return { from: `${y + offset}-01-01`, to: `${y + offset}-12-31` };
}

// 期間内の学習時間（秒）の棒。週・月は1日ごと、年は1か月ごと
export function studySeries(records, period, { from, to }) {
  const buckets = new Map();
  if (period === 'year') {
    const y = from.slice(0, 4);
    for (let m = 1; m <= 12; m++) buckets.set(`${y}-${p2(m)}`, 0);
  } else {
    for (let k = from; k <= to; k = addDays(k, 1)) buckets.set(k, 0);
  }
  for (const r of records) {
    if (r.dayKey < from || r.dayKey > to) continue;
    const key = period === 'year' ? r.dayKey.slice(0, 7) : r.dayKey;
    buckets.set(key, buckets.get(key) + r.studySeconds);
  }
  return [...buckets].map(([key, seconds]) => ({ key, seconds }));
}

// 時間のグラフの縦軸の上限（秒）。目盛りが 15分・30分・1時間… の区切りになる4等分の値を返す
export function timeAxisMax(seconds) {
  const steps = [300, 600, 900, 1800, 3600, 7200, 10800, 18000, 36000, 72000, 180000, 360000];
  const step = steps.find((s) => s * 4 >= seconds) ?? Math.ceil(seconds / 4 / 360000) * 360000;
  return step * 4;
}

// 割合の円グラフ。key は カテゴリid / 'none'（カテゴリなし）/ 'unset'（未分類）。0秒のものは除く
export function categoryShares(state, { from, to } = {}) {
  const subjects = new Map(state.subjects.map((s) => [s.id, s]));
  const sum = new Map();
  for (const r of state.records) {
    if (from && (r.dayKey < from || r.dayKey > to)) continue;
    const sub = r.subjectId ? subjects.get(r.subjectId) : null;
    const key = !sub ? 'unset' : sub.categoryId ?? 'none';
    sum.set(key, (sum.get(key) ?? 0) + r.studySeconds);
  }
  const rows = [];
  for (const c of sortedCategories(state)) if (sum.get(c.id)) rows.push({ key: c.id, name: c.name, color: c.themeColor, seconds: sum.get(c.id) });
  if (sum.get('none')) rows.push({ key: 'none', color: GRAY, seconds: sum.get('none') });
  if (sum.get('unset')) rows.push({ key: 'unset', color: GRAY_LIGHT, seconds: sum.get('unset') });
  return rows;
}

export function examStudySeconds(state, exam) {
  const ids = new Set(exam.subjectIds);
  let sum = 0;
  for (const r of state.records) if (ids.has(r.subjectId)) sum += r.studySeconds;
  return sum;
}

// ---- todo（4.5, 4.6） ----

export function todoBadge(todos, now) {
  let red = 0;
  let near = 0;
  for (const t of todos) {
    if (t.completedAt != null || t.dueAt == null) continue;
    const left = t.dueAt - now;
    if (left <= 24 * HOUR) red++;
    if (left <= 72 * HOUR) near++;
  }
  return { red, normal: red ? 0 : near, app: near };
}

export function overdueDays(todo, now) {
  if (todo.completedAt != null || todo.dueAt == null || todo.dueAt >= now) return null;
  return dayDiff(dayKey(now), dayKey(todo.dueAt));
}

// showOpen: 未完了（今日完了したものは灰色で一緒に出す）、showDone: 完了済み
export function visibleTodos(todos, { showOpen, showDone }, now) {
  const today = dayKey(now);
  return todos.filter((t) => {
    if (t.completedAt == null) return showOpen;
    if (showDone) return true;
    return showOpen && dayKey(t.completedAt) === today;
  });
}

const byDue = (a, b) => {
  if (a.dueAt == null && b.dueAt == null) return a.createdAt - b.createdAt;
  if (a.dueAt == null) return 1;
  if (b.dueAt == null) return -1;
  return a.dueAt - b.dueAt || a.createdAt - b.createdAt;
};

export function sortByDue(todos) {
  return [...todos].sort(byDue);
}

// sort: 'due' | 'category' | 'newest' | 'oldest'。category のときは groupOf で使う順に並べる
export function sortTodos(state, todos, sort) {
  if (sort === 'newest') return [...todos].sort((a, b) => b.createdAt - a.createdAt);
  if (sort === 'oldest') return [...todos].sort((a, b) => a.createdAt - b.createdAt);
  if (sort === 'category') {
    const rank = groupRank(state);
    return [...todos].sort((a, b) => rank(a) - rank(b) || byDue(a, b));
  }
  return sortByDue(todos);
}

// カテゴリの順 → カテゴリなしの科目 → 科目なし（TODO-34）
function groupRank(state) {
  const order = new Map(sortedCategories(state).map((c, i) => [c.id, i]));
  const subjects = new Map(state.subjects.map((s) => [s.id, s]));
  return (todo) => {
    const sub = todo.subjectId ? subjects.get(todo.subjectId) : null;
    if (!sub) return order.size + 1;
    return order.get(sub.categoryId) ?? order.size;
  };
}

export function sortedCategories(state) {
  return [...state.categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sortedSubjects(state) {
  return [...state.subjects].sort((a, b) => a.sortOrder - b.sortOrder);
}

// ---- ポモドーロ・ストップウォッチの経過（4.7, 4.8） ----

function segmentsOf({ studyMin, breakMin, sets }) {
  const out = [];
  for (let i = 0; i < sets; i++) {
    out.push({ kind: 'study', set: i + 1, ms: studyMin * 60_000 });
    if (i < sets - 1 && breakMin > 0) out.push({ kind: 'break', set: i + 1, ms: breakMin * 60_000 });
  }
  return out;
}

// events をたどって今の状態を求める。離れていた時間もここで進む
export function computeSession(session, now) {
  const segs = session.mode === 'pomodoro' ? segmentsOf(session.pomodoro) : null;
  let idx = 0;
  let left = segs ? segs[0].ms : 0;
  let studyMs = 0;
  let breakMs = 0;
  let paused = false;
  let ended = false;
  let endedAt = null;
  let at = session.events[0]?.at ?? now;

  const advance = (to) => {
    let dt = Math.max(0, to - at);
    if (paused) {
      breakMs += dt;
    } else if (!segs) {
      studyMs += dt;
    } else {
      while (dt > 0 && idx < segs.length) {
        const take = Math.min(dt, left);
        if (segs[idx].kind === 'study') studyMs += take;
        else breakMs += take;
        left -= take;
        dt -= take;
        if (left === 0) {
          idx++;
          left = segs[idx]?.ms ?? 0;
        }
      }
      if (idx >= segs.length) {
        ended = true;
        endedAt = Math.max(at, to - dt);
      }
    }
    at = Math.max(at, to);
  };

  for (const e of session.events) {
    advance(e.at);
    if (ended) break;
    if (e.type === 'pause') paused = true;
    else if (e.type === 'resume') paused = false;
    else if (e.type === 'skipBreak' && segs?.[idx]?.kind === 'break') {
      idx++;
      left = segs[idx].ms;
    } else if (e.type === 'stop') {
      ended = true;
      endedAt = e.at;
      break;
    }
  }
  if (!ended) advance(now);

  const out = { paused, ended, endedAt, studyMs, breakMs, startAt: session.events[0]?.at ?? now };
  if (segs) {
    const seg = segs[Math.min(idx, segs.length - 1)];
    let totalLeft = ended ? 0 : left;
    if (!ended) for (let i = idx + 1; i < segs.length; i++) totalLeft += segs[i].ms;
    Object.assign(out, {
      phase: seg.kind,
      set: seg.set,
      sets: session.pomodoro.sets,
      segmentMs: seg.ms,
      leftMs: ended ? 0 : left,
      totalLeftMs: totalLeft,
    });
  }
  return out;
}

// ---- 表示用の小さな変換 ----

export function toLocalInput(ms) {
  const d = new Date(ms);
  return `${dateKey(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function fromLocalInput(s) {
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${p2(m)}:${p2(s)}` : `${p2(m)}:${p2(s)}`;
}
