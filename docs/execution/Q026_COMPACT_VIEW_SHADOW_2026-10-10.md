# Q-026 — representação compacta para a tela Entregas (SHADOW)

**Data:** 2026-10-10. **Estado:** pesquisa em branch isolada. **NÃO integrar / NÃO produção / NÃO replay Q-016**.

## Base verificável

- `integration/deliveryos-product-ux-android-20261009` @ `99b0c72e6a254c68358767b5addffe673707d934`; PR #34 já integrado com validação de testes, `main` não alterada por esta pesquisa.
- Fonte do custo: `lerFatosParaReplay` materializa todos os eventos e `projetar` produz `ViagemProjetada.eventos[]` completo.
- O código da apresentação `src/product/viewmodels/entregas-vm.ts` usa `v.eventos.length` para a contagem `fatos`. `viagemLida()` usa estado, frescor, posição, device, ocorrências e procedência, não cada ID. Isso **não autoriza** modificar o contrato do replay.

## Hipótese testada

Separar a **representação compacta apenas de apresentação** da projeção forense, mantendo o decoder/projetor canônicos e sem escolher uma janela de histórico:

1. Banco PostgreSQL 16 descartável com migrations reais; fatos `simulated` em 1.000 eventos por viagem.
2. Cursor `DECLARE ... FETCH FORWARD 4096` com `ORDER BY unit_id,source_mode,object_type,object_id`.
3. `projetar()` canônico por viagem, retendo na saída só `trip_id,unit_id,estado,device_id,ultimo_fato_em,ocorrencias_abertas,source_mode,ultima_posicao_em,frescor,fatos`.
4. Comparação **completa** dessa forma compacta (`deepEqual` e `JSON.stringify` byte a byte) contra o replay integral `lerFatosParaReplay() -> projetar() -> compacto()`.
5. Exige contar todos os fatos; saída vazia ou fatos perdidos reprovam. Verifica que a cópia compacta **não** possui vetor `eventos[]`.

**Importante:** enquanto cada grupo é processado, ainda materializamos os seus eventos; com uma viagem gigantesca a memória cresce com ela. O PR #32 provou isso com 120 mil fatos em uma viagem. Não é leitura O(1) para caudas arbitrárias.

## Resultados do CI em PostgreSQL descartável

[Run 38050635370](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38050635370) — **2/2 jobs SUCCESS**, Node 22, tipagem completa e tipagem do teste:

| Fatos simulados | Viagens | RSS no fim da fase paginada/compacta | Heap após GC | Tempo da fase | RSS após replay integral | Heap após replay integral | Tempo replay |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100.000 | 100 | 167,2 MiB | 9,1 MiB | 1.044 ms | 229,7 MiB | 120,3 MiB | 753 ms |
| 1.030.000 | 1.030 | **188,5 MiB** | **8,2 MiB** | **5.833 ms** | **1.237,8 MiB** | **1.083,2 MiB** | 4.724 ms |

Nas duas escalas, **100% dos fatos contabilizados**, campos da apresentação e JSON compacto exatos; sem vetor `eventos[]` na saída compacta. A redução da medição de RSS entre fases na fixture de 1,03 milhão foi de ~84,8%; fase paginada ~23,5% mais lenta. **Não alegar ganho na latência.**

### Restrições metodológicas obrigatórias

- A fase de replay executa **depois** da compacta **no mesmo processo**; a comparação de RSS é descritiva de fases com objetos retidos diferentes, **não experimento A/B em processos independentes**. O pico RSS máximo do processo completo continua no valor do replay integral.
- Um único modo `simulated`, uma unidade, apenas `trip_started` + `gps_batch_received`, e viagens de 1.000 fatos. Não cobre `real`, `control`, histórico anterior à migration 0003 (`UNKNOWN`), corrupção, evento sem trip_id, duplicata, todas as dimensões, toda a resposta HTTP ou os escopos da Q-016. O PR #32 contém adversários de modos, mas o protótipo compacto **ainda não é sua união comprovada**.
- Não foram testados dois leitores simultâneos, append concorrente no event_log, isolamentos/snapshots distintos, resposta real do endpoint, hardware do Itaim, telefone Android nem leitura de dados de produção.
- `cursor` e `dimensoes` do replay global **não podem ser inferidos automaticamente** do resultado agrupado por viagem: contraexemplos confirmados no PR #32.
- A apresentação mantém todas as viagens compactas para as contagens exatas; não se tratou decisão de janela da Q-026 nem retenção.

## Próximo passo seguro

1. Claude: auditoria independente de snapshot, concorrência, ordenação de eventos e nulidade antes de propor implementação — missão **READY, NOT STARTED** em [issue #36](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/36). CLI do Claude instalado no Foxxy, porém sem login; GitHub issue não inicia a execução por si só.
2. ChatGPT: reforçar o comparador de **toda a resposta do view model**, não só a forma compacta da viagem, com `real/simulated/control`, histórico UNKNOWN e duas unidades; medir em processos independentes.
3. Só após esses passos, decidir se existe um caminho de visualização separado, explicitamente parcial, sem romper os contratos canônicos Q-016 e Q-026. Alterar schema/HTTP/retention/produção demanda decisão humana específica.

**Arquivos da pesquisa:** `tests/product/run-q026-compact-view-shadow.ts` e workflow `.github/workflows/deliveryos-q026-compact-view-shadow.yml`. Nenhum arquivo de runtime alterado, nenhuma migration, nenhuma produção ou custo novo.
