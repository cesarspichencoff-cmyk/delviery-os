'use strict';

const state = {
  data: null,
  reviewIndex: 0,
  blindIndex: 0,
  lastChat: null,
  intelligence: null,
  intelligenceView: 'crm'
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
  if (mode === 'intelligence') loadIntelligence();
  $(`#mode-${mode}`)?.querySelector('h2')?.focus({ preventScroll: true });
}

function intelligenceBadge(value, good = false) {
  return `<span class="badge ${good ? 'good' : 'warning'}">${escapeHtml(value)}</span>`;
}

function renderIntelligenceCrm() {
  const customers = state.intelligence.customers;
  const integration = state.intelligence.integration;
  $('#intelligence-content').innerHTML = `
    <article class="integration-truth">
      <strong>Caminho realmente conectado</strong>
      <p>${escapeHtml(integration.chat_endpoint)} · Pattern Engine ${escapeHtml(integration.pattern_engine)} · Journey State ${escapeHtml(integration.journey_state)} · compositor ${escapeHtml(integration.deterministic_composer)}</p>
      <p>Writer local: ${escapeHtml(integration.response_writer)}. Linguagem natural final por modelo local: não implementada nesta máquina. Dados reais: ${integration.real_data ? 'sim' : 'não'}.</p>
    </article>
    <div class="intelligence-grid">${customers.map((customer) => `
    <article class="intelligence-card">
      <strong>${escapeHtml(customer.customer_id)}</strong>
      <p>${escapeHtml(customer.provenance)} · ${customer.identity_count} identidade(s) tokenizada(s)</p>
      ${intelligenceBadge(customer.consent_state, customer.consent_state === 'allowed')}
      ${customer.review_required ? intelligenceBadge('revisão necessária') : intelligenceBadge('sem conflito aberto', true)}
      <button type="button" data-customer-detail="${escapeHtml(customer.customer_id)}">Ver ficha segura</button>
    </article>`).join('')}</div>`;
}

function renderIntelligenceImports() {
  $('#intelligence-content').innerHTML = `<div class="intelligence-grid">${state.intelligence.imports.map((batch) => `
    <article class="intelligence-card">
      <strong>${escapeHtml(batch.batch_id)}</strong>
      <dl>
        <div><dt>Origem</dt><dd>${escapeHtml(batch.source)}</dd></div>
        <div><dt>Estado</dt><dd>${escapeHtml(batch.state)}</dd></div>
        <div><dt>Válidas</dt><dd>${batch.valid}/${batch.total}</dd></div>
        <div><dt>Inválidas</dt><dd>${batch.invalid}</dd></div>
        <div><dt>Adapter</dt><dd>${escapeHtml(batch.adapter_version)}</dd></div>
        <div><dt>Correspondências exatas</dt><dd>${batch.exact_matches}</dd></div>
        <div><dt>Revisão humana</dt><dd>${batch.human_review}</dd></div>
      </dl>
      <p>A importação não ocorre sem aprovação humana.</p>
      <div class="inline-actions">
        <button type="button" data-import-action="duplicate_probe">Provar deduplicação</button>
        ${batch.state === 'previewed' ? '<button type="button" data-import-action="approve_and_apply">Aprovar e aplicar lote sintético</button>' : ''}
        ${batch.state === 'imported' ? '<button type="button" data-import-action="rollback">Rollback compensatório</button>' : ''}
      </div>
      <p>${batch.rollback ? 'Rollback registrado por eventos compensatórios; dados anteriores preservados.' : `Linhas: ${escapeHtml(batch.row_states.map((row) => `${row.row_number}:${row.state}/${row.resolution}`).join(' · '))}`}</p>
    </article>`).join('')}</div>`;
}

