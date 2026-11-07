// タブの切り替え。app.js が実体を登録し、各画面から呼ぶ（循環参照を避けるため分けている）
import { t } from './i18n.js';
import { iconButton } from './ui.js';

let handler = () => {};
let backHandler = () => {};

export function setNavHandler(fn, back) {
  handler = fn;
  backHandler = back;
}

export function goTab(id) {
  handler(id);
}

// 設定を開く前の画面に戻る
export function goBack() {
  backHandler();
}

// ナビにある画面の見出しの右上に置く、設定の歯車
export function settingsButton() {
  return iconButton('gear', t('tab.settings'), () => goTab('settings'), 'gear-btn');
}
