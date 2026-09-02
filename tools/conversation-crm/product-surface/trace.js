'use strict';

const STAGES = Object.freeze([
  { key: 'user', label: 'User', aliases: ['user', 'input', 'customer_message'] },
  { key: 'understanding', label: 'Understanding', aliases: ['understanding', 'plan', 'conversation_plan'] },
  { key: 'required_commitments', label: 'Required commitments', aliases: ['required_commitments', 'commitments', 'required_response_commitments'] },
  { key: 'capability_fact_need', label: 'Capability / fact need', aliases: ['capability_fact_need', 'capability_need', 'fact_need', 'tool_requirement'] },
  { key: 'authority_result', label: 'Authority result', aliases: ['authority_result', 'authority', 'authority_outcome'] },
  { key: 'response_plan', label: 'Response plan', aliases: ['response_plan', 'approved_response_plan'] },
  { key: 'writer_fallback', label: 'Writer / fallback', aliases: ['writer_fallback', 'writer', 'writer_attempts'] },
  { key: 'validator', label: 'Validator', aliases: ['validator', 'validation', 'publication_validator'] },
  { key: 'published_response', label: 'Published response', aliases: ['published_response', 'publication', 'response'] }
]);

const LABELS = Object.freeze({
  accepted: 'Aceito',
  action_truth: 'Ação autorizada',
  active_restrictions: 'Restrições ativas',
  approved_facts: 'Fatos aprovados',
  authority_evidence_hash: 'Evidência da autoridade',
  capability: 'Capability',
  channel_authorized: 'Canal autorizado',
  checks: 'Verificações',
  commitment_id: 'Commitment',
  commitments: 'Commitments',
  conversational_move: 'Movimento',
  cost_authorized: 'Custo autorizado',
  evidence_hash: 'Hash da evidência',
  external_action_allowed: 'Ação externa permitida',
  fact_need: 'Fato necessário',
  facts: 'Fatos',
  first_divergence_reason: 'Motivo',
  first_divergence_stage: 'Etapa',
  missing_commitments: 'Commitments ausentes',
  next_best_step: 'Próximo passo',
  plan_hash: 'Hash do plano',
  primary_attempt: 'Writer principal',
  publication_outcome: 'Publicação',
  publication_state_hash: 'Estado da publicação',
  reason: 'Motivo',
  reference: 'Referência',
  relation_to_history: 'Relação com o histórico',
  repair_acknowledgement: 'Reconhecimento do reparo',
  required_question: 'Pergunta necessária',
  response: 'Resposta',
  response_hash: 'Hash da resposta',
  restrictions: 'Restrições',
  safety_priority: 'Prioridade de segurança',
  shadow_mode: 'Shadow mode',
  status: 'Estado',
  tool_requirement: 'Ferramenta necessária',
  user_goal: 'Objetivo do cliente',
  validator_reason: 'Motivo do validator',
  what_changed: 'O que mudou',
  writer_limit: 'Limite do Writer',
  writer_source: 'Fonte do texto'
});

const HIDDEN_KEYS = new Set([
  'schema_version', 'stage', 'stage_id', 'key', 'name', 'title', 'label',
  'summary', 'description', 'details', 'data', 'payload',
  'raw', 'raw_input', 'prompt', 'private_state', 'oracle', 'gold', 'expected_result'
]);

const stagesRoot = document.querySelector('#trace-stages');
const traceStatus = document.querySelector('#trace-status');
const errorState = document.querySelector('#error-state');
const divergenceBox = document.querySelector('#first-divergence');
const divergenceTitle = document.querySelector('#divergence-title');
const divergenceReason = document.querySelector('#divergence-reason');
const gateGrid = document.querySelector('#gate-grid');

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .toLowerCase();
}

