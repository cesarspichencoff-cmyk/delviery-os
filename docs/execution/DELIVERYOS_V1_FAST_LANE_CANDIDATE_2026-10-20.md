# DeliveryOS V1 — trilho rápido de demonstração e piloto (CANDIDATO, NÃO CANÔNICO)
Data: 20/10/2026 | Autor: frente GPT-6/VÉRTICE 2.2 | Status: PROPOSTA TÉCNICA, sem aprovação de release.

> Este arquivo NÃO substitui `docs/Plano_Entrega_V1_DeliveryOS.md`, a Constituição do produto,
> `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`, decisões de César ou `docs/execution/PERGUNTAS.jsonl`.
> Aceleração significa reduzir escopo e caminhos redundantes, NÃO eliminar provas ou converter simulado em real.
> Prazo abaixo = meta condicional de planejamento, NÃO promessa de lançamento.

## Uma versão mínima, em vez de esperar a plataforma inteira

**P0 — preview demonstrável / shadow:** núcleo do Copiloto da operação do restaurante (Calmo,
Ambiente, Foco seguindo motores/autoridade já existentes) + Entregas em leitura de aprofundamento.
A UX deve dizer a fonte, modo, idade/limitação e se o dado não existe. O Copiloto mostra informação
e decisão humana, nunca executa comandos nem fabrica pedidos/pressão/saúde.
Sem backend de compras, impressão, alteração de pedidos ou ligação a fontes não aprovadas.
`src/product/ui/**` tem congelamento visual/governança; NUNCA descongelar por conveniência técnica.

**P1 — piloto shadow em uma unidade:** mesmos componentes com dados reais SOMENTE quando
procedência, escopo de leitura, credenciais, infraestrutura e aprovação humana estiverem comprovados.
Sem decisões automáticas nem efeitos na loja. Usar shadow/dual-read somente sob
contrato válido. Um dispositivo de desenvolvimento/emulador não equivale a Android de campo.

**P2 — piloto operacional:** somente após Android real, ingestão atestada e recuperável,
backups operacionais, observabilidade, stop/rollback e homologação humana. Não chamar P0/P1 de P2.

## Estado verificável hoje: não reabrir o que já passou

| Gate | Prova | Status real |
|---|---|---|
| Compilação do candidato | `tsc --noEmit` e CI da integração | TEST_PASS |
| Backend+browser sintético Copiloto/Entregas | GitHub Actions 39369498789 na HEAD `216dc2c` | TEST_PASS LAB |
| PgUoW -> public_outbox -> consumer -> platform.event_log -> Copiloto | 13/13 no PG descartável CI | TEST_PASS LAB |
| Produtor assinado fictício -> consumidor real do código | 20/20 CI, chaves LAB | TEST_PASS LAB, NÃO runtime autenticado |
| Leitura do Copiloto / células V3.3 | 6/6 + 7/7 local | TEST_PASS LOCAL |
| Evidência/escopo Copiloto | 15/15 + 100 combinações locais na HEAD `635bd0f` | TEST_PASS LOCAL, sem CI nessa HEAD |
| Home/sinais / Product System / hierarquia visual | 44/44 + 52/52 + 6/6 local | TEST_PASS LOCAL |
| Cadeia 'real' de campo no Foxxy | 9 verificações locais, passo PG pula por ausência de URL | PARTIAL, nunca END-TO-END REAL |
| Credencial real de produtor e identidade humana | laboratório fictício, sem origem real integrada | NO_GO |
| Android físico + entrega de verdade | sem homologação | NO_GO |
| Fonte real de pedidos no Copiloto V1 | Q-020 e leitor de loja não homologado nesta árvore | NO_GO |
| Backup/rollback implantado | prova de laboratório não é serviço operacional | NO_GO |

## Caminho crítico que realmente reduz prazo

1. **Não fazer merge cego de toda a plataforma.** A HEAD de candidato diverge de main desde
   `a441bc7e9ed209ca965be549dbbd0cd787867bd5`; diff `origin/main...HEAD`: 1.747
   arquivos (427.725 linhas adicionadas), incluindo patrimônio histórico. Comparação com merge-base
   NÃO mede conflitos reais, mas alerta para risco de integração ampla.
2. **Tratar o candidato `216dc2c` como BASE DE LABORATÓRIO**, preservando seus gates;
   consolidar somente commits relevantes e revisar o diff depois. Nada de produção no main sem
   CI completo e revisão.
