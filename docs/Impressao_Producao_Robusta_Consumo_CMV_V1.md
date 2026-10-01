# DeliveryOS — Impressão de Produção Robusta + Consumo Operacional/CMV V1

Data: 2026-10-01  
Branch de preparação: `fix/odhen-routing-config-proof-20260930`

## Objetivo

Transformar o pedido real em três produtos coerentes, sem criar três fontes de verdade:

```text
PEDIDO REAL ODHEN
  ↓
itens + códigos + quantidades + observações
  ↓
┌──────────────────────┬─────────────────────────┬──────────────────────────────┐
│ PRODUÇÃO             │ MONTAGEM/CONFERÊNCIA    │ CONSUMO/RELATÓRIO            │
│ praça + itens        │ caixas/sacolas/kits     │ item/caixa/sacola/kit/BOM    │
│ observações          │ complementos            │ custo teórico/CMV futuro     │
└──────────────────────┴─────────────────────────┴──────────────────────────────┘
```

As saídas compartilham o mesmo `order_id`, produtos e regras versionadas.

## 1. O que a pesquisa encontrou

### DeliveryOS

Já existe:

- roteamento produto → impressora por `CDPRODUTO`;
- mapa atual das seis impressoras de produção usadas;
- contrato lógico de comanda;
- sequência TATÁ;
- motor de 8 praças;
- dependências de cozinha HOT/EBITEN/SHISO;
- conhecimento do cardápio;
- regras documentadas de caixas e sacolas;
- separação explícita entre rota esperada e prova de papel.

Gap anterior:

- a comanda era preview lógico;
- não havia contrato robusto de intenção de impressão/idempotência;
- não havia calibração física por impressora;
- embalagem/kit/ingrediente não formavam um ledger de consumo unificado.

### TATÁ Academia

A fonte atual possui um motor de embalagem e kits mais maduro:

- agrupamento físico antes de escolher caixa;
- caixas numéricas 240/450/650/750/1000/1500/1600;
- sacolas P/M/G como camada separada;
- regra de temperatura e grupos especiais;
- kits por pessoas + necessidade de shoyu;
- seis kits com composição humana declarada;
- testes que mantêm UNKNOWN fora dos casos julgados.

A composição de kits foi importada para:
`data/kit_component_registry_v1.json`.

O motor completo ainda NÃO foi duplicado dentro do DeliveryOS. A fonte foi travada em:
`data/packaging_source_lock_v1.json`.

Qualquer port deve manter paridade com os fixtures do Academia.

### TATÁ OS

O Print Agent do TATÁ OS já resolveu arquiteturalmente vários problemas difíceis de impressão:

- `operation_id` idempotente;
- payload semântico congelado;
- persistência antes do Effect Boundary;
- crash depois de efeito possível → `EFFECT_UNKNOWN_REQUIRES_RECONCILIATION`;
- nenhuma repetição automática quando o efeito pode ter ocorrido;
- reprint = nova intenção + motivo + vínculo com original;
- spooler observado ≠ papel fisicamente confirmado;
- heartbeat/health separado de evidência do job.

Essa arquitetura deve ser reaproveitada. Não criar um segundo protocolo de confiabilidade inferior no DeliveryOS.

## 2. Impressoras atuais

O cadastro Retail atual prova como usados por produtos:

| Código | Nome | Modelo cadastrado | IP | Alias atual |
|---|---|---|---|---|
| 00002 | COZINHA | Epson TM-T20 | 192.168.0.116 | LPT3 |
| 00003 | DELIVERY SUSHI 1 | Epson TM-T20 | 192.168.0.153 | — |
| 00004 | DELIVERY SUSHI 2 | Epson TM-T20 | 192.168.0.4 | — |
| 00006 | BALCAOSUSHI2 | Epson TM-T20 | 192.168.0.110 | LPT5 |
| 00007 | BAR | Epson TM-T20 | 192.168.0.232 | LPT6 |
| 00009 | BALCAOSUSHI1 | Epson TM-T20 | 192.168.0.142 | LPT4 |

Servidor de periféricos configurado: `192.168.0.24:3000`.

