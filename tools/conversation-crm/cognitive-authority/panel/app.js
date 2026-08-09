'use strict';

const left = document.querySelector('#left');
const right = document.querySelector('#right');
const form = document.querySelector('#composer');
const message = document.querySelector('#message');
const status = document.querySelector('#status');

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error_code || 'Falha local');
  return body;
}

function bubble(root, role, text) {
  const item = document.createElement('p');
  item.className = `bubble ${role}`;
  item.textContent = text;
  root.append(item);
  root.scrollTop = root.scrollHeight;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = message.value.trim();
  if (!value) return;
  bubble(left, 'customer', value);
  bubble(right, 'customer', value);
  message.value = '';
  status.textContent = 'As duas conversas estão respondendo…';
  try {
    const result = await api('/api/cognitive-authority/turn', { method: 'POST', body: { message: value } });
    bubble(left, 'assistant', result.turn.left);
    bubble(right, 'assistant', result.turn.right);
    status.textContent = 'Compare somente a experiência. O diagnóstico continua oculto.';
  } catch (error) {
    status.textContent = `Não foi possível concluir o turno: ${error.message}`;
  }
});

document.querySelectorAll('[data-vote]').forEach((button) => button.addEventListener('click', async () => {
  try {
    await api('/api/cognitive-authority/vote', { method: 'POST', body: { preference: button.dataset.vote } });
    const reveal = await api('/api/cognitive-authority/reveal');
    status.textContent = `Voto registrado. Diagnóstico liberado: Conversa A = variante ${reveal.assignment.left}; Conversa B = variante ${reveal.assignment.right}.`;
  } catch (error) {
    status.textContent = error.message;
  }
}));

document.querySelector('#reset').addEventListener('click', async () => {
  await api('/api/cognitive-authority/reset', { method: 'POST' });
  left.replaceChildren();
  right.replaceChildren();
  status.textContent = 'Nova comparação iniciada.';
  message.focus();
});

api('/api/cognitive-authority/reset', { method: 'POST' }).then(() => message.focus()).catch((error) => {
  status.textContent = error.message;
});
