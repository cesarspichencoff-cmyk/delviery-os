# DeliveryOS — Android HTTPS e viagem sintética no emulador (13/10/2026)

**Resultado: E2E DE DEMONSTRAÇÃO PARCIAL COMPROVADO. NÃO É E2E OPERACIONAL, NÃO É CAMPO FÍSICO, NÃO É PRODUTO HOMOLOGADO.**

## Fonte, isolamento e prova

- HEAD exato do código executado: `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3`, candidato isolado da PR #108 (Q-019). PR #106 e PR #108 continuam sem merge ou publicação.
- Bancada: Foxxy, AVD já existente `deliveryos_api34` (`emulator-5554`), Android 14/API 34; nenhum celular físico.
- **Cópia temporária de compilação** em `C:\Users\italo\deliveryos-emulator-https-lab-20261013` no MESMO commit, porém **com um único arquivo alterado**: `android/app/src/debug/res/raw/deliveryos_lab_ca.crt` (CA recém-gerada de laboratório). Não alterar o arquivo no repositório candidato, o visual, os requisitos de HTTPS ou os caminhos autorizados da Q-019.
- APK de laboratório `assembleDebug --offline`: **BUILD SUCCESSFUL** em 23s; SHA-256 `856DE02373BD828ECD4A0A57CC4C8D0F814F2820CCBD2B22386223E776B8FF42`; instalado exclusivamente no AVD. **Esse APK é variante de bancada, não o binário canônico byte a byte**.
- Chave privada e certificados de curta duração (3 dias) guardados **somente** no scratch local `C:\Users\italo\deliveryos-q019-visual-proof-20261013\emulator-https`, jamais copiados para o GitHub. O certificado de servidor tem SAN `10.0.2.2` e `127.0.0.1`.
- `https://127.0.0.1:5193` (loopback Foxxy) serviu como proxy TLS estrito para servidor **HTTP DEMO em memória** na porta local 5194. Cliente Node com `rejectUnauthorized:true` e CA explicitamente confiável: `/api/health` **200** e `/rider-mobile/` **200**. Não houve TLS bypass nem exposição pública.
- O health declarou expressamente `demo=true`, `mode=demo`, `copiloto=false`, `shell=false`. Não se conectou qualquer banco operacional, sessão real, Neemo/Teknisa, iFood ou plataforma LIVE.

## Prova de interface Android → servidor de DEMO

Cenário: Trip `LAB-Q019-20261013-T01`, entrega `LAB-Q019-20261013-D01`, pedido preexistente da fixture `P-101`, ator fictício `rid-demo` e `demo-unit`.

| Momento | Como foi acionado | Prova observada |
|---|---|---|
| Preparação da viagem | HTTPS `POST /api/command` / `CreateTrip`, usando apenas fixture | `preparando_saida`, uma parada apresentada no WebView Android |
| Saída | **Toque real no botão Android** + confirmação nativa de diálogo WebView | `em_rota` conferido em `GET /api/snapshot` |
| Chegada | **Toque real no botão “Cheguei” do Android**, sem sensor | `chegada_detectada` no mesmo Trip e na mesma entrega |
| “Offline” de laboratório | `POST /api/connection` com `offline` | Indicador do servidor `offline`; nenhum corte físico de rede |
| Entrega | **Toque no Android** + confirmação, com flag de UI `offline` | `entregue_confirmado`, `pending_sync=1` em memória |
| “Conexão restaurada” | `POST /api/connection` com `online` | Indicador `online`; pendência ainda 1 antes de novo comando |
| Retorno | `StartTripReturn` via HTTPS, ator sintético | `retornando` e `pending_sync=0` no mesmo processo |
| Encerramento | `CloseTripManually` via HTTPS, líder fictício | `encerrada`, `pending_sync=0`, sem viagem ativa na UI após recarga |

Evidência pública reduzida e sem identificadores do emulador: [JSON de estados sintéticos](evidencias/android-https-lab-2026-10-13/flow-proof-synthetic.json).

## Capturas de prova

**Imagens cortadas propositadamente na parte inferior para excluir o identificador de aparelho e o código de vínculo.** Não são screenshots full-page nem prova de Copiloto.