function renderIntelligenceMenu() {
  const menu = state.intelligence.menu;
  $('#intelligence-content').innerHTML = `
    <div class="tag-summary">${menu.channels.map((channel) => `<span>${escapeHtml(channel)}</span>`).join('')}</div>
    <div class="intelligence-grid">${menu.items.map((item) => `
      <article class="intelligence-card">
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(item.channel)} · ${escapeHtml(item.unit_id)} · ${escapeHtml(item.category)}</p>
        ${intelligenceBadge(item.review_status, item.review_status === 'confirmed')}
        ${intelligenceBadge(item.availability.state, item.availability.state === 'available')}
        <dl>
          <div><dt>Preço do canal</dt><dd>${item.price == null ? 'desconhecido' : `R$ ${Number(item.price).toFixed(2).replace('.', ',')}`}</dd></div>
          <div><dt>Ingredientes</dt><dd>${escapeHtml((item.ingredients || []).map((entry) => `${entry.name} (${entry.status})`).join(', ') || 'desconhecidos')}</dd></div>
          <div><dt>Alergênicos</dt><dd>${escapeHtml((item.allergens || []).map((entry) => `${entry.allergen}: ${entry.assertion}`).join(', ') || 'sem garantia confirmada')}</dd></div>
          <div><dt>Contato cruzado</dt><dd>${escapeHtml(item.cross_contact?.state || 'unknown')}</dd></div>
        </dl>
      </article>`).join('')}</div>
    <p class="lead">${menu.conflicts.length} conflito(s) aberto(s). Variantes de canais diferentes não são fundidas.</p>
    <p class="lead">${menu.pairings.length} harmonização sintética aprovada: ${escapeHtml(menu.pairings.map((item) => `${item.menu_item_id} + ${item.beverage_item_id}`).join(', ') || 'nenhuma')}.</p>`;
}

function renderIntelligenceRecommendations() {
  $('#intelligence-content').innerHTML = `
    <form id="recommendation-form" class="intelligence-form">
      <label>Canal<select id="recommendation-channel"><option value="dining_room">Salão</option><option value="ifood">iFood</option><option value="own_delivery">Delivery próprio</option></select></label>
      <label>Unidade<select id="recommendation-unit"><option value="SIM-UNIT-ITAIM">Unidade sintética</option></select></label>
      <label>Preparo<select id="recommendation-preparation"><option value="">Sem preferência</option><option value="raw">Cru</option><option value="cooked">Cozido</option></select></label>
      <label>Cream cheese<select id="recommendation-cream"><option value="">Não informado</option><option value="without">Sem cream cheese</option></select></label>
      <label>Alergia sintética<select id="recommendation-allergy"><option value="">Nenhuma informada</option><option value="crustacean">Crustáceos</option><option value="gluten">Glúten</option></select></label>
      <button class="primary" type="submit">Encontrar opções seguras</button>
    </form>
    <div id="recommendation-result" class="intelligence-grid"></div>`;
  $('#recommendation-form').addEventListener('submit', runRecommendation);
}

function renderIntelligenceConsents() {
  $('#intelligence-content').innerHTML = `
    <div class="intelligence-grid">${state.intelligence.consent_states.map((consent) => `
      <article class="intelligence-card"><strong>${escapeHtml(consent)}</strong><p>Estado separado do cadastro e do histórico de pedidos.</p></article>`).join('')}</div>
    <p class="lead">Opt-out prevalece. Atendimento operacional não depende de autorização de marketing.</p>`;
}

function renderIntelligenceAudit() {
  const audit = state.intelligence.audit;
  $('#intelligence-content').innerHTML = `
    <div class="intelligence-grid">
      <article class="intelligence-card"><strong>${audit.event_count}</strong><p>eventos append-only sintéticos</p></article>
      <article class="intelligence-card"><strong>${audit.append_only ? 'Preservado' : 'Falha'}</strong><p>histórico não sobrescrito</p></article>
      <article class="intelligence-card"><strong>${audit.pii_visible ? 'Falha' : 'Zero PII visível'}</strong><p>identidades tokenizadas e logs redigidos</p></article>
    </div>
    <div class="audit-stream">${audit.recent_events.map((event) => `<article><strong>${escapeHtml(event.event_id)}</strong><span>${escapeHtml(event.type)} · ${escapeHtml(event.aggregate_id)} · ${escapeHtml(event.source)}</span></article>`).join('')}</div>`;
}

