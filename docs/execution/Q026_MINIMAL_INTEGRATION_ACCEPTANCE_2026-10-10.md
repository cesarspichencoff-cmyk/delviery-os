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
