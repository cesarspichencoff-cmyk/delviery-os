'use strict';

const form = document.querySelector('#triage-form');
const caseSelect = document.querySelector('#case-select');
const message = document.querySelector('#message');
const origin = document.querySelector('#origin');
const severity = document.querySelector('#severity');
const orderReference = document.querySelector('#order-reference');
const detailCode = document.querySelector('#detail-code');
const result = document.querySelector('#result');
const requestState = document.querySelector('#request-state');
const evaluation = document.querySelector('#evaluation');
const evaluationState = document.querySelector('#evaluation-state');
const experienceNote = document.querySelector('#experience-note');
const saveExperienceNote = document.querySelector('#save-experience-note');
const advanceClock = document.querySelector('#advance-clock');
const replayState = document.querySelector('#replay-state');
const resetState = document.querySelector('#reset-state');
const clockState = document.querySelector('#clock-state');
const humanTest = document.querySelector('#human-test');
const humanGroupList = document.querySelector('#human-group-list');
const humanGroupPrompts = document.querySelector('#human-group-prompts');
const developmentMode = new URLSearchParams(window.location.search).get('dev') === '1';
let cases = [];
let humanGroups = [];
let activeCase = 'manual';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function tokenList(values, kind = '') {
  if (!values?.length) return '<span class="token">nenhum</span>';
  return values.map((value) => `<span class="token ${kind}">${escapeHtml(value)}</span>`).join('');
}

function asPanelOutput(output) {
  if (!output.classification) return output;
  return {
    raw: output,
    intent: output.classification.intent,
    origin: output.classification.origin,
    severity: output.classification.severity,
    block_code: output.classification.legacy_projection?.primary_block,
    confidence: output.classification.confidence,
    human_required: output.classification.escalation !== 'E0',
    escalation_code: output.classification.escalation,
    known_field_labels: Object.keys(output.classification.entities || {}),
    missing_field_labels: output.classification.fields_missing,
    suggested_response: output.response?.text,
    previous_response: output.response?.previous_text,
    response_plan: output.response?.plan,
    response_validation: output.response?.validation,
    response_repetition: output.response?.repetition,
    response_comparison: output.response?.comparison,
    tags: output.classification.legacy_projection?.tags || [],
    allowed_actions: [output.classification.action],
    forbidden_actions: output.classification.prohibited_responses || [],
    capability: output.classification.capability_id,
    driver: output.route?.driver_id,
    evidence: output.evidence?.evidence_id,
    authority: output.classification.authority,
    policy: output.classification.policy_id,
    result_status: output.result?.status,
    crm_record: output.case_id ? { entity_type: 'NativeCase', summary_code: output.case_id, status: output.closure?.expected_state } : null
  };
}

function technicalDecision(output) {
  return `
    <div class="result-grid technical-grid">
      <div class="summary">
        <div class="metric"><span>Intenção</span><strong>${escapeHtml(output.intent_label || output.intent)}</strong></div>
        <div class="metric"><span>Origem</span><strong>${escapeHtml(output.origin_label || output.origin)}</strong></div>
        <div class="metric"><span>Gravidade</span><strong>${escapeHtml(output.severity_label || output.severity)}</strong></div>
      </div>
      <div class="card"><h3>Bloco e confiança</h3><p><strong>${escapeHtml(output.block_code || output.block_id)}</strong> · ${Math.round(output.confidence * 100)}% · humano: ${output.human_required ? 'sim' : 'não'}</p><p>Escalonamento: ${escapeHtml(output.escalation_code || output.escalation_level)}</p></div>
      <div class="card"><h3>Fatos conhecidos</h3><div class="tokens">${tokenList(output.known_field_labels || output.known_fields)}</div></div>
      <div class="card"><h3>Fatos faltantes</h3><div class="tokens">${tokenList(output.missing_field_labels || output.missing_fields, 'warn')}</div></div>
      <div class="card"><h3>Capacidade e driver</h3><p>${escapeHtml(output.capability || 'legado')} · ${escapeHtml(output.driver || 'não selecionado')} · resultado: ${escapeHtml(output.result_status || 'n/a')}</p></div>
      <div class="card"><h3>Evidência e autoridade</h3><p>${escapeHtml(output.evidence || 'sem evidência')} · ${escapeHtml(output.authority || 'n/a')} · ${escapeHtml(output.policy || 'n/a')}</p></div>
      <div class="card"><h3>Ações permitidas</h3><div class="tokens">${tokenList(output.allowed_actions)}</div></div>
      <div class="card"><h3>Ações proibidas</h3><div class="tokens">${tokenList(output.forbidden_actions, 'block')}</div></div>
      <div class="card"><h3>Validação da linguagem</h3><p>${output.response_validation?.passed ? 'aprovada' : 'fallback seguro'} · achados: ${escapeHtml((output.response_validation?.findings || []).join(', ') || 'nenhum')}</p></div>
      <div class="card"><h3>CRM</h3><p>${output.crm_record ? `${escapeHtml(output.crm_record.entity_type)} · ${escapeHtml(output.crm_record.summary_code)} · ${escapeHtml(output.crm_record.status)}` : 'nenhum registro obrigatório'}</p></div>
    </div>`;
}

