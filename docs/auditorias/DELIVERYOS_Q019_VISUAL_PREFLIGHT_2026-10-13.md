# DeliveryOS — preflight Q-019 e aceitação visual preservacionista

**Data:** 13/10/2026
**Base verificada:** PR #106, commit 7dddd9f5b0487bc164c1251d85b16a2330bc231e.
**Escopo deste documento:** revisão documental e proposta de decisão; NÃO é autorização, aprovação estética, execução de C6, teste em Android, homologação de campo, merge ou deploy.
**Estado:** DRAFT/HOLD · NO MERGE · NO DEPLOY · NO PROD · NO GPS · NO SPEND.

## 1. Verdade de partida

- A Home (/) é o organismo Copiloto/Operação Viva; a rota /copiloto é inspeção Shadow, não a experiência principal. Referências vinculantes: Sprint Visual V2, Organismo V3.3 e suas descendências De-Mechanization / Motion North Star.
- O Entregas possui console, rider-mobile e handoff externo com experiência confirmada em 20/07/2026. Proibido redesign geral sem nova decisão de César.
- PR #106 continua Draft, não mesclado, alvo integration/deliveryos-product-ux-android-20261009. No commit-base, o CI registrou success para Q026 promotion required, PG borrowed connection survives forced termination e product-ux. Isto não é prova operacional.
- Q-019 continua open e default PAUSE em docs/execution/PERGUNTAS.jsonl. O classificador SEM_FAIL_NOVO não substitui a verificação M1/C6 nem concede autorização histórica.
- Q-022 foi respondida para a exceção estreita de leitura da rua em Entregas. Ela não resolve Q-019 nem autoriza M1B.
- Figma vigente documentado: DeliveryOS Product System — Recovery, dGyF0eRDd4YG8uqyWqU1P4. Nesta retomada, a tentativa read-only de get_metadata foi recusada por falta de edição; whoami confirmou conta de César com seat View / tier Starter. Portanto, paridade visual do arquivo Figma ao vivo NÃO VERIFICADA.
- A auditoria fundadora em docs/auditorias/DELIVERYOS_AUDITORIA_PRESERVACAO_FUNDADORA_2026-10-13.md preserva os hashes do ZIP original e registra captura Chromium sintética; capturas não equivalem a aceite humano.

## 2. Reconstrução reproduzível do escopo Q-019

Base histórica M1: f87a36dfd39c9989344f0fed6ebf8db5db1a8c35.
Commits históricos investigados: d326c5d, f23006a, 91e766c (Q-003); 2a3b8f8 (Q-015); a117c43 (B7); f24ff62 (B6); 39a9a9c (adaptador TATÁ).
A união de arquivos nos prefixos protegidos desses commits devolve 13 caminhos. Um deles, src/product/ui/app.js, já figura na seção AUTHORIZED_PATHS do envelope e por isso não integra os 12 caminhos em aberto relatados em Q-019. Estar listado no envelope NÃO representa aprovação da execução ampla de M1B, que permanece AWAITING_CESAR_M1B_EXECUTION_APPROVAL.

**Doze caminhos candidatos a regularização específica — nenhum autorizado por esta tabela:**

| # | Caminho protegido | Origem histórica identificada | Classe estreita para avaliar, não aprovada |
|---|---|---|---|
| 1 | src/perfil-delivery/decisao.js | d326c5d / Q-003 | mesma causa-raiz do Foco; sem novo dono da atenção |
| 2 | src/platform/copiloto/attention-authority.ts | d326c5d / Q-003 | gate causal e fail-closed do Foco |
| 3 | src/platform/copiloto/causal-attention-orchestrator.ts | f23006a / Q-003 | orquestração Shadow sem execução |
| 4 | src/platform/copiloto/causal-identity-bridge.ts | 91e766c / Q-003 | identidade causal comprovada, sem inferir vínculos |
| 5 | src/platform/copiloto/shadow.ts | d326c5d / Q-003 | sombra subordinada ao Foco canônico |
| 6 | src/platform/copiloto/conference-bridge.ts | 2a3b8f8 / Q-015 | timestamp terminal e retenção contratual |
| 7 | src/product/ui/surfaces/copiloto.js | a117c43 / f24ff62 | apresentação Shadow: gate humano preparado e histórico somente leitura |
| 8 | src/product/viewmodels/copiloto-vm.ts | a117c43 / f24ff62 | motivos fail-closed e apresentação de propostas |
| 9 | src/product/ui/surfaces/operacao-viva.js | f24ff62 | fatos históricos somente leitura, modo explícito |
| 10 | src/product/viewmodels/operacao-viva-vm.ts | f24ff62 | apresentação histórica sem interpretação LIVE inventada |
| 11 | src/product/viewmodels/historico-vm.ts | f24ff62 / 39a9a9c | histórico de eventos e TATÁ por proveniência, sem payload bruto |
| 12 | src/product/viewmodels/tata-comanda-vm.ts | 39a9a9c | adaptador de auditoria TATÁ não ao vivo |

