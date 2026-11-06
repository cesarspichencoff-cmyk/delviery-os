# Delivery OS Itaim — L1/N2: consistência SQL não é finalização da comanda

Data: 06/11/2026. Escopo: análise cruzada PR #135 (Comandas) → PR #138 (Delivery OS), ambas DRAFT/HOLD. Nenhuma mudança em SQL, Reader, caixa, impressão, Home, GetIn ou Android.

## Diferença comprovada por teste adversarial

A PR #135 contém um contraexemplo diferente do problema N3 de serialização: tools/verificar_comandas_reader_serializable_semantic_commit_gap_v1_offline.cjs. Ele simula gravações fictícias independentes de cabeçalho (t=10), item (t=20), observação geral (t=50) e cancelamento posterior (t=75).

Três leituras em t=25, t=30 e t=40 observam **o mesmo hash** de uma revisão com um item e nenhuma observação. Uma nota pode ser gravada em t=50 e alterar o hash sem alterar item ou estado. O cancelamento posterior pode gerar nova revisão.

Portanto, uma consulta SERIALIZABLE pode observar corretamente o banco naquele instante sem provar que a **aplicação concluiu todos os commits do pedido**. Esse cenário é simulado, não prova que a aplicação real usa essa ordem ou esses intervalos.

Prova: GitHub Actions https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42174372892, PR135 HEAD 686584b602399602f6453f1ba2275ab1c5087e2c, 2/2 jobs aprovados, com COMANDAS_STAGE3_SEMANTIC_COMMIT_GAP=12/12 SYNTHETIC_COMMITTED_STATES_ONLY em ambos. Nenhuma consulta SQL nem dado de cliente usado.

A candidata tools/comandas_reader_one_order_serializable_REVIEW_ONLY.sql tem SERIALIZABLE e LOCK_TIMEOUT 100; o timeout limita a espera do leitor, **não** o bloqueio que pode causar a escritores. A junção com TEKNISA.PRODUTO pode ampliar custo. Sem autorização e plano estimado, NÃO executar.

## Gates separados da L1

| Gate | Já comprovado | Lacuna |
| --- | --- | --- |
| N1: identidade do Reader | Sessão real observada em 04/11 com conta de serviço, banco teknisa e READ COMMITTED | Identidade e permissões atuais na eventual execução |
| N2-A: consistência do SQL | Contratos e cenários offline; RCSI/SNAPSHOT OFF na sessão observada | Prova de leitura coerente, cardinalidade e plano/impacto seguro |
| N2-B: finalização semântica | Contraexemplo de estados estáveis antes de nota/cancelamento | Evidência independente do término/imutabilidade da revisão pela aplicação |
| N3: vínculo de hash | Oráculo Windows PS5.1 25/25 e integração GUI one-shot 10/10 sintéticos na PR138 | Recibo de uma revisão REAL pelo canal local seguro |
| N4: origem iFood | DLV_IFO é valor de escopo do evento | Confirmação externa de identidade/frescor, não apenas string declarada pelo Reader |

N2-A não promove N2-B. N3 íntegro não prova N2 ou N4. Nunca atribuir sentido terminal aos estados 3, P ou X sem autoridade independente.

## Sequência mínima revista

1. Inventariar somente em código e documentos já existentes se há identificador nativo de revisão, marca de finalização, ACK de aplicação, sequência imutável, evento de encerramento ou outra evidência de completude. Cada candidato deve ser classificado como DOCUMENTADO, OBSERVADO, HIPÓTESE ou AUSENTE. Não presumir que algum existe.
2. Se não houver evidência N2-B, registrar BUSINESS_FINALITY_UNKNOWN e preservar PRINT/HOME=HOLD. Um teste de contagens SQL pode contribuir para N2-A, mas **não** responde sozinho à conclusão do pedido.
3. A PR138 mantém lançador LAB_ONLY que recusa CAIXA_MOOCA. Antes de qualquer leitura real, comprovar identidade/ACL, canal sem janela na sessão efetiva, proteção de privacidade, rollback e autorização específica Q-029.
4. **Postergar Q-030** até existir motivo concreto para a testemunha SQL e um plano de baixo impacto. Essa autorização é independente, não implícita na continuidade do projeto.