function comparisonView(output) {
  const comparison = output.response_comparison || {};
  return `
    <div class="comparison-grid">
      <div class="card"><h3>Resposta anterior</h3><p>${escapeHtml(output.previous_response || 'indisponível')}</p></div>
      <div class="card"><h3>Resposta humanizada</h3><p>${escapeHtml(output.suggested_response)}</p></div>
      <div class="card"><h3>Diferenças técnicas</h3><p>tamanho: ${escapeHtml(comparison.previous_length)} → ${escapeHtml(comparison.humanized_length)} · alterada: ${comparison.changed ? 'sim' : 'não'} · risco de promessa: ${comparison.risk_of_promise ? 'sim' : 'não'}</p><p>alertas de repetição: ${escapeHtml((comparison.conversation_warnings || []).join(', ') || 'nenhum')}</p></div>
    </div>`;
}

function render(rawOutput) {
  const output = asPanelOutput(rawOutput);
  result.classList.remove('empty');
  result.innerHTML = `
    <article class="customer-response">
      <p class="eyebrow">RESPOSTA DO TATÁ</p>
      <p class="response-copy">${escapeHtml(output.suggested_response)}</p>
      <p class="response-meta">Simulação local · nenhuma mensagem enviada</p>
    </article>
    <details id="technical-decision" class="technical-decision">
      <summary>Ver decisão do DeliveryOS</summary>
      ${technicalDecision(output)}
    </details>
    <details id="response-comparison" class="developer-only hidden">
      <summary>Comparar resposta anterior × resposta humanizada</summary>
      ${comparisonView(output)}
    </details>`;
  if (developmentMode) result.querySelectorAll('.developer-only').forEach((element) => element.classList.remove('hidden'));
  evaluation.classList.remove('hidden');
}

function loadPrompt(prompt) {
  activeCase = 'manual';
  caseSelect.value = 'manual';
  message.value = prompt;
  origin.value = '';
  severity.value = '';
  orderReference.value = '';
  detailCode.value = '';
  requestState.textContent = 'Pergunta carregada para o atendimento livre.';
  message.focus();
}

