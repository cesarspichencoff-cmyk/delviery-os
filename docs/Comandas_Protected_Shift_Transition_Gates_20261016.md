# TATÁ Comandas — portões para transição do turno protegido
**VÉRTICE 2.2 | 16/10/2026 | STATUS: DRAFT / HOLD — desenho sem autorização de efeito**

## 1. Decisão

Não implantar a prévia V8.15 isoladamente. Uma mudança segura envolve **um conjunto indivisível de versões e permissões**: armazenamento do turno sob ACL separada, leitor V2 com caminho protegido, configuração do supervisor ancorada no hash exato do leitor, mecanismo de atualização com autorização humana independente e trilha de transição recuperável.

O contrato de tempo validado nas V7.4/V8.12 é necessário, mas não fornece identidade humana, custódia ou prova física de impressão. **Nenhum campo `evidence=HUMAN_CONFIRMED_RULE` ou `source_ref` é, por si só, autenticação.**

O serviço mantém sua árvore de `state` para checkpoint, heartbeat, lock e eventos. O arquivo de turno aprovado não deve permanecer em uma pasta onde o mesmo serviço detenha capacidade de substituí-lo.

## 2. Evidência presente — não extrapolar

| Objeto | Evidência atual | Limite |
|---|---|---|
| Fonte canônica VÉRTICE 2.2 | `vertice-runtime.` / `vertice-active` / `VERTICE_ENTRY.md`, blob `912a02f932acc42e76cb1fb7d46b3f1f8a0c380d` | Estado revalidado ao preparar esta nota |
| PR #107 | `OPEN / DRAFT / HOLD`, HEAD anterior `ea83fd24c5408bb6bdb81c4f530d3e065d76bef2` | Não houve merge |
| V8.13 | Contas NTFS reais distintas em runner Windows descartável: leitor lê turno e grava eventos, mas não modifica o turno protegido | **Não é ACL da CAIXA, nem identidade humana** |
| V8.14 | Mudança de UMA linha do watcher V2, SHA de origem pinado; 12 testes sintéticos Windows + Linux; parser do PowerShell real aprovou a prévia em memória | Não instalou o candidato |
| V8.15 | Prévia em código `tools/comandas_watcher_supervisor_pair_v815_offline.cjs`; conferência do par de arquivos de origem e hashes de candidatos em memória na CAIXA | **Sem teste V8.15 próprio**: tentativa de criação de suíte bloqueada pela ferramenta. CI de `ea83fd24...` verde **não prova V8.15** |
| Estado e história | Estado do turno instalado de 14/10 LUNCH; última linha do histórico comum 07/10 DINNER; proposta de 14/10 marcada `HOLD` concorda nos campos examinados, exceto `updated_at` | Autoria/autoridade da mudança ainda UNKNOWN |
| Supervisionamento | O supervisor V2 usa `watcher_path` e `watcher_sha256`; a entrada legada V1 ainda aponta para V1 | Troca de um arquivo isolado falharia no pin ou perderia o caminho de rollback |
| Arquivos protegidos candidatos | `approved-shift` e o script `v2_protected_v815.ps1` foram consultados passivamente e **não existem** no host observado | A separação ainda não está instalada |

### Pares de identidade já conferidos (somente preview)

- Leitor V2 original: SHA-256 `A58E428826D70EDF27763C3FA47893608305A7FB48F973EE1F84F02E5DA19C5C`, 16.755 bytes.
- Configuração de supervisor original: SHA-256 `FE213C3E865D88C48C7A6B803459804A44C8E287B85B1C574DC42400D73DCD19`, 777 bytes.
- Leitor V2 candidato: SHA-256 `0DF2F5C7AAEE8749C1B48EA9C6162025AA1C9821F948F11351CBF6BC24FC4392`, 16.764 bytes.
- Configuração candidata: SHA-256 `DA25DD3EE3AF2F1E19BBB2274EC95B90D280D1FA50BA74C33FB9A81E092A7781`, 792 bytes.
- Alterações semânticas previstas na configuração: **somente `watcher_path` e `watcher_sha256`**. `heartbeat_path`, `child_record_path` e `lock_path` preservados. Uma igualdade de hashes de prévia **não comprova execução compatível do supervisor**.