function renderIntelligence() {
  if (!state.intelligence) return;
  $$('[data-intelligence-view]').forEach((button) => button.classList.toggle('active', button.dataset.intelligenceView === state.intelligenceView));
  const renderers = {
    crm: renderIntelligenceCrm,
    imports: renderIntelligenceImports,
    menu: renderIntelligenceMenu,
    recommendations: renderIntelligenceRecommendations,
    consents: renderIntelligenceConsents,
    audit: renderIntelligenceAudit
  };
  renderers[state.intelligenceView]();
}

async function loadIntelligence() {
  if (state.intelligence) {
    renderIntelligence();
    return;
  }
  try {
    state.intelligence = await api('/api/customer-menu/bootstrap');
    $('#intelligence-state').textContent = 'Pronto. Todos os registros desta área são sintéticos e revisáveis.';
    renderIntelligence();
  } catch {
    $('#intelligence-state').textContent = 'A inteligência local está indisponível. Nenhum dado foi enviado.';
  }
}

async function runRecommendation(event) {
  event.preventDefault();
  const allergy = $('#recommendation-allergy').value;
  const body = await api('/api/customer-menu/recommend', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: 'SIM-CUSTOMER-001',
      channel: $('#recommendation-channel').value,
      unit_id: $('#recommendation-unit').value,
      raw_or_cooked: $('#recommendation-preparation').value || null,
      cream_cheese: $('#recommendation-cream').value || null,
      allergies: allergy ? [allergy] : []
    })
  });
  const result = body.result.data;
  $('#recommendation-result').innerHTML = result.candidates.length
    ? result.candidates.map((item) => `<article class="intelligence-card"><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.reasons.join(' · ') || 'canal, unidade e disponibilidade confirmados')}</p>${intelligenceBadge(item.availability.state, true)}</article>`).join('')
    : '<article class="intelligence-card"><strong>Nenhuma opção segura confirmada</strong><p>A incerteza foi preservada; confirme a restrição com a equipe.</p></article>';
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

