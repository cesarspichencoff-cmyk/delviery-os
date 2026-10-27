const el = id => document.getElementById(id);
const states = {
  source_blocked: ['Fonte bloqueada para leitura', 'O leitor preservou bloqueios de origem. A leitura de pedidos aguarda a correção validada da vigência.'],
  sample_observed: ['Amostra da fonte observada', 'Os arquivos examinados passaram pelas verificações da amostra. A leitura operacional dos pedidos ainda não foi liberada.'],
  no_evidence: ['Sem evidência na amostra', 'A consulta não encontrou arquivos nesta janela. Isso não significa que não existam pedidos.'],
  review_required: ['A fonte precisa de revisão', 'A amostra contém divergências ou arquivos que não puderam ser validados.'],
  source_unavailable: ['Fonte indisponível', 'O servidor não conseguiu consultar o diretório do leitor.'],
  unavailable: ['Fonte indisponível', 'O servidor não conseguiu validar a configuração ou consultar a fonte.'],
  not_configured: ['Fonte não configurada', 'Este ambiente ainda não está conectado ao leitor do Itaim.'],
};
async function refresh() {
  el('refresh').disabled = true;
  el('sample').hidden = true;
  el('window').textContent = 'Indisponível';
  el('read-at').textContent = 'Indisponível';
  try {
    const response = await fetch('/api/copiloto/source', { cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      el('title').textContent = 'Acesso do responsável necessário';
      el('message').textContent = 'Use a chave de gerente ou líder de Delivery fornecida pelo responsável pelo ensaio.';
      el('login').hidden = false;
      return;
    }
    if (!response.ok) throw Error('unavailable');
    const data = await response.json();
    el('login').hidden = true;
    const [title, message] = states[data.state] || states.unavailable;
    el('title').textContent = title;
    el('message').textContent = message;
    const p = data.preview;
    if (p) {
      const s = p.serviceState;
      if (s?.operationalDate) el('window').textContent = `${s.operationalDate} · ${s.service === 'LUNCH' ? 'Almoço' : s.service === 'DINNER' ? 'Jantar' : 'Turno não validado'}${s.validFromLocal && s.validUntilLocal ? ` · ${s.validFromLocal.slice(11,16)}–${s.validUntilLocal.slice(11,16)}` : ''}`;
      if (p.observedAtUtc) el('read-at').textContent = new Date(p.observedAtUtc).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      el('sample').textContent = `Janela de diagnóstico: ${p.sampledFiles} arquivos examinados; ${p.producerBlocksDownstream} bloqueados pelo produtor. Seleção por diretório, sem garantia de atualidade.`;
      el('sample').hidden = false;
    }
  } catch {
    el('title').textContent = 'Consulta indisponível';
    el('message').textContent = 'Não foi possível consultar o servidor. Tente novamente.';
  } finally { el('refresh').disabled = false; }
}
el('refresh').addEventListener('click', refresh);
el('login').addEventListener('submit', async event => {
  event.preventDefault();el('enter').disabled = true;el('login-error').textContent = '';
  try {
    const result = await window.entregasPilotLogin(el('access-key').value);
    el('access-key').value = '';
    if (!result.ok) { el('login-error').textContent = 'Chave não reconhecida.'; return; }
    await refresh();
  } catch { el('login-error').textContent = 'Não foi possível entrar. Tente novamente.'; }
  finally { el('enter').disabled = false; }
});
refresh();
