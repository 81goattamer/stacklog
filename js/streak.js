import { store } from './app-store.js';
import { streak } from './calc.js';
import { t } from './i18n.js';
import { h, icon } from './ui.js';

// ストリークの表示（LIST-01〜03）。ナビにある画面の見出しの下に出す
export function streakBanner() {
  const s = streak(store.state.records, store.state.settings.streakMinMinutes, Date.now());
  return h('div', { class: `streak ${s.kind}` }, icon('flame', { size: 20, fill: s.kind === 'active' }), h('span', {}, t(`streak.${s.kind}`, { n: s.n })));
}
