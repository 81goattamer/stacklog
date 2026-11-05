// 入力欄の部品
import { fromLocalInput, PALETTE, toLocalInput } from './calc.js';
import { t } from './i18n.js';
import { h, icon, textOn } from './ui.js';

export function field(label, ...control) {
  return h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), ...control);
}

export function seg(options, value, onPick, cls = '') {
  return h('div', { class: `seg ${cls}`, role: 'group' }, options.map(([v, label]) => h('button', {
    type: 'button',
    class: v === value ? 'on' : '',
    'aria-pressed': v === value ? 'true' : 'false',
    onClick: () => onPick(v),
  }, label)));
}

// value: 選択中の id（null = なし）。options: [{ id, name }]
export function selectField(value, options, noneLabel, onChange) {
  const sel = h('select', { class: 'input', onChange: (e) => onChange(e.target.value || null) },
    noneLabel != null ? h('option', { value: '' }, noneLabel) : null,
    options.map((o) => h('option', { value: o.id }, o.name)));
  sel.value = value ?? '';
  return sel;
}

export function colorSwatches(value, onPick) {
  return h('div', { class: 'swatches', role: 'group' }, PALETTE.map((c) => h('button', {
    type: 'button',
    class: `swatch ${c === value ? 'on' : ''}`,
    style: { background: c, color: textOn(c) },
    'aria-label': c,
    'aria-pressed': c === value ? 'true' : 'false',
    onClick: () => onPick(c),
  }, c === value ? icon('check', { size: 16 }) : null)));
}

// 時間と分の入力。分を変えるまでは秒の端数を保つ
export function durationField(seconds, onChange) {
  const hours = h('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: 0, step: 1, value: String(Math.floor(seconds / 3600)), 'aria-label': t('field.hours') });
  const mins = h('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: 0, step: 1, value: String(Math.floor((seconds % 3600) / 60)), 'aria-label': t('field.minutes') });
  const emit = () => {
    const hh = Math.max(0, Math.floor(Number(hours.value) || 0));
    const mm = Math.max(0, Math.floor(Number(mins.value) || 0));
    onChange(hh * 3600 + mm * 60);
  };
  hours.addEventListener('input', emit);
  mins.addEventListener('input', emit);
  return h('div', { class: 'duration' }, hours, h('span', {}, t('field.hours')), mins, h('span', {}, t('field.minutes')));
}

// ms（null 可）の日時入力。onChange には ms か null を渡す
export function datetimeField(ms, onChange, { clearable = false } = {}) {
  const input = h('input', {
    class: 'input',
    type: 'datetime-local',
    value: ms == null ? '' : toLocalInput(ms),
    onInput: (e) => onChange(e.target.value ? fromLocalInput(e.target.value) : null),
  });
  if (!clearable) return input;
  return h('div', { class: 'inline-field' }, input, h('button', {
    type: 'button',
    class: 'btn',
    onClick: () => { input.value = ''; onChange(null); },
  }, t('common.clear')));
}

export function dateField(value, onChange) {
  return h('input', { class: 'input', type: 'date', value: value ?? '', onInput: (e) => onChange(e.target.value) });
}

// 複数選択の一覧。items: [{ id, name, sub?, color? }]
export function checkList(items, selected, onToggle) {
  return h('div', { class: 'pick-list' }, items.map((it) => {
    const on = selected.includes(it.id);
    return h('button', {
      type: 'button',
      class: 'pick-row',
      role: 'checkbox',
      'aria-checked': on ? 'true' : 'false',
      onClick: () => onToggle(it.id),
    },
    h('span', { class: `check ${on ? 'on' : ''}` }, on ? icon('check', { size: 14 }) : null),
    h('span', { class: 'grow' }, it.name, it.sub ? h('small', { class: 'sub block' }, it.sub) : null));
  }));
}

export function toggled(list, id) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function switchRow(label, checked, onChange, disabled = false) {
  return h('label', { class: 'toggle-row' },
    h('span', { class: 'grow' }, label),
    h('input', { type: 'checkbox', class: 'switch', checked, disabled, onChange: (e) => onChange(e.target.checked) }));
}

// 数値（空は null）。不正な値は NaN を返す
export function parseNumber(s) {
  const v = String(s ?? '').trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