Nenhum start_process, CMD, PowerShell, serviço, tarefa, instalação, impressão, leitura de pedido real ou SQL foi realizado no CAIXA_MOOCA por esta análise.

Estado: N1 PARTIAL; N2-A HOLD; N2-B UNKNOWN/HOLD; N3 LAB TEST_PASS; N3 FIELD HOLD; N4 HOLD; HOME/PRINT HOLD; V1 0/8 aceites operacionais.

Próximo passo: procurar evidência de finalização nos contratos existentes, não repetir o mesmo teste de serialização e não executar SERIALIZABLE só para obter mais um hash.

## Inventário mínimo de candidatos à autoridade — diferença entre contrato e realidade

**Código versionado PR #135 (não necessariamente idêntico ao worker instalado):** em tools/tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1, a consulta observa IDSTCOMANDA, DTHRABERMESA, itens e notas (linhas 310–334); o emissor exige StablePolls do mesmo hash (linhas 438–450). Esse mecanismo é uma evidência de **estabilidade entre leituras**, não um ACK de finalização pela aplicação, nem um token transacional do conjunto cabeçalho + itens + observações. O evento pode ter ready_for_downstream_shadow com base em bloqueios de horário/serviço (linhas 453–467), que **não** autentica encerramento nativo nem impressão.

**Candidato oficial externo identificado em pesquisa de 06/11:** a página pública da Teknisa, https://www.teknisa.com/api, documenta uma Order API com POST /orderStatus e categorias de status incluindo produção, cupom impresso, expedido, finalizado e cancelado. Isso oferece **vocabulário/documentação do fornecedor**, não evidência de que o endpoint esteja contratado, habilitado, acessível ou configurado no Itaim. **Direção do POST, payload, mapeamento de IDs, semântica de eventualidade, relação com o estado da revisão e condições comerciais são desconhecidos**; não executar requisições nem presumir que seja uma API somente de leitura. A própria página informa que APIs podem estar sujeitas a condições comerciais e que especificações técnicas devem ser solicitadas ao gerente de contas. Nenhuma compra autorizada.

**Candidato externo independente iFood:** documentação oficial de eventos webhook (https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-request) descreve assinatura de origem; documentação (https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-overview) também adverte que webhooks podem ser duplicados, fora de ordem e eventualmente descartados. Uma assinatura validada pode atestar origem de um evento recebido, **não** a integridade do conteúdo capturado da Teknisa, a presença de observações ou o estado final do pedido. Não implantar listener, cadastrar webhook nem obter credenciais sem autorização e infraestrutura apropriada.

**Outro candidato local NÃO autoritativo:** tools/tata_reader_native_fiscal_observer_candidate_v1.ps1 lê campos fiscais da TEKNISA.VENDA (status NFC-e e protocolo), mas um documento fiscal ou seu status não é, por si só, confirmação de que observações e comandas acabaram de ser gravadas. Não acionar essa consulta.

### Decisão de roteamento

- **Primeiro:** verificar existência de **documentação de mapeamento** já contratada/instalada do status do pedido entre iFood ↔ Teknisa e sua relação com NRVENDAREST/NRCOMANDA, sem abrir pedidos ou segredos. Se não existir, buscar esclarecimento do fornecedor por canal autorizado. Não inventar o significado de 3/P/X.
- **Depois:** definir prova de finalização para a mesma revisão nativa, preservando mecanismo de revisão/cancelamento posterior e observações. A pergunta correta é **quando o conteúdo está disponível para a praça/Conferência sem omissões**, não apenas quando a venda está fiscalmente finalizada — eventos podem ter finalidades distintas.
- **Só então:** medir se um testemunho SQL N2-A acrescenta evidência necessária, com Q-030 separada. Se a documentação oficial/instalada não oferecer marcador confiável, manter N2-B UNKNOWN e não liberar Home/print.
- Esta pesquisa é somente documental, não confirmou acesso efetivo a API, status ou webhook no TATÁ; não gerou chamadas, credenciais, gastos, implantação nem leitura de cliente.
