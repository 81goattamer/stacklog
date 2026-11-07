import { store } from '../app-store.js';
import { t } from '../i18n.js';
import { h, empty, setChildren } from '../ui.js';
import { recordRow } from '../record-form.js';
import { settingsButton } from '../nav.js';
import { streakBanner } from '../streak.js';

// 全記録を新しい順に並べる（LIST-22）。多いときは50件ずつ出す
const view = { limit: 50 };

export function renderTimeline(root) {
  const records = [...store.state.records].sort((a, b) => b.startAt - a.startAt);
  setChildren(root,
    h('header', { class: 'page-head' }, h('h1', {}, t('tab.timeline')), settingsButton()),
    streakBanner(),
    records.length
      ? h('div', { class: 'card list' }, records.slice(0, view.limit).map(recordRow))
      : empty(t('data.noRecords'), 'calendar'),
    records.length > view.limit
      ? h('button', { type: 'button', class: 'btn block next-btn', onClick: () => { view.limit += 50; renderTimeline(root); } }, t('common.more'))
      : null);
}
