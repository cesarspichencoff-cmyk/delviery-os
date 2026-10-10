# Comandas térmicas — auditoria de continuidade V7.13–V7.16 (10/10/2026)

**Missão estrita:** comandas reais de Cozinha, Sushi e Conferência; segurança e legibilidade de impressoras térmicas Epson 80 mm. **Fonte:** `delviery-os` PR #38, branch `feat/thermal-v63-packaging-bridge-shadow-20261010`. **Status:** DRAFT/HOLD. César autorizou avançar amplamente, mas a autorização de trabalho não transforma conteúdo desconhecido, turno vencido, identidade não verificada ou aceite óptico ausente em fatos. Nenhuma instalação, serviço Windows, banco, contador TATÁ, spooler, impressora ou Figma foi alterado nesta sequência.

## 1. Base comprovada e preservada

- Motor de embalagem canônico do TATÁ Academia já instalado no `CAIXA_MOOCA`, Git blob `3167c309f02a0ad5a84fb43043b8866e3bee873c`, SHA-256 da fonte `1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e`. **Não reconstruir.**
- Consumidor instalado V2, Git blob `22e3bdcbbed1cf245088f32679dd29ffb50766c9`. Candidato V7.10 confirmou paridade sintética com notas, alergia, aliases, override, sacolas e kits; a V7.12 adicionou escopo por snapshot. A versão V7.12, entretanto, ainda permitia `FACT` baseado em declaração estrutural e **não deve ser instalada**.
- Desenho Figma master Produção V4.4 (`30:2`) e Conferência V4.3 (`20:2`), três hashes SVG históricos V7.2 travados. **Não houve redesenho nem papel novo.**
- Mundo: último estado de leitor auditado `189 processed / 189 blocked / 0 ready`, turno `DINNER 07/10` vencido, múltiplos bloqueios materiais de kits/sacolas/classificação/observações. Esses números são de **uma observação de estado**, não uma contagem atual de todos os pedidos.

## 2. Diferença adversarial V7.13 — fato humano ≠ campo preenchido

Dois overrides históricos no Windows possuem `teknisa_sequence`/`ifood_sequence`, `source_refs` e `scope`, mas não `store_id`, `loja_id`, `operational_date`, `order_key` e `snapshot_hash` estruturados. A V7.12 rejeita essa ausência; porém um registro *fabricado* com todos os campos, sem aprovação autêntica, ainda poderia criar `FACT` de sacolas/kits.

