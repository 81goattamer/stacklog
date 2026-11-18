// 締め切りが24時間以内の todo のお知らせ（アプリを開いたとき）。
// 勉強の記録中は出さず、その記録が終わった（保存・破棄した）ときに出す
import { store, subjectName } from './app-store.js';
import { dueSoonTodos, formatLeft } from './calc.js';
import { t } from './i18n.js';
import { h, icon, openSheet } from './ui.js';
import { recordWithTodo } from './views/record.js';

let waiting = false;

// 起動時に呼ぶ。記録中なら終わるまで待つ
export function dueAlertOnLaunch() {
  if (store.state.activeSession) {
    waiting = true;
    const off = store.subscribe(() => {
      if (!waiting || store.state.activeSession) return;
      waiting = false;
      off?.();
      // 記録の保存・破棄の画面の切り替えが済んでから出す
      setTimeout(openDueAlert, 300);
    });
  } else {
    openDueAlert();
  }
}

function openDueAlert() {
  if (store.state.activeSession || !dueSoonTodos(store.state.todos, Date.now()).length) return;
  let timer = null;
  const sheet = openSheet({
    title: t('dueAlert.title'),
    onClose: () => clearInterval(timer),
    render: (api) => {
      const list = dueSoonTodos(store.state.todos, Date.now());
      if (!list.length) {
        api.close();
        return h('div');
      }
      return h('div', {},
        h('p', { class: 'due-alert-msg' }, t('dueAlert.message', { n: list.length })),
        h('div', { class: 'card list' }, list.map((x) => h('button', {
          type: 'button',
          class: 'due-alert-row',
          onClick: () => { sheet.close(); recordWithTodo(x); },
        },
        h('div', { class: 'grow' },
          h('div', {}, x.content),
          x.subjectId ? h('div', { class: 'sub' }, subjectName(x.subjectId)) : null),
        h('span', { class: 'due-alert-left', 'data-due': x.dueAt }, formatLeft(x.dueAt - Date.now())),
        icon('chevron', { size: 18 })))),
        h('p', { class: 'muted small due-alert-hint' }, t('dueAlert.hint')));
    },
  });
  // 残り時間を1秒ごとに書き換える。締め切りを過ぎたものが出たら作り直す
  timer = setInterval(() => {
    const now = Date.now();
    let passed = false;
    for (const el of sheet.body.querySelectorAll('.due-alert-left')) {
      const left = Number(el.dataset.due) - now;
      if (left <= 0) passed = true;
      el.textContent = formatLeft(left);
    }
    if (passed) sheet.refresh();
  }, 1000);
}