**Limite da evidência:** esta matriz correlaciona os commits referidos pela Q-019 com seus arquivos; não é uma revisão exaustiva do diff acumulado até o HEAD, nem executou C6. Mudanças posteriores nos mesmos arquivos, classes mais amplas ou efeito de produção não estão incluídos por analogia.

### O que pode ser decidido e como provar

1. **Q-003 (cinco caminhos):** preservar a decisão humana existente de que só o MOTOR é dono do Foco. Conferir patch exato, chamadas em runtime e regressões causais; propor exceção por caminho+classe+commit apenas se não houver abertura automática de Foco ou execução.
2. **Q-015 (um caminho):** a autorização de política de retenção já existe; confirmar que a alteração no bridge fica no carimbo terminal/contrato e não ativa a Spine fora de local.
3. **B7/B6 (cinco caminhos, com sobreposição):** inspecionar as duas superfícies e seus view models, certificar que inspeção histórica não vira experiência principal e que não existem botões, comandos, ação automatizada, fonte LIVE fictícia nem exposição de payload bruto.
4. **Adaptador TATÁ (dois caminhos, um compartilhado com B6):** manter fonte histórica 05/10 separada de leitura operacional ao vivo; status da CAIXA, ID Neemo/Teknisa e medição real continuam lacunas.
5. Para cada alteração a preservar, pedir decisão estreita de César sobre exceção histórica versus reversão. Se autorizada, registrar caminho + classe + missão + commit + autorização_ref no envelope, preservando o baseline histórico e os testes de mutação/negação. **Não** inserir os 12 caminhos em AUTHORIZED_PATHS, não abrir exceção por diretório, não editar PERGUNTAS.jsonl como answered antes da decisão.
6. Rodar test:platform:m1-bridge, incluindo C6 e controles negativos, na árvore exata após qualquer correção. Um workflow product-ux verde em árvore anterior não cobre esta obrigação.

## 3. Folha de aceitação visual — inspeção preparada, NÃO realizada ao vivo

**Condições comuns de comparação:** mesma cena, mesma largura, mesmo modo real/simulado, mesma proveniência, estado de conexão explícito. Comparar implementação atual com ZIP Sprint V2 e V3.3 (hashes registrados na auditoria fundadora), De-Mechanization/Motion North Star e, para Entregas, a experiência aprovada em 20/07. Registrar captura lado a lado, data, commit, viewport e veredito humano por cenário.