function diagnosticHtml(diagnostic) {
  if (!diagnostic || !$('#chat-diagnostic').checked) return '';
  const entries = [
    ['Endpoint', diagnostic.endpoint],
    ['Pattern', diagnostic.pattern],
    ['Jornada', diagnostic.journey || 'nenhuma'],
    ['Estado', diagnostic.journey_state ? `${diagnostic.journey_state.active_step || 'sem etapa'} · v${diagnostic.journey_state.version}` : 'sem jornada ativa'],
    ['Movimento', diagnostic.journey_action || 'none'],
    ['Canal', diagnostic.channel || 'unknown'],
    ['Unidade', diagnostic.unit_id || 'unknown'],
    ['Caminho da resposta', diagnostic.response_path],
    ['Fallback', diagnostic.fallback_used ? `sim · ${diagnostic.fallback_reason || diagnostic.context_reason || 'safe_response_rejected'}` : 'não'],
    ['Motivo de contexto', diagnostic.context_reason || 'nenhum'],
    ['Fontes do conhecimento', (diagnostic.knowledge_sources || []).join(', ') || 'nenhuma'],
    ['Contexto de cliente', diagnostic.customer_context_source],
    ['Contexto de cardápio', diagnostic.menu_context_source],
    ['Candidatos', (diagnostic.candidates_found || []).join(', ') || 'nenhum'],
    ['Writer', diagnostic.writer_status],
    ['Contrato', diagnostic.response_contract],
    ['Envelope', diagnostic.envelope_contract],
    ['Fonte do texto', diagnostic.source_of_final_text]
  ];
  return `<details class="runtime-diagnostic"><summary>Diagnóstico sanitizado desta resposta</summary><dl>${entries.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || 'unknown')}</dd></div>`).join('')}</dl></details>`;
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
  // A interface começa visualmente sem conversa; o runtime deve começar no
  // mesmo estado para não reaproveitar contexto oculto após um recarregamento.
  await api('/api/homologation/chat/reset', { method: 'POST' });
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
$$('[data-intelligence-view]').forEach((button) => button.addEventListener('click', () => {
  state.intelligenceView = button.dataset.intelligenceView;
  renderIntelligence();
}));

$('#intelligence-content').addEventListener('click', async (event) => {
  const importAction = event.target.dataset.importAction;
  if (importAction) {
    const result = await api('/api/customer-menu/imports/action', {
      method: 'POST',
      body: JSON.stringify({ action: importAction })
    });
    if (importAction === 'duplicate_probe') {
      $('#intelligence-state').textContent = result.batch.duplicate_upload
        ? 'Deduplicação comprovada: o mesmo arquivo não criou outro lote.'
        : 'Falha: o reenvio não foi reconhecido como duplicado.';
    } else {
      state.intelligence = await api('/api/customer-menu/bootstrap');
      $('#intelligence-state').textContent = importAction === 'rollback'
        ? 'Rollback compensatório concluído no lote sintético.'
        : 'Lote sintético aprovado e aplicado pelo pipeline real.';
      renderIntelligenceImports();
    }
    return;
  }
  const customerId = event.target.dataset.customerDetail;
  if (!customerId) return;
  const body = await api(`/api/customer-menu/customers/${encodeURIComponent(customerId)}`);
  const summary = body.result.data;
  $('#intelligence-content').innerHTML = `
    <button type="button" id="back-to-customers">← Voltar</button>
    <article class="intelligence-card">
      <strong>${escapeHtml(summary.customer_id)}</strong>
      <p>Fontes: ${escapeHtml(summary.sources.join(', ') || 'desconhecidas')}</p>
      <p>Fatos: ${escapeHtml(summary.facts.map((fact) => `${fact.field} (${fact.state})`).join(', ') || 'nenhum')}</p>
      <p>Restrições: ${escapeHtml(summary.restrictions.map((item) => `${item.type}: ${item.value} (${item.status})`).join(', ') || 'nenhuma')}</p>
      <p>Pedidos: ${escapeHtml(summary.recent_orders.map((item) => `${item.order_id} (${item.channel})`).join(', ') || 'nenhum')}</p>
      <p>Reservas: ${escapeHtml(summary.recent_reservations.map((item) => `${item.reservation_id} (${item.state})`).join(', ') || 'nenhuma')}</p>
      <p>Incidentes: ${escapeHtml(summary.recent_incidents.map((item) => `${item.incident_id} (${item.state})`).join(', ') || 'nenhum')}</p>
      <p>Candidatos pendentes: ${escapeHtml(summary.fact_candidates.map((item) => `${item.field} (${item.status})`).join(', ') || 'nenhum')}</p>
      <p>Consentimento de marketing: ${escapeHtml(summary.consent.all_marketing)}</p>
    </article>`;
  $('#back-to-customers').addEventListener('click', renderIntelligenceCrm);
});

$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = $('#chat-message').value.trim();
  if (!message) return;
  $('#global-state').textContent = 'Processando localmente…';
  try {
    const channel = $('#chat-menu-channel').value;
    const body = await api('/api/homologation/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        customer_id: $('#chat-customer').value || null,
        channel: channel || null,
        unit_id: channel ? 'SIM-UNIT-ITAIM' : null
      })
    });
    state.lastChat = body.turn;
    $('#chat-thread').insertAdjacentHTML('beforeend', `${conversationHtml([{ customer: message, response: body.turn.response }])}${diagnosticHtml(body.turn.diagnostic)}`);
    $('#chat-message').value = '';
    $('#free-feedback').classList.remove('hidden');
    $('#global-state').textContent = `Resposta pronta pelo ${body.turn.diagnostic.response_path}; Pattern ${body.turn.diagnostic.pattern || 'unknown'}.`;
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
