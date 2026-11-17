# TATÁ Comandas — orientação de kits e sacolas para a composição de três caixas (09/11/2026)

**Escopo:** laboratório sintético isolado derivado da PR #135, sem usar pedidos/clientes reais. **Status:** CANDIDATE_REVIEW_ONLY / PRINT_HOLD.

## Composição investigada
Um combinado (1P ou 2P) + um Hot Roll + dois enrolados frios; a investigação reportou três caixas, mas sua distribuição física por praça/capacidade ainda não foi atestada independentemente. As identidades reais exatas não são inseridas neste laboratório.

## Origem e diferença verificada
- Motor da TATÁ Academia pinado: blob Git `3167c309f02a0ad5a84fb43043b8866e3bee873c`; fonte humana `content-source/human-current/kits_2026-09-22_cesar.md`.
- O Hot Roll pertence à categoria dos enrolados; isso não cria Kit Quente automaticamente.
- Regra humana vigente: combinado 1P + **dois** enrolados → Kit p/2; combinado 2P + **dois** enrolados → Kit p/2 + Kit p/1.
- **Terceiro enrolado:** não existe julgamento humano explícito para a extensão combinada; manter **INFERENCE**, jamais FACT.
- **Proposta**, não confirmação: 1P + três enrolados → 1 Kit p/2; 2P + três enrolados → 1 Kit p/2 + 1 Kit p/1.
- Quantidade de linhas, quantidade de caixas e quantidade de sacolas não são equivalentes. Itens da mesma praça fisicamente compatíveis podem compartilhar caixa; praças distintas não se fundem.
- Sacola M ou G e número de sacolas **não são autorizados** nesta composição: faltam tamanhos exatos, encaixe/estabilidade e correspondência com as caixas físicas. Uma classificação G para uma caixa 1.500/1.600 isolada não comprova espaço para o pedido completo.

## Implementação isolada
`tools/comandas_three_box_kit_bag_advisory_v1_offline.cjs` aceita somente papel sintético, composição exata e um indicador não autoritativo de compatibilidade de praça. Campos extras (ID nativo, cliente, observação, nome de produto, comandos de impressão) são recusados sem eco dos valores. As saídas retornam `kit_status=INFERENCE_NOT_FACT`, `bag_suggestion=null`, `bag_count=null`, `print_authorized=false` e `ready_for_preview=false`. Não há integração com Reader, catálogo instalado, motor original, decisão de arquivo ou impressão.

`tools/verificar_comandas_three_box_kit_bag_advisory_v1_offline.cjs` testa falhas negativas e confronta o comportamento do motor pinado em memória: três enrolados em praças separadas ou agrupadas podem alterar a contagem de caixas. Um workflow Linux/Windows roda somente fora do host no GitHub Actions.

## Portões independentes
1. **Regra humana exata:** kits só passam a FACT quando a composição específica for validada com fonte adequada, sem induzir escolha por conta do programa.
2. **Geometria física:** mapa por caixa/praça e encaixe real são necessários para promover quantidade/tamanho de sacola. Não preencher `UNKNOWN` automaticamente com M ou G.
3. **Reader/Teknisa:** a persistência integral e semanticamente completa da revisão e impacto SQL seguem pendentes; CI sintética não libera impressão.
4. **Autorização de efeito:** nenhuma alteração no CAIXA_MOOCA, processos, CMD/PowerShell, SQL, spooler, impressoras, Teknisa, sequência, merge, deploy ou cutover; PR #135 e o fluxo nativo permanecem intactos.

**Prova local anterior ao envio:** 9/9 testes do núcleo sintético passaram em container isolado. A prova diferencial com o arquivo pinado e a CI do commit exato devem ser avaliadas **após** o GitHub executar; não alegar aprovação antecipada.
