import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

/**
 * Minimal DOM element mirror for the panel script: appendChild moves an
 * already-attached child (like the real DOM) and the text setters clear
 * children. Only what media/askAi.js touches on the driven paths.
 */
class FakeElement {
  public children: FakeElement[] = [];
  public parentNode: FakeElement | null = null;
  public className = '';
  public disabled = false;
  public hidden = false;
  public value = '';
  public placeholder = '';
  public type = '';
  public scrollTop = 0;
  public scrollHeight = 0;
  public text = '';
  public html = '';
  private _classes = new Set<string>();
  private _focused = false;
  private _listeners: Array<{ type: string; listener: (event: unknown) => void }> = [];
  public readonly classList = {
    add: (...names: string[]): void => {
      for (const name of names) {
        this._classes.add(name);
      }
    },
    remove: (...names: string[]): void => {
      for (const name of names) {
        this._classes.delete(name);
      }
    }
  };

  public constructor(public tag = 'div') {}

  public get textContent(): string {
    return this.text;
  }

  public set textContent(value: string) {
    this.text = String(value);
    this._detachChildren();
  }

  public get innerHTML(): string {
    return this.html;
  }

  public set innerHTML(value: string) {
    this.html = String(value);
    this._detachChildren();
  }

  public get nextSibling(): FakeElement | null {
    if (!this.parentNode) {
      return null;
    }
    const siblings = this.parentNode.children;
    const at = siblings.indexOf(this);
    return at >= 0 && at + 1 < siblings.length ? siblings[at + 1] : null;
  }

  public appendChild(child: FakeElement): FakeElement {
    if (child.parentNode) {
      const siblings = child.parentNode.children;
      const at = siblings.indexOf(child);
      if (at >= 0) {
        siblings.splice(at, 1);
      }
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  public addEventListener(type: string, listener: (event: unknown) => void): void {
    this._listeners.push({ type, listener });
  }

  public focus(): void {
    this._focused = true;
  }

  private _detachChildren(): void {
    for (const child of this.children) {
      child.parentNode = null;
    }
    this.children = [];
  }
}

interface FakePanel {
  conversation: FakeElement;
  posted: unknown[];
  postMessage: (message: unknown) => void;
}

// The panel is a plain webview script: load the real shipped files in a VM,
// charts, markdown, panel then hover, like the panel HTML does.
function loadPanel(): FakePanel {
  const mediaDir = path.join(__dirname, '..', '..', '..', 'media');
  const conversation = new FakeElement('div');
  const byId: Record<string, FakeElement> = {
    'ask-form': new FakeElement('form'),
    prompt: new FakeElement('textarea'),
    conversation,
    status: new FakeElement('p'),
    stop: new FakeElement('button')
  };
  let messageListener: ((event: { data: unknown }) => void) | undefined;
  const posted: unknown[] = [];
  const sandbox: Record<string, unknown> = {
    acquireVsCodeApi: () => ({
      postMessage: (message: unknown): void => {
        posted.push(message);
      }
    }),
    document: {
      getElementById: (id: string): FakeElement | null => byId[id] ?? null,
      createElement: (tag: string): FakeElement => new FakeElement(tag),
      querySelector: (): FakeElement | null => null,
      addEventListener: (): void => undefined
    },
    window: {
      addEventListener: (
        type: string,
        listener: (event: { data: unknown }) => void
      ): void => {
        if (type === 'message') {
          messageListener = listener;
        }
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(mediaDir, 'charts.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(mediaDir, 'markdown.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(mediaDir, 'askAi.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(mediaDir, 'chartInteract.js'), 'utf8'), sandbox);
  assert.ok(messageListener, 'panel registers a message listener');
  return {
    conversation,
    posted,
    postMessage: (message: unknown): void => messageListener?.({ data: message })
  };
}

function childClasses(conversation: FakeElement): string[] {
  return conversation.children.map((child) => child.className);
}

suite('askAiWebview', () => {
  test('answer text after cards renders below them in one bubble', () => {
    const panel = loadPanel();
    panel.postMessage({
      command: 'transcript',
      sessionId: 's1',
      messages: [{ role: 'user', text: 'run ram-report' }],
      busy: true
    });
    panel.postMessage({ command: 'chunk', sessionId: 's1', text: 'Lead-in. ' });
    panel.postMessage({
      command: 'question',
      sessionId: 's1',
      id: 'question-1',
      questions: [{ id: 'q1', question: 'Top 5 or 10?', options: ['5', '10'] }]
    });
    panel.postMessage({ command: 'chunk', sessionId: 's1', text: 'Middle. ' });
    panel.postMessage({ command: 'actionLog', sessionId: 's1' });
    panel.postMessage({ command: 'chunk', sessionId: 's1', text: 'Final.' });
    panel.postMessage({ command: 'done', sessionId: 's1' });

    assert.deepStrictEqual(childClasses(panel.conversation), [
      'message user',
      'message question',
      'message action-log',
      'message assistant'
    ]);
    const bubble = panel.conversation.children[3];
    const lead = bubble.html.indexOf('Lead-in.');
    const middle = bubble.html.indexOf('Middle.');
    const final = bubble.html.indexOf('Final.');
    assert.ok(
      lead >= 0 && middle > lead && final > middle,
      'single bubble keeps the full answer in order'
    );
  });

  test('chunks without cards stay in a single bubble', () => {
    const panel = loadPanel();
    panel.postMessage({
      command: 'transcript',
      sessionId: 's1',
      messages: [{ role: 'user', text: 'hi' }],
      busy: true
    });
    panel.postMessage({ command: 'chunk', sessionId: 's1', text: 'Hello. ' });
    panel.postMessage({ command: 'chunk', sessionId: 's1', text: 'There.' });
    panel.postMessage({ command: 'done', sessionId: 's1' });

    assert.deepStrictEqual(childClasses(panel.conversation), [
      'message user',
      'message assistant'
    ]);
    const bubble = panel.conversation.children[1];
    assert.ok(bubble.html.includes('Hello.'), 'first chunk kept');
    assert.ok(bubble.html.includes('There.'), 'second chunk kept');
  });

  test('assistant chart blocks render as inline SVG in the bubble', () => {
    const panel = loadPanel();
    panel.postMessage({
      command: 'transcript',
      sessionId: 's1',
      messages: [
        {
          role: 'assistant',
          text: 'Top RAM:\n```chart\n{"type":"bar","labels":["a","b"],"datasets":[{"label":"MB","data":[10,20]}]}\n```'
        }
      ],
      busy: false
    });
    const bubble = panel.conversation.children[0];
    assert.ok(bubble.html.includes('Top RAM:'), 'text kept');
    assert.ok(bubble.html.includes('<figure class="md-chart"'), 'chart figure rendered');
    assert.ok(bubble.html.includes('<svg'), 'chart renders as SVG');
  });
});
