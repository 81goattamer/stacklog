import { t } from './i18n.js';
import { dayKey } from './calc.js';

// 小さなDOM生成ヘルパー
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  shelf: 'M4 19V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v14M9 19V8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v11M15.5 7.5l3-.8a1 1 0 0 1 1.2.7l2.8 10.7M2 19h20',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l2.5 2M9 2h6M12 2v4',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
  checklist: 'M9 6h12M9 12h12M9 18h12M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  close: 'M18 6L6 18M6 6l12 12',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  check: 'M20 6L9 17l-5-5',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  flame: 'M12 22a7 7 0 0 0 7-7c0-3-2-5.5-3.5-7.5-.5 2-1.500 3-3 3.500.5-3-1-6-3.500-8.500C9 6 5 9.500 5 15a7 7 0 0 0 7 7z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  layers: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.500 10a1.500 1.500 0 1 0 0-3 1.500 1.500 0 0 0 0 3zM21 15l-5-5L5 21',
  gem: 'M6 3h12l4 6-10 12L2 9zM2 9h20M9 3L7 9l5 12 5-12-2-6',
  play: 'M6 3l14 9-14 9z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  stop: 'M6 6h12v12H6z',
  skip: 'M5 4l10 8-10 8zM19 5v14',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  book: 'M4 19.500A2.500 2.500 0 0 1 6.500 17H20V2H6.500A2.500 2.500 0 0 0 4 4.500zM4 19.500A2.500 2.500 0 0 0 6.500 22H20v-5',
};

export function icon(name, { fill = false, size = 22 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', fill ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] ?? '');
  svg.append(path);
  return svg;
}

export function iconButton(name, label, onClick, cls = '') {
  return h('button', { type: 'button', class: `icon-btn ${cls}`, 'aria-label': label, title: label, onClick }, icon(name));
}

// ---- シート（下から出るパネル） ----

const openSheets = [];

// render が渡されたときは、store の変更や refresh() で中身を作り直す
export function openSheet({ title, render, full = false, onClose, headerRight }) {
  const body = h('div', { class: 'sheet-body' });
  const titleEl = h('h2', { class: 'sheet-title' }, title ?? '');
  const right = h('div', { class: 'sheet-head-right' });
  const sheet = h('div', { class: `sheet ${full ? 'full' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-head' },
      iconButton('close', t('common.close'), () => api.close()),
      titleEl,
      right),
    body);
  const backdrop = h('div', { class: 'backdrop', onClick: (e) => { if (e.target === backdrop) api.close(); } }, sheet);
  const api = {
    body,
    closed: false,
    setTitle(s) { titleEl.textContent = s; },
    refresh() {
      if (!render || api.closed) return;
      const y = body.scrollTop;
      const content = render(api);
      if (api.closed) return;
      body.replaceChildren(content);
      api.refreshHead();
      body.scrollTop = y;
    },
    refreshHead() {
      right.replaceChildren(headerRight ? headerRight(api) ?? '' : '');
    },
    close() {
      if (api.closed) return;
      api.closed = true;
      openSheets.splice(openSheets.indexOf(api), 1);
      backdrop.classList.remove('show');
      setTimeout(() => backdrop.remove(), 200);
      onClose?.();
    },
  };
  openSheets.push(api);
  document.body.append(backdrop);
  api.refresh();
  requestAnimationFrame(() => backdrop.classList.add('show'));
  return api;
}

export function refreshSheets() {
  for (const s of [...openSheets]) s.refresh();
}

export function closeAllSheets() {
  for (const s of [...openSheets]) s.close();
}

// 確認ダイアログ
export function confirmDialog({ message, okLabel = t('common.ok'), cancelLabel = t('common.cancel'), danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      sheet.close();
      resolve(v);
    };
    const sheet = openSheet({
      title: '',
      onClose: () => finish(false),
      render: () => h('div', { class: 'confirm' },
        h('p', { class: 'confirm-msg' }, message),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onClick: () => finish(false) }, cancelLabel),
          h('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, onClick: () => finish(true) }, okLabel))),
    });
  });
}

// メニュー（…ボタン）
export function actionMenu(title, items) {
  const sheet = openSheet({
    title,
    render: () => h('div', { class: 'menu' },
      items.filter(Boolean).map((it) => h('button', {
        type: 'button',
        class: `menu-item ${it.desc ? 'tall' : ''} ${it.danger ? 'danger' : ''}`,
        onClick: () => { sheet.close(); it.onClick(); },
      }, it.icon && icon(it.icon), it.desc ? h('span', {}, h('strong', {}, it.label), h('small', {}, it.desc)) : it.label))),
  });
  return sheet;
}

let toastTimer = null;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

export function empty(text, iconName = 'book') {
  return h('div', { class: 'empty' }, icon(iconName, { size: 40 }), h('p', {}, text));
}

// ---- 表示の整形 ----

export function formatDuration(seconds) {
  if (seconds > 0 && seconds < 60) return t('time.s', { s: seconds });
  const total = Math.floor(seconds / 60);
  const hh = Math.floor(total / 60);
  const m = total % 60;
  if (hh && m) return t('time.hm', { h: hh, m });
  if (hh) return t('time.h', { h: hh });
  return t('time.m', { m });
}

export function formatDate(key) {
  return key ? key.replaceAll('-', '/') : '';
}

export function formatDateTime(ms) {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function todayKey() {
  return dayKey(Date.now());
}

// ---- 科目のアイコン ----

// Blob の表示用 URL は同じ Blob なら使い回す
const iconUrls = new WeakMap();
export function blobUrl(blob) {
  if (!iconUrls.has(blob)) iconUrls.set(blob, URL.createObjectURL(blob));
  return iconUrls.get(blob);
}

// 画像がない科目に出す、その科目の色の本のマーク（SHELF-04）
export function bookMark(color, size = 40) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const body = document.createElementNS(ns, 'path');
  body.setAttribute('d', 'M6.500 2H20v20H6.500A2.500 2.500 0 0 1 4 19.500v-15A2.500 2.500 0 0 1 6.500 2z');
  body.setAttribute('fill', color);
  const pages = document.createElementNS(ns, 'path');
  pages.setAttribute('d', 'M6.500 17.500H20v4H6.500a2 2 0 0 1 0-4z');
  pages.setAttribute('fill', '#ffffff');
  pages.setAttribute('fill-opacity', '.85');
  svg.append(body, pages);
  return svg;
}

export function subjectCover(subject, cls = '', size = 40) {
  return h('div', { class: `cover ${cls}` },
    subject.iconImage
      ? h('img', { src: blobUrl(subject.iconImage), alt: '', draggable: 'false' })
      : bookMark(subject.color, size));
}

export function colorDot(color) {
  return h('span', { class: 'dot', style: { background: color } });
}

export function downloadFile(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// 塗りの上に置く文字の色（白か黒の読みやすいほう）
export function textOn(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return lum > 0.3 ? '#000000' : '#ffffff';
}
