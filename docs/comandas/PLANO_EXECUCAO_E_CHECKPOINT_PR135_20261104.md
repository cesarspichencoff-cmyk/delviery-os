# TATÁ Comandas — plano de finalização e checkpoint de continuidade da PR #135

**Criado em:** 04/11/2026 (horário de São Paulo).  
**Missão exclusiva:** finalizar o **TATÁ Comandas** no Itaim. **Não desenvolver Delivery OS nesta frente.**  
**PR:** https://github.com/cesarspichencoff-cmyk/delviery-os/pull/135  
**Branch:** `audit/comandas-native-chain-20261102` — manter **DRAFT/HOLD** até provas e decisão de César.  
**Base verificada antes do registro:** `0dd1e8ac7fd11605a15aec11a4ba0896b7a66dfb`; a criação deste documento gera um novo commit, cujo CI deve ser aferido no SHA novo.  
**Contrato de comunicação solicitado por César:** informar **a cada passo material** a etapa atual, o que foi verificado/executado, evidência, bloqueio e próximo passo. **Anunciar explicitamente cada mudança de etapa**, mas só com critério de passagem comprovado. Sem prometer notificações assíncronas fora da conversa/automação ativa.

## Objetivo final e fronteira de realidade

Reutilizar o Reader V2 Itaim, as regras existentes de classificação/kits/caixas/observações/roteamento, e a renderização das vias aplicáveis **Cozinha, Sushi e Conferência**, para obter uma emissão operacional confiável, sem modificar gravações da Teknisa e sem duplicar ou perder impressões. A quantidade de vias por pedido **é variável**: nenhuma via de produção vazia deve ser inventada só para atingir três.

O TATÁ é consumidor de dados/roteador de produção; **Teknisa permanece sistema de registro**. O cruzamento independente iFood × Teknisa é exigência da **Conferência**, não pré-condição externa das vias nativas de produção, sem afrouxar vetos globais de origem/embalagem.

**Invariantes de autorização:** sem executar SQL de pedidos ou `SERIALIZABLE` na operação, mudar RCSI/SNAPSHOT, instalar ou substituir worker/supervisor, alterar ACL/credencial, serviço/caixa, tocar spooler/fila/porta, imprimir, alterar fiscal/SEFAZ, reservar sequência real, contatar Teknisa, merge/deploy/cutover ou novo gasto sem autorização específica próxima do efeito. Pesquisa, revisão e testes isolados sem efeito operacional são permitidos. Não misturar CI verde com evidência física; `ATTEMPTED != DONE != PROVEN`.

## Estado comprovado que deve ser preservado

1. Reader V2 **instalado** no CAIXA_MOOCA (host do Itaim, não caixa lógico IFO): supervisor `tata_reader_continuous_watch_candidate_v1.ps1` apenas gerencia processos; worker real `tata_reader_continuous_watch_candidate_v2.ps1`, SHA-256 `92b33e82ed72426be46fe20bcb2a4f4557f9716108886f89e15a4e262c506d44`. Não substituir pelo V1 antigo. Fonte: `ITAIM_REAL_READER_SQL_SOURCE_PROOF_20261104.md`.
2. Banco `teknisa`, login ativo `NT SERVICE\TataComandaReader`, `READ COMMITTED`, `RCSI OFF`, `SNAPSHOT OFF`; quatro tabelas do Reader sem rowversion/Change Tracking/temporal. Plano do SQL instalado observado no cache; **plano e impacto da candidata de uma comanda continuam UNKNOWN**. Fontes: `ITAIM_REAL_READER_SQL_SOURCE_PROOF_20261104.md`, `READER_V2_CACHED_SQL_PLAN_AND_ATOMICITY_GATE_20261104.md`.
3. Eventos históricos V2 com notas; digest antigo em MAIÚSCULAS. `ToLower` isolado não substitui recálculo por JSON canônico (diferenças PowerShell/Node em caracteres especiais). Existe candidata canônica review-only e checkpoint antigo; migração sem reemissão dos 250 registros observados **não implementada**. Fonte: `READER_V2_CANONICAL_CANDIDATE_ROLLOUT_GATE_20261104.md`.
4. Candidata de homologação nativa: manifesto pinado de **26 arquivos de código + 8 de dados**, cadeia testada com revisões históricas, renderizador V4.8, laboratório de sequência/atestado; **sem** atestador real, impressão física ou produção autorizada. Fonte: `CANDIDATA_FINAL_HOMOLOGACAO_20261102.md`.
5. `tools/comandas_reader_one_order_serializable_REVIEW_ONLY.sql`: uma comanda `DLV_IFO`, `SELECT TOP (201)`, campos e observações, dois parâmetros `varchar(10)`; `SERIALIZABLE` tem risco de bloquear escritores. `LOCK_TIMEOUT 100` limita espera do leitor, **não** tempo de bloqueio do caixa. Fonte: `ITAIM_ONE_ORDER_SERIALIZABLE_REVIEW_GATE_20261104.md`.
6. Censo de papel nativo (até 20 pedidos consecutivos no almoço + 20 no jantar) **autorizado apenas como observação passiva** em 02/11, mas sem resultado físico recebido: `PAPER_CENSUS_AUTHORIZED_NOT_OBSERVED`. Fonte: `CENSO_FISICO_PRODUCAO_IFOOD_ITAIM_SEM_EFEITOS_20261102.md`.
7. CI do HEAD **anterior a este registro**: Actions `41791752098` concluiu `success` no `0dd1e8a...`. O SHA criado por este documento exige sua própria verificação. O sucesso de CI não prova SQL vivo nem impressão.

