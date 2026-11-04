// タブの切り替え。app.js が実体を登録し、各画面から呼ぶ（循環参照を避けるため分けている）
let handler = () => {};

export function setNavHandler(fn) {
  handler = fn;
}

export function goTab(id) {
  handler(id);
}