## 3. Portões de aceite, na ordem

### P0 — Baseline e proteção contra deriva (somente leitura; obrigatório)
Verificar contemporaneamente HEAD da PR, hashes dos **dois** artefatos originais, identidade efetiva dos processos, topologia V1/V2, configuração do supervisor e ausência de alterações paralelas. Se qualquer origem divergir, **HOLD** e nova revisão; não aplicar o patch antigo sobre código desconhecido.

### P1 — Origem da aprovação e custódia independente (ainda UNKNOWN)
Definir uma pessoa/identidade autorizada que não seja o principal do leitor, autenticar a autorização de forma independente e amarrá-la à unidade, data, serviço, janela, versão anterior e mudança pretendida. `source_ref`, nome digitado, arquivo gerado pelo mesmo serviço, commits em repositório público ou assinatura com chave custodiada pelo mesmo executor não satisfazem esse requisito.

A trilha de histórico atual tem discrepância temporal e é gravável pelo serviço; **não pode servir como única fonte de confiança**. Reusar a investigação V7.58 sobre testemunha externa como conhecimento prévio, **sem presumir que seus testes sintéticos provam custódia real** e sem provisionar serviço pago.

### P2 — Compatibilidade e regressão isoladas (ainda NÃO aprovadas)
Executar teste adversarial próprio do **par V8.15** com entradas reais reproduzidas em ambiente isolado e sem dados de pedidos: SHA incorreto, alteração de um byte, duplicidade de caminho/hash, schema/campo desconhecido, falta de script, script inválido, configuração incompatível, concorrência, rollback e corte entre as duas alterações.

Testar também o **supervisor efetivamente lançado** com o candidato em ambiente Windows descartável: deve rejeitar SHA divergente, não cair silenciosamente no caminho antigo, conservar heartbeat, lock e filho, e não criar serviço, estado verdadeiro nem imprimir. Somente teste estático ou CI de versões anteriores não atende.

### P3 — Isolamento de diretórios com tokens Windows reais
Em sandbox descartável, provar a combinação integrada: leitor sob principal restrito lê o turno **somente na pasta protegida**; consegue gravar eventos/checkpoint na outra árvore; não consegue renomear a pasta protegida, escrever/substituir/remover arquivo ou usar a ACL do pai para contornar a proteção. Escritor separado pode executar uma transição sintética autorizada com controle de versão, mas **não herda aprovação humana** por possuir ACL de escrita. Se o turno protegido estiver ausente, desatualizado, alterado ou inacessível, o leitor deve produzir **HOLD** sem retrocesso ao arquivo antigo.

### P4 — Durabilidade/rollback em sandbox
Simular interrupção antes do staging, depois do staging do script, antes da atualização do supervisor, depois da troca de configuração, na leitura do estado e durante registro de histórico. Exigir recibo da revisão anterior, hash esperado, testemunha durável externa quando aplicável e reconciliação **sem autocorreção** em estado ambíguo.

Mudar só o hash no supervisor com o script ausente é proibido; mover o script para outro caminho sem referenciar o SHA correto é proibido. O processo legado V1 deve permanecer íntegro e seu escopo conhecido.

### P5 — Aprovação humana explícita do efeito real
Somente depois dos portões anteriores, apresentar um pacote de autorização específico para **uma** implantação controlada: janela, unidade, identidade de aprovação, conteúdo e hashes previstos, operações permitidas, reversão verificável, impacto e condição de parada. Sem essa decisão humana, não modificar pasta/ACL, supervisor, serviço, estado de turno, SQL ou impressoras.

### P6 — Evidência pós-implantação (ainda futura)
Se autorizada, verificar leitura sob token real, saúde do supervisor, ausência de retorno ao estado antigo e falhas em modo bloqueado, provas de integridade da transição, logs minimizados e reversibilidade. **CODE_READY ≠ DEPLOYED ≠ WORLD_PROVEN.**

A eventual liberação da impressão é **outro efeito**, condicionado a provas independentes da consulta SQL efetiva, cinco fontes V6.8, identidade dos pedidos, embalagem/quantidade e papel físico das três vias. Não confundir fila/HTTP 202 com impressão.

