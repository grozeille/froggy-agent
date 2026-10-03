(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('ask-form');
  const promptEl = document.getElementById('prompt');
  const conversationEl = document.getElementById('conversation');
  const statusEl = document.getElementById('status');

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
      setBusy(false);
      return;
    }
    // Ignore late chunks for a session the user already left.
    if (message.sessionId && message.sessionId !== activeSessionId) {
      return;
    }
    if (message.command === 'status') {
      statusEl.textContent = message.text;
      statusEl.hidden = false;
    } else if (message.command === 'chunk') {
      if (!assistantEl) {
        assistantEl = appendMessage('assistant', '');
        assistantRaw = '';
      }
      assistantRaw += message.text;
      renderAssistant(assistantEl, assistantRaw);
      conversationEl.scrollTop = conversationEl.scrollHeight;
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

  function appendMessage(kind, text) {
    const div = document.createElement('div');
    div.className = 'message ' + kind;
    div.textContent = text;
    conversationEl.appendChild(div);
    conversationEl.scrollTop = conversationEl.scrollHeight;
    return div;
  }

  function setBusy(busy) {
    promptEl.disabled = busy;
    if (!busy) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      promptEl.focus();
    }
  }
})();