- [01 · Preparando saída](evidencias/android-https-lab-2026-10-13/01-preparando-saida.png)
- [02 · Em rota](evidencias/android-https-lab-2026-10-13/02-viagem-em-rota.png)
- [03 · Estado visual offline / tela intermediária desatualizada](evidencias/android-https-lab-2026-10-13/03-estado-offline-stale.png)
- [04 · Nenhuma viagem ativa após reinício da interface](evidencias/android-https-lab-2026-10-13/04-encerrada-apos-recarga.png)

## Controles de GPS, origem e ambiente

- Em todos os pontos conferidos, `adb shell settings get secure location_mode` retornou `0`. Permissões `ACCESS_FINE_LOCATION` e `ACCESS_COARSE_LOCATION` não concedidas; `POST_NOTIFICATIONS` negada no AVD; `TripLocationService` não encontrado como serviço ativo.
- O WebView exibe `GPS DESLIGADO — SEM VIAGEM ATIVA`; sem pontos geográficos ou prova de geocerca.
- **A origem canônica `source_mode=simulated` e o evento público compartilhado NÃO foram produzidos por este servidor:** ele carimba `demo` no health, mantém `MemoryUnitOfWork` e não disponibiliza feed ao Copiloto. Nunca reinterpretar `demo` como evento certificado da plataforma.
- O estado “offline” desta facade **não interrompe a rede** e o contador `pending_sync` **não equivale** a outbox durável no dispositivo.

## Testes independentes (não confundidos com a viagem Android)

- `src/entregas/integration/run-durable-event-feed-tests.ts`: **9/9 PASS**, com `FileUnitOfWork` temporário e eventos `source_mode=simulated`. Provou persistência, cursor/restart e ausência de default para `real` em **outro harness**; NÃO o Trip do emulador.
- `tests/product/run-copiloto-entregas-http-browser.ts`: **PASS**, browser 390×844, localhost, sem URL de banco; prova que o Copiloto expressa **indisponibilidade de fonte** e não fabrica dados quando desconectado. **Não** prova o mesmo evento do Android.
- Anteriormente, `connectedDebugAndroidTest` no AVD: **19/19 PASS**, 0 falhas/erros/pulos, APK canônico de debug; também não substitui este teste de integração.

## Questões reais encontradas (não maquiar)

1. **Integração nativa ausente no demo:** abaixo do estado do GPS a WebView apresenta literalmente `Not Found`; o servidor `tools/entregas_ui_server.ts` só implementa a fachada UI e não fornece o controle de identidade/consentimento nativo do piloto. A tela entrou no fluxo manual, porém vinculação do aparelho **não foi comprovada**.
2. **Texto de offline pode sugerir durabilidade inexistente nesta fixture:** “Confirmações ficam neste aparelho e sobem sozinhas quando a rede voltar” apareceu na UI, mas a fachada demo só altera flag/contador em memória do servidor. Não usar como evidência de resistência a perda de rede/restart.
3. **Título temporário concatenado:** no estado desatualizado, a UI exibiu `em_rotaEm rotaem_rota`; origem identificada em `src/entregas/ui/rider-mobile/rider.js`, expressão `chip(t.state).replace(/<[^>]+>/g, t.state)`. Após reiniciar a interface, o estado terminal e o modo online apareceram corretamente. Reproduzido, **não corrigido** nesta missão, pois integra os visuais aprovados e merece regressão específica.
4. **Copiloto não observou esse Trip:** `copiloto=false` é um fato explícito do servidor. O teste de Copiloto separado observa ausência de fonte, não o evento.
5. **Sem aparelho físico e sem rede interrompida realmente:** nem piloto operacional nem GPS, Neemo/Teknisa ou lançamento em produção estão autorizados por esta evidência.

## Próxima etapa, sem reiniciar projeto

Construir **apenas em worktree de laboratório isolada** o ensaio com `tools/entregas_pilot_server.ts` em `mode=test` ou `demo`, `source_mode=simulated`, `gps_production=false`, `ENTREGAS_HTTPS=1`, `FileUnitOfWork` temporário e credenciais fictícias; usar a porta de eventos públicos versionados para o consumidor Shadow em **somente leitura**. Comprovar um mesmo `event_id` e `source_mode` nas duas superfícies, offline real do emulador e reabertura. Nenhuma exceção genérica a Q-019, nenhum endpoint LIVE/merge/deploy, nenhuma confiança TLS desligada.

**Estado final desta missão:** prova HTTPS e fluxo manual-demonstrativo concluída, CI de componentes verdes nos escopos citados, prova operacional integrada e homologação humana **PENDENTES**.
