import * as assert from 'assert';
import * as vscode from 'vscode';
import { SessionStore } from '../../sessionStore';
import {
  MAIN_SESSION_ID,
  MAIN_SESSION_TITLE,
  NEW_SESSION_TITLE,
  withMessage
} from '../../sessions';

function fakeMemento(): vscode.Memento {
  const backing = new Map<string, unknown>();
  return {
    keys: () => [...backing.keys()],
    get: <T,>(key: string, defaultValue?: T): T => {
      return (backing.has(key) ? backing.get(key) : defaultValue) as T;
    },
    update: async (key: string, value: unknown): Promise<void> => {
      backing.set(key, value);
    }
  };
}

suite('SessionStore main chat', () => {
  test('getOrCreateMain creates the main session once', async () => {
    const store = new SessionStore(fakeMemento());
    try {
      const first = await store.getOrCreateMain();
      assert.strictEqual(first.id, MAIN_SESSION_ID);
      assert.strictEqual(first.title, MAIN_SESSION_TITLE);
      const second = await store.getOrCreateMain();
      assert.strictEqual(second.id, MAIN_SESSION_ID);
      assert.strictEqual(store.get(MAIN_SESSION_ID)?.title, MAIN_SESSION_TITLE);
    } finally {
      store.dispose();
    }
  });

  test('list excludes the main session', async () => {
    const store = new SessionStore(fakeMemento());
    try {
      const main = await store.getOrCreateMain();
      await store.save(withMessage(main, { role: 'user', text: 'hi' }, Date.now()));
      const regular = await store.create();
      await store.save(withMessage(regular, { role: 'user', text: 'hello' }, Date.now()));
      const ids = store.list().map((session) => session.id);
      assert.ok(!ids.includes(MAIN_SESSION_ID), 'main session should not be listed');
      assert.ok(ids.includes(regular.id), 'regular sessions should still be listed');
    } finally {
      store.dispose();
    }
  });

  test('create preserves an empty main session', async () => {
    const store = new SessionStore(fakeMemento());
    try {
      await store.getOrCreateMain();
      await store.create();
      await store.create();
      assert.ok(store.get(MAIN_SESSION_ID), 'empty main session should survive create()');
      assert.strictEqual(store.list().length, 1, 'only one empty regular session is kept');
    } finally {
      store.dispose();
    }
  });

  test('clear empties the transcript and resets the title', async () => {
    const store = new SessionStore(fakeMemento());
    try {
      const regular = await store.create();
      await store.save(withMessage(regular, { role: 'user', text: 'hello' }, Date.now()));
      const cleared = await store.clear(regular.id);
      assert.ok(cleared);
      assert.deepStrictEqual(cleared.messages, []);
      assert.strictEqual(cleared.title, NEW_SESSION_TITLE);
      assert.deepStrictEqual(store.get(regular.id)?.messages, []);
      const main = await store.getOrCreateMain();
      await store.save(withMessage(main, { role: 'user', text: 'hi' }, Date.now()));
      const clearedMain = await store.clear(main.id);
      assert.strictEqual(clearedMain?.title, MAIN_SESSION_TITLE);
      assert.strictEqual(await store.clear('missing'), undefined);
    } finally {
      store.dispose();
    }
  });
});

suite('SessionStore archive', () => {
  test('archive moves a session from list() to listArchived() and back', async () => {
    const store = new SessionStore(fakeMemento());
    try {
      const session = await store.create();
      await store.save(withMessage(session, { role: 'user', text: 'hello' }, Date.now()));
      await store.archive(session.id);
      assert.deepStrictEqual(store.list().map((s) => s.id), []);
      assert.deepStrictEqual(
        store.listArchived().map((s) => s.id),
        [session.id]
      );
      await store.restore(session.id);
      assert.deepStrictEqual(
        store.list().map((s) => s.id),
        [session.id]
      );
      assert.deepStrictEqual(store.listArchived(), []);
    } finally {
      store.dispose();
    }
  });

  test('archive ignores unknown ids and the main chat', async () => {
    const store = new SessionStore(fakeMemento());
    try {
      await store.getOrCreateMain();
      await store.archive(MAIN_SESSION_ID);
      await store.archive('missing');
      await store.restore('missing');
      assert.deepStrictEqual(store.listArchived(), []);
      assert.ok(store.get(MAIN_SESSION_ID), 'main chat survives archive attempts');
    } finally {
      store.dispose();
    }
  });

  test('create preserves archived sessions even when empty', async () => {
    const store = new SessionStore(fakeMemento());
    try {
      const session = await store.create();
      await store.archive(session.id);
      await store.create();
      assert.ok(store.get(session.id), 'archived session should survive create()');
    } finally {
      store.dispose();
    }
  });

  test('remove deletes an archived session for good', async () => {
    const store = new SessionStore(fakeMemento());
    try {
      const session = await store.create();
      await store.save(withMessage(session, { role: 'user', text: 'hello' }, Date.now()));
      await store.archive(session.id);
      await store.remove(session.id);
      assert.strictEqual(store.get(session.id), undefined);
      assert.deepStrictEqual(store.listArchived(), []);
    } finally {
      store.dispose();
    }
  });
});

suite('SessionStore rename', () => {
  test('rename retitles a session and ignores unknown ids and blank titles', async () => {
    const store = new SessionStore(fakeMemento());
    try {
      const session = await store.create();
      await store.save(withMessage(session, { role: 'user', text: 'hello' }, Date.now()));
      const renamed = await store.rename(session.id, '  New title  ');
      assert.ok(renamed);
      assert.strictEqual(renamed.title, 'New title');
      assert.strictEqual(renamed.messages.length, 1);
      assert.strictEqual(store.get(session.id)?.title, 'New title');
      assert.strictEqual(await store.rename('missing', 'x'), undefined);
      const kept = await store.rename(session.id, '   ');
      assert.strictEqual(kept?.title, 'New title');
      assert.strictEqual(store.get(session.id)?.title, 'New title');
    } finally {
      store.dispose();
    }
  });
});
