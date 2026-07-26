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
let cases = [];
let activeCase = 'manual';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function tokenList(values, kind = '') {
  if (!values?.length) return '<span class="token">nenhum</span>';
  return values.map((value) => `<span class="token ${kind}">${escapeHtml(value)}</span>`).join('');
}

function render(output) {
  result.classList.remove('empty');
  result.innerHTML = `
    <div class="result-grid">
      <div class="summary">
        <div class="metric"><span>Intenção</span><strong>${escapeHtml(output.intent_label || output.intent)}</strong></div>
        <div class="metric"><span>Origem</span><strong>${escapeHtml(output.origin_label || output.origin)}</strong></div>
        <div class="metric"><span>Gravidade</span><strong>${escapeHtml(output.severity_label || output.severity)}</strong></div>
      </div>
      <div class="card"><h3>Bloco e confiança</h3><p><strong>${escapeHtml(output.block_code || output.block_id)}</strong> · ${Math.round(output.confidence * 100)}% · humano: ${output.human_required ? 'sim' : 'não'}</p><p>Escalonamento: ${escapeHtml(output.escalation_code || output.escalation_level)}</p></div>
      <div class="card"><h3>Dados conhecidos</h3><div class="tokens">${tokenList(output.known_field_labels || output.known_fields)}</div></div>
      <div class="card"><h3>Dados faltantes</h3><div class="tokens">${tokenList(output.missing_field_labels || output.missing_fields, 'warn')}</div></div>
      <div class="card"><h3>Resposta sugerida</h3><p>${escapeHtml(output.suggested_response)}</p></div>
      <div class="card"><h3>Tags</h3><div class="tokens">${tokenList(output.tags)}</div></div>
      <div class="card"><h3>Ações permitidas</h3><div class="tokens">${tokenList(output.allowed_actions)}</div></div>
      <div class="card"><h3>Ações proibidas</h3><div class="tokens">${tokenList(output.forbidden_actions, 'block')}</div></div>
      <div class="card"><h3>Registro CRM</h3><p>${output.crm_record ? `${escapeHtml(output.crm_record.entity_type)} · ${escapeHtml(output.crm_record.summary_code)} · ${escapeHtml(output.crm_record.status)}` : output.consent_record ? `${escapeHtml(output.consent_record.entity_type)} · ${escapeHtml(output.consent_record.status)}` : 'nenhum registro obrigatório'}</p></div>
      <div class="card"><h3>Privacidade e integração</h3><p>texto persistido: não · decisão financeira automática: não · sistema externo acessado: não</p></div>
    </div>`;
  evaluation.classList.remove('hidden');
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

caseSelect.addEventListener('change', () => {
  activeCase = caseSelect.value;
  const selected = cases.find((item) => item.id === activeCase);
  if (!selected) {
    origin.value = '';
    severity.value = '';
    orderReference.value = '';
    detailCode.value = '';
    return;
  }
  message.value = selected.message;
  origin.value = selected.context.origin || '';
  severity.value = selected.context.severity || '';
  orderReference.value = selected.context.order_reference || '';
  detailCode.value = selected.context.occurrence_detail_code || '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  requestState.textContent = 'Processando localmente…';
  const selected = cases.find((item) => item.id === activeCase);
  const context = selected ? { ...selected.context } : {};
  if (origin.value) context.origin = origin.value;
  if (severity.value) context.severity = severity.value;
  if (orderReference.value) context.order_reference = orderReference.value;
  if (detailCode.value) context.occurrence_detail_code = detailCode.value;
  try {
    const response = await fetch('/api/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.value, context })
    });
    const body = await response.json();
    if (!body.ok) throw new Error(body.error_code);
    render(body.result);
    requestState.textContent = 'Triagem concluída sem acesso externo.';
  } catch {
    requestState.textContent = 'A triagem não pôde ser concluída. Nenhum conteúdo foi registrado.';
  }
});

evaluation.addEventListener('click', async (event) => {
  const verdict = event.target.dataset.verdict;
  if (!verdict) return;
  const response = await fetch('/api/evaluations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: activeCase, verdict })
  });
  const body = await response.json();
  evaluationState.textContent = body.ok ? 'Avaliação registrada somente em memória nesta execução.' : 'Avaliação não registrada.';
});

loadCases().catch(() => { requestState.textContent = 'Casos sintéticos indisponíveis.'; });
