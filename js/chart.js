// グラフ（SVG）。色は CSS の変数と、渡された科目・カテゴリの色だけを使う
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

// 1, 2, 5, 10… の切りのよい目盛り幅
function niceStep(raw) {
  if (raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

// 棒グラフ。rows: [{ label, value, readout }]。top は縦軸の上限、tickLabel は目盛りの表示。
// 棒をタップ・ホバーすると readout を上の行に出す。defaultText は何も選んでいないときの表示
export function barChart(rows, { top, tickLabel, defaultText, labelEvery = 1, ariaLabel }) {
  const W = 340;
  const H = 180;
  const L = 34;
  const R = 6;
  const T = 8;
  const B = 22;
  const sy = (v) => T + (1 - v / top) * (H - T - B);
  const band = (W - L - R) / rows.length;
  const barW = Math.min(24, Math.max(3, band - 2));

  const readout = h('div', { class: 'chart-readout' }, defaultText);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': ariaLabel ?? defaultText });
  for (let i = 0; i <= 4; i++) {
    const v = (top * i) / 4;
    const y = sy(v);
    svg.append(el('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'grid' }));
    svg.append(el('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', class: 'axis' }, tickLabel(v)));
  }
  const reset = () => { readout.textContent = defaultText; };
  rows.forEach((r, i) => {
    const cx = L + band * i + band / 2;
    const x0 = cx - barW / 2;
    const y = sy(r.value);
    const bar = el('g', { class: 'bar-col' });
    if (r.value > 0) {
      const rad = Math.min(4, barW / 2, H - B - y);
      bar.append(el('path', {
        class: 'bar',
        d: `M${x0},${H - B}V${y + rad}Q${x0},${y} ${x0 + rad},${y}H${x0 + barW - rad}Q${x0 + barW},${y} ${x0 + barW},${y + rad}V${H - B}Z`,
      }));
    }
    const hit = el('rect', { x: L + band * i, y: T, width: band, height: H - T - B, class: 'hit' });
    hit.append(el('title', {}, r.readout));
    hit.addEventListener('pointerenter', () => { readout.textContent = r.readout; });
    hit.addEventListener('click', () => { readout.textContent = r.readout; });
    bar.append(hit);
    svg.append(bar);
    if (i % labelEvery === 0) svg.append(el('text', { x: cx, y: H - 7, 'text-anchor': 'middle', class: 'axis' }, r.label));
  });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') reset(); });
  return h('div', { class: 'chart-box' }, readout, svg);
}

// ドーナツ。rows: [{ color, value, title }]。名前と割合は呼び出し側の凡例に出す
export function donutChart(rows, { size = 150, ariaLabel }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  const c = size / 2;
  const r0 = size / 2 - 2;
  const r1 = r0 - 26;
  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, class: 'donut', role: 'img', 'aria-label': ariaLabel, width: size, height: size });
  if (rows.length === 1) {
    const ring = el('circle', { cx: c, cy: c, r: (r0 + r1) / 2, fill: 'none', stroke: rows[0].color, 'stroke-width': r0 - r1 });
    ring.append(el('title', {}, rows[0].title));
    svg.append(ring);
    return svg;
  }
  let a = -Math.PI / 2;
  for (const row of rows) {
    const sweep = (row.value / total) * Math.PI * 2;
    const b = a + sweep;
    const pt = (rad, ang) => `${(c + rad * Math.cos(ang)).toFixed(2)},${(c + rad * Math.sin(ang)).toFixed(2)}`;
    const large = sweep > Math.PI ? 1 : 0;
    const seg = el('path', {
      d: `M${pt(r0, a)}A${r0},${r0} 0 ${large} 1 ${pt(r0, b)}L${pt(r1, b)}A${r1},${r1} 0 ${large} 0 ${pt(r1, a)}Z`,
      fill: row.color,
      class: 'donut-seg',
    });
    seg.append(el('title', {}, row.title));
    svg.append(seg);
    a = b;
  }
  return svg;
}

// 点数の折れ線。points: [{ date, score, label }] は日付の古い順。max は満点（なければ点数から決める）
export function lineChart(points, { max, shortDate }) {
  const W = 340;
  const H = 190;
  const L = 36;
  const R = 26;
  const T = 18;
  const B = 24;
  const best = Math.max(...points.map((p) => p.score));
  const step = niceStep((max ?? best) / 4);
  const top = max ?? (Math.ceil(best / step) * step || step);
  const sy = (v) => T + (1 - v / top) * (H - T - B);
  const sx = (i) => (points.length === 1 ? L + (W - L - R) / 2 : L + (i / (points.length - 1)) * (W - L - R));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  // 切りのよい目盛りを並べ、満点が近すぎなければ最後に満点も出す
  const ticks = [];
  for (let v = 0; v < top - step * 0.25; v += step) ticks.push(v);
  ticks.push(top);
  for (const v of ticks) {
    svg.append(el('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: 'grid' }));
    svg.append(el('text', { x: L - 6, y: sy(v) + 4, 'text-anchor': 'end', class: 'axis' }, Number(v.toFixed(2))));
  }
  svg.append(el('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.score).toFixed(1)}`).join(''), class: 'line' }));
  points.forEach((p, i) => {
    const dot = el('circle', { cx: sx(i), cy: sy(p.score), r: 4, class: 'mark' });
    dot.append(el('title', {}, p.label));
    svg.append(dot);
  });
  const lastIdx = points.length - 1;
  svg.append(el('text', { x: sx(lastIdx), y: sy(points[lastIdx].score) - 9, 'text-anchor': 'middle', class: 'value' }, points[lastIdx].score));
  const xTicks = points.length === 1 ? [0] : points.length === 2 ? [0, 1] : [0, Math.floor(lastIdx / 2), lastIdx];
  xTicks.forEach((i, n) => {
    const anchor = xTicks.length === 1 ? 'middle' : n === 0 ? 'start' : n === xTicks.length - 1 ? 'end' : 'middle';
    svg.append(el('text', { x: sx(i), y: H - 7, 'text-anchor': anchor, class: 'axis' }, shortDate(points[i].date)));
  });
  return h('div', { class: 'chart-box' }, svg);
}