## 4. Matriz curta de falhas

| Situação | Ação segura |
|---|---|
| Origem ou SHA do script/config alterado | **HOLD:** não usar candidato antigo |
| Turno protegido inexistente ou vencido | **HOLD:** não aproveitar turno legado nem inferir almoço/jantar |
| Aprovação humana não verificável | **HOLD:** sem escrita de turno |
| Leitor consegue escrever no turno aprovado | **HOLD:** isolamento falhou |
| Arquivo staged ausente, hash incorreto ou erro do supervisor | **HOLD:** não liberar; preparar reversão sob decisão autorizada |
| Estado e histórico não reconciliados | **HOLD:** preservar evidências, investigar |
| SQL sem permissão/coluna confirmada | **HOLD:** sem consulta a pedidos reais nem concessão automática |
| Evento recebido sem cinco provas V6.8 / papel não observado | **HOLD:** sem afirmar três vias impressas |
| CI existente verde mas suíte V8.15 ausente | **HOLD:** sem declarar integração validada |

## 5. Restrições de execução

**Nenhuma modificação foi feita na CAIXA** para produzir este documento. Não consultar SQL, não conceder GRANT, não instalar, não reiniciar serviço, não ajustar ACL, não modificar turno/histórico, não executar o escritor, não usar dados de clientes, não imprimir, não mesclar a PR e não consumir recursos pagos.

**Próxima implementação:** validar o par V8.15 e comportamento real do supervisor em sandbox, por um caminho de teste permitido, *antes* de preparar qualquer efeito no host. Se o bloqueio de criação do teste persistir, manter essa lacuna `UNKNOWN`; não reembalar uma rota equivalente para contorná-lo.

## Adendo: referência operacional de supervisão — 16/10/2026, 02h41 BRT

**Leitura passiva, não um monitoramento contínuo.** O computador `CAIXA_MOOCA` estava conectado. Foram lidos os metadados do serviço, a configuração já existente do supervisor e os campos técnicos sanitizados do heartbeat/registro de processo filho, sem consulta SQL e sem publicar conteúdo de pedidos.

1. O arquivo `bin/tata_reader_supervisor_v1.config.json` manteve o SHA-256 exato `FE213C3E865D88C48C7A6B803459804A44C8E287B85B1C574DC42400D73DCD19` e `watcher_sha256` correspondeu ao hash atual do watcher V2 em seu caminho configurado; ambos os arquivos existiam.
2. O `state/reader-heartbeat-v1.json` estava legível sob schema `deliveryos.tata-reader-heartbeat.v1`, apresentando `state=RUNNING`, `consecutive_failures=0` e timestamp local `2026-10-16T02:41:31.9885462-03:00`. O arquivo havia sido modificado aproximadamente **3 segundos antes da leitura**. Isto é prova pontual de heartbeat recente, **não** prova de funcionamento ininterrupto, aprovação do turno ou processamento correto de um pedido.
3. O registro `reader-supervisor-child-v1.json` existia, era JSON válido no schema `deliveryos.tata-reader-supervisor-child.v1`; o arquivo de lock `reader-supervisor-v1.lock` existia. Não foi inferida a validade efetiva do lock nem provada a operação da rotina de recuperação a partir da mera presença dos arquivos.
4. O envelope `effects` do heartbeat indicou `supervisor_database_read=false`, `database_write=false`, `network_call=false`, `print=false`, `spooler_write=false`, `odhen_write=false`, `fiscal_action=false` e `sefaz_call=false`. Informou `local_state_write=true`, que pode abranger registros auxiliares e **não comprova nem exclui** modificação específica de `production-service-state.json`.
5. **Fronteira de regressão para futura mudança:** após um deploy autorizado, verificar novamente saúde e cadência dos mesmos campos, os hashes do par e a identidade real do processo V2, mantendo o leitor V1 intacto. Se não existir heartbeat recente, surgir falha/deriva, ou o turno protegido não estiver legível, **HOLD**, sem fallback silencioso ao arquivo anterior.