function humanLabel(key) {
  const normalized = normalizeKey(key);
  if (LABELS[normalized]) return LABELS[normalized];
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function displayValue(value) {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  if (value == null || value === '') return 'Não informado';
  if (Array.isArray(value)) {
    if (!value.length) return 'Nenhum';
    return value.map((item) => {
      if (item && typeof item === 'object') {
        const id = item.commitment_id || item.id || item.type || item.field || '';
        const text = item.description || item.summary || item.value || item.status || '';
        return [id, text].filter(Boolean).join(' — ') || 'Item registrado';
      }
      return String(item);
    }).join('\n');
  }
  return String(value);
}

function collectDetails(value, prefix = '', depth = 0, output = []) {
  if (!value || typeof value !== 'object' || depth > 2 || output.length >= 16) return output;
  for (const [key, item] of Object.entries(value)) {
    if (output.length >= 16 || HIDDEN_KEYS.has(normalizeKey(key))) continue;
    const label = prefix ? `${prefix} · ${humanLabel(key)}` : humanLabel(key);
    if (item == null || ['string', 'number', 'boolean'].includes(typeof item) || Array.isArray(item)) {
      output.push({ label, value: displayValue(item) });
    } else if (typeof item === 'object') {
      collectDetails(item, label, depth + 1, output);
    }
  }
  return output;
}

function traceIdFromLocation() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const traceIndex = parts.lastIndexOf('trace');
  const value = traceIndex >= 0 ? parts[traceIndex + 1] : parts.at(-1);
  return value && value !== 'trace' ? decodeURIComponent(value) : '';
}

async function fetchTrace(turnId) {
  const response = await fetch(`/api/product/trace/${encodeURIComponent(turnId)}`, {
    headers: { accept: 'application/json' }
  });
  let body;
  try { body = await response.json(); } catch { throw new Error('TRACE_RESPONSE_INVALID'); }
  if (!response.ok || body?.ok === false) throw new Error('TRACE_NOT_AVAILABLE');
  return body;
}

function tracePayload(body) {
  return body?.trace && typeof body.trace === 'object' ? body.trace : body;
}

function matchStage(rawStages, definition) {
  if (Array.isArray(rawStages)) {
    return rawStages.find((item) => {
      const identity = normalizeKey(item?.stage || item?.stage_id || item?.id || item?.key || item?.name || item?.title);
      return [definition.key, ...definition.aliases].includes(identity);
    }) || null;
  }
  if (rawStages && typeof rawStages === 'object') {
    const entry = Object.entries(rawStages).find(([key]) => (
      [definition.key, ...definition.aliases].includes(normalizeKey(key))
    ));
    return entry ? entry[1] : null;
  }
  return null;
}

function stageStatus(raw) {
  if (!raw) return 'not_available';
  if (typeof raw !== 'object') return 'complete';
  if (typeof raw.accepted === 'boolean') return raw.accepted ? 'accepted' : 'rejected';
  return String(raw.status || raw.state || raw.outcome || 'complete');
}

function statusAppearance(status) {
  const value = normalizeKey(status);
  if (/(?:fail|reject|invalid|error)/u.test(value)) return 'fail';
  if (/(?:need|pending|block|limit|unavailable|degraded|diverg)/u.test(value)) return 'warn';
  if (/(?:not_available|unknown|none)/u.test(value)) return 'neutral';
  return '';
}

function statusText(status) {
  const labels = {
    accepted: 'Aceito',
    approved: 'Aprovado',
    blocked: 'Bloqueado',
    complete: 'Concluído',
    completed: 'Concluído',
    degraded: 'Degradado',
    failed: 'Falhou',
    needs_clarification: 'Precisa esclarecer',
    needs_tool: 'Precisa de ferramenta',
    not_available: 'Não disponível',
    published: 'Publicado',
    rejected: 'Rejeitado',
    validated: 'Validado'
  };
  const key = normalizeKey(status);
  return labels[key] || humanLabel(key || 'complete');
}

function stageSummary(raw, definition) {
  if (raw == null) return 'A API não forneceu informação para esta etapa.';
  if (typeof raw !== 'object') return displayValue(raw);
  const payload = raw.detail === undefined ? raw : raw.detail;
  if (payload == null) return 'Etapa sem resultado publicável.';
  if (typeof payload !== 'object') return displayValue(payload);
  const direct = payload.summary || payload.description || payload.message;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const candidates = {
    user: payload.current_message || payload.input,
    understanding: payload.user_goal || payload.what_changed,
    required_commitments: Array.isArray(payload.commitments) ? `${payload.commitments.length} commitment(s) registrado(s).` : null,
    capability_fact_need: payload.tool_requirement || payload.fact_need || payload.capability,
    authority_result: payload.outcome || payload.publication_outcome || payload.reason,
    response_plan: payload.next_best_step || payload.required_question,
    writer_fallback: payload.writer_source || payload.writer_limit,
    validator: payload.reason || payload.validator_reason || payload.status,
    published_response: payload.response || payload.text
  };
  return displayValue(candidates[definition.key] || 'Etapa registrada.');
}

