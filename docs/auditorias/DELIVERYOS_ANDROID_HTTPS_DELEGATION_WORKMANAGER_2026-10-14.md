# DeliveryOS — prova Android HTTPS, WorkManager e recuperação

**Data:** 14/10/2026. **Status:** 4/4 testes instrumentados Android API 34 PASS, somente laboratório sintético. **NÃO HOMOLOGADO PARA PRODUÇÃO.**

## Base e ambiente isolado

Código testado: PR **#117**, commit `7a011e160a51694323807de0040f02b7ac0abac8`, sobre o PR #116; piloto oficial do candidato, plataforma **fictícia** de autenticação.

- Emulador descartável Android API 34 `emulator-5580`; o emulador preexistente `emulator-5554` permaneceu intocado.
- GPS desligado (`location_mode=0`) durante todas as provas.
- Plataforma HTTPS fictícia em `127.0.0.1:8390`, piloto oficial HTTPS em `127.0.0.1:5490`, `mode=test`, `source_mode=simulated`, armazenamento persistente FileUnitOfWork, GPS de produção desabilitado. Serviços preexistentes em 8080/5193 preservados.
- CA/certificado de laboratório efêmeros, SAN `10.0.2.2` e `127.0.0.1`, validação OpenSSL, importados exclusivamente na configuração **debug**. Sem trust-all. APK debug SHA-256 `79B994C71049ACCD86B32C3901A78DB9A72204DEF3E9A64503F737860ED2E276` **não distribuível**.

## Uma única viagem sintética: provas instrumentadas

1. **Chegada — PASS.** Trip `LAB-WM-T1`, entrega `LAB-WM-D1`, preparadas por atores fictícios. O app inseriu `LAB-WM-20261014-ARRIVAL-01` em Room, autenticou com a plataforma, obteve credencial exclusiva `pt1`, enviou ao piloto HTTPS, passou pela consulta online de identidade e recebeu recibo. A fila voltou a 0; o piloto persistiu `arrival_reported`, entrega `chegada_detectada`. [Log](evidencias/android-delegated-fullflow-2026-10-14/android-instrumentation.txt).
2. **Piloto indisponível — PASS.** Apenas o servidor de laboratório na porta 5490 foi parado; a plataforma fictícia permaneceu ativa. O Android tentou confirmar `LAB-WM-20261014-DELIVERED-02` e conservou o evento `failed` no Room. Não houve descarte nem aceite indevido. **Foi uma queda do serviço**, não corte físico do Wi-Fi. [Log](evidencias/android-delegated-fullflow-2026-10-14/android-offline-stage01.txt).
3. **Recuperação automática — PASS.** O piloto reiniciou sobre o mesmo armazenamento. O WorkManager recuperou o comando **sem novo envio manual**, Room voltou a 0 pendências, e o piloto persistiu `delivery_confirmed` e `entregue_confirmado`. [Log](evidencias/android-delegated-fullflow-2026-10-14/android-offline-stage02.txt).
4. **Início do retorno — PASS.** O Android confirmou `LAB-WM-20261014-RETURN-03`, com recibo individual. Store persistente: Trip `LAB-WM-T1` = **`retornando`**, versão 5; delivery `LAB-WM-D1` = **`entregue_confirmado`**; evento `trip_return_started`. [Log](evidencias/android-delegated-fullflow-2026-10-14/android-return-test.txt).

Os quatro logs contêm `OK (1 test)` e `INSTRUMENTATION_CODE: -1`. Testes Android instrumentados preservados:
[chegada](evidencias/android-delegated-fullflow-2026-10-14/ScopedPilotWorkManagerLabTest.kt),
[retenção/recuperação](evidencias/android-delegated-fullflow-2026-10-14/ScopedPilotOfflineRecoveryLabTest.kt) e
[retorno](evidencias/android-delegated-fullflow-2026-10-14/ScopedPilotReturnLabTest.kt).

Contagens da plataforma **fictícia** após os ensaios: **1 sessão**, **4 delegações**, **3 verificações online** de identidade, **0 recusas**, **0 chamadas GPS**. No piloto, os eventos `arrival_reported`, `delivery_confirmed` e `trip_return_started` constavam na Store de laboratório.

## O que o teste NÃO prova

- A plataforma usada era uma **fixture** HTTPS, não o runtime crítico oficial com **PostgreSQL**; as verificações online eram da fixture, não do cadastro produtivo.
- A projeção real PostgreSQL/Entregas/Copiloto **não foi observada** aqui. Não afirmar que os dois stores preservam o mesmo `event_id`.
- Ainda não foram provados o revogar aparelho em banco real, isolamento entre unidades reais, queda de Wi-Fi do Android, rotas de termo/políticas (usam autenticação legada), encerramento da Trip, TLS público, assinatura Android de campo, backup/restore real, CI remoto, dispositivo físico e aceite humano.
- **Nenhum pedido real, dado de cliente, GPS produtivo, merge ou deploy.** Nenhuma chave privada, token, config de credenciais ou arquivo CA foi publicado.

## Próxima fase obrigatória

1. Substituir fixture por runtime crítico **oficial** com PostgreSQL temporário e cadastros de aparelho/ator, incluindo revogação ativa.
2. Resolver autenticação específica das rotas de **aceite de termo/políticas**; não reaproveitar indevidamente a audiência `entregas:events:write`.
3. Provar o mesmo fluxo com projeção PostgreSQL e leitura Entregas/Copiloto, recibo/replay real, perda real de rede e isolamento de unidade.
4. Concluir CI, TLS, backup restore, variante assinada e piloto físico supervisionado com autorização humana.

**Fronteira de verdade:** `TEST_PASS` de HTTPS/Room/WorkManager na bancada sintética; `DEPLOYED`, `WORLD_PROVEN` operacional e `HUMAN_ACCEPTED` permanecem **NÃO**. PRs em DRAFT/HOLD.
