import { store } from '../app-store.js';
import { recordsCsv } from '../store.js';
import { t } from '../i18n.js';
import { h, icon, confirmDialog, downloadFile, formatDateTime, openSheet, toast } from '../ui.js';
import { seg } from '../fields.js';

function group(title, ...rows) {
  return h('section', { class: 'group' },
    title ? h('h2', { class: 'group-label' }, title) : null,
    h('div', { class: 'card list' }, rows));
}

function row(iconName, label, control) {
  return h('div', { class: 'set-row' }, h('span', { class: 'set-icon' }, icon(iconName, { size: 18 })), h('span', { class: 'grow' }, label), control);
}

function navRow(iconName, label, onClick) {
  return h('button', { type: 'button', class: 'set-row nav', onClick },
    h('span', { class: 'set-icon' }, icon(iconName, { size: 18 })),
    h('span', { class: 'grow' }, label),
    icon('chevron', { size: 18 }));
}

export function renderSettings(root) {
  const st = store.state.settings;
  const streakIn = h('input', {
    class: 'input num',
    type: 'number',
    inputmode: 'numeric',
    min: 1,
    step: 1,
    value: String(st.streakMinMinutes),
    'aria-label': t('settings.streak'),
    onChange: (e) => {
      const v = Math.floor(Number(e.target.value));
      if (v >= 1) store.setSettings({ streakMinMinutes: v });
      else e.target.value = String(store.state.settings.streakMinMinutes);
    },
  });
  root.replaceChildren(
    h('header', { class: 'page-head' }, h('h1', {}, t('settings.title'))),
    group(t('settings.general'),
      row('globe', t('settings.lang'), seg([['auto', t('settings.auto')], ['ja', '日本語'], ['en', 'English']], st.language, (v) => store.setSettings({ language: v }), 'small')),
      row('moon', t('settings.theme'), seg([['auto', t('settings.auto')], ['light', t('settings.light')], ['dark', t('settings.dark')]], st.theme, (v) => store.setSettings({ theme: v }), 'small'))),
    group(t('settings.study'),
      row('flame', t('settings.streak'), h('span', { class: 'inline-field' }, streakIn, h('span', { class: 'muted small nowrap' }, t('settings.streakUnit')))),
      row('calendar', t('settings.weekStart'), seg([['sun', t('settings.sunday')], ['mon', t('settings.monday')]], st.weekStart, (v) => store.setSettings({ weekStart: v }), 'small'))),
    group(t('settings.data'),
      navRow('download', t('settings.backup'), openBackup)),
    h('p', { class: 'muted small pad' }, t('settings.storageNote')),
    h('p', { class: 'muted small center' }, 'Stacklog v1.0'));
}

// ---- バックアップと復元（SCR-51） ----

function stamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function openBackup() {
  const item = (iconName, label, desc, onClick) => h('button', { type: 'button', class: 'menu-item tall', onClick },
    icon(iconName), h('span', {}, h('strong', {}, label), desc ? h('small', {}, desc) : null));
  openSheet({
    title: t('backup.title'),
    render: () => h('div', { class: 'menu' },
      item('download', t('backup.exportJson'), t('backup.exportJsonDesc'), exportJson),
      item('file', t('backup.exportCsv'), t('backup.exportCsvDesc'), exportCsv),
      item('upload', t('backup.import'), null, importBackup)),
  });
}

async function exportJson() {
  const data = JSON.stringify(await store.exportData(), null, 2);
  downloadFile(`stacklog-${stamp()}.json`, new Blob([data], { type: 'application/json' }));
  toast(t('backup.exported'));
}

function exportCsv() {
  const csv = recordsCsv(store.state, {
    header: ['day', 'start', 'subject', 'category', 'todos', 'study', 'break', 'mode'].map((k) => t(`csv.${k}`)),
    modeLabel: (m) => t(`mode.${m}`),
    formatStart: formatDateTime,
  });
  downloadFile(`stacklog-records-${stamp()}.csv`, new Blob([csv], { type: 'text/csv' }));
  toast(t('backup.exported'));
}

// 読み込み方法の選択（DLG-52）
function importBackup() {
  const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    let data;
    try {
      data = store.parseBackup(await file.text());
    } catch (e) {
      toast(t(e.message === 'newer' ? 'backup.newer' : 'backup.error'));
      return;
    }
    const sheet = openSheet({
      title: t('backup.chooseMode'),
      render: () => h('div', { class: 'menu' },
        h('button', {
          type: 'button',
          class: 'menu-item tall',
          onClick: () => { sheet.close(); store.importMerge(data); toast(t('backup.done')); },
        }, icon('layers'), h('span', {}, h('strong', {}, t('backup.merge')), h('small', {}, t('backup.mergeDesc')))),
        h('button', {
          type: 'button',
          class: 'menu-item tall danger',
          onClick: async () => {
            sheet.close();
            if (await confirmDialog({ message: t('backup.overwriteWarn'), okLabel: t('backup.overwrite'), danger: true })) {
              store.importOverwrite(data);
              toast(t('backup.done'));
            }
          },
        }, icon('download'), h('span', {}, h('strong', {}, t('backup.overwrite')), h('small', {}, t('backup.overwriteDesc'))))),
    });
  });
  document.body.append(input);
  input.click();
}