async function loadCases() {
  const response = await fetch('/api/cases');
  const body = await response.json();
  cases = body.cases || [];
  for (const item of cases) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.id} · ${item.category}`;
    caseSelect.appendChild(option);
  }
}

async function loadHumanGroups() {
  const response = await fetch('/api/human-test-groups');
  const body = await response.json();
  humanGroups = body.groups || [];
  humanGroupList.innerHTML = humanGroups.map((group) => `<button type="button" data-human-group="${escapeHtml(group.id)}">${escapeHtml(group.label)}</button>`).join('');
}

async function refreshClock() {
  const response = await fetch('/api/health');
  const body = await response.json();
  clockState.textContent = body.clock ? `Relógio: ${body.clock}` : 'Modo local';
}

caseSelect.addEventListener('change', () => {
  activeCase = caseSelect.value;
  const selected = cases.find((item) => item.id === activeCase);
  if (!selected) return;
  message.value = selected.message;
  origin.value = selected.context.origin || '';
  severity.value = selected.context.severity || '';
  orderReference.value = selected.context.order_reference || '';
  detailCode.value = selected.context.occurrence_detail_code || '';
});

humanTest?.addEventListener('click', (event) => {
  const humanPrompt = event.target.dataset.humanPrompt;
  if (humanPrompt) loadPrompt(humanPrompt);
});

humanGroupList?.addEventListener('click', (event) => {
  const groupId = event.target.dataset.humanGroup;
  if (!groupId) return;
  const group = humanGroups.find((item) => item.id === groupId);
  if (!group) return;
  humanGroupList.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.humanGroup === groupId));
  humanGroupPrompts.innerHTML = `<strong>${escapeHtml(group.label)}</strong>${group.prompts.map((prompt) => `<button type="button" data-human-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}`;
});

humanGroupPrompts?.addEventListener('click', (event) => {
  const humanPrompt = event.target.dataset.humanPrompt;
  if (humanPrompt) loadPrompt(humanPrompt);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  requestState.textContent = 'O TATÁ está preparando a resposta…';
  const selected = cases.find((item) => item.id === activeCase);
  const context = selected ? { ...selected.context } : {};
  if (origin.value) context.origin = origin.value;
  if (severity.value) context.severity = severity.value;
  if (orderReference.value) context.order_reference = orderReference.value;
  if (detailCode.value) context.occurrence_detail_code = detailCode.value;
  try {
    const nativeScenario = developmentMode && activeCase.startsWith('TATA-SC-');
    const response = await fetch(nativeScenario ? `/api/native/scenarios/${activeCase}` : '/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.value, context })
    });
    const body = await response.json();
    if (!body.ok) throw new Error(body.error_code);
    render(body.result);
    requestState.textContent = 'Resposta criada localmente, sem acesso externo.';
    message.value = '';
  } catch {
    requestState.textContent = 'A resposta não pôde ser concluída. Nenhum conteúdo foi enviado.';
  }
});

advanceClock?.addEventListener('click', async () => {
  const response = await fetch('/api/native/clock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ advance_ms: 60000 }) });
  const body = await response.json();
  clockState.textContent = body.ok ? `Relógio: ${body.clock}` : 'Relógio indisponível.';
});

replayState?.addEventListener('click', async () => {
  const response = await fetch('/api/native/replay', { method: 'POST' });
  const body = await response.json();
  requestState.textContent = body.ok ? 'Replay concluído e contexto reconstruído.' : 'Replay indisponível.';
});

resetState?.addEventListener('click', async () => {
  const response = await fetch('/api/native/reset', { method: 'POST' });
  const body = await response.json();
  requestState.textContent = body.ok ? 'Atendimento sintético reiniciado.' : 'Reset indisponível.';
  if (body.clock) clockState.textContent = `Relógio: ${body.clock}`;
});

async function saveEvaluation(verdict, note = '') {
  const response = await fetch('/api/evaluations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: activeCase, verdict, note })
  });
  const body = await response.json();
  evaluationState.textContent = body.ok ? 'Feedback sintético guardado somente nesta execução local.' : 'Feedback não registrado.';
  if (body.ok && verdict === 'experience_note') experienceNote.value = '';
}

evaluation.addEventListener('click', (event) => {
  const verdict = event.target.dataset.verdict;
  if (verdict) saveEvaluation(verdict);
});

saveExperienceNote?.addEventListener('click', () => {
  const note = experienceNote.value.trim();
  if (!note) {
    evaluationState.textContent = 'Escreva uma observação antes de salvar.';
    return;
  }
  saveEvaluation('experience_note', note);
});

if (developmentMode) document.querySelectorAll('.developer-only').forEach((element) => element.classList.remove('hidden'));
Promise.all([loadCases(), loadHumanGroups(), refreshClock()]).catch(() => { requestState.textContent = 'O banco sintético não pôde ser carregado.'; });