Criada `runtime/shadow/live_shadow_consumer_v2_candidate_v713.cjs`: deriva somente da V7.12 e **remove a promoção automática a `FACT` por qualquer override JSON**, inclusive quando todos os campos casam. `HUMAN_ORDER_OVERRIDE_ATTESTATION_NOT_VERIFIED` mantém a cadeia bloqueada. A classificação por motor canônico fica intacta; não converte silenciosamente texto ou referência em aprovação humana. [CI #38094058298](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38094058298): V7.13 **15/15**.

## 3. Integridade V7.14 — hashes dos mesmos bytes consumidos

A V7.10–V7.13 lia os arquivos JSON usados para decidir e os relia para hash de linhagem. Em caso de mudança no intervalo, a decisão poderia alegar um digest diferente dos bytes usados. Criada `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs`:
- captura digest do **mesmo buffer de cada JSON decodificado**, suportando UTF-8/UTF-16LE; linhagem de oito fontes reflete o conteúdo carregado, mesmo que o arquivo seja alterado depois;
- carrega o motor com dois SHA-256 antes/depois da carga, abortando em `PACKAGING_ENGINE_CHANGED_DURING_LOAD` quando há mutação observável;
- mantém todas as proteções V2 e a regra V7.13 de não conceder `FACT` por auto declaração;
- **limitação:** este controle não substitui identidade do serviço, atomicidade transacional entre os oito arquivos ou prova de aprovação humana.

[CI #38094058298](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38094058298) **SUCCESS**: `THERMAL_BYTE_IDENTITY_V714=18/18`, `THERMAL_OVERRIDE_AUTHORITY_GUARD_V713=15/15`, pré-voo `16/16`, V7.10 `10/10`, reconciliador V6.8 `62/62`, turno `29/29`, desenho `12/12 SVG_GOLDENS_MATCH`. As simulações incluem arquivo JSON modificado logo após a leitura e motor trocado durante a carga.

## 4. Simulação nunca vira fonte canônica — V7.15

O auditor V7.11 recebe opcionalmente um hash de motor fictício para testes; antes um conjunto simulado de fontes poderia retornar o mesmo estado `SOURCE_PREFLIGHT_MATCH_ONLY_NO_DEPLOY_AUTHORIZATION` que uma leitura com o pin canônico. Agora:
- com override: `source_pin_mode=TEST_SUPPLIED_NOT_CANONICAL`; resultado `SIMULATION_MATCH_ONLY_UNTRUSTED_TEST_PIN` quando todos os testes estruturais passam;
- sem override: exige SHA-256 **canônico fixo**, `source_pin_mode=CANONICAL_FIXED`;
- nenhuma dessas respostas autentica Windows, aprova turno, imprime ou permite cutover;
- o pré-voo já bloqueia arquivos de exceções contendo pedidos com escopo incompleto, que existem historicamente no computador instalado. O erro nesse arquivo é um bloqueio esperado, não algo que deva ser corrigido inventando snapshot.

## 5. Um candidato futuro, versões históricas desaconselhadas — V7.16

`runtime/shadow/thermal-consumer-release-hold.v1.json` registra:
- **único candidato futuro para revisão humana e rollout separado:** `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs`, blob Git `0fe817bd07fd13a6df5cf19d4e01c5e28ae77c50`, **não instalado**;
- versões V7.10, V7.12 e V7.13 **não instalar** por lacunas específicas (escopo de overrides, auto-declaração humana ou hash de bytes consumidos);
- oito portões de mundo ainda abertos e **nenhum** efeito autorizado automaticamente; inclui os SHA-256 dos três SVGs de referência.
- `tools/verificar_release_hold_v716.js` bloqueia CI se mudarem bytes do candidato ou o manifesto de modo inconsistente.

A seleção do candidato **não** comprova maturidade de produção. Um checksum no GitHub e testes sintéticos são CODE_READY/TEST_PASS, não DEPLOYED/PRINT_ACCEPTED.

## 6. Portões materiais para operação, ainda sem prova

1. **Contrato real de turno:** serviço instalado tem `valid_until_local` e não controla `valid_from_local`; revalidar turno prospectivo com confirmação humana e evitar retroatividade. Não renovar por relógio.
2. **Instalação reversível:** confirmar identidade/permissões reais do serviço, os oito arquivos, checksums e schemas, backup imutável, compatibilidade de decisões, rollback testado e janela autorizada. A auditoria agregada Windows foi bloqueada por controle de segurança; não contornar.
3. **Dados do pedido:** kits, sacolas, caixas físicas, praças, observações gerais e alergias devem ser comprovados por revisão exata. Não reaproveitar exceções antigas.
4. **Três setores, possível separação de duas comandas de Cozinha:** manter regras existentes V4.7/V4.9 e master Figma. A prova de três SVGs históricos não equivale a teste de todos os casos.
5. **Papel real:** teste óptico final Epson **somente CAIXA Itaim** sob instrução específica; contrastes e alinhamentos físicos não são comprovados por SHA de SVG.
6. **Efeitos:** sem qualquer merge, deploy, reinício, SQL write, vínculo de número TATÁ, impressão, spooler, corte ou alteração de produção até fechar portões relevantes.

**Critério de conclusão:** pedido real com identidade/revisão/observações e motor pinado, janela de turno válida, 3 saídas setoriais verificadas e desenho/legibilidade fisicamente aceitos. Nenhum componente individual ou green CI pode substituir esse conjunto.
