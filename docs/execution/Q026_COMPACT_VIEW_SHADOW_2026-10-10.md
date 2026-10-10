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


## Complemento: A/B em processos independentes + modelo completo da tela

[GitHub Actions run **38051370730**](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38051370730): **8/8 jobs SUCCESS** no commit 6d3415c22b3f30068944c94efa4e532883b70598, cobrindo duas provas anteriores, novo teste completo de UI, quatro variantes A/B (100 mil e 1,03 milhão, cada uma em processo Node separado) e um comparador de artefatos que reprova SHA diferente ou contagem incompleta.

### Igualdade de TODO o view model, não apenas de cada viagem

Novo teste: \`tests/product/run-q026-compact-full-ui-shadow.ts\`. Cria banco descartável na versão anterior à migration 0003, escreve um fato sem modo, migra pelas migrations reais, grava 6 mil fatos sintéticos (\`gerarLinhas\`, incluindo empates/atrasos/clock suspeito) com 16 aparelhos, 2 unidades e modos \`real\`, \`simulated\`, \`control\`. Lê a porta de realidade operacional **sem modificá-la**.

Substitui o vetor de IDs em cada viagem por um objeto que só admite a leitura de \`length\`; acessar índice, método, enumerar ou iterar IDs **lança exceção**. Compara **JSON e deepEqual do \`entregasVM()\` inteiro** contra versão com vetores completos para as quatro seleções \`[todas, ITAIM, LAB-BANCADA, SEM-UNIDADE]\`. **5/5 provas** (4 filtros): hashes da visão iguais, 6 mil fatos contabilizados, histórico \`UNKNOWN=1\`, 3 modos presentes. Controle mutante: alterar o tamanho de um vetor \`+1\` muda o VM; alterar \`UNKNOWN 1→0\` também muda o VM. Isso prova que **nesta versão da UI**, o vetor de IDs não é necessário para o resultado **dado que o restante de \`RealidadeDeEntregas\` veio da porta canônica**. Não prova que uma implementação alternativa gere corretamente essa realidade.

### Diagnóstico de memória realmente em processos separados

Arquivo: \`tests/product/run-q026-compact-independent-shadow.ts\`. Jobs \`independent-ab\` matriciais executam em containers GitHub Actions separados, cada um com **PostgreSQL descartável criado pela suíte** e um único processo Node medido. Fixture idêntica (datas ancoradas em 2026-10-09T22:00:00Z, sem variação de \`now()\`). \`independent-compare\` baixa os quatro artefatos e exige SHA-256 igual do JSON compacto, contagem integral \`N\`, quantidade de viagens \`N/1000\`, RSS não nulo e RSS menor no experimento compacto. Portanto o comparador não aceita saída vazia nem sucesso unilateral.

| Fatos | Variante | RSS após GC com resultado retido (MiB) | Pico RSS desde início do processo (MiB) | Tempo da fase (ms) | SHA-256 compacto |
| ---: | --- | ---: | ---: | ---: | --- |
| 100.000 | compacta | 159,7 | 160,9 | 1.065 | \`98f420be327fdb7f956cbbb360023bc9e6cca4bfef4b28880be61dd9b3fca67\` |
| 100.000 | replay integral | 218,0 | 226,2 | 882 | mesmo |
| 1.030.000 | compacta | **191,6** | **191,6** | 5.825 | \`19f47f74bd0e2ed1ab6a1cac02f2c38b6490510d4d41fc16511c9af9ed90076a\` |
| 1.030.000 | replay integral | **1.137,8** | **1.242,3** | 6.920 | mesmo |

Pico de memória residente **~84,6% menor** na fixture de 1,03 milhão, agora comparando processos isolados. Tempo mais rápido nessa rodada grande (5,83 vs 6,92 s) e mais lento na pequena (1,065 vs 0,882 s): **uma única amostra de cada variante por tamanho e runners distintos**; não declarar ganho de tempo significativo nem p95. O par de 1,03 milhão foi medido com dados sintéticos, uma unidade, \`simulated\`, dois tipos, viagens com exatamente mil fatos.

### Falha de workflow observada e reparada

O commit intermediário \`2c5ed34\` teve validação de workflow **FAIL antes de qualquer job**, por usar \`runner.temp\` no contexto de \`env\` do job. Foi trocado por caminho relativo de artefato no commit \`6d3415c\`; reexecução **8/8 SUCCESS**. A falha do workflow anterior não foi erro da plataforma, e a correção foi efetivamente validada no CI.

### Fronteira da prova

- **Estudado:** representação de interface sem IDs, contrato de UI completo com mistura de fontes a partir da porta canônica, process-to-process memory em fixture determinística, quatro hashes cruzados.
- **NÃO demonstrado:** streaming real de \`lerRealidadeDeEntregas\` em múltiplos modos e duas unidades simultâneas; snapshot consistente sob append concorrente; contrato Q-016/cursor/quarentena/dimensões completo; dispositivo físico; HTTP real com leitor compacto; benefício no ambiente operacional.
- **Não alterar/autorizar:** \`main\`, integração, produção, Android, TATÁ Comanda, schema, retenção, janela, contrato externo, novo custo.
- **Auditoria independente:** issue [#36](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/36), entregue pelo César ao Claude. Na última verificação **não havia PR/branch \`review/claude-q026-snapshot-adversarial-20261010\` nem comentário novo**; isso é ausência de prova pública, não declaração sobre execução em sessão Claude.

**Decisão:** PR #37 **DRAFT / HOLD**, sem merge. A próxima etapa de implementação deverá preservar replay Q-016 como caminho forense autoritativo; uma vista compacta pode ser uma projeção derivada com contrato explícito, mas depende de auditoria de consistência/snapshot e teste fim a fim. Q-026 continua ABERTA.