3. **Claude Opus 5.5: fronteira de procedência do produtor e runtime**, em worktree separado;
   não compartilhar arquivos com GPT-6. SHA/CI próprios antes da integração.
4. **GPT-6: Copiloto e simplificação de provas**, Home, escopo/procedência, legibilidade e
   revisão visual com gate. Branch local `test/deliveryos-copiloto-evidence-boundary-20261020`.
5. **Um P0 de produto de verdade**: validar em 390px + desktop com um responsável; cobrir os
   estados Calmo/Ambiente/Foco, indisponível, sem evidência, leitura simulada e leitura envelhecida.
   Não redesenhar a home sem consultar autoridade visual e sem decisão de César.
6. **Um P1 de campo**: selecionar apenas UMA unidade, fonte de pedidos/telemetria autorizada
   e contas humanas; tudo em leitura, sem alterar sistemas externos; verificar fonte saudável/queda,
   isolamento, reinício, réplicas/PG, e rollback.
7. **Cutover operacional não automático**: um único checklist físico, sign-off de César,
   backup restaurável e planos de contingência; só então P2.

## Reduzir decisões sem atropelar a autoridade

O registro `PERGUNTAS.jsonl` na HEAD verificada contém 26 perguntas, 14 abertas, 13 delas
com `PAUSE`. Elas NÃO são 14 'tickets' a fechar antes do preview.
- **P0 demo:** não necessita inventar respostas para Q-001, Q-002, Q-004, Q-005, Q-007,
  Q-008, Q-009, Q-012. Preservar os comportamentos conservadores e gates preexistentes.
- **P1 dados reais:** Q-020 (fonte conhecida não visível na UI congelada) é candidato a
  decisão bloqueante; sem autorização de edição/contrato, NÃO simular live.
- **Integração com Android:** Q-021 (duas migrações 0009 concorrentes) e Q-023
  (fila offline sem source_mode) exigem reconciliação de contrato antes de merge/cutover.
- **P2 escala:** Q-026 (leitura integral do event_log, custo grande) é risco conhecido;
  limitar escala no piloto não aprova política de retenção/janela. Sem teto seguro, NO_GO.
- Qualquer questão aberta que de fato alcance o escopo é PAUSE até decisão de César.

## Metas comprimidas, com prova de saída

| Marco | Alvo de planejamento, com pré-condições | Prova obrigatória |
|---|---|---|
| P0 preview no ambiente de desenvolvimento | **2–4 dias úteis** após congelar só esta fatia | HTTP e navegador 390/desktop, CI em SHA igual, UX de 5 estados, aprovação visual |
| P1 shadow com fonte verdadeira | **7–14 dias úteis**, apenas se fonte, autorização e ambiente já disponíveis | leitura confiável, 401/403, isolamento, indisponibilidade, observação humana; sem comandos |
| P2 piloto operacional limitado | **3–5 semanas** no melhor cenário, não um compromisso | Android físico, origem atestada, backup/restore, rollback, testes por turno, aceite César |
| Plataforma DeliveryOS ampla | sem prazo fundamentado | depende de escopo e decisões ainda abertas |

**Regra:** nenhuma faixa acima é previsão estatística. Se as pré-condições não se resolverem,
não declarar entrega: publicar o motivo exato e manter P0 demonstrável.

## Próximo ciclo: tarefas efetivas, sem aguardar todo o projeto

- GPT-6: concluir benchmark de preview/UX P0 e incorporar gate local de evidências
  `635bd0f` sem tocar runtime do Claude; proteger as 5 condições humanas.
- Claude: entregar commit independente de procedência operacional OFF por padrão
  com testes de regressão e nenhum acesso real.
- Integração: revisar pares de SHAs, testar na mesma HEAD, provar diff/check e CI, sem promover
  alterações que conflitem com congelamento de produto.
- César só precisa autorizar **efeitos relevantes** na fase certa: fonte real de pedidos,
  autenticação de humanos, UI congelada e execução física. Não pedir aprovação para cada
  teste local reversível.

## Não fazer para 'ganhar tempo'

- Não ativar `EntregasLiveConsumer` ou source_mode `real` a partir de payload autodeclarado.
- Não confundir 200 de demo, build OK ou simulado com produção.
- Não iniciar qualquer gravação/execução na CAIXA_MOOCA, iFood, Teknisa ou clientes.
- Não instalar software/gerar despesas/ligar GPS produtivo sem autorização humana.
