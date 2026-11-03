# Copiloto — estratégia de sinais próprios e independência operacional
**Data da análise:** 03/11/2026 (BRT)  
**Unidade:** TATÁ Sushi Itaim  
**Estado:** decisão de engenharia proposta para revisão, **não** liberação operacional  
**Contexto versionado na leitura:** PR #137 em DRAFT/HOLD, HEAD `3539e8f47e81f2da946ef87ebc0033d2ee9d32ee`.

## Atualização vinculante do escopo de lançamento — decisão posterior de César, 03/11/2026
A V1 **não** está autorizada a ser lançada como Copiloto apenas de sinais próprios de Entregas. É obrigatório ter **leitura de pedidos, itens, praças, o que está pronto e Entregas** com jornada integrada e prova real. O contrato atualizado e os gates são `docs/execution/DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md`.

Esta decisão altera o sequenciamento proposto abaixo: primeiro resolver fonte completa e estados de pedidos **mais** Entregas, depois updates. A restrição permanente é **sem integração/ferramenta oficial** do iFood/Teknisa; não prometer independência da origem dos dados. O **Reader já existente read-only**, quando devidamente autorizado e comprovado, pode ser o canal provisório de dados externos sem habilitar API oficial ou novo coletor. A antiga proposta abaixo de não depender sequer do Reader/SQL como fonte de dados para V1 está **superada apenas nesse ponto**, não nos limites de acesso, integridade e efeitos.