Isso prova identidade/configuração. Não prova o caminho de impressão que um futuro DeliveryOS deverá usar.

## 3. Envelope técnico da Epson TM-T20

A documentação oficial da família TM-T20 prova como capacidade do modelo:

- impressão térmica 203 × 203 dpi;
- suporte a papel de 80 mm e 58 mm;
- área imprimível típica:
  - 80 mm → 576 dots;
  - 58 mm → 420 dots;
- ESC/POS contém:
  - status em tempo real;
  - Automatic Status Back;
  - seleção de tabela de caracteres;
  - corte.

**Capacidade do modelo ≠ configuração instalada no TATÁ.**

Continuam UNKNOWN por impressora:

- variante exata;
- largura real do rolo;
- fila/driver Windows;
- porta real;
- se o caminho será Windows/GDI, RAW/ESC-POS ou bridge existente;
- code page/acento;
- corte e feed;
- densidade/legibilidade;
- status offline/paperout;
- observabilidade do spooler;
- prova física de uma comanda.

Registro fail-closed:
`data/production_printer_calibration_registry_v1.json`.

## 4. Novo pipeline de impressão

### 4.1 Planejamento

`src/production/productionPrintPlan.ts`

Recebe a projeção roteada e:

- agrupa itens por impressora física;
- gera uma intenção lógica por impressora, não uma por linha;
- preserva item → caixa → observação;
- exclui do print de produção itens confirmados como `NO_OWN_PRODUCTION_TICKET`;
- cria material semântico estável para idempotência;
- exige perfil de calibração correspondente ao mesmo código/nome/IP;
- nunca autoriza efeito físico.

Estado possível hoje:
`PLANNED / CALIBRATION_REQUIRED / physical_effect_authorized=false`.

### 4.2 Evidência

Ladder planejada:

```text
PLANNED
→ SUBMISSION_RETURNED_UNOBSERVED
→ SPOOLER_OBSERVED
→ PHYSICALLY_CONFIRMED
```

Em falha ambígua:

```text
EFFECT_UNKNOWN_REQUIRES_RECONCILIATION
→ NO AUTO RETRY
```

Não converter `SPOOLER_OBSERVED` em papel impresso.

## 5. Comanda de produção V2

`src/production/productionTicketV2.ts`

A comanda da praça deve responder em 1–2 segundos:

1. destino;
2. TATÁ;
3. caixa de montagem;
4. quantidade + produto;
5. observação;
6. componentes de preparo relevantes;
7. Teknisa/iFood;
8. check final.

Exemplo semântico:

```text
==============================
DELIVERY SUSHI 1
==============================
TATÁ 037               19:42
TEKNISA 18452
IFOOD A1B2C3

>>> CX 750 <<<

1x COMBINADO SALMÃO 1 PESSOA
!!! SEM CEBOLINHA !!!

PREPARAR
3x EBITEN

[ ] FINALIZADO
```

### Ingredientes na comanda

Não imprimir a ficha técnica inteira.

Usar `PREPARAR` somente para componentes que:

- são relevantes à praça naquele instante;
- têm quantidade;
- possuem prova `HUMAN_CONFIRMED` ou `RECIPE_BOM`.

Componente sem prova fica fora da comanda e aparece como UNKNOWN no diagnóstico.

Assim a comanda continua rápida, enquanto o consumo completo fica no ledger.

## 6. Conferência do DeliveryOS — tela, sem nova comanda

O Delivery precisa de informação diferente da bancada, mas isso fica na interface do DeliveryOS. **Não gera uma segunda comanda física.**

Exemplo:

```text
TATÁ 037 — MONTAGEM

CAIXAS
1x 750
1x 650

SACOLAS
1x M
1x G

KITS
1x Kit p/1
1x Kit Quente

COMPLEMENTOS
1x Wasabi
1x Gengibre

[ ] CAIXAS
[ ] KITS
[ ] COMPLEMENTOS
[ ] SACOLAS
[ ] FECHADO
```

Isso evita poluir cada comanda de produção com hashi, guardanapo, sacola etc. e evita acumular papel. A projeção tem `effects.print=false`.

## 7. Ledger de consumo teórico

