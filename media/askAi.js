(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('ask-form');
  const promptEl = document.getElementById('prompt');
  const conversationEl = document.getElementById('conversation');
  const statusEl = document.getElementById('status');
  const badgeEl = document.querySelector('.model-badge');
  const stopEl = document.getElementById('stop');

  let activeSessionId = null;
  let assistantEl = null;
  let assistantRaw = '';

  promptEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  conversationEl.addEventListener('click', (event) => {
    const anchor =
      event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) {
      return;
    }
    event.preventDefault();
    vscode.postMessage({ command: 'openLink', url: anchor.getAttribute('href') || '' });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const prompt = promptEl.value.trim();
    if (!prompt || !activeSessionId) {
      return;
    }
    appendMessage('user', prompt);
    promptEl.value = '';
    assistantEl = null;
    assistantRaw = '';
    setBusy(true);
    vscode.postMessage({ command: 'ask', prompt: prompt, sessionId: activeSessionId });
  });

  stopEl.addEventListener('click', () => {
    if (!activeSessionId) {
      return;
    }
    vscode.postMessage({ command: 'stop', sessionId: activeSessionId });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'transcript') {
      activeSessionId = message.sessionId;
      assistantEl = null;
      assistantRaw = '';
      conversationEl.textContent = '';
      for (const item of message.messages || []) {
        if (item.role === 'assistant') {
          renderAssistant(appendMessage('assistant', ''), item.text);
        } else {
          appendMessage('user', item.text);
        }
      }
      scrollToBottom();
      // The session may still be working (asked, then switched away and back).
      setBusy(message.busy === true);
      if (message.busy === true) {
        statusEl.textContent = 'Thinking...';
        statusEl.hidden = false;
      }
      return;
    }
    // Ignore late chunks for a session the user already left.
    if (message.sessionId && message.sessionId !== activeSessionId) {
      return;
    }
    if (message.command === 'model') {
      if (badgeEl) {
        badgeEl.textContent = 'Model: ' + (message.name || 'Auto');
      }
    } else if (message.command === 'status') {
      statusEl.textContent = message.text;
      statusEl.hidden = false;
      // Showing the status shrinks the conversation: re-scroll to bottom.
      scrollToBottom();
    } else if (message.command === 'chunk') {
      if (!assistantEl) {
        assistantEl = appendMessage('assistant', '');
        assistantRaw = '';
      } else if (assistantEl.nextSibling) {
        // Cards (questions, confirmations, log links) posted after the
        // bubble stay above it: the running answer always renders last.
        conversationEl.appendChild(assistantEl);
      }
      assistantRaw += message.text;
      renderAssistant(assistantEl, assistantRaw);
      scrollToBottom();
    } else if (message.command === 'confirm') {
      appendConfirm(message.id, message.title, message.detail);
    } else if (message.command === 'question') {
      appendQuestion(message.id, message.questions);
    } else if (message.command === 'actionLog') {
      appendActionLink();
    } else if (message.command === 'done') {
      setBusy(false);
    } else if (message.command === 'error') {
      appendMessage('error', message.message || 'Something went wrong.');
      setBusy(false);
    }
  });

  function renderAssistant(el, raw) {
    if (typeof renderMarkdown === 'function') {
      el.innerHTML = renderMarkdown(raw);
    } else {
      el.textContent = raw;
    }
  }

  function scrollToBottom() {
    conversationEl.scrollTop = conversationEl.scrollHeight;
  }

  function appendMessage(kind, text) {
    const div = document.createElement('div');
    div.className = 'message ' + kind;
    div.textContent = text;
    conversationEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  function appendConfirm(id, title, detail) {
    const div = document.createElement('div');
    div.className = 'message confirm';
    const label = document.createElement('div');
    label.className = 'confirm-title';
    label.textContent = title || 'Run this?';
    const code = document.createElement('code');
    code.textContent = detail || '';
    const row = document.createElement('div');
    row.className = 'confirm-actions';
    const ok = document.createElement('button');
    ok.textContent = 'Continue';
    ok.className = 'confirm-ok';
    const ko = document.createElement('button');
    ko.textContent = 'Cancel';
    ko.className = 'confirm-ko';
    const answer = (approved) => {
      ok.disabled = true;
      ko.disabled = true;
      div.classList.add(approved ? 'approved' : 'denied');
      vscode.postMessage({ command: 'confirmResult', id: id, approved: approved });
    };
    ok.addEventListener('click', () => answer(true));
    ko.addEventListener('click', () => answer(false));
    row.appendChild(ok);
    row.appendChild(ko);
    div.appendChild(label);
    if (detail) {
      div.appendChild(code);
    }
    div.appendChild(row);
    conversationEl.appendChild(div);
    scrollToBottom();
  }

  function appendQuestion(id, questions) {
    const div = document.createElement('div');
    div.className = 'message question';
    const list = Array.isArray(questions) ? questions : [];
    const rows = [];
    for (const item of list) {
      const q = item && typeof item === 'object' ? item : {};
      const wrap = document.createElement('div');
      wrap.className = 'question-item';
      const label = document.createElement('div');
      label.className = 'question-text';
      label.textContent = typeof q.question === 'string' && q.question ? q.question : 'Question';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'question-input';
      input.placeholder = 'Type your answer...';
      wrap.appendChild(label);
      const options = Array.isArray(q.options) ? q.options.filter((o) => typeof o === 'string' && o) : [];
      if (options.length > 0) {
        const opts = document.createElement('div');
        opts.className = 'question-options';
        for (const opt of options) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = opt;
          btn.className = 'question-option';
          btn.addEventListener('click', () => {
            input.value = opt;
            const siblings = opts.querySelectorAll('.question-option');
            for (const s of siblings) {
              s.classList.remove('selected');
            }
            btn.classList.add('selected');
          });
          opts.appendChild(btn);
        }
        wrap.appendChild(opts);
      }
      wrap.appendChild(input);
      div.appendChild(wrap);
      rows.push({ id: typeof q.id === 'string' && q.id ? q.id : '', input: input });
    }
    const row = document.createElement('div');
    row.className = 'confirm-actions';
    const send = document.createElement('button');
    send.textContent = 'Send';
    send.className = 'confirm-ok';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.className = 'confirm-ko';
    const done = (answers) => {
      const controls = div.querySelectorAll('button, input');
      for (const c of controls) {
        c.disabled = true;
      }
      div.classList.add(answers ? 'answered' : 'denied');
      vscode.postMessage({ command: 'answerResult', id: id, answers: answers });
    };
    send.addEventListener('click', () => {
      done(rows.map((r) => ({ id: r.id, value: r.input.value || '' })));
    });
    cancel.addEventListener('click', () => done(null));
    row.appendChild(send);
    row.appendChild(cancel);
    div.appendChild(row);
    conversationEl.appendChild(div);
    scrollToBottom();
  }

  function appendActionLink() {
    const div = document.createElement('div');
    div.className = 'message action-log';
    const button = document.createElement('button');
    button.textContent = 'See action logs...';
    button.className = 'link-button';
    button.addEventListener('click', () => {
      vscode.postMessage({ command: 'openActionLog', sessionId: activeSessionId });
    });
    div.appendChild(button);
    conversationEl.appendChild(div);
    scrollToBottom();
  }

  function setBusy(busy) {
    promptEl.disabled = busy;
    stopEl.disabled = !busy;
    if (!busy) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      promptEl.focus();
    }
  }
})();
