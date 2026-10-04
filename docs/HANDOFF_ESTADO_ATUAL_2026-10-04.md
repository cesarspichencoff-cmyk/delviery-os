# HANDOFF — Estado atual do projeto — 2026-10-04

## Fonte canônica e continuidade

- VÉRTICE: `cesarspichencoff-cmyk/vertice-runtime.`
- branch: `vertice-active`
- HEAD verificado: `e81b6d810e6a20e4a7e2f55ff9d1902b23dcf664`
- entrada: `VERTICE_ENTRY.md`

Projeto principal desta frente:
- DeliveryOS repo: `cesarspichencoff-cmyk/delviery-os`
- branch de trabalho: `fix/odhen-routing-config-proof-20260930`
- HEAD verificado: `34ab8a86e086626f9b5b26242c449aeeb9d1abfa`

Núcleo unificado:
- TATÁ OS repo: `cesarspichencoff-cmyk/tata-os`
- branch: `feature/unified-tata-core-20261001`
- HEAD verificado: `9e6f46c8e19cc9485bc4bd028b845c7e52cdf95c`

## Missão real

O projeto NÃO é só NFC-e.

A direção atual é construir uma camada operacional única do TATÁ capaz de observar o que a operação já produz, manter memória confiável do turno e transformar sinais reais em ação operacional útil.

Arquitetura atual:

`FONTES REAIS -> TATÁ Reader -> identidade/normalização -> Unified Core -> projeções por superfície -> DeliveryOS / produção / conferência / cockpit / outras frentes`

A frente fiscal usa o emissor nativo Teknisa e é apenas uma frente do projeto.

## Estado global

### 1. TATÁ Reader — PROVEN no mínimo necessário

Já houve leitura real minimizada de pedido integrado iFood no SQL usando identidade de serviço restrita.

Estado:
- `PROVEN_ADMIN_PHASE_PASS`
- `PROVEN_MINIMIZED_REAL_ORDER_READ`
- principal SQL: `NT SERVICE\TataComandaReader`
- banco: `teknisa`
- sem escrita
- sem PII persistida
- sem ação fiscal

Pedido real observado:
- Filial `0001`
- Loja `01`
- `NRVENDAREST = 0000346965`
- `NRCOMANDA = 0000346537`
- `NRCOMANDAEXT = 9092`
- `IDORGCMDVENDA = DLV_IFO`

Itens observados:
- `CDPRODUTO = 0000001459`
  - `COMB SUSHI + SASHIMI ESPECIAL 2 P`
  - qtd 1
- `CDPRODUTO = 0000001641`
  - `TEMAKI DE BARRIGA DE SALMAO `
  - qtd 3

UNKNOWN importante:
- `NRCOMANDAEXT = 9092` ainda NÃO está provado como sendo exatamente o número curto do iFood.

### 2. Descoberta de namespace de produto — blocker atual

Foi descoberto que o `CDPRODUTO` vindo diretamente do SQL e o código usado pelo Retail/roteamento NÃO estão no mesmo namespace.

Exemplo:
- SQL `0000001459`
- SQL `0000001641`

Aplicar diretamente a formatação Retail gera códigos inexistentes.

Portanto está bloqueado o pressuposto:
`SQL CDPRODUTO == Retail Código`

### 3. Replay candidato do pedido real — PASS, mas não é identidade canônica

Foi feito um replay zero-effect usando somente nome de produto com `trim` como ponte temporária.

Resultado:

- `0000001459`
  - nome: `COMB SUSHI + SASHIMI ESPECIAL 2 P`
  - 1 match exato no snapshot histórico de 210 produtos
  - candidato Retail: `9150003000`
  - código canônico: `9.15.00.030.00`
  - rota atual:
    - `00009 BALCAOSUSHI1` / `192.168.0.142`
    - `00003 DELIVERY SUSHI 1` / `192.168.0.153`