Esta observação **não** amplia permissões de implantação. A V8.15 permanece sem suíte integrada própria e sem teste efetivo do supervisor com o novo caminho. Ações não praticadas: escrita local pelo assistente, alteração de ACL, instalação, restart, SQL, spooler, impressão e merge.


## Adendo de auditoria adversarial — cobertura de processos entre gerações V2/V8.15

**Criticidade: BLOQUEIO DE IMPLANTAÇÃO, não falha observada em produção.** Leitura passiva do arquivo instalado `bin/tata_reader_continuous_watch_candidate_v1.ps1` (790 linhas) esclareceu uma terminologia enganosa: **apesar do nome do arquivo, o V1 instalado é o SUPERVISOR DE LOTES**, não um segundo leitor V1 em paralelo. A entrada do serviço inicia esse supervisor; ele lança o watcher V2 a partir de `tata_reader_supervisor_v1.config.json`. Corrige-se assim a inferência anterior que denominou a entrada V1 de “leitor legado”. A existência simultânea de processos V1 e V2 é normal enquanto um é o supervisor e o outro é seu filho.

**Bug de transição em cenário de falha (código lido, não reproduzido):** `Stop-UnrecordedBatches`, acionada no startup do supervisor, identifica lote órfão *sem registro* por linha de comando que contenha exclusivamente `$cfg.watcher_path`. A V8.15 troca justamente esse campo para o novo arquivo `v2_protected_v815.ps1`. Se restar um lote no caminho V2 antigo e seu registro `reader-supervisor-child-v1.json` estiver ausente, o novo supervisor não o selecionará pela busca de órfãos: pode iniciar outro lote sobre o mesmo checkpoint. `Stop-OrphanBatch` cobre o PID registrado, mas não resolve o cenário **sem registro**. O código do supervisor reconhece explicitamente a janela entre `Process.Start` e `Save-ChildRecord`.

Além disso, se a enumeração de processos falha, `Stop-UnrecordedBatches` retorna `LIST_UNKNOWN`; o startup apenas registra essa condição e continua. Isso era limitação conhecida do supervisor atual, **inadequada como prova de exclusividade no momento de troca do caminho**.

**Consequência:** os testes de hash do par V8.15, a sintaxe PowerShell V8.14 e a ACL NTFS V8.13, embora necessários, **não testam a coexistência de processos antigos e novos nem a recuperação de órfãos entre gerações**. `V815_CUTOVER_NO_DUPLICATE_WATCHER=NOT_PROVEN`. Não interpretar `CI 2/2 SUCCESS` de versões anteriores como passe desse portão.

### Menor correção verificável antes de autorização real

1. No teste Windows isolado, simular um watcher antigo sintético vivo **sem registro de filho** e conferir que a lógica candidata o identifica como bloqueio antes de iniciar um watcher novo. Testar também PID reutilizado, registro ilegível, lista de processos negada, morte durante staging e restart/rollback. **Falha de enumeração vira HOLD**, não `NONE`.
2. Escolher a menor estratégia segura, após prova: **(a)** corte inteiramente quiescente com serviço supervisionado parado, prevenção de reinício, enumeração confiável e confirmação de que não existe processo V2 antigo/nova geração antes de aplicar config; ou **(b)** revisão versionada do supervisor para buscar ambas as gerações e bloquear quando a lista for desconhecida. Qualquer mudança do supervisor é terceiro artefato, com hash, rollback e teste próprios; não supor que apenas mudar `watcher_path` seja suficiente.
3. A recuperação pós-falha exige o mesmo portão de ausência de processos duplicados **antes** de devolver a configuração anterior ou reiniciar. Se a enumeração ou encerramento de um processo for inconclusivo, HOLD e escalonamento humano, sem matar arbitrariamente outros processos.
4. Mantêm-se os bloqueios prévios: identidade humana de aprovação do turno, pasta protegida sob ACL efetiva, testes próprios V8.15, SQL de menor privilégio, cinco provas reais V6.8 e impressão física autorizada.

**Limites da auditoria:** nenhuma alteração, parada ou reinício de serviço, criação de contas, GRANT, modificação de arquivo de turno, spooler ou impressão no restaurante. O cenário de órfão intergeracional é inferência causal diretamente sustentada pelo código, **não incidente operacional presenciado**.
