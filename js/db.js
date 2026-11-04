// データの保存先（IndexedDB）。起動時に全部メモリへ読み込み、以後は変更だけを書き込む。
import { TABLES, memoryRepo } from './store.js';

const DB_NAME = 'stacklog';
const DB_VERSION = 1;

// テーブルごとのインデックス（設計書3章）。多対多は multiEntry で逆引きする
const INDEXES = {
  categories: [],
  subjects: ['categoryId', 'status', 'hiddenAt'],
  todos: ['subjectId', 'dueAt', 'completedAt'],
  records: ['dayKey', 'subjectId', 'startAt', ['todoIds', { multiEntry: true }]],
  exams: [['subjectIds', { multiEntry: true }]],
  milestones: ['examId'],
  examAttempts: ['examId', 'date'],
  settings: [],
  activeSession: [],
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const [name, indexes] of Object.entries(INDEXES)) {
        const os = req.result.createObjectStore(name, { keyPath: 'id' });
        for (const ix of indexes) {
          const [key, opts] = Array.isArray(ix) ? ix : [ix, {}];
          os.createIndex(key, key, opts);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAll(db) {
  const names = [...TABLES, 'settings', 'activeSession'];
  const tx = db.transaction(names);
  return Promise.all(names.map((name) => new Promise((resolve, reject) => {
    const req = tx.objectStore(name).getAll();
    req.onsuccess = () => resolve([name, req.result]);
    req.onerror = () => reject(req.error);
  }))).then(Object.fromEntries);
}

// IndexedDB が使えない環境（一部のプライベートブラウズなど）ではメモリだけで動く
export async function loadRepo() {
  const repo = memoryRepo();
  let db = null;
  try {
    db = await openDb();
    repo.tables = await readAll(db);
  } catch {
    db = null;
  }
  if (db) {
    repo.write = (ops) => {
      const fail = (e) => {
        console.error('save failed', e);
        repo.onError?.(e);
      };
      try {
        const tx = db.transaction([...new Set(ops.map((o) => o.table))], 'readwrite');
        tx.onerror = () => fail(tx.error);
        tx.onabort = () => fail(tx.error);
        for (const op of ops) {
          const os = tx.objectStore(op.table);
          if (op.type === 'put') os.put(op.row);
          else if (op.type === 'delete') os.delete(op.id);
          else os.clear();
        }
      } catch (e) {
        fail(e);
      }
    };
  }
  return repo;
}
