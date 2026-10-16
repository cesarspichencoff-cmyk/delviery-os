# DeliveryOS — condição de origem comprovada antes de aceitar fatos como reais

**16/10/2026 — CONTRATO PARA REVISÃO, NÃO IMPLEMENTAÇÃO.**
Autoridade humana: César. Escopo: G0→G1 e G0→G4 do DeliveryOS V1. Base técnica: PR #124 em DRAFT.

## Achado factual (não confundir com incidente produtivo)

O código atual oferece duas famílias de eventos públicos: eventos derivados de `DomainEvent` e sinais independentes gerados por `buildSignalEvent`. Ambos carregam um campo opcional `source_mode` e a string `source='entregas'`; esses campos são declarações de payload, **não identidade verificada do emissor**. O `validatePublicEvent` valida conteúdo/estrutura; `adaptarEventoPublicoEntregas` só exige modo explícito e Trip válida para tipos com equivalência. O processo `EntregasLiveConsumer` aceita e persiste `source_mode` do envelope se habilitado e autorizado pelo kill switch — **não existe nessa cadeia teste independente de atestação do produtor do modo real**.

**[CI 38855928358](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38855928358) SUCCESS: `ENTREGAS_SOURCE_PROVENANCE_BOUNDARY_LAB: 16/16 PASS`.** A suíte nova `tests/product/run-entregas-source-provenance-boundary-lab-tests.ts` reproduziu, totalmente em memória e com eventos fictícios, que um envelope marcado `real` passa do builder pelo validador, adaptador e consumidor para um escritor de fatos quando a flag é explicitamente ligada e o controle permite. Os testes também comprovaram: flag OFF por padrão; kill switch bloqueia; ausência de modo é isolada; `simulated` e `control` não são promovidos; sinais `delivery_ready` não viram `trip_started` pelo adaptador. **Nenhuma leitura, escrita, API, arquivo, serviço ou banco operacional foi envolvido.**

Este achado demonstra **ausência de prova de origem nessa cadeia específica**, não confirma que algum agente não autorizado possa enviar mensagens hoje, nem que a ingestão esteja ligada em produção. O processo de source-ingest permanece desligado por padrão na configuração.

## Contrato de aceitação por fronteira (antes do primeiro evento real)

1. **Identidade fora do payload:** a identidade do emissor deve ser verificada por credencial de transporte/serviço/aparelho expressamente autorizado, com expiração, revogação e escopo. Não aceitar `source`, `source_mode`, `confidence`, `source_health`, `unit_id` ou `correlation_id` enviados no JSON como prova de identidade ou de natureza real. Credenciais de aparelho não são automaticamente credenciais de gerente.
2. **Registro de autoridade controlado pelo servidor:** vincular a identidade verificável do produtor às unidades, tipos de evento e modos permitidos, com origem da autorização e trilha de mudanças. Não conceder `real` só porque `mode:'pilot'` ou um arquivo de configuração declara `source_mode:'real'`. Teste e desenvolvimento permanecem `simulated`/`control`; **UNKNOWN deve continuar UNKNOWN**.
3. **Atribuição de modo pela fronteira confiável:** após verificar produtor, escopo e autorização específica, **o servidor** estabelece modo e proveniência; divergência ou ausência de comprovação recusa/coloca em quarentena, sem gravar um fato `real`. Nunca promover `simulated`/UNKNOWN por conveniência.
4. **Dois caminhos legítimos:** eventos COR derivados de `domain_event` podem ter relação verificável com evento-base; sinais independentes (`delivery_ready`, `rider_arrived_store`, etc.) podem **não ter domain_event**. A política de procedência deve prever prova alternativa positiva para sinais, sem impor FK universal que bloquearia eventos legítimos ou aceitar qualquer JSON coerente.
5. **Encadeamento transacional e antirreplay:** registrar `producer_id` estável ou prova equivalente, idempotência, carimbo de recebimento do servidor, unidade autorizada, tipo permitido, decisão do modo e motivo de recusa. Garantir que o consumidor não atualize checkpoint como fato real não verificado. Preservar integridade de lote e escrita transacional existente.
6. **Menor privilégio:** credencial que só lê feed ou dashboard não pode criar/publicar `real`; emissor autorizado não obtém papel de DBA/DDL, `BYPASSRLS`, sessão humana ou permissão de outra unidade.
7. **Ativação separada:** feature flag, kill switch, fonte real, dispositivo ou interface iFood, banco e piloto só podem ser ativados com aprovação de César, prova do fornecedor autorizado, revisão de logs e reversão. A ferramenta não deve inventar credenciais nem contornar bloqueios anteriores.

## Contraprovas obrigatórias antes do GO

