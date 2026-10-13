# Neemo ↔ Teknisa ↔ Entregas — revisão de identidade sem recaptura

## Decisão operacional (12/10/2026)

**Não recriar um leitor nem usar o spooler como identidade de entrega.** As capturas de pedido do TATÁ Comandas já fornecem uma fonte Teknisa/Odhen; o aplicativo Entregas conserva seus próprios `delivery_id` e `trip_id`. A integração da Neemo, como origem comercial dos pedidos próprios, precisa ser provada por vínculo explícito. Igualdade de números, horário próximo, item, valor, texto de cliente ou impressão são **evidências insuficientes**.

O auditor `tools/reconciliar_neemo_teknisa_v1.cjs` foi preparado para um **manifesto local, minimizado e autorizado**, sem banco, rede, impressora, serviço ou escrita. Não faz parsing do banco real: é uma etapa de verificação sobre artefatos já exportados pelas fontes existentes. Não criar outro watcher.

## Verificação da fonte existente — 13/10/2026

A leitura **somente leitura** dos 2.626 envelopes `state/reader-events-v1` no CAIXA_MOOCA terminou com **zero erro de JSON**. Foram observados: `DLV_NMO` 39 eventos/30 `order_key` distintos; `DLV_IFO` 2.557/1.561; `DLV_FOS` 30/11. A amostra abrange eventos coletados entre 05/10 e 13/10/2026, **não necessariamente todos os pedidos comerciais desses dias**.

Nos 30 pedidos de origem `DLV_NMO` havia 30 referências `NRCOMANDAEXT` distintas, sem referência vazia, sem alteração da referência por revisão, sem duplicação da referência entre pedidos e sem sobreposição entre as referências externas Neemo e iFood no conjunto observado. **Estabilidade não é identidade externa autenticada:** a equivalência `NRCOMANDAEXT = ID nativo Neemo` permanece UNKNOWN. A flag `ready_for_downstream_shadow` não declara preparo concluído nem autorização de despacho.

Todos os envelopes pertencem ao mesmo par `CDFILIAL=0001`/`CDLOJA=01`. Os três arquivos de configuração já existentes no Windows (`shadow/routing.json`, `shadow/printer-map.json`, `shadow/non-production.json`) identificam a filial `0001` como **TATÁ ITAIM**, com data de 30/09/2026. Trata-se de **evidência da configuração instalada**, não substitui a conferência do mapeamento completo `0001|01 -> ITAIM` antes de ativar integração.

**Primeira versão sem API iFood:** a loja pode conferir presencialmente a comanda pelo `order_key` interno Teknisa e, sob autorização operacional, registrar uma entrega própria no Entregas. Isso **não exige comprovar previamente o número nativo Neemo** se a própria comanda/filial e o pedido estiverem verificados pelo operador. Em nenhuma hipótese um manifesto de auditoria adiciona pedidos prontos, cria Trip, imprime ou classifica automaticamente pedido como próprio.

A revisão de domínio `a1b693151cebd2a43d9dd668be61876fdcf7734e` introduz bloqueio fail-closed de **canais explicitamente externos/desconhecidos** em `CreateTrip` e `AddDeliveryToTrip`. O cadastro manual legado sem canal explícito continua compatível e **necessita conferência humana da origem**. iFood permanece exclusivamente em `Handoff`. O Copiloto usa a ponte causal pública preexistente, sem coletor adicional.

**Provas pendentes:** amostra independente de ID externo Neemo (apenas se esse dado for necessário na evolução), confirmação final da loja `01`, piloto Android físico com saída/retorno e eventos públicos reais, operação e aceite humano. PR #106 DRAFT/HOLD; nenhum efeito no ambiente da loja.

---

## Contrato de entrada

JSON único:
- `schema="neemo-teknisa-correlation-review.v1.1"`
- `teknisa[]`: `unit_id`, `origin_code="DLV_NMO"`, `order_key`, `revision`, `snapshot_sha256`, `observed_at`; identidade/revisão/hash devem vir do mesmo evento existente do TATÁ Comandas. Não usar hash de arquivo de impressão como substituto do pedido.
- `neemo[]`: `unit_id`, `order_id`, `revision`, `observed_at`; somente campos documentados em captura/exportação/autorização da Neemo. Não inferir `order_id` a partir do número da comanda.
- `links[]`: chave/revisão/digest exatos de ambas as fontes, `evidence_sha256` e `evidence_kind=independent_source_export` ou `documented_vendor_reference`. Esses vínculos devem vir de uma fonte externa real de associação, não de horário/telefone/nome. O digest declarado **não autentica automaticamente sua própria origem**.

**Dados proibidos neste manifesto:** nomes de clientes/motoboys, telefones, endereço, notas de observação, coordenadas, arquivos de impressão, valores monetários, CPF e tokens. Limite de 1 MiB e 1.000 registros por coleção; qualquer campo inesperado bloqueia o arquivo.

Execução local (quando os dois exports autorizados já estiverem disponíveis):
```powershell
node tools/reconciliar_neemo_teknisa_v1.cjs C:\caminho-autorizado\manifesto-minimizado.json
```
A saída contém **apenas contagens**, inclusive propostas com pin exato, sem vínculo, conflito, mudança de revisão e fonte faltante. Não publica pedidos ou identificadores e não modifica estado.

## Semântica da prova

`candidates_with_exact_pins` quer dizer **proposta de vínculo consistente no manifesto**, e nunca `WORLD_PROVEN`, `REAL_ORDER_CONFIRMED`, `TRIP_APPROVED` ou `PRINT_APPROVED`. Exige verificação independente de origem/autoridade e amostragem presencial posterior. Um candidato conflitante/repetido é recusado, sem escolha automática.

Não existindo uma referência de Neemo para Teknisa no material observado, registrar `UNKNOWN` e manter o pedido sem associação — não construir heurística por proximidade. Um pedido alterado depois da captura invalida o vínculo antigo por revisão/hash.

## Do vínculo ao Entregas

Após amostra real auditada, criar uma associação de identidade versionada e **somente leitura** para o `delivery_id` do domínio Entregas. O evento `Trip` deve manter seu contrato público `schema_version=1.0.0` e `source_mode` explícito. Só motoboy **próprio** faz `Trip`; courier externo é `Handoff` sem GPS obrigatório. GPS não comprova entrega concluída. `Copiloto` observa fatos públicos e não dispara viagens.

## Estado e fronteira

**Preparado em código e testes sintéticos; amostra real Neemo ↔ Teknisa NÃO validada.** Windows CAIXA_MOOCA respondeu a ping, mas as chamadas de leitura do diretório sofreram timeout nesta sessão; não atribuir cobertura a consultas que não terminaram. O leitor Comandas V1 no Windows e o runner V2/V6.8 em DRAFT são frentes distintas. Nunca instalar/alterar o serviço de Comandas para viabilizar esta auditoria.

Próxima prova útil: inspecionar **somente nomes/tipos de campos** dos eventos mais recentes, identificar um export/registro Neemo confiável e medir quantas ligações independentes existem numa pequena amostra sem conteúdo de cliente; se zero, relatar zero evidência de vínculo, não zero pedidos. Validar depois uma viagem real de motoboy e confirmação no Android físico.
