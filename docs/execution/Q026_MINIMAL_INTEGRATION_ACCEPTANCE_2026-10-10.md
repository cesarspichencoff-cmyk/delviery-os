# Q-026 — candidata limpa de integração: aceitação e promoção

**Data:** 2026-10-10. **PR #77**. Base: `integration/deliveryos-product-ux-android-20261009`, SHA inicial `99b0c72e6a254c68358767b5addffe673707d934`. Esta branch contém somente código opt-in e testes transferidos da pesquisa consolidada #70, sem seus 104 commits de histórico experimental. **Não é publicação nem aceitação operacional.**

## Onde estamos: provas no próprio código da candidata limpa

- [GitHub Actions #38096520943](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38096520943): **6/6 SUCCESS**, configuração de apresentação anterior com flags OFF, rota HTTP real com candidato ligado, PostgreSQL SELECT-only, cancelamento de socket e deadline, cursor MVCC sob commit concorrente, rollback e liberação backend_xmin, fairness incremental em 120k e regressões Q-016/Product/governança.
- [GitHub Actions #38096520974](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38096520974): **2/2 SUCCESS**, Chromium headless real em localhost + PostgreSQL16 descartável: dispositivo/timestamp carregados, 503 durante leitura bloqueada sem apagar leitura anterior, mensagem legível e botão reabilitado, mobile 375×812 sem falso zero, 200 após desbloqueio; screenshots arquivadas no próprio GitHub Actions.
- Ambos rodaram no commit `427d330d0436ff4ad9b4c8e9dbdca23e243578ab`; qualquer modificação posterior exige **nova verificação verde no HEAD final**.

## Contratos operacionais imutáveis

- `DELIVERYOS_ENTREGAS_INCREMENTAL_RR` **ausente = desligado**. O candidato `=1` exige `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS` explícito, mais `DELIVERYOS_ENTREGAS_MAX_INFLIGHT` válido em `1`, `2` ou `4`. Ausência de flags mantém o código de leitura anterior.
- O incremental está limitado a **apresentação**: `ViagemParaApresentacao.eventos` expõe **somente `length`**, não IDs. Replay forense Q-016 preserva IDs, sem substituição pelo acumulador.
- Cada leitura usa transação PostgreSQL `REPEATABLE READ, READ ONLY`, cursor `FETCH FORWARD 257`. Erro/abort não produz leitura parcial saudável; a transação faz rollback e liberta conexão. A fila do pool possui timeout opt-in e respostas 503 para sobrecarga e prazo, com `Retry-After` quando aplicável.
- A role do banco deve ser **não superusuária e exclusivamente de leitura** nos schemas/tabelas necessários. O cancelamento da própria sessão PostgreSQL foi demonstrado em PG16 com essa mesma role na fixture, sem `pg_signal_backend`. Isto não prova permissões da role operacional ainda desconhecida.
- Conexão remota exige TLS validado; banco de teste localhost é exceção limitada.

## Limites provados por auditoria adversarial

- **Múltiplos processos:** [PR #74](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/74), PG compartilhado, 2 workers×1 slot => **2 leituras admitidas**. Não existe limite global; é preciso dimensionar max conexões e workers antes de escala horizontal.
- **120.000 viagens distintas de um único fato cada:** [PR #75](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/75), digest de apresentação idêntico, pico RSS canônico/incremental **629,16 / 624,57 MiB**, leitura **1.356 / 1.674ms**. O ganho de 90% de RSS com viagem longa de 1,03M fatos NÃO vale universalmente.
- **Prazo HTTP 1 segundo:** [PR #76](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/76), 120k/300k, canônico/incremental, todos os GETs encerraram 503 e nenhum falso 200. Maior resposta observada do canônico em 300k **1.092,8ms**; incremental **1.003,7ms** numa amostra. Não é deadline hard real-time. A fixture só destrói banco descartável após confirmar rollback e ausência de SQL ativo.
- Essas medições são de CI sintético, não p95/p99 ou ambiente final.

## GATE ainda aberto para promoção

1. **Identificar destino Preview legítimo e isolado.** A consulta à Vercel conectada não encontrou projeto ligado à URL do repositório `cesarspichencoff-cmyk/delviery-os`. Projetos nomeados delivery/Academia não podem ser tratados como o destino deste backend sem prova. Não criar projeto pago nem apontar para produção por conveniência.
2. **Preparar PostgreSQL de Preview**, sem dados operacionais reais e com TLS/role de leitura. Confirmar configuração exata e capacidade de conexões por instância. O `DELIVERYOS_PG_URL` das fixtures é exclusivamente administrativo e jamais configuração do serviço.
3. **Prova ao vivo sobre URL de Preview:** primeiro GET, atualização, overload HTTP 503/Retry-After, saúde, desconexão, rollback observável, commit separado e nova leitura. Verificar que frontend e backend do **mesmo SHA** estão publicados.
4. **Carga e distribuição representativa:** medir p50/p95/p99 e RSS com quantidade de fatos **e de viagens**, workers definidos, TLS real, sem depender só de runner CI ou caso 1M GPS numa viagem.
5. **Android e operação física:** login/vínculo de aparelho, rede offline/retomada, GPS, consistência e prova humana. Sem essa validação, não declarar WORLD_PROVEN.
6. **Auditoria de merges e autorização final:** revisão do diff de PR #77, gates verdes no commit final e nenhuma regressão crítica; promoção reversível para integração primeiro, produção em gate separado.

## Rollback seguro no Preview

Em caso de sobrecarga, valores errados ou piora de memória, **retirar `DELIVERYOS_ENTREGAS_INCREMENTAL_RR=1` e reiniciar a instância de Preview** para voltar ao leitor anterior. Para desativar toda a proteção opt-in, remover também `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS` e `DELIVERYOS_ENTREGAS_MAX_INFLIGHT` após análise de capacidade. Não alterar fatos PostgreSQL, migrations, índices, retenção nem IDs do Q-016 como parte do rollback.

**Estado:** CODE_READY candidate with CI proof; NOT DEPLOYED; Q-026 OPEN/HOLD. **CAN DO ≠ AUTHORIZED EFFECT ≠ PROVEN OPERATIONS.**


## Auditoria cruzada com Claude PR #71 — correções obrigatórias de semântica

**Origem:** O Claude publicou no [PR #71](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/71), HEAD `a1c0f8db3dc7648c00aeeb476c7f8a99277a9f40`, um módulo de leitura RR por cursor sem ordenação PostgreSQL, acumulando viagens por chave e reutilizando **diretamente** o decoder Q-016 por lote. O módulo não tinha integração HTTP, mas trazia testes determinísticos de empates e dados corrompidos, mutações 14/14 e benchmark de 1M. Essa prova não se transforma por si só em autorização de produção; em particular a transação MVCC dele teve regressão medida (+11% a +34%) em diversos cenários.

**Três falhas reproduzidas na implementação compacta anterior da candidata:**

1. [PR #79](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/79): a Q-016 classificou 3 linhas inválidas (`occurred_at='infinity'`, `'-infinity'` e `sequence_local` insegura) com 2 válidas preservadas; o leitor anterior lançava `timestamp invalido no cursor` e anulava a leitura inteira. Reproduzido em [CI 38097075596](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38097075596), corrigido e paridade provada em [38097148905](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38097148905).
2. [PR #80](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/80): em empate de `localeCompare` (IDs NFC/NFD), o canônico escolhia o último aparelho da ordem estável e o acumulador anterior, o primeiro. Reproduzido em [38097305099](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38097305099), correção pontual provada em [38097360584](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38097360584).
3. [PR #81](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/81): com duas unidades e viagens Unicode distintas em bytes mas empatadas no comparador JS, `ORDER BY unit_id,object_id` do cursor antigo trocava a ordem de escopos e viagens da porta canônica. Reproduzido em [CI 38097514321](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38097514321). A solução não é apenas um ajuste de apresentação; exige acumulador que não dependa da ordenação SQL.

**Decisão de código na branch limpa:** substituir **somente** o núcleo da leitura incremental pelo algoritmo do Claude, mantendo `DELIVERYOS_ENTREGAS_INCREMENTAL_RR` **OFF por padrão**, contrato TypeScript estreito `RealidadeParaApresentacao` (`eventos.length`, nunca IDs), tamanho padrão de lote **257** da candidata para não mudar parâmetros de runtime junto com o algoritmo, roteamento, deadline, admissão, pool, TLS, UI e replay forense intocados. O JSON de apresentação conserva a `versao` pública anterior por compatibilidade, enquanto o algoritmo possui `LEITURA_INCREMENTAL_VERSION` interno. Esta diferença em relação ao código original do Claude é proposital e deve permanecer documentada.

**Provas do adaptador isolado:** [PR #82](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/82), com [CI 38097777284](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38097777284) (2/2: aparelho, escopos e viagens Unicode nas duas ordens e os três inválidos em quarentena), [CI 38097984236](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38097984236) (6/6: HTTP real, defaults, role SELECT-only, abort/deadline, MVCC e regressões), [CI 38097870457](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38097870457) (Chromium, 2/2) e [CI 38097870411](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38097870411) (alta cardinalidade, 2/2). **Essas execuções são do candidato isolado**; o HEAD desta branch limpa após transplante precisa de suas próprias provas verdes, que devem ser verificadas novamente antes de promoção.

**Alta cardinalidade no módulo do Claude adaptado:** com 30 mil viagens únicas, pico RSS canônico/incremental **280,91/241,45 MiB**, tempos **379,39/363,01ms**; com 120 mil viagens, **638,31/612,73 MiB**, tempos **1342,76/1355,92ms**. Digest idêntico de modelo + quatro viewmodels nos dois volumes. Uma execução CI por volume, sem significância estatística. Não prometer economia universal de 90% nem ganho universal de velocidade.

**Novos gates permanentes na candidata limpa:** `q026-corrupt-pg-timestamp-parity.yml`, `q026-unicode-p4-stable-tie.yml` (agora aparelhos, escopos e viagens) e `q026-clean-high-cardinality.yml`, além de integração HTTP/MVCC e Chromium originais. Todos exigem PG16 real descartável; ausência de banco não é sucesso.

**Bloqueios ainda abertos:** Preview real ligado ao repositório, role/tls operacionais, carga repetida e p95/p99, multiworker e capacidade total, rede, Android e aceitação humana. Q-026 e Q-024 permanecem OPEN/HOLD. Não houve merge, deploy, migração de dados nem alteração em main/integração operacional nesta integração.
