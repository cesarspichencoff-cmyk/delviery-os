'use strict';

const thread = document.querySelector('#chat-thread');
const form = document.querySelector('#chat-form');
const messageInput = document.querySelector('#chat-message');
const sendButton = document.querySelector('#send-message');
const resetButton = document.querySelector('#new-conversation');
const status = document.querySelector('#chat-status');

let busy = false;

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('Resposta local indisponível');
  }
  if (!response.ok || body?.ok === false) throw new Error('Atendimento local indisponível');
  return body;
}

function setBusy(value) {
  busy = value;
  messageInput.disabled = value;
  sendButton.disabled = value;
  resetButton.disabled = value;
  form.setAttribute('aria-busy', String(value));
}

function scrollToLatest() {
  thread.scrollTop = thread.scrollHeight;
}

function createMessage(role, text, options = {}) {
  const article = document.createElement('article');
  article.className = `message message-${role}`;

  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'Você' : 'TATÁ';

  const bubble = document.createElement('p');
  bubble.className = 'message-bubble';
  bubble.textContent = text;

  article.append(label, bubble);

  if (role === 'assistant' && options.turnId) {
    const trace = document.createElement('a');
    trace.className = 'trace-link';
    trace.href = `/trace/${encodeURIComponent(options.turnId)}`;
    trace.target = '_blank';
    trace.rel = 'noopener';
    trace.textContent = 'Abrir trace';
    trace.setAttribute('aria-label', 'Abrir trace desta resposta em uma nova aba');
    article.append(trace);
  }

  thread.append(article);
  scrollToLatest();
  return article;
}

function createPendingMessage() {
  const article = document.createElement('article');
  article.className = 'message message-assistant message-pending';
  article.setAttribute('aria-label', 'Preparando resposta');

  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = 'TATÁ';

  const bubble = document.createElement('p');
  bubble.className = 'message-bubble';
  bubble.innerHTML = '<span></span><span></span><span></span>';

  article.append(label, bubble);
  thread.append(article);
  scrollToLatest();
  return article;
}

function showWelcome() {
  thread.replaceChildren();
  createMessage('assistant', 'Oi! Estou por aqui. Como posso ajudar?');
}

function responseFrom(body) {
  const turn = body?.turn || body?.result || body || {};
  const text = turn.response?.text
    || turn.response
    || body?.response?.text
    || body?.response
    || body?.published_response?.text
    || body?.published_response;
  const turnId = turn.turn_id || turn.id || body?.turn_id || body?.trace_id || body?.trace?.turn_id || body?.trace?.id;
  return {
    text: typeof text === 'string' ? text.trim() : '',
    turnId: turnId == null ? '' : String(turnId)
  };
}

async function resetConversation(options = {}) {
  if (busy) return;
  setBusy(true);
  status.textContent = options.initial ? 'Preparando o atendimento…' : 'Iniciando uma nova conversa…';
  try {
    await api('/api/product/reset', { method: 'POST', body: {} });
    showWelcome();
    status.textContent = 'Nova conversa pronta.';
  } catch {
    if (!thread.children.length) showWelcome();
    status.textContent = 'Não foi possível reiniciar agora. Você ainda pode tentar conversar.';
  } finally {
    setBusy(false);
    messageInput.focus();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const message = messageInput.value.trim();
  if (!message) return;

  createMessage('user', message);
  messageInput.value = '';
  messageInput.style.height = '';
  const pending = createPendingMessage();
  setBusy(true);
  status.textContent = 'Preparando uma resposta…';

  try {
    const body = await api('/api/product/turn', { method: 'POST', body: { message } });
    const result = responseFrom(body);
    if (!result.text) throw new Error('Resposta vazia');
    pending.remove();
    createMessage('assistant', result.text, { turnId: result.turnId });
    status.textContent = 'Resposta pronta.';
  } catch {
    pending.remove();
    createMessage('assistant', 'Não consegui concluir esta resposta agora. Tente novamente em instantes.');
    status.textContent = 'A resposta não foi concluída.';
  } finally {
    setBusy(false);
    messageInput.focus();
  }
});

messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
});

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

resetButton.addEventListener('click', () => resetConversation());

resetConversation({ initial: true });