| Superfície / cena | Alvo de prova | Rejeitar se |
|---|---|---|
| Home Calmo · 1440 e 375/320 | organismo presente, pulso discreto, leitura útil; sem falso vazio | cartão genérico, painel vazio ou fonte ausente pintada de verde |
| Home Ambiente · 1440 e 375/320 | territórios/praças legíveis; várias tensões continuam visíveis | apenas KPIs, desaparecimento de área relevante ou ação secundária prescrita |
| Home Foco · 1440 e 375/320 | Foco único reorganiza a atenção; demais tensões continuam visíveis | Foco como apenas mais um card ou ação sem causa provada |
| Home sem medição/falha | Caixa e Conferência sem medição explicitadas; falha técnica em ardósia sem movimento | ausência vira zero, saudável, verde ou pressão operacional |
| Home reduced-motion | mesma informação, movimento removido de verdade | conteúdo ausente porque animação foi desativada |
| Entregas console · desktop e 390 | jornada operacional aprovada preservada; expedição externa separada | console substituído por dashboard/frota ou Trip externo inventado |
| Rider-mobile · 390×844 (também 320/375) | uma ação primária conforme fase: preparar/saída, em rota, entrega, exceção, retorno | muitas ações concorrentes, textos ilegíveis, ranking punitivo |
| Rider offline/retorno · 390×844 | proveniência, fila local, reenvio e retorno sem inventar confirmação | GPS interpretado como entrega concluída ou status sem fonte |
| Copiloto Shadow /copiloto | inspetor técnico permanece auxiliar e read-only | promovido a Home sem decisão e paridade |
| Entregas /entregas | leitura de realidade tem modo, disponibilidade e fonte explícitos | DEMO/simulated apresentada como turno real |

**Artefatos disponíveis:** o workflow product-ux da revisão original publicou artifact evidencias-product-ux (retenção de 14 dias), mas as imagens do Figma vivo e o conjunto pareado revisado por César não foram obtidos nesta retomada. Nenhum aceite visual foi registrado aqui.

## 4. Primeiro ensaio — somente após gates anteriores

1. Verificar solução de C6/Q-019 com autorização estreita e manter as referências originais intactas.
2. Comparar as telas do candidato com o material canônico. O veredito humano recai sobre a expressão visual, não sobre CI.
3. Identificar dispositivo Android disponível e ambiente de piloto isolado. Primeiro ensaio com eventos sintéticos rotulados e **GPS desativado**: login/identidade, uma Trip demonstrativa, fase de saída, pausa/offline, sincronização, exceção, retorno e leitura da mesma realidade no Copiloto. A demonstração não prova entrega real.
4. Só depois, com consentimento e autorização operacional específicos, correlacionar UM pedido próprio Neemo identificado legitimamente na Teknisa com UM motoboy da casa; testar ida, entrega com confirmação humana, retorno, reenvio e leitura do mesmo evento no Copiloto, sem copiar PII ao GitHub.
5. Courier iFood externo é handoff, não Trip de motoboy da casa. API iFood LIVE não é gate da V1.

## 5. Estado e efeitos desta retomada

- **PROVADO nesta leitura:** repositório/branch/PR/HEAD; Q-019 open; origem nominal dos 12 arquivos; referência de design e experiência aprovada; checks CI específicos de 7dddd9f5; falha de leitura Figma/seat View.
- **NÃO PROVADO:** execução de test:platform:m1-bridge neste novo trabalho; diff integral dos 12 caminhos no candidato final; paridade Figma ao vivo; aceite de César; Android físico; ambiente piloto; evento Neemo/Teknisa conciliado; Trip operacional; produção.
- **EFEITO:** somente criação de uma branch de auditoria e deste documento. Nenhuma fonte de dados, PR #106, branch de integração, código funcional, guardas, impressora, Android, GPS ou serviço operacional foi alterado.
- **PRÓXIMA DECISÃO HUMANA MATERIAL:** revisar exceções históricas Q-019 por classe/caminho, aceitando ou revertendo cada grupo, e julgar a folha de confronto visual quando as capturas pareadas estiverem disponíveis.

## Referências diretas

- [PR #106](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/106)
- [Issue #103](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/103)
- [Commit de auditoria fundadora](https://github.com/cesarspichencoff-cmyk/delviery-os/commit/7dddd9f5b0487bc164c1251d85b16a2330bc231e)
- docs/execution/PERGUNTAS.jsonl (Q-019/Q-022)
- docs/design/M1_VISUAL_CHANGE_ENVELOPE.md e src/platform/run-m1-bridge-tests.ts
- docs/design/VISUAL_REFERENCE_HIERARCHY.md e docs/design/M1_CANONICAL_SUCCESSION.md
- docs/entregas/ux/EXPERIENCIA_VISUAL_CONFIRMADA.md
- docs/figma/FIGMA_ORGANISMO_PARITY_MATRIX.md
