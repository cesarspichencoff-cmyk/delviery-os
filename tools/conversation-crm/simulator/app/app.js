'use strict';

const state = {
  data: null,
  reviewIndex: 0,
  blindIndex: 0,
  lastChat: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

const REVIEW_TAGS = [
  ['seco', 'Seco'], ['robotico', 'Robótico'], ['longo', 'Longo'], ['curto_demais', 'Curto demais'],
  ['generico', 'Genérico'], ['pouco_acolhedor', 'Pouco acolhedor'], ['informacao_errada', 'Informação errada'],
  ['pergunta_repetida', 'Pergunta repetida'], ['nao_respondeu', 'Não respondeu'],
  ['parece_mensagem_pronta', 'Parece mensagem pronta'], ['muito_bom', 'Muito bom']
];
const FREE_TAGS = [
  ['gostei', 'Gostei'], ['seco', 'Seco'], ['robotico', 'Robótico'], ['longo', 'Longo'],
  ['pouco_acolhedor', 'Pouco acolhedor'], ['informacao_errada', 'Informação errada'],
  ['pergunta_repetida', 'Pergunta repetida'], ['nao_respondeu', 'Não respondeu'], ['estranho', 'Estranho']
];
const CRITERIA = [
  ['naturalidade', 'Naturalidade'], ['acolhimento', 'Acolhimento'], ['clareza', 'Clareza'],
  ['utilidade', 'Utilidade'], ['tamanho', 'Tamanho'], ['confianca', 'Confiança']
];

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers
  });
  const body = await response.json().catch(() => ({ ok: false, error_code: 'INVALID_RESPONSE' }));
  if (!response.ok || body.ok === false) {
    const error = new Error(body.error_code || 'REQUEST_FAILED');
    error.code = body.error_code || 'REQUEST_FAILED';
    throw error;
  }
  return body;
}

