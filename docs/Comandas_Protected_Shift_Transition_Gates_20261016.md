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