## Descoberta de engenharia que corrige a pesquisa anexada

**Duas leituras iguais + SHA-256 + quiet-window são indícios de estabilidade, não atestação de revisão íntegra.** Podem repetir uma fotografia misturada/incompleta. Mesmo snapshot transacional garante visão do banco, **não** que a aplicação Teknisa tenha completado todos os commits de cabeçalho, itens, notas e modificadores. Não liberar impressão autônoma com essa heurística.

**Rota preferida:** Reader V2 existente + prova transacional da consulta + **prova separada de completude semântica da revisão** + objeto de revisão imutável + motores existentes + shadow + controle independente de efeito físico.

**Rota alternativa que pode acelerar:** se o censo físico provar que as vias nativas de Cozinha/Sushi já estão corretas e não são duplicadas, manter temporariamente essa produção e homologar **apenas uma Conferência TATÁ exclusiva**; preservar as vias virtuais prontas para substituição futura. Se o censo falhar, não contornar: manter sombra e provar primeira emissão, fallback, backlog, emissor e cutover antes de substituir.

## Etapas e critérios de transição

### ETAPA 1 — Inventário e congelamento dos componentes válidos
**ESTADO: CONCLUÍDA (04/11/2026; gate 1 comprovado pelo HEAD `26232815` e CI #41797580883).**
- Revalidar HEAD e CI, manifesto 26+8, V2 instalado (não V1), contratos de origem `DLV_IFO`, chaves e revisões, 2 ou 3 vias aplicáveis, motores pinados, testes existentes e ausência de mudanças de efeito.
- Produzir mapa curto `PRESERVAR / CORRIGIR / BLOQUEAR`; NÃO reimplementar classificação/kits/renderizador.
- **GATE 1:** base e testes relevantes identificados sem contradição; riscos atuais catalogados e nenhuma modificação de produção. Só então anunciar entrada na Etapa 2.

### ETAPA 2 — Testes adversariais e integridade offline
**ESTADO: EM_ANDAMENTO (04/11/2026; transição explícita após gate 1).**
- Exercitar dados de transações repartidas; A→B→A; notas Unicode/apóstrofo; cancelamento durante leitura; linhas ausentes/truncadas; revisões distintas com hashes, duplicidade e restart; risco de misturar revisão entre vias.
- Reusar suítes existentes; implementar apenas casos não cobertos. Proteção de migração de hash/checkpoint sem reemissão das 250 entradas amostradas.
- **GATE 2:** testes adversariais e CI do SHA exato, recusa segura `HOLD` nos casos negativos; não atribuir prova de banco real a fixtures.

### ETAPA 3 — Prova de plano/isolamento SQL antes de consulta de pedidos
**ESTADO: PENDENTE.**
- Analisar somente catálogos/plano quando autorizado pelas permissões existentes. A candidata `SERIALIZABLE` tem risco físico de locks; plano já cacheado do Reader V2 NÃO representa plano da candidata.
- Demonstrar filtros nativos, `varchar(10)`, abrangência de todas as linhas/notas, custos, `TOP(201)`=sentinela, `MAXDOP 1`, limites de comando e rollback/STOP. Determinar se transações nativas gravam revisão semanticamente completa.
- **GATE 3:** risco de bloqueio controlável e prova técnica suficiente para **propor** ensaio específico. Caso contrário manter HOLD e explorar alternativa não bloqueante de forma autorizada; não habilitar RCSI global.

### ETAPA 4 — Uma revisão real, sob autorização nova e específica
**ESTADO: PENDENTE / NÃO AUTORIZADA.**
- Uma comanda `DLV_IFO` no Itaim, identidade do Reader, sessão isolada, limites e monitoramento de writers; nenhuma alteração de pedidos.
- Provar simultaneidade transacional **e** completude semântica; preservar notas/quantidades/estados sem expor PII.
- **GATE 4:** revisão íntegra da mesma chave e evidência sem impacto material nos escritores, ou HOLD fundamentado. Essa autorização não libera print/serviço/seq/merge.

### ETAPA 5 — Censo físico e modo sombra
**ESTADO: PENDENTE.**
- Censo natural de papel almoço/jantar já autorizado **somente para observar**; resultado ainda desconhecido. D1 = papel nativo conforme na amostra; D2 = anomalia; D0 = incompleto.
- Simulação dos tickets TATÁ sem imprimir requer canal/piloto autorizado separadamente caso envolva cópia/execução no caixa; comparar conteúdo/observações/rotas, medir cobertura sem PII. `Printed` na fila != papel.
- **GATE 5:** decidir por prova entre preservar Cozinha/Sushi nativas e acrescentar Conferência ou substituir vias sob plano próprio; nenhuma rota passa automaticamente à produção.

### ETAPA 6 — Sequência, impressão supervisionada e aceite
**ESTADO: PENDENTE / NÃO AUTORIZADA.**
- Escritor de sequência diária TATÁ persistente e atestador por identidade independente; `LIVE_ATTESTED` exige prova real. Cruzamento independente iFood apenas Conferência.
- Inventariar fontes nativas, Gestor/GP, transportes, fallback/backup, backlog antigo, reimpressão, papel fiscal isolado, printer exclusiva e rollback.
- Efeito desconhecido = conciliação supervisionada, jamais retry automático como se não houvesse papel.
- Autorizações separadas para instalação/piloto, Epson, supressão seletiva e cutover.
- **GATE 6 / ACEITE:** paper/world proof, emissão única por revisão e praça, sequência persistida, impressão legível e aceite de César, sem obrigação crítica aberta. CI verde isoladamente ≠ 10/10.

## Próximo passo seguro

Executar **ETAPA 2** sobre os casos adversariais que ainda não possuem prova completa: split commits e completude semântica, ABA, mudanças concorrentes, notas Unicode, dedupe/checkpoint e migração V2 sem reemissão. Rastrear exatamente qual teste atual já cobre cada caso e adicionar apenas cobertura faltante. Antes de sair da etapa 2, exigir CI do SHA de código exato e documentação da falha segura. Nenhuma tentativa de SQL live ou impressão sem autorização expressa.


## Gate 1 — fechamento comprovado e mapa de preservação (04/11/2026)

**Transição autorizada neste escopo de desenvolvimento:** `ETAPA 1 CONCLUÍDA → ETAPA 2 EM_ANDAMENTO`. Este registro **não** autoriza efeito no caixa.

- **HEAD validado antes desta atualização:** `262328153075cb50952f7796090c60ffe02e4db4`; [CI #41797580883](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41797580883) `completed/success`. Este commit introduziu apenas o documento de checkpoint sobre a base `0dd1e8ac`; sucesso de CI não constitui prova live.
- **PRESERVAR:** manifesto 26 code + 8 runtime data, identidade byte-a-byte; Reader V2 instalado e supervisor V1 intocados; contrato de quatro partes e origem `DLV_IFO`; motor pinado de produtos, kits, embalagens e observações; renderizador Figma V4.8; número de vias **variável 2 ou 3**, sem via vazia, `VIRTUAL_VIEWS_READY`.
- **CORRIGIR/PROVAR ANTES DE OPERAÇÃO:** revisão inteira consistente no banco e **semanticamente completa** (provas separadas); migração de SHA antigo/JSON canônico sem reemissão; confirmação de checkpoint/restart; leitura independente de iFood somente na Conferência; sequência real e censo físico.
- **BLOQUEAR:** `SERIALIZABLE`/query de pedidos em caixa, troca de serviço V1/V2, alteração RCSI/SNAPSHOT, printer/queue/fiscal, sequência real, impressão/cutover/merge/deploy, fornecedor e novos custos sem gate/autorização específica.
- **Prova adicional Foxxy ISOLADO**, cópia no commit `39deca62` (**não** o HEAD atual): 9/9 revisão SQL estática, 23/23 isolamento sem DB, 5/5 atualização canônica synthetic, 6/6 risco de revisão misturada após build local TypeScript; total **43/43**. Uma primeira tentativa 6/6 não executou por ausência de `dist`; recuperada com compilação somente na cópia Foxxy, sem mudar o banco. A diferença entre a cópia Foxxy e o HEAD antes do registro são **3 arquivos**: dois documentos e a suíte SQL review (não alegar que os testes Foxxy são testes do HEAD).
- **Etapa 2 ainda aberta:** não há teste operacional vivo nem prova de migração do checkpoint de 250 entradas; investigar cobertura antes de escrever novo código. O gate 2 exige CI exata após eventuais mudanças, testes negativos adversariais e recusa segura.

## Etapa 2 — checkpoint incremental: proteção de revisão e de checkpoint (04/11/2026)

**Estado: EM_ANDAMENTO; nenhuma transição para a Etapa 3.** Tudo abaixo foi feito em código `REVIEW_ONLY` e CI hospedada, **sem ler SQL atual, alterar Reader instalado ou imprimir**.

1. **Regressão de revisão misturada:** `0daabc99` incluiu três casos negativos (duas leituras idênticas da mesma mistura, ciclo A→B→A, subconjunto semanticamente incompleto), mantendo os vetos `realOrderPublishable=false`, `currentSqlSnapshotProven=false`. O workflow `#41798880206` passou nesse commit, mas **ainda não executava esses verificadores**. Não usar esse CI como prova de sua execução.
2. **Correção da cobertura do CI:** `3e69aaa5` conectou explicitamente os testes de revisão misturada e de política SQL aos runners Linux, e os testes de revisão misturada e checkpoint V2 ao Windows. O workflow completo `#41800746999` no **SHA exato de código `ad7c5e70304a6b6a1d87a4cac9ab59fb13850413` concluiu `success`**, com os dois jobs (Linux e Windows) aprovados e os novos passos executados. Fonte: https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41800746999 .
3. **Guard adicional na candidata, sem instalação:** `afbd0e25` exige marcador de geração da candidata nova, formato de fingerprint canônico minúsculo, chaves não repetidas e limite de 250 entradas. Uma edição isolada de `hash_contract_version` no checkpoint antigo não o torna aceito. **Marcador de origem/geração NÃO é autenticação independente de migração**, e um checkpoint forjado com campos plausíveis continua exigindo prova externa.
4. **Teste de migração sintética:** `1359b9b4` ampliou o fixture PowerShell para `10/10` cenários, incluindo **250 entradas completamente fictícias**, hash `emitted_hash` preservado na carga, tentativas de reetiquetagem, hashes antigos em maiúsculas, duplicatas, limite excedido e bootstrap sem arquivo. `ad7c5e70` fez o wrapper Windows exigir o novo resultado. O teste **não é migração de produção** nem comprova que 250 entradas reais estejam corretamente reconvertidas ou que uma revisão nova legítima não seja perdida.
5. **Gates ainda não resolvidos:** reconciliação verificável dos eventos legados com seus bytes/hash de origem e novo JSON canônico; prova sobre pedidos alterados durante migração e comissões/revisões abertas; simulação de crash/backup/rollback/restart sem reemissão; completude semântica além de snapshot de SQL; nenhuma autorização de leitura real nem de troca de worker. `MIGRATION_REAL=NOT_IMPLEMENTED`, `ROWSET_ATOMICITY=UNKNOWN`, `PRINT=HOLD`.

**Próximo passo da Etapa 2:** aprofundar a prova independente de origem dos arquivos/eventos legados, cobertura de revisões em aberto, concorrência e reinício/rollback sem duplicação; usar o reconciliador atual apenas como diagnóstico `HOLD` e preservar como alternativa a ponte em memória separada da PR #137. Não habilitar migração, SQL, serviço, impressão nem sequência real.

## Etapa 2 — reconciliação dos hashes legados: diagnóstico sem migração (04/11/2026)

**ESTADO: EM_ANDAMENTO — gate 2 ainda aberto; NÃO iniciar Etapa 3.** Escopo integralmente de código e CI isolada, sem SQL ao vivo, leitura de arquivo privado, mudança no serviço, impressão ou sequência.

1. **Diferença verificada e reuso:** a PR #137 já contém uma ponte **de consumidor** em memória para aceitar SHA legado maiúsculo somente quando o hash canônico é recalculado e coincide; opt-in restritivo, sem migração do checkpoint e sem comprovação de revisão SQL atômica. Não duplicar essa ponte em PR #135.
2. **Novo diagnóstico TATÁ:** `tools/comandas_reader_legacy_event_reconciliation_review_only.cjs` (introduzido em `9a695b09`): combina checkpoint antigo, testemunho bruto de evento e digest do próprio arquivo; exige chave nativa exata, `DLV_IFO`, filial/loja Itaim, igualdade de hashes **após recomputação**, integridade sintática de notas e nome histórico exato. **A origem dos bytes NÃO é autenticada** pelo SHA fornecido junto com o arquivo; as observações e `observation_scan_complete` também não atestam o SQL. O retorno é **SEMPRE `HOLD`**, com `converted_checkpoint=null`, sem eventos exportados e todos os efeitos bloqueados, inclusive no caso sintético de 250 entradas coincidentes.
3. **Regressões de segurança:** `tools/verificar_comandas_reader_legacy_event_reconciliation_review_only.cjs`, 19 casos inventados: 250 fingerprints, testemunhos ausentes/duplicados, observações editadas, hashes divergentes com apóstrofo, falsa procedência, alteração de origem, rótulo de versão, colisões de chaves e nomes por diferença de caixa. A correção `6dd56271` recusa colisões também no sentido case-insensitive usado por PowerShell/NTFS; `11535404` incluiu três verificações para elas.
4. **CI INDEPENDENTE do SHA EXATO:** commit de código `11535404218def5f3f0d1633d73cc3026471bddc`, [workflow #41803407946](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/41803407946) **`completed/success` nos dois jobs Linux e Windows**. O passo explícito de reconciliação Windows foi `completed/success`. O run anterior `#41802942015` foi cancelado por novos commits e **não** é a prova final.
5. **Obrigações abertas:** SHA de arquivo auto declarado e coincidência canônica não autenticam origem; não há mapeamento verificável dos 250 eventos reais, nem prova de pedido mais recente/revisão legítima, crash/restart/rollback, atomicidade do SQL `RCSI OFF` ou completude semântica. `MIGRATION_REAL=NOT_IMPLEMENTED`; `READER_INSTALLED=UNCHANGED`; `PRINT=NO`; `RELEASE=HOLD`.

**Gate de passagem:** não promover para Etapa 3 apenas por 19/19 ou CI verde; reconciliar testes adversariais restantes e explicitar a prova que falta. Um futuro diagnóstico privado precisará autorização específica, isolamento, preservação de PII e comparação de bytes/origem, sem transportar notas de clientes para artefatos públicos.

## Registro de acompanhamento (append cronológico com provas)

- **04/11/2026 — CHECKPOINT INICIAL:** plano consolidado com base na pesquisa internacional e no conteúdo da PR #135. Etapa 1 `EM_ANDAMENTO`; etapas 2–6 `PENDENTE`. Sem execução operacional. SHA anterior conhecido `0dd1e8a...`.
- **04/11/2026 — TRANSIÇÃO ETAPA 1 → ETAPA 2:** Gate 1 comprovado por CI #41797580883 em `26232815`; preservação/matriz verificadas, 43/43 verificações adicionais no Foxxy isolado (commit distinto `39deca62`). Etapa 2 `EM_ANDAMENTO`; nenhuma ação operacional. Novo SHA gerado por este registro exige prova própria, mas não altera código executável.
- **04/11/2026 — ETAPA 2, checkpoint de integridade:** CI completo `#41800746999` SUCCESS no commit de código `ad7c5e70` (ambos os jobs; testes específicos integrados ao workflow), checkpoint sintético 10/10 e candidata V2 ainda bloqueada. Etapa 2 `EM_ANDAMENTO`; migração real/SQL/print permanecem `HOLD`. Este registro documental gerará novo SHA cuja CI é independente.
- **04/11/2026 — ETAPA 2, reconciliador `HOLD`:** 19/19 testes sintéticos incluídos no job Windows, CI #41803407946 completa `SUCCESS` no SHA de código `11535404` (Linux + Windows). Checkpoint real e Reader V2 intocados; etapa 2 continua `EM_ANDAMENTO`, com origem/atomicidade/restart e migração real não provados. O commit documental deste registro exige CI separada.
- **As próximas atualizações devem especificar:** `DATA | ETAPA | EXECUÇÃO | EVIDÊNCIA (URL/SHA/teste) | RISCO/HOLD | DECISÃO/PRÓXIMO PASSO`. Transição só após gate comprovado, e comunicada explicitamente a César.