function detailSource(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return raw.detail || raw.details || raw.data || raw.payload || raw;
}

function stageIdentity(value) {
  const normalized = normalizeKey(value);
  const definition = STAGES.find((item) => [item.key, ...item.aliases].includes(normalized));
  return definition?.key || normalized;
}

function firstDivergence(body, trace) {
  const candidate = trace.first_divergence ?? body.first_divergence ?? null;
  const stage = candidate && typeof candidate === 'object'
    ? candidate.stage || candidate.stage_id || candidate.key
    : candidate;
  const reason = candidate && typeof candidate === 'object' ? candidate.reason || candidate.summary : null;
  const fallbackStage = trace.first_divergence_stage || body.first_divergence_stage;
  const fallbackReason = trace.first_divergence_reason || body.first_divergence_reason;
  const resolvedStage = stageIdentity(stage || fallbackStage);
  if (!resolvedStage || ['none', 'null', 'not_detected'].includes(resolvedStage)) return null;
  return { stage: resolvedStage, reason: reason || fallbackReason || 'A cadeia sinalizou uma divergência nesta etapa.' };
}

function renderStage(definition, raw, divergence) {
  const item = document.createElement('li');
  item.className = 'trace-stage';
  if (divergence?.stage === definition.key) item.classList.add('divergence');

  const card = document.createElement('article');
  card.className = 'stage-card';

  const head = document.createElement('div');
  head.className = 'stage-head';

  const title = document.createElement('h3');
  title.className = 'stage-title';
  title.textContent = definition.label;

  const rawStatus = stageStatus(raw);
  const badge = document.createElement('span');
  badge.className = `stage-status ${statusAppearance(rawStatus)}`.trim();
  badge.textContent = divergence?.stage === definition.key ? 'Primeira divergência' : statusText(rawStatus);
  head.append(title, badge);

  const summary = document.createElement('p');
  summary.className = 'stage-summary';
  summary.textContent = stageSummary(raw, definition);

  card.append(head, summary);
  const details = collectDetails(detailSource(raw));
  if (details.length) {
    const list = document.createElement('dl');
    list.className = 'stage-details';
    details.forEach((detail) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = detail.label;
      description.textContent = detail.value;
      row.append(term, description);
      list.append(row);
    });
    card.append(list);
  }

  item.append(card);
  return item;
}

function gateSource(body, trace) {
  return {
    ...(body && typeof body === 'object' ? body : {}),
    ...(trace && typeof trace === 'object' ? trace : {}),
    ...(body?.gates || {}),
    ...(body?.publication_gates || {}),
    ...(trace?.gates || {}),
    ...(trace?.publication_gates || {}),
    ...(trace?.publication_gate || {}),
    ...(trace?.gate || {})
  };
}

function gateValue(source, key) {
  const entry = Object.entries(source || {}).find(([candidate]) => normalizeKey(candidate) === key);
  const value = entry?.[1];
  if (value && typeof value === 'object') {
    return {
      allowed: value.allowed ?? value.authorized ?? value.accepted ?? null,
      status: value.status || value.state || null,
      reasons: value.reasons || value.reason || null
    };
  }
  return { allowed: typeof value === 'boolean' ? value : null, status: typeof value === 'string' ? value : null, reasons: null };
}