- `0000001641`
  - nome normalizado: `TEMAKI DE BARRIGA DE SALMAO`
  - 1 match exato no snapshot histórico de 210 produtos
  - candidato Retail: `9600001000`
  - código canônico: `9.60.00.010.00`
  - rota atual:
    - `00006 BALCAOSUSHI2` / `192.168.0.110`
    - `00004 DELIVERY SUSHI 2` / `192.168.0.4`

Verificador:
`TATA_READER_IDENTITY_BRIDGE_CANDIDATE_PASS`

Mas:
- ponte por nome NÃO pode virar identidade de runtime;
- NÃO pode autorizar impressão;
- NÃO pode autorizar estoque/CMV;
- NÃO pode virar regra canônica;
- full Retail catalog uniqueness ainda UNKNOWN.

Arquivos:
- `data/tata_reader_real_order_identity_bridge_candidate_20261004_v1.json`
- `tools/verificar_tata_reader_identity_bridge_candidate_v1.js`
- `docs/TATA_READER_REAL_ORDER_IDENTITY_BRIDGE_2026-10-04.md`

### 4. Próximo gate técnico já preparado

Objetivo:
provar de forma determinística a relação entre o identificador interno SQL e o código Retail.

Pista de documentação Teknisa:
- `CDPRODUTO` = código interno
- `CDPROINTE` = código externo
- `CDARVPROD` = outro código de produto no sistema
- também é pesquisado `CDPRODESTO`

Isso ainda NÃO prova a relação local no banco do TATÁ.

Foi preparado um probe metadata-only:
- `tools/tata_reader_product_identity_metadata_probe_readonly.ps1`

Static guard:
- `tools/verificar_tata_reader_product_identity_metadata_probe_static_v1.js`

Status:
`TATA_READER_PRODUCT_IDENTITY_METADATA_PROBE_STATIC_PASS`

O probe:
- usa Windows Integrated Authentication;
- lê apenas `sys.objects`, `sys.schemas`, `sys.columns`;
- não lê linhas de pedidos;
- não lê linhas de `TEKNISA.PRODUTO`;
- não escreve;
- não imprime;
- não faz fiscal/SEFAZ.

Próximo gate:
`PROVE_CANONICAL_SQL_INTERNAL_PRODUCT_ID_TO_RETAIL_PRODUCT_CODE_CROSSWALK`

### 5. CAIXA real é operado pelo Claude

ChatGPT NÃO tem acesso direto ao CAIXA pelo Desktop Commander.

- Desktop Commander atual: apenas Foxxy.
- CAIXA é operado por César através do Claude.

Foi criado handoff específico para o Claude:

`docs/CLAUDE_CAIXA_PRODUCT_IDENTITY_METADATA_PROBE_2026-10-04.md`

Instrução curta para César enviar ao Claude:

`Leia e execute exatamente docs/CLAUDE_CAIXA_PRODUCT_IDENTITY_METADATA_PROBE_2026-10-04.md no CAIXA. Não expanda o escopo e me devolva a evidência completa.`

O Claude deve parar depois do resultado do metadata probe.

### 6. Unified Core

O centro arquitetural atual não é mais o DeliveryOS isolado.

Unified Core:
- repo `tata-os`
- branch `feature/unified-tata-core-20261001`
- HEAD `9e6f46c8e19cc9485bc4bd028b845c7e52cdf95c`

DeliveryOS deve consumir projeções do núcleo único e manter apenas estado local da superfície.

Pin atualizado em:
`data/unified_core_source_v1.json`

Estado:
- núcleo muito desenvolvido;
- ainda `MIGRATION_TARGET_NOT_CUTOVER`;
- runtime cutover NÃO autorizado.

O objetivo após resolver identidade é executar:
`REAL_ORDER -> CURRENT_UNIFIED_CORE`
em replay zero-effect.

### 7. Produção / roteamento

Cadastro atual de roteamento e mapa de impressoras estão carregados e testados.

Arquivos principais:
- `data/odhen_product_routing_compact_v1.json`
- `data/runtime_printer_map_v1.json`

Já existe boa cobertura de comportamento esperado de produção.

Importante:
`CONFIG_EXPECTED_ROUTE != PHYSICAL_PRINT_PROVEN`