`src/production/resourceConsumption.ts`

Cada pedido pode emitir recursos esperados:

- `MENU_ITEM`;
- `PACKAGING_BOX`;
- `BAG`;
- `KIT`;
- `KIT_COMPONENT`;
- `COMPLEMENT`;
- `KITCHEN_DEPENDENCY`;
- `RECIPE_INGREDIENT`.

Exemplos:

```text
BOX_750                    1 EA
BAG_M                      1 EA
KIT:Kit p/1                1 EA
HASHI                      1 EA
SHOYU_GARRAFINHA_50ML      1 EA
SHOYUZARA                  1 EA
GUARDANAPO                 1 EA
COMPLEMENT:WASABI          1 EA
ING:SALMAO               120 GRM  ← somente com BOM
```

### Regra crítica

`VENDIDO ≠ CONSUMIDO_REAL`

O ledger é:
`THEORETICAL_EXPECTED_CONSUMPTION`

até existir uma política de baixa/estoque autorizada e provada.

Nenhuma projeção atual escreve estoque.

## 8. Kits já quantificáveis

`data/kit_component_registry_v1.json`

Já é possível contar automaticamente, quando o motor de kits retornar FACT:

- Hashi;
- sachê shoyu 8 ml;
- garrafinha shoyu 50 ml;
- shoyuzara;
- guardanapo;
- adaptador Kids;
- colher sobremesa.

Logo um relatório diário poderá dizer, por exemplo:

```text
Kit p/1          87
Kit p/2          34
Kit Quente       52
Kit Kids          8
Kit Simples      41
Kit Sobremesa    12

Hashi           256
Garrafinha       155
Sachê             101
Shoyuzara        196
Guardanapo       234
Adaptador Kids     8
Colher Sobremesa  12
```

Os números acima são apenas formato de exemplo, não dados reais.

## 9. Caixas e sacolas

A camada de recursos já aceita o output do motor atual do Academia:

### Caixas

Pode agregar:
- 240;
- 450;
- 650;
- 750;
- 1000;
- 1500;
- 1600.

Somente grupo com decisão FACT entra no consumo.

### Sacolas

Pode agregar P/M/G apenas quando:

- contagem exata está provada;
- tamanho do grupo está provado.

Se a regra souber que precisa separar, mas não souber quantas/tamanho exato, o relatório mantém UNKNOWN.

Isso é essencial para o controle não aprender um consumo falso.

## 10. Ingredientes e CMV

### O que existe hoje

O cardápio contém nomes de ingredientes extraídos das descrições.

Isso é suficiente para:
- busca;
- agrupamento qualitativo;
- explicação;
- sinal operacional.

Não é suficiente para CMV.

Faltam:

- gramatura/volume/unidade;
- rendimento;
- base da porção;
- perdas/aparas quando relevantes;
- vínculo com item canônico de estoque;
- custo com vigência.

Por isso foi criado:
`data/recipe_bom_registry_v1.json`

Estado atual:
`PARTIAL_EMPTY_AWAITING_QUANTIFIED_RECIPE_SOURCE`.

### Quando houver ficha técnica

Exemplo:

```json
{
  "produto": "URAMAKI SALMAO",
  "porcao_vendida": 1,
  "componentes": [
    {"estoque": "SALMAO", "quantidade": 60, "uom": "GRM"},
    {"estoque": "ARROZ_SUSHI", "quantidade": 80, "uom": "GRM"},
    {"estoque": "NORI", "quantidade": 0.5, "uom": "EA"}
  ]
}
```

Pedido com 2 unidades:

```text
Salmão      120 g
Arroz       160 g
Nori          1 un
```

A mesma estrutura agrega por:
- dia;
- turno;
- praça;
- produto;
- ingrediente;
- pedido.

## 11. Custo

`src/production/resourceCosting.ts`

O custo é separado da quantidade.

Registro:
`data/resource_cost_registry_v1.json`

Regras:

- custo com data de vigência;
- BRL;
- unidade precisa coincidir;
- nenhuma conversão implícita g↔kg ou ml↔L;
- fonte de compra/estoque obrigatória.

Isso permite fechar primeiro:

`CUSTO_TEORICO_EMBALAGEM_KITS`

e só depois:

`CMV_TEORICO_COMPLETO`

quando BOM + custos cobrirem todos os produtos do pedido.

`CMV_TEORICO ≠ CMV_CONTABIL/ESTOQUE_REAL`.

## 12. Relatórios que essa arquitetura destrava

Com pedidos reais por item:

### Produção
- pedidos/itens por praça;
- itens por impressora;
- vias planejadas;
- reprints;
- falhas/ambiguidade;
- tempo até cada estado futuro.

### Embalagem
- caixas por tipo;
- sacolas P/M/G;
- pedidos com embalagem UNKNOWN;
- caixas por produto/praça.

### Kits
- kits por tipo;
- componentes totais;
- ml de shoyu enviados por tipo de recipiente;
- consumo esperado de hashi/guardanapo/shoyuzara/adaptador/colher.

### Complementos
- wasabi;
- gengibre;
- tarê;
- demais itens montados.

### Receita/CMV
Quando BOM estiver coberto:
- consumo teórico por ingrediente;
- consumo por produto;
- custo teórico por produto;
- custo teórico por pedido;
- custo por praça;
- diferença teórica x inventário futuro.

## 13. Preflight Windows sem impressão

Preparado:
`tools/production_printer_preflight_readonly.ps1`

Lê:

- filas;
- drivers;
- portas;
- IP da porta quando exposto;
- configuração de papel;
- status Windows/CIM;
- associação fila ↔ IP/alias.

Não:

- cria job;
- chama PrintDocument;
- altera impressora;
- reinicia spooler;
- imprime.

TCP/9100 é opcional e desligado por padrão.

## 14. Ordem de prova física futura

Uma impressora por vez:

1. executar preflight sem efeito;
2. identificar host/queue/driver/porta;
3. provar largura real do papel;
4. provar caracteres PT-BR:
   `Á É Í Ó Ú Ã Õ Ç –`;
5. provar fonte/bold/double size;
6. provar quebra de linha de nomes longos;
7. provar observação longa;
8. provar feed/corte;
9. simular/observar offline;
10. observar paper-out;
11. capturar job do spooler;
12. uma impressão física controlada;
13. comparar papel com Golden semantic ticket;
14. desligar/reiniciar durante cenário controlado antes de testar retry;
15. somente então habilitar perfil daquela impressora.

Cada uma das seis Epson tem gate independente.

## 15. Estado atual

### PROVEN/PREPARADO

- roteamento de 463 produtos;
- itens sem comanda própria explicitados;
- identidade das seis Epson;
- planner lógico por impressora;
- registro de calibração fail-closed;
- ticket V2 semântico;
- checklist de montagem;
- ledger de consumo teórico;
- composição dos seis kits;
- cálculo de custos com vigência;
- preflight Windows sem impressão.

### NÃO PROVADO

- fila Windows real de cada Epson;
- largura real do papel em cada impressora;
- transporte futuro escolhido;
- render físico;
- acentos/corte/densidade físicos;
- spooler real;
- papel físico;
- motor de embalagem do Academia portado integralmente e com paridade no DeliveryOS;
- ficha técnica quantificada;
- custo real carregado;
- baixa de estoque.

## Regra de promoção

Nenhuma impressão física, baixa de estoque ou CMV real é promovida por simulação.

```text
ROTA CONFIGURADA
≠ JOB CRIADO
≠ SPOOLER OBSERVADO
≠ PAPEL IMPRESSO

VENDA
≠ CONSUMO TEORICO
≠ BAIXA REAL
≠ CMV CONTABIL
```


## Correção de arquitetura — núcleo único

A autoridade futura das regras deixa de ser local ao DeliveryOS/Academia.

Casa canônica em preparação:
`cesarspichencoff-cmyk/tata-os` → branch `feature/unified-tata-core-20261001` → `packages/unified-restaurant-core/`.

DeliveryOS será consumidor/projeção operacional desse núcleo.
TATÁ Academia será consumidor/projeção de treinamento.
Arquivos locais de regra existentes neste branch são transitórios de migração e não devem ser promovidos como segunda autoridade.
