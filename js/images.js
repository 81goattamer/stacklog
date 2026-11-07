// アイコン画像。中央を切り抜き、縮小してから保存する。
// 比率（縦÷横）は、科目は B4 の 1:√2（SHELF-03）、試験は正方形の 1
const WIDTH = 360;

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // 下の Image で読み直す
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 写真を選ばせ、切り抜いた JPEG の Blob を渡す。キャンセル時は何もしない
export function pickImage(onPicked, onError, ratio = Math.SQRT2) {
  const RATIO = ratio;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const src = await decode(file);
      const w = src.width;
      const h = src.height;
      const cw = Math.min(w, h / RATIO);
      const ch = cw * RATIO;
      const outW = Math.round(Math.min(WIDTH, cw));
      const outH = Math.round(outW * RATIO);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, outW, outH);
      src.close?.();
      canvas.toBlob((blob) => (blob ? onPicked(blob) : onError?.()), 'image/jpeg', 0.85);
    } catch {
      onError?.();
    }
  });
  document.body.append(input);
  input.click();
}