Não promover configuração para prova de impressão física sem evidência de mundo.

### 8. Fiscal / NFC-e — FROZEN até 05/10/2026

Esta frente está congelada deliberadamente.

Já comprovado por telas do Retail:
- iFood ativo;
- `Utiliza Loja e Caixa do Vendedor Padrão = Sim`;
- Vendedor Padrão `3004 - DELIVERY ITAIM`;
- operador Delivery Itaim;
- CAIXA PDV 001 configurado para NFC-e;
- `Recebimento Automático Delivery = Sim`;
- `Sincronização com Delivery Centralizado = Sim`;
- `Finaliza pedido automático após expedição vendas Delivery = Sim`;
- `Imprime nota fiscal após finalizar a venda = Sim`;
- `Imprimir Cupom Fiscal automaticamente ao realizar expedição do pedido no KDS = Não`;
- `Utiliza Expedição Automática pelo ForSale = Não`;
- `Pedidos Expedição KDS` usa impressora `00001 - CAIXA`.

Hipótese forte, NÃO PROVEN:
o F7 é o fechamento/fiscalização manual porque a expedição automática pelo ForSale está desligada.

Não alterar ainda.

Retomada em 05/10:
1. emitir primeiro pedido iFood normal com F7 sem alterar configuração;
2. confirmar NFC-e autorizada normalmente após mudança SEFAZ;
3. confirmar protocolo novo;
4. só então avaliar teste controlado dos dois parâmetros de automação;
5. qualquer ambiguidade = rollback imediato.

Princípio:
`PRODUCTION_DISPATCH != NFCE_AUTHORIZED != DANFE_PRINTED`

### 9. Rotas descartadas / não repetir

Não repetir sem nova evidência:
- scanner literal de F7;
- engenharia reversa genérica de tecla;
- monitor genérico de crescimento de IMP como prova fiscal;
- inferir que status `5 - Expedido` exige ação manual;
- assumir que crescimento de log significa impressão fiscal;
- usar nome de produto como identidade canônica;
- criar emissor próprio SEFAZ.

### 10. Melhor ordem de próximos passos

1. **Agora:** executar no CAIXA via Claude o metadata-only product identity probe.
2. Analisar resultado e localizar a superfície oficial de crosswalk.
3. Se a relação canônica aparecer, preparar uma leitura mínima dos dois produtos reais somente dos campos necessários.
4. Provar `SQL internal id -> Retail product code`.
5. Executar replay zero-effect do pedido real completo pelo roteamento atual.
6. Passar esse pedido real pelo Unified Core atual.
7. Só depois decidir próximo ganho operacional: produção/conferência/cockpit.
8. Em paralelo, manter fiscal congelado até 05/10.
9. Em 05/10, retomar fiscal pelo checkpoint definido, não reiniciar a investigação.

## Truth boundary

PROVEN:
- Reader real mínimo;
- pedido real e itens mínimos;
- configuração atual de roteamento;
- replay candidato por nome único dentro do snapshot histórico;
- static safety do metadata probe;
- Unified Core HEAD atual;
- fiscal/configuração observada nas telas mencionadas.

UNKNOWN:
- crosswalk canônico SQL -> Retail;
- unicidade de nome no catálogo Retail completo;
- NRCOMANDAEXT == short iFood;
- pedido real já atravessando Unified Core;
- automação fiscal real sem F7;
- impressão física para o replay atual.

FROZEN:
- alterações fiscais até 05/10/2026.

## Primeira mensagem recomendada no novo chat

`Continue o projeto a partir de docs/HANDOFF_ESTADO_ATUAL_2026-10-04.md. Revalide VÉRTICE vertice-active, DeliveryOS fix/odhen-routing-config-proof-20260930 e TATÁ OS feature/unified-tata-core-20261001. Não reinicie a investigação. O próximo passo é receber/analisar o resultado do Claude para docs/CLAUDE_CAIXA_PRODUCT_IDENTITY_METADATA_PROBE_2026-10-04.md e fechar o crosswalk canônico SQL -> Retail. Fiscal permanece congelado até 05/10.`
