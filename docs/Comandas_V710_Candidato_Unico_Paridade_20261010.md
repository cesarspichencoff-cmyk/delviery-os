# Comandas V7.10 — candidato único do consumidor sem instalação

**Checkpoint:** 10/10/2026. **Branch:** `feat/thermal-v63-packaging-bridge-shadow-20261010`; **PR:** #38 DRAFT/HOLD. Todo trabalho desta etapa ocorreu **somente no repositório e na CI**, usando o código-base inspecionado previamente em leitura no CAIXA_MOOCA. Nada foi instalado ou executado no Windows operacional nesta etapa.

## 1. Diferença real, sem reconstruir o motor

- **Motor canônico existente:** `packaging-current.js`, Git blob `3167c309f02a0ad5a84fb43043b8866e3bee873c`; SHA-256 de arquivo `1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e`. Preservado integralmente.
- **Consumidor Windows instalado:** arquivo `shadow/live_shadow_consumer_v1.cjs` cuja origem tem Git blob `22e3bdcbbed1cf245088f32679dd29ffb50766c9`, 16.480 bytes. Essa versão já suporta `observation_rows`, `order_observations`, `items[].observations`, notas de alergia, aliases de produto, overrides humanos de pedidos e fingerprint V2, porém **não registra origem de regras**.
- **Consumidor v1 do GitHub:** blob `bba3212cba43d0a7803e9025f4826ded0459c63c`, diferente e **não seguro para substituir diretamente** a versão instalada. Possui linhagem de seis fontes, mas não preserva todas as superfícies V2.

## 2. Entregável V7.10

Foi criado `runtime/shadow/live_shadow_consumer_v2_candidate_v710.cjs` como **candidato offline, não instalado**, partindo dos bytes da V2 instalada. Não foi alterado o arquivo `runtime/shadow/live_shadow_consumer_v1.cjs` versionado nem o motor. O candidato introduz **somente** três blocos marcados `V710 LINEAGE`:

1. Função SHA-256 read-only de arquivo de regra;
2. `rule_lineage` com **oito arquivos realmente consumidos**, não seis: Academy `packaging-current.js` e `app-data.json`; DeliveryOS `routing.json`, `printer-map.json`, `non-production.json`, `product-identity-cache-v1.json`, **`product-aliases-v1.json` e `human-order-overrides-v1.json`**;
3. Inclusão da linhagem na decisão depois de `...core`, **sem alterar o core do fingerprint V2**, preservando comparabilidade com o consumidor instalado.

A leitura dos oito arquivos é somente para digest de origem já necessária para o consumidor. A candidata mantém o mecanismo existente de gravar **arquivo local de decisão somente quando o chamador fornece `outPath`**. Não contém código para impressora ou envio operacional; não foi executada no Windows. A presença desses hashes na decisão é **declaração de origem do produtor** e não substitui auditoria independente dos arquivos/identidade instalada.

## 3. Reconciliador V6.8 — fail closed diferente para V1 e V2

Foi reforçado `verifyLiveReaderPairV68`:
- Eventos legados V1 exigem suas **seis** referências já reconhecidas;
- Eventos V2 identificados por `observation_scan_complete/observation_rows`, apesar do mesmo schema do envelope, exigem **oito** referências; não aceitar seis referências antigas em V2;
- Falha se faltar alias/override, fonte for desconhecida, hash não for SHA-256 ou fonte duplicada. O hash do `packaging-current.js` continua comparado com a referência pinada;
- Exigências anteriores de igualdade das notas, snapshot, fingerprint, rota, turno, embalagem, kits e decisão sem efeitos continuam ativas.

**Não** foram alterados: Figma, desenhos SVG, renderer Epson, regras de kits/caixas/sacolas, janela de turno instalada, leitor Windows, estado fiscal ou produção.

## 4. Prova forte de paridade, com escopo explícito

Novo `tools/verificar_consumidor_shadow_v710.js`, exigido pela **mesma CI térmica existente**:

- Retira **somente** os três blocos `V710 LINEAGE` e o cabeçalho técnico do candidato; reconstrói exatamente o arquivo-base do Windows e verifica o **Git blob SHA-1 `22e3bdcb...` e 16.480 bytes**. O teste inicialmente falhou por quebra de linha entre propriedades e LF adicional de staging; corrigidas apenas as regras de extração exata, **sem atualizar o hash canônico nem alterar comportamento do consumidor**.
- Em diretórios temporários, monta **dois consumidores**, original e candidato, com os mesmos **dados totalmente fictícios** e motor fake apenas para essa prova. Nenhum caminho de dados reais entra na CI.
- Compara decisões completas retirando apenas `generated_at` e a **nova `rule_lineage`**, incluindo fingerprint, observações gerais/por item, classificador, sacola, kit, alergia, bloqueios e efeitos.
- Cenários: sem notas, nota geral, nota por item, alergia, ambas, varredura incompleta. Confirma 2+6 digests contra SHA-256 dos oito arquivos de fixture e preservação das regras de alias/override. Testa saída bloqueada, sem impressão e limpeza de temporários.
- CI [#38090745565](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38090745565) **SUCCESS**: `THERMAL_CONSUMER_V710_PARITY=10/10` e `STABLE_READER_SHADOW_PAIR_V68=62/62`; auditor V6.9 `21/21`; turno V7.0/V7.4 `29/29`; segurança do renderer V7.1 `12/12`; **trava de desenho V7.2 `12/12 SVG_GOLDENS_MATCH`**.

## 5. Limites e próximo portão

- Os cenários sintéticos mostram **paridade funcional nos casos testados e paridade de bytes do código-base**, não que oito arquivos de regras ou identidade do serviço estejam instalados/atualizados, nem que toda situação operacional esteja coberta.
- **Não realizar deploy** do candidato, reiniciar serviço, editar `production-service-state.v2`, emitir novo `TATA sequence`, imprimir ou cortar. Antes de qualquer cutover: plano formal de rollback, confirmação da identidade `NT SERVICE\\TataComandaReader`, checksums e schema dos oito ativos reais, revisão da direção correta da migração, testes de estado/concurrency e autorização específica do efeito.
- Ainda faltam a janela prospectiva do turno humano (`valid_from_local`), confirmação atual, tratamento de `KITS_NOT_FACT`, `BAG_SIZE_NOT_FACT`, `BAG_COUNT_NOT_FACT`, `PACKAGING_UNKNOWN`, notas gerais/alergias com decisão humana, pedido atual conciliado e três vias SHADOW.
- Impressão e aceite óptico na **CAIXA Itaim** continuam dependentes de autorização própria.

**Estado:** `CODE_READY + SYNTHETIC_PARITY_TEST_PASS` em PR DRAFT, **não** `DEPLOYED/WORLD_PROVEN/HUMAN_ACCEPTED`.