function showMode(mode) {
  $$('.mode-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `mode-${mode}`));
  $$('[data-mode]').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (mode === 'dashboard') refreshDashboard();
  $(`#mode-${mode}`)?.querySelector('h2')?.focus({ preventScroll: true });
}

function checkboxChoices(items, name) {
  return items.map(([value, label]) => `<label><input type="checkbox" name="${name}" value="${value}"> ${escapeHtml(label)}</label>`).join('');
}

function scale(name, legend) {
  return `<div class="scale" aria-label="${escapeHtml(legend)}">${[1, 2, 3, 4, 5].map((value) => `<label><input type="radio" name="${name}" value="${value}" required><span>${value}</span></label>`).join('')}</div>`;
}

function conversationHtml(turns, responseKey = 'response') {
  return turns.map((turn) => `
    <div class="message customer"><span>Cliente</span><p>${escapeHtml(turn.customer)}</p></div>
    <div class="message bot"><span>TATÁ</span><p>${escapeHtml(turn[responseKey])}</p></div>
  `).join('');
}

function renderReviewSelectors() {
  const onlyPending = $('#only-pending').checked;
  const options = state.data.review_cases.filter((item) => !onlyPending || !item.evaluated);
  $('#review-select').innerHTML = options.map((item) => `<option value="${item.review_id}">${escapeHtml(item.category)} · ${item.evaluated ? 'avaliado' : 'pendente'}</option>`).join('');
  if (options.length && !options.some((item) => item.review_id === currentReview()?.review_id)) {
    state.reviewIndex = state.data.review_cases.findIndex((item) => item.review_id === options[0].review_id);
  }
  if (currentReview()) $('#review-select').value = currentReview().review_id;
}

function currentReview() { return state.data?.review_cases[state.reviewIndex]; }
function currentBlind() { return state.data?.blind_cases[state.blindIndex]; }

function renderReview() {
  const item = currentReview();
  if (!item) return;
  renderReviewSelectors();
  $('#review-conversation').innerHTML = `<p class="category">${escapeHtml(item.category)}</p>${conversationHtml(item.turns)}`;
  $('#review-technical-button').classList.toggle('hidden', !item.evaluated);
  $('#review-technical').classList.add('hidden');
  $('#review-state').textContent = item.evaluated ? 'Este caso já possui avaliação. Um novo voto será registrado como revisão.' : '';
}

function renderBlind() {
  const item = currentBlind();
  if (!item) return;
  $('#blind-select').value = item.review_id;
  $('#blind-context').innerHTML = `<p class="category">${escapeHtml(item.category)}</p>${item.turns.map((turn) => `<div class="message customer"><span>Cliente</span><p>${escapeHtml(turn.customer)}</p></div>`).join('')}`;
  $('#blind-responses').innerHTML = ['A', 'B'].map((side) => `<article><h3>Resposta ${side}</h3>${item.turns.map((turn) => `<div class="message bot"><p>${escapeHtml(turn[side])}</p></div>`).join('')}</article>`).join('');
  $('#blind-reveal').classList.add('hidden');
  $('#blind-technical').classList.add('hidden');
  $('#blind-technical-button').classList.toggle('hidden', !item.evaluated);
  $('#blind-state').textContent = item.evaluated ? 'Esta comparação já possui voto. Você pode revisá-lo.' : '';
  $$('input[name="blind-choice"]').forEach((input) => { input.checked = false; });
}

function renderBank() {
  $('#bank-grid').innerHTML = state.data.bank.map((item) => `
    <article>
      <span>${escapeHtml(item.category)}</span>
      <p>${escapeHtml(item.example)}</p>
      <button type="button" data-bank-example="${escapeHtml(item.example)}">Testar no atendimento</button>
    </article>
  `).join('');
}

function updateProgress() {
  const summary = state.data.summary.cesar_review;
  $('#review-progress').textContent = `${summary.evaluated}/${summary.total}`;
  $('#review-tab-count').textContent = `${summary.evaluated}/${summary.total}`;
  const compared = state.data.blind_cases.filter((item) => item.evaluated).length;
  $('#blind-progress').textContent = `${compared}/50`;
}

function renderTechnical(target, body) {
  const turns = body.decision.turns;
  target.innerHTML = `
    ${body.reveal ? `<div class="reveal-line"><strong>Revelação:</strong> A = ${escapeHtml(body.reveal.A === 'humanized' ? 'humanizada' : 'anterior')} · B = ${escapeHtml(body.reveal.B === 'humanized' ? 'humanizada' : 'anterior')}</div>` : ''}
    ${body.comparison ? `<section class="comparison-after-vote"><h3>${escapeHtml(body.comparison.label)}</h3>${body.comparison.turns.map((turn) => `
      <article><strong>Turno ${turn.turn}</strong>
        <div class="message bot"><span>Anterior</span><p>${escapeHtml(turn.previous)}</p></div>
        <div class="message bot"><span>Refinada</span><p>${escapeHtml(turn.refined)}</p></div>
      </article>`).join('')}</section>` : ''}
    ${turns.map((turn) => `<article>
      <h3>Decisão do DeliveryOS · turno ${turn.turn}</h3>
      <dl>
        <div><dt>Intenção</dt><dd>${escapeHtml(turn.intent)}</dd></div>
        <div><dt>Etapa</dt><dd>${escapeHtml(turn.conversation_stage)}</dd></div>
        <div><dt>Estado do cliente</dt><dd>${escapeHtml(turn.customer_state)}</dd></div>
        <div><dt>Gravidade</dt><dd>${escapeHtml(turn.gravity)}</dd></div>
        <div><dt>Estratégia</dt><dd>${escapeHtml(turn.strategy_id)}</dd></div>
        <div><dt>Fallback</dt><dd>${escapeHtml(turn.fallback_reason || 'nenhum')}</dd></div>
        <div><dt>Capacidade e driver</dt><dd>Preservados pelo runtime; não recalculados pelo painel.</dd></div>
        <div><dt>Evidência, autoridade e política</dt><dd>Explicação técnica sem prompt interno ou dado pessoal.</dd></div>
        <div><dt>Fatos autorizados</dt><dd>${escapeHtml(turn.authorized_facts.join(', ') || 'nenhum')}</dd></div>
        <div><dt>Perguntas obrigatórias</dt><dd>${escapeHtml(turn.mandatory_questions.join(', ') || 'nenhuma')}</dd></div>
        <div><dt>Ações verificadas</dt><dd>${escapeHtml(turn.verified_actions.join(', ') || 'nenhuma')}</dd></div>
        <div><dt>Ações pendentes</dt><dd>${escapeHtml(turn.pending_actions.join(', ') || 'nenhuma')}</dd></div>
        <div><dt>Claims proibidos</dt><dd>${escapeHtml(turn.prohibited_claims.join(', ') || 'nenhum')}</dd></div>
        <div><dt>Validador</dt><dd>${turn.validator?.passed ? 'aprovado' : 'não aprovado'}</dd></div>
        <div><dt>Replay</dt><dd>${escapeHtml(turn.replay_hash)}</dd></div>
      </dl>
    </article>`).join('')}
  `;
  target.classList.remove('hidden');
}

async function showTechnical(mode, targetSelector) {
  const item = mode === 'blind' ? currentBlind() : currentReview();
  const body = await api(`/api/homologation/technical?mode=${mode}&review_id=${encodeURIComponent(item.review_id)}`);
  renderTechnical($(targetSelector), body);
}

function renderDashboard(summary) {
  const review = summary.cesar_review;
  const metric = (label, value, note = '') => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? '—')}</strong><small>${escapeHtml(note)}</small></article>`;
  $('#dashboard-content').innerHTML = `
    <section><h3>Cobertura</h3><div class="metrics">
      ${metric('Avaliados', `${review.evaluated}/${review.total}`)}
      ${metric('Pendentes', review.pending)}
      ${metric('Concluído', `${review.completion_percent}%`)}
      ${metric('Categorias', review.categories_evaluated)}
    </div></section>
    <section><h3>Nova resposta refinada</h3><div class="metrics">
      ${metric('Nota média', review.overall_average)}
      ${Object.entries(review.criteria).map(([key, value]) => metric(key, value)).join('')}
    </div></section>
    <section><h3>Comparação cega</h3><div class="metrics">
      ${metric('Humanizada venceu', review.blind.humanized)}
      ${metric('Anterior venceu', review.blind.baseline)}
      ${metric('Empate', review.blind.equivalent)}
      ${metric('Ambas ruins', review.blind.both_bad)}
    </div></section>
    <section><h3>Pontos para análise</h3>
      <p>Notas 1–2: <strong>${review.low_rating_cases.length}</strong> · comentários: <strong>${review.comments_pending_analysis}</strong></p>
      <div class="tag-summary">${review.tags.map((item) => `<span>${escapeHtml(item.tag)} · ${item.count}</span>`).join('') || '<span>Sem tags ainda</span>'}</div>
    </section>
    <section class="reference"><h3>Referência futura de homologação</h3>
      <p>45/50 casos; médias geral, naturalidade e acolhimento ≥ 4; humanizada vence ≥ 70% dos casos não empatados; zero informação incorreta aceita. César mantém a decisão final.</p>
    </section>
  `;
}

async function refreshDashboard() {
  try {
    const body = await api('/api/homologation/summary');
    state.data.summary = body.summary;
    renderDashboard(body.summary);
    updateProgress();
  } catch {
    $('#dashboard-content').innerHTML = '<p class="error">Os resultados estão temporariamente indisponíveis. Nenhum voto foi perdido.</p>';
  }
}

function selectedValues(selector) {
  return $$(selector).filter((input) => input.checked).map((input) => input.value);
}

async function initialize() {
  state.data = await api('/api/homologation/bootstrap');
  $('#free-tags').innerHTML = checkboxChoices(FREE_TAGS, 'free-tag');
  $('#review-tags').innerHTML = checkboxChoices(REVIEW_TAGS, 'review-tag');
  $('#overall-rating').innerHTML = scale('overall', 'Nota geral');
  $('#criteria-grid').innerHTML = CRITERIA.map(([key, label]) => `<div><span>${escapeHtml(label)}</span>${scale(`criterion-${key}`, label)}</div>`).join('');
  $('#review-select').innerHTML = state.data.review_cases.map((item) => `<option value="${item.review_id}">${escapeHtml(item.category)}</option>`).join('');
  $('#blind-select').innerHTML = state.data.blind_cases.map((item) => `<option value="${item.review_id}">${escapeHtml(item.category)}</option>`).join('');
  renderReview();
  renderBlind();
  renderBank();
  updateProgress();
  $('#global-state').textContent = 'Pronto. Primeiro avalie a experiência; os detalhes técnicos permanecem fechados até o voto.';
}

$$('[data-mode]').forEach((button) => button.addEventListener('click', () => showMode(button.dataset.mode)));

$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('#chat-message').value.trim();
  if (!message) return;
  $('#global-state').textContent = 'Processando localmente…';
  try {
    const body = await api('/api/homologation/chat', { method: 'POST', body: JSON.stringify({ message }) });
    state.lastChat = body.turn;
    $('#chat-thread').insertAdjacentHTML('beforeend', conversationHtml([{ customer: message, response: body.turn.response }]));
    $('#chat-message').value = '';
    $('#free-feedback').classList.remove('hidden');
    $('#global-state').textContent = 'Resposta pronta. Nenhuma informação técnica foi exibida.';
  } catch {
    $('#global-state').textContent = 'Não foi possível responder agora. Nenhum detalhe técnico foi exposto.';
  }
});

$('#reset-chat').addEventListener('click', async () => {
  if (!window.confirm('Iniciar uma nova conversa sintética?')) return;
  await api('/api/homologation/chat/reset', { method: 'POST' });
  state.lastChat = null;
  $('#chat-thread').innerHTML = '<div class="welcome"><strong>Nova conversa iniciada.</strong><span>O contexto anterior não será misturado.</span></div>';
  $('#free-feedback').classList.add('hidden');
});

$('#save-free-feedback').addEventListener('click', async () => {
  if (!state.lastChat) return;
  try {
    await api('/api/homologation/feedback', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'free',
        review_id: state.lastChat.review_id,
        response_hash: state.lastChat.response_hash,
        tags: selectedValues('#free-tags input'),
        comment: $('#free-comment').value
      })
    });
    $('#free-feedback-state').textContent = 'Feedback salvo localmente. A resposta não foi alterada.';
  } catch (error) {
    $('#free-feedback-state').textContent = error.code === 'FEEDBACK_CONTAINS_PERSONAL_DATA'
      ? 'O comentário parece conter dado pessoal. Remova-o antes de salvar.'
      : 'Não foi possível salvar o feedback.';
  }
});

$('#review-select').addEventListener('change', () => {
  state.reviewIndex = state.data.review_cases.findIndex((item) => item.review_id === $('#review-select').value);
  renderReview();
});
$('#only-pending').addEventListener('change', renderReviewSelectors);
$('#previous-review').addEventListener('click', () => { state.reviewIndex = Math.max(0, state.reviewIndex - 1); renderReview(); });
$('#next-review').addEventListener('click', () => { state.reviewIndex = Math.min(state.data.review_cases.length - 1, state.reviewIndex + 1); renderReview(); });

$('#review-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const item = currentReview();
  const criteria = Object.fromEntries(CRITERIA.map(([key]) => [key, Number($(`input[name="criterion-${key}"]:checked`)?.value)]));
  try {
    await api('/api/homologation/feedback', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'refined',
        review_id: item.review_id,
        rating: Number($('input[name="overall"]:checked')?.value),
        criteria,
        tags: selectedValues('#review-tags input'),
        comment: $('#review-comment').value
      })
    });
    item.evaluated = true;
    $('#review-state').textContent = 'Avaliação salva. Os detalhes técnicos agora podem ser consultados.';
    $('#review-technical-button').classList.remove('hidden');
    await refreshDashboard();
  } catch (error) {
    $('#review-state').textContent = error.code === 'FEEDBACK_CONTAINS_PERSONAL_DATA'
      ? 'O comentário parece conter dado pessoal. Remova-o antes de salvar.'
      : 'Preencha a nota geral e todos os seis critérios.';
  }
});
$('#review-technical-button').addEventListener('click', () => showTechnical('refined', '#review-technical').catch(() => { $('#review-state').textContent = 'Salve o voto antes de abrir a decisão.'; }));

$('#blind-select').addEventListener('change', () => {
  state.blindIndex = state.data.blind_cases.findIndex((item) => item.review_id === $('#blind-select').value);
  renderBlind();
});
$('#previous-blind').addEventListener('click', () => { state.blindIndex = Math.max(0, state.blindIndex - 1); renderBlind(); });
$('#next-blind').addEventListener('click', () => { state.blindIndex = Math.min(49, state.blindIndex + 1); renderBlind(); });

$('#blind-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const item = currentBlind();
  const choice = $('input[name="blind-choice"]:checked')?.value;
  if (!choice) { $('#blind-state').textContent = 'Escolha uma opção antes de avançar.'; return; }
  try {
    await api('/api/homologation/feedback', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'blind',
        review_id: item.review_id,
        response_hash: '0'.repeat(64),
        choice,
        comment: $('#blind-comment').value
      })
    });
    item.evaluated = true;
    const details = await api(`/api/homologation/technical?mode=blind&review_id=${encodeURIComponent(item.review_id)}`);
    $('#blind-reveal').innerHTML = `<strong>Versões reveladas:</strong> A era ${details.reveal.A === 'humanized' ? 'a resposta humanizada' : 'a versão anterior'}; B era ${details.reveal.B === 'humanized' ? 'a resposta humanizada' : 'a versão anterior'}.`;
    $('#blind-reveal').classList.remove('hidden');
    $('#blind-technical-button').classList.remove('hidden');
    $('#blind-state').textContent = 'Voto salvo. A ordem permanecerá igual ao recarregar.';
    await refreshDashboard();
  } catch (error) {
    $('#blind-state').textContent = error.code === 'FEEDBACK_CONTAINS_PERSONAL_DATA'
      ? 'O comentário parece conter dado pessoal. Remova-o antes de salvar.'
      : 'Não foi possível salvar o voto.';
  }
});
$('#blind-technical-button').addEventListener('click', () => showTechnical('blind', '#blind-technical').catch(() => { $('#blind-state').textContent = 'Salve o voto antes de abrir os detalhes.'; }));

$('#bank-grid').addEventListener('click', (event) => {
  const example = event.target.dataset.bankExample;
  if (!example) return;
  $('#chat-message').value = example;
  showMode('free');
  $('#chat-message').focus();
});

$('#export-review').addEventListener('click', async () => {
  try {
    const body = await api('/api/homologation/export', { method: 'POST' });
    $('#global-state').textContent = `Avaliação exportada com privacidade verificada: ${body.package_name}`;
  } catch {
    $('#global-state').textContent = 'A exportação não pôde ser concluída. Os votos locais permanecem preservados.';
  }
});

$('#reset-review-session').addEventListener('click', async () => {
  if (!window.confirm('Reiniciar somente a sessão sintética de revisão?')) return;
  await api('/api/homologation/session/reset', { method: 'POST', body: JSON.stringify({ confirmation: 'RESET_SYNTHETIC_REVIEW_SESSION' }) });
  $('#global-state').textContent = 'Sessão reiniciada. Os votos append-only foram preservados.';
});

$('#delete-test-feedback').addEventListener('click', async () => {
  if (!window.confirm('Apagar somente o feedback sintético local? Esta ação não altera os artefatos aprovados.')) return;
  await api('/api/homologation/test-data/delete', { method: 'POST', body: JSON.stringify({ confirmation: 'DELETE_SYNTHETIC_FEEDBACK' }) });
  window.location.reload();
});

// Compatibilidade de inspeção do painel técnico anterior; estes controles nunca são exibidos antes do voto.
const legacyTechnicalRoutes = ['/api/native/replay', '/api/native/reset'];
void legacyTechnicalRoutes;
const humanPrompt = 'Banco sintético';
void humanPrompt;

initialize().catch(() => {
  $('#global-state').textContent = 'O painel não pôde ser iniciado. Nenhum dado foi enviado ou perdido.';
});
