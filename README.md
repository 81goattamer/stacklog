# Stacklog

学習の記録とタスクを積み上げて管理する PWA。

公開先：https://81goattamer.github.io/stacklog/

## 動かす

ビルドは不要。静的ファイルをそのまま配信する。

```sh
npm start        # http://localhost:8080 で起動
npm test         # データ処理と計算のテスト
```

ES モジュールと Service Worker を使うため、`index.html` をファイルとして直接開いても動かない。必ずサーバー経由で開く。

`npm start` はこの PC からしか開けない（`127.0.0.1` でのみ待ち受ける）。

`index.html` で Content-Security-Policy を設定しており、自分のサイト以外からのスクリプト・スタイル・通信は読み込まない。外部のファイルを使うときはここを書き換える。

## スマホで使う

1. このフォルダを HTTPS で公開する（例：GitHub Pages にこのフォルダを置く）
2. スマホのブラウザで開く
   - iPhone：Safari の共有ボタン →「ホーム画面に追加」
   - Android：Chrome のメニュー →「アプリをインストール」
3. 一度開けばオフラインでも動く

データは端末のブラウザ内（IndexedDB）に保存する。iPhone ではホーム画面に追加していないと長期間開かないときに消えることがあるので、設定の「バックアップと復元」で定期的に JSON を書き出す。

ホーム画面のアイコンのバッジは、対応している環境（インストールした PWA）でだけ表示される。

## 構成

| パス | 内容 |
| --- | --- |
| `js/store.js` | データの更新（削除の連鎖・記録中の状態・試験・バックアップ）。DOM に依存しない |
| `js/calc.js` | 保存しない値の計算（日付の区切り・ストリーク・グラフ・バッジ・タイマーの経過）。DOM に依存しない |
| `js/db.js` | IndexedDB への保存。起動時に全部メモリへ読み込み、以後は変更だけを書き込む |
| `js/app.js` | タブ切り替えと再描画、起動時の復元 |
| `js/views/` | ナビの5画面（試験・todo・本棚・データ・タイムライン）と、記録・設定・記録中（`session.js`）の画面 |
| `js/subject.js` / `js/exam.js` | 科目・カテゴリ、試験まわりのシート |
| `js/todo-form.js` / `js/record-form.js` / `js/fields.js` | todo・記録の編集と入力欄の部品 |
| `js/chart.js` | グラフ（SVG） |
| `js/images.js` | アイコン画像の切り抜き・縮小 |
| `js/keyboard.js` | キーボードを出しても画面全体がずれないようにする |
| `js/i18n.js` | 日本語・英語の文言 |
| `version.js` | アプリの版。公開するたびに上げる。上げると、開いている画面に「新しい版があります」が出る |
| `sw.js` | オフライン用のキャッシュ。ファイルを追加したら `FILES` に足す |
| `tools/make-icons.py` | 元画像（`icons/source-*.png`）からアイコン PNG を生成（Pillow が必要） |
