// キーボードを出しても画面全体が上にずれないようにする。
// ブラウザは入力欄を見せるために表示領域を上へ動かすので、その分だけ body を逆に動かして打ち消す。
// キーボードの高さは --kb に入れ、スクロール領域とシートをその分だけ縮める（style.css）。
const MIN_KEYBOARD = 80;

export function initKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let lastKb = 0;
  const sync = () => {
    // ピンチで拡大しているときは、利用者の操作なので何もしない
    const zoomed = vv.scale > 1.01;
    const raw = zoomed ? 0 : Math.round(root.clientHeight - vv.height);
    const kb = raw >= MIN_KEYBOARD ? raw : 0;
    root.style.setProperty('--kb', `${kb}px`);
    if (window.scrollY) window.scrollTo(0, 0);
    document.body.style.transform = !zoomed && vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
    // キーボードが出たときだけ、入力欄が隠れないようにスクロールする
    if (kb > lastKb && document.activeElement?.matches('input, select, textarea')) {
      document.activeElement.scrollIntoView({ block: 'nearest' });
    }
    lastKb = kb;
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}
