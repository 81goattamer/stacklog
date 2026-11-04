import { Store } from './store.js';
import { loadRepo } from './db.js';

export const store = new Store({ repo: await loadRepo() });

export function subjectName(id) {
  return store.get('subjects', id)?.name ?? '';
}