| Cenário | Resultado mínimo |
| --- | --- |
| Evento sem modo, incluindo histórico legado | UNKNOWN/quarentena, nunca fato real |
| Payload válido diz `source_mode=real`, produtor desconhecido | Sem fato real persistido |
| Produtor simulado tenta se declarar real | Rejeição e log sem promoção |
| Produtor com vínculo ITAIM declara unidade VILA-LAB | Rejeição anterior ao banco |
| Credencial revogada, expirada ou adulterada | Negação sem ingestão e sem checkpoint como fato real |
| Evento COR com domínio inconsistente | Rejeição/quarentena com evidência; sem FK global improvisada |
| Sinal independente legítimo e autorizado | Aceito com origem positiva, sem exigir `domain_event` inexistente |
| Sinal independente forjado marcado `real` | Rejeição/quarentena, inclusive se JSON coerente |
| Replay/idempotência duplicada; crash entre commit e checkpoint | No máximo um fato e checkpoint consistente |
| Configuração sem flag/kill switch ou indisponibilidade de prova | Fail-closed, nenhum consumo real |
| Rotas HTTP e SQL de duas unidades sob papéis segregados | Nenhum acesso ou escrita cruzados |
| Consumidor e produtor executados na mesma execução sintética | Prova de ponta a ponta em ambiente isolado, sem dados TATÁ |

**Para GO:** origem autenticada e autorizada demonstrada no exato executável e no exato canal que vai operar, logs/rastreabilidade, reversão, compatibilidade de sinais, autenticação humana confiável quando aplicável e aceite explícito. **Estado hoje: NO_GO para eventos reais, apesar do CI verde de bancada.**

## Próxima implementação segura

Fazer revisão do desenho de produtor/credencial e mapa dos emissores reais **sem acessar dados privados ou habilitar ingestão**. Uma prova em laboratório pode injetar identidades e concessões **fictícias** em um validador isolado e exercitar o produtor→feed→ingestão com papéis efêmeros. Isso **não** é autenticação funcional; integrar a versão real depende de superfície de edição autorizada e de aprovação operacional.

**Borda preservada:** nenhum merge, deploy, gasto, publicação, usuário real, token produtivo, RLS/role do banco produtivo ou atualização de turno/pedido foram feitos por esta auditoria.


## Segundo laboratório — assinatura de produtor + concessão independente (16/10/2026)

**Estado: PASS EM LABORATÓRIO; ORIGEM REAL CONTINUA NO_GO.**

- Artefato: tests/product/run-entregas-producer-attestation-lab-tests.mjs, executado no workflow isolado .github/workflows/deliveryos-operator-session-lab.yml.
- **[GitHub Actions 38856957406](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38856957406) SUCCESS**, HEAD de teste 5419049099a1d2eb9e7f58693d2cd5fb00ee68e0: DELIVERYOS_PRODUCER_ATTESTATION_LAB: **27/27 PASS** e regressão preexistente ENTREGAS_SOURCE_PROVENANCE_BOUNDARY_LAB: **16/16 PASS**; job completo aprovado.
- O harness gera pares Ed25519 **fictícios em memória**, mantém registro controlado pelo ensaio com chave pública, producer_id, unidade, tipos e modos autorizados, prazo e revogação. Não há credencial do restaurante, provedor real, chave operacional ou integração externa.
- A declaração producer_id serve apenas para localizar a chave candidata. A prova criptográfica é verificada **antes** de confiar nos atributos assinados, que são então confrontados com a concessão independente. Uma assinatura válida de Itaim não permite Vila-Lab; uma assinatura de simulador não concede modo real.
- As negativas cobrem identidade falsa, alteração do payload após assinar, unidade alheia, modo/tipo sem concessão, produtor revogado/expirado, rotação de chave, canal incorreto, assinatura antiga/futura, modo ausente, replay de nonce e duplicação de event_id.
- Uma fonte fictícia autorizada para o **rótulo de política** real exerce apenas a regra de permissão. O recibo é sempre LAB_SIGNED_SYNTHETIC_NOT_REAL, com world_real_source_proven=false, e o escritor em memória jamais grava source_mode=real. O sinal independente delivery_ready pode ser autorizado sem inventar domain_event.
- Feature flag desligada e kill switch são reprovados de forma fechada no ensaio; nenhum endpoint produtivo, consumidor produtivo, banco, feed da loja, operação humana ou fonte real foi ativado.

### Fronteira da evidência e próximo gate

O PASS **não prova** autenticação real de dispositivo/serviço, instalação segura da chave pública, cadeia de custódia, rotação e revogação operacionais, identidade da empresa/unidade, transporte protegido, outbox/checkpoint durável, nem o caminho completo **produtor real → transporte/feed real → validação de fronteira → consumidor/escrita real**. A verificação atual é uma política simulada em processo isolado, não uma proteção instalada na entrada do EntregasLiveConsumer.

**Próximo passo seguro:** criar uma fronteira de verificação anterior ao consumidor e ensaiar ponta a ponta um feed inteiro **fictício**, inclusive mistura de eventos válidos e rejeitados, cursor/checkpoint, crash/replay e os dois caminhos domain_event e sinal independente, sem transportar uma assinatura já validada por meio de simples declaração no JSON. Somente depois avaliar a fonte real com autorização e evidência externa específica.

**Gates mantidos:** G0 laboratório PASS; G1 BLOQUEADO; G2/G3 PARCIAIS; G4/G5 NÃO HOMOLOGADOS. PR #124 em DRAFT/HOLD, sem merge/deploy/gasto/modificação da loja.
