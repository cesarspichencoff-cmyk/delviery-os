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