function renderGate(label, gate, safeWhenFalse = false) {
  const card = document.createElement('article');
  const expectedBlocked = safeWhenFalse && gate.allowed === false;
  card.className = `gate-card ${(gate.allowed === true || expectedBlocked) ? 'safe' : 'blocked'}`;
  const eyebrow = document.createElement('small');
  const state = document.createElement('strong');
  const reason = document.createElement('span');
  eyebrow.textContent = label;
  if (gate.allowed === true) state.textContent = 'Autorizado';
  else if (gate.allowed === false) state.textContent = safeWhenFalse ? 'Bloqueado com segurança' : 'Não autorizado';
  else state.textContent = gate.status ? humanLabel(gate.status) : 'Não informado';
  reason.textContent = gate.reasons ? displayValue(gate.reasons) : (expectedBlocked ? 'Nenhuma ação externa será executada.' : 'Estado registrado pelo gate deste turno.');
  card.append(eyebrow, state, reason);
  return card;
}

function renderGates(body, trace) {
  const gates = gateSource(body, trace);
  const external = gateValue(gates, 'external_action_allowed');
  const channel = gateValue(gates, 'channel_authorized');
  const cost = gateValue(gates, 'cost_authorized');
  const shadow = trace.shadow_mode ?? body.shadow_mode ?? gates.shadow_mode;
  const externalSpend = trace.external_spend_brl ?? body.external_spend_brl ?? 0;

  document.querySelector('#shadow-state').textContent = shadow === false ? 'Inativo' : 'Ativo';
  document.querySelector('#cost-state').textContent = `R$ ${Number(externalSpend || 0).toFixed(2).replace('.', ',')}`;
  document.querySelector('#publication-state').textContent = external.allowed === true ? 'Autorizada' : 'Bloqueada';

  const safetyCards = document.querySelectorAll('#safety-summary article');
  if (shadow === false) safetyCards[0]?.querySelector('.signal')?.classList.replace('signal-safe', 'signal-warn');
  if (Number(externalSpend || 0) > 0) safetyCards[1]?.querySelector('.signal')?.classList.replace('signal-safe', 'signal-warn');
  if (external.allowed === true) safetyCards[2]?.querySelector('.signal')?.classList.replace('signal-safe', 'signal-warn');

  gateGrid.replaceChildren(
    renderGate('EXTERNAL_ACTION_ALLOWED', external, true),
    renderGate('CHANNEL_AUTHORIZED', channel, true),
    renderGate('COST_AUTHORIZED', cost)
  );
}

function renderDivergence(divergence) {
  divergenceBox.classList.remove('loading', 'clear');
  if (!divergence) {
    divergenceBox.classList.add('clear');
    divergenceBox.querySelector('.summary-icon').textContent = '✓';
    divergenceTitle.textContent = 'Nenhuma divergência sinalizada';
    divergenceReason.textContent = 'Este trace não identificou quebra entre as etapas do turno.';
    return;
  }
  divergenceBox.querySelector('.summary-icon').textContent = '!';
  const definition = STAGES.find((item) => item.key === divergence.stage);
  divergenceTitle.textContent = definition ? definition.label : humanLabel(divergence.stage);
  divergenceReason.textContent = divergence.reason;
}

function renderTrace(body, turnId) {
  const trace = tracePayload(body);
  const rawStages = trace.stages || trace.steps || trace.trace_stages || trace.pipeline || trace;
  const divergence = firstDivergence(body, trace);
  document.querySelector('#turn-id').textContent = trace.turn_id || body.turn_id || turnId;
  stagesRoot.replaceChildren(...STAGES.map((definition) => (
    renderStage(definition, matchStage(rawStages, definition), divergence)
  )));
  renderDivergence(divergence);
  renderGates(body, trace);
  traceStatus.textContent = `${STAGES.length} etapas carregadas`;
}

async function loadTrace() {
  const turnId = traceIdFromLocation();
  document.querySelector('#turn-id').textContent = turnId || 'não informado';
  errorState.classList.add('hidden');
  traceStatus.textContent = 'Carregando…';
  stagesRoot.replaceChildren();
  if (!turnId) {
    errorState.classList.remove('hidden');
    traceStatus.textContent = 'Turno ausente';
    return;
  }
  try {
    const body = await fetchTrace(turnId);
    renderTrace(body, turnId);
  } catch {
    traceStatus.textContent = 'Indisponível';
    errorState.classList.remove('hidden');
  }
}

document.querySelector('#retry-trace').addEventListener('click', loadTrace);
loadTrace();