## Mandato preservado
O produto central é a **Home /**, Copiloto da operação do restaurante; Entregas é um módulo e `/copiloto` é uma rota Shadow, não a Home aprovada. A Operação Viva é a única dona de Calmo/Ambiente/Foco; a Camada de Decisão já existente ranqueia as ações dentro do Foco. **Não criar motor, rota principal, dashboard ou Copiloto paralelo.** Não trocar a linguagem visual canônica por UI de demonstração.

A missão aqui é conseguir um Copiloto útil e verificável **sem depender de API, licença, contato, parceria, cookies, endpoints internos, alteração de aplicativo ou mecanismos oficiais do iFood/Teknisa**. O uso continuado do Gestor web, de uma captura de SQL do fornecedor ou de impressão desviada **não é** uma dependência admissível para a primeira liberação independente. Manter as integrações históricas onde estiverem isoladas, mas nunca promovê-las silenciosamente a prova.

## Constatações atuais — não inferir cobertura
- A investigação de 01/11 sobre a UI do Gestor conseguiu observar contadores agregados `DIAGNOSTIC_ONLY`. IDs individuais, unidades efetivas, cobertura de lista virtualizada, datas/estados confiáveis e frescor **não** foram comprovados. Rolagem UIA no host foi interrompida; não repetir via equivalente.
- O Reader contínuo versionado foi identificado com lacuna de `observation_rows` / `observation_scan_complete` e potencial divergência de hash PowerShell↔Node para caracteres; instalação efetiva e paridade real desconhecidas. Isso impede usar esses dados como base silenciosa para recomendações de itens.
- A cadeia própria Entregas→eventos públicos→Copiloto possui contratos, outbox Room no Android, testes de reenvio e consumidores **simulados**. `SimulatedCopilotoConsumer` é prova de laboratório, **não** alimento live da Home.
- A camada `src/perfil-delivery/decisao.js` foi originalmente construída sobre tempos do iFood e composição sintética/real; chamar sua flag `fonteReal` sem lastro de cobertura por pedido ou frescor é risco de confiança falsa. O contrato não deve ser afrouxado para liberar uma integração.
- O mapa de ambientes é proposto e tem ambiguidade conhecida Quentes/Cozinha, e Caixa sem medição automática. Não normalizar implicitamente praças ou pintar áreas desconhecidas como verde.
- O Copiloto precisa continuar com **um único Foco**, ambientes críticos visíveis, distinção fato/inferência/desconhecido e a opção de indicar ausência de medição. Sem prompts manuais por pedido no pico.

## Alternativas estudadas (custo e risco relativos são avaliação de projeto, não preços de mercado)

| Rota | Informação possível | Limite / risco | Decisão |
| --- | --- | --- | --- |
| API/comércio oficial, DOM persistente do Gestor ou SQL de fornecedor | potencialmente pedidos detalhados | depende do ecossistema rejeitado, cobertura/autorização/contrato não comprovados | **NÃO** como base do produto independente |
| Espelhar impressora/spool ou reter via antiga | ticket no momento de impressão | acoplamento ao formato externo, duplicidade/efeito em impressão, cobertura incompleta | **NÃO** para piloto independente |
| Câmera contínua / OCR do balcão | volume visual aparente, sinais parciais | não prova item ou estado, custo de operação, privacidade/LGPD, oclusão | **DEPOIS**, só se ganho e proteção comprovados |
| RFID, sensores e leitores dedicados | presença/movimentação física | novas compras, instalação/manutenção e integração física | **DEPOIS**, não é gargalo atual |
| **Marcos reais dentro de fluxos TATÁ existentes** | custódia, conferência, lacre, saída, entrega, exceções confirmadas | não revela pedidos que ainda não entraram em nenhuma superfície TATÁ; demanda validação física | **PRIORIDADE 1** |
| Captura complementar no Xiaomi já existente, por QR/código **próprio** | associação entre sacola/viagem/posto no ato da conferência ou retirada | só quando o código/identidade for produzido pelo TATÁ e escanear não aumentar atrito no pico | **CANDIDATO PRIORIDADE 2**, sem hardware novo |

### Limite lógico da independência (não mascarar)
Sem capturar o pedido no momento de entrada por um canal **próprio e autorizado**, o sistema **não pode** saber todos os pedidos recebidos no iFood/Teknisa, seu cardápio, observações ou tempo prometido. O MVP independente mede os marcos físicos TATÁ que de fato observou, não o total de pedidos que só existe nos sistemas externos.

Se TATÁ Comandas receber originalmente um ticket, registro SQL ou informação derivada de plataforma externa, os marcos **posteriores** produzidos pelo TATÁ podem ser próprios, mas o conteúdo inicial continua com origem externa. Registrar procedência de cada campo, jamais renomear `derivado_de_fornecedor` para `origem_independente`. Não promover um sinal de produção/preparo de pedido com cobertura parcial a panorama completo do Itaim.

O produto pode ser operacionalmente útil sem cobertura total: buscar **o que está sob custódia TATÁ comprovada**. Quando nenhum marco interno foi observado, mostrar `não observado`, e não `nenhum pedido`.

## Arquitetura escolhida — Copiloto com lastro em ações naturais

**Uma única cadeia, sem infraestrutura nova:** evento nascido em fluxo TATÁ que já existe → persistência/recibo próprio → verificação de unidade, identidade, versão, ordem temporal, completude e frescor → projeção operacional existente → **Operação Viva** → Camada de Decisão existente → **Home**. Reusar as interfaces e portas atuais, não introduzir um event bus/serviço adicional.

1. **Entregas**: reaproveitar a outbox Android Room/SyncWorker e os contratos próprios de eventos. Saída, chegada e entrega só contam como **comprovadas pelo servidor** após recibo durável; evento apenas em Room é **pendente no aparelho**, jamais `entregue`. Não converter GPS/geofence em prova de entrega.
2. **Conferência e balcão preto**: reaproveitar o fluxo próprio TATÁ Comandas, **quando** os eventos próprios de montagem/conferência/lacre estiverem verificáveis ponta a ponta. Associar identidade TATÁ de pedido/sacola, posto, horário e evidência. Nada de inferir `conferido` só porque um ticket foi impresso.
3. **Conexão entre ambos**: estabelecer identidade e recibo de passagem conferência→motoboy, com deduplicação e recuperação após queda de rede. A identidade de pedido não pode ser inventada a partir de número parecido ou hora próxima.
4. **Exceções raras**: se um fluxo já tem um ato explícito de informar falta, erro de kit, indisponibilidade ou espera, transformar **esse** ato em um evento próprio. Não introduzir digitação extra por pedido no pico.
5. **Sinais futuros**: produção por praça, composição do pedido e observações/alergias **só** quando existir captura independente integral desses fatos, cardinalidade comprovada, mapeamento de praça aprovado e atualização dentro da janela medida. Até lá: `SEM_MEDICAO` / `UNKNOWN`, sem sugestão de item, insumo, duas sacolas ou fechamento automático.

### Três estados obrigatórios para qualquer sinal
- **PROVADO E FRESCO**: cadeia de fonte e recibo válidos, sem duplicação, modo/unidade certos; elegível ao motor **existente**.
- **DIAGNÓSTICO / PARCIAL / DEFASADO**: utilizável apenas como informação explicitamente rotulada; não produz recomendação operacional factual.
- **AUSENTE / CONFLITANTE / NÃO AUTORIZADO**: não contabilizar como zero nem pintar verde; mostrar lacuna e caminho de averiguação para humano quando relevante.

O envelope deve preservar `event_id`, `unit_id`, identidade de origem e ator quando apropriada, `occurred_at`, `recorded_at`, versão da fonte, modo de operação, vínculo com evento/pedido, completude e carimbo de confirmação. **Mapear para os contratos existentes**; não criar formato paralelo à revelia dos donos dos domínios.

### Como a Home deve agir
- **Calmo** apenas com as fontes necessárias disponíveis, frescas e sem sinal relevante. Ausência de dados não é Calmo.
- **Ambiente** mostra pressão conhecida e lacunas por área sem demandar ação nem ocultar outras áreas importantes.
- **Foco** contém **uma** recomendação concreta, evidenciada, reversível e com primeiro passo humano. Nunca um percentual de confiança calculado de severidade; onde confiança não for validada, dizer `não estimada`.
- Priorizar situações cujo custo humano está comprovado: sacola pronta mas não retirada (quando ambas as pontas estão atestadas), divergência no lacre/conferência, entrega sem recibo final e perda de confiabilidade de uma fonte crítica. Não alertar sobre a ausência de um pedido ainda não observado como se ele estivesse atrasado.
- A equipe precisa conseguir verificar *por quê / origem / há quanto tempo / o que fazer* com um toque no detalhe, sem poluir a tela principal. Não aumentar interruptividade sem evidência.

## Plano mínimo de execução (sem prometer o que não foi testado)
**Gate 0 — agora:** preservar a decisão acima; conferir os eventos próprios já disponíveis, seus contratos e o circuito real que chega à Home. Identificar lacunas específicas; não adicionar coletor.
**Gate 1 — bancada:** usar eventos sintéticos do fluxo TATÁ e testar duplicidade, ACK perdido, reinício, leitura externa ausente, identidade cruzada, transição tardia, dois aparelhos e falha de origem. Exigir que nenhum caso gere entrega/pronto/verde/foco enganoso.
**Gate 2 — observação real:** verificar em Itaim somente eventos produzidos pelo TATÁ, com autorização operacional delimitada, sem alterar sistema fornecedor, imprimir, habilitar GPS de pessoas, ativar serviço do caixa ou registrar pedidos reais sem escopo aprovado. Verificar a cadeia de recibo, frescor e associação contra observação humana.
**Gate 3 — Home verdadeira:** verificar fluxo do Copiloto na Home, não apenas `/copiloto`; testar a prioridade única, movimento Calmo/Ambiente/Foco, visual canônico, falsos positivos e retorno à normalidade em um almoço e um jantar.
**Gate 4 — piloto controlado:** liberar somente sinais aprovados; iniciar read-only; consentimento e autorização humana para qualquer ação de entrega ou GPS. Reversão operacional comprovada antes de ampliar.

### Critérios de aceitação propostos (metas, **não** resultados medidos)
- Zero afirmações de pedido entregue/pronto/conferido sem recibo/prova; zero verde decorrente de origem ausente; zero inferências de observações sensíveis sem cobertura integral.
- Nenhuma atualização de estado atestada em duplicidade após reenvio; nenhum histórico perdido após reinício; nenhum evento do segundo dispositivo ou unidade misturado.
- Toda recomendação de Foco responde `o quê, por quê, evidência, frescor e primeiro olhar`; nenhum Foco compete com a autoridade da Operação Viva.
- Revisão humana de casos reais com registro de alerta útil, falso alerta, alerta perdido e tempo até percepção. Tempos-limite e sensibilidade **devem ser medidos e ajustados**, não inventados.

## Fontes de pesquisa / transferências de aprendizado
- Google SRE, *Incident Management Guide*: https://sre.google/resources/practices-and-processes/incident-management-guide/ — alertas por sintomas e acionáveis, sem ruído.
- Google SRE, *Monitoring*: https://sre.google/workbook/monitoring/ — dado defasado pode induzir ação errada.
- NIST AI RMF: https://airc.nist.gov/airmf-resources/airmf/3-sec-characteristics/ — transparência, robustez e intervenção humana.
- Android Developers, *Offline-first*: https://developer.android.com/topic/architecture/data-layer/offline-first — fonte local e recuperação de sincronização.
- GS1 Brasil, *EPCIS*: https://www.gs1br.org/epcis — conceito de eventos: o quê, onde, quando, por quê e como; **não** decisão de adotar plataforma externa.
- Lei Geral de Proteção de Dados (LGPD), art. 6º: https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html — finalidade, necessidade e transparência; evitar vigilância visual desnecessária.
- Investigação interna `RESEARCH_AND_DECISION.md` (01/11) e `docs/execution/COMANDAS_READER_SOURCE_CONTRACT_GAP_20261103.md`: fontes diagnósticas não legitimam alimentar o Copiloto.

## Efeitos e fronteiras
Artefato de **planejamento verificável**, não implantação. Não altera contratos, telemetria, bancos, credenciais, alertas ativos, ambiente comercial, aparelhos, versões, rota pública, impressão, GPS ou pedidos. Requer prova antes de promover mudanças de comportamento. O Copiloto permanece uma experiência governada pela documentação canônica e pelo humano.
