# DeliveryOS — Copiloto e Entregas, leitura compartilhada no navegador com PostgreSQL isolado
Data da prova: 15/10/2026. Status: **LABORATORIO PASS**, **PRODUCAO NO_GO**.

## Fato que mudou a rota
- A suite existente `tests/product/run-entregas-servidor-pg-tests.ts` ja comprovava a mesma projecao na API `/api/copiloto?unit_id=ITAIM` e `/api/entregas?unidade=ITAIM`, 7/7, mas nao exercitava o navegador com o mesmo banco.
- A primeira extensao visual carregava `#/copiloto` e passava 9/9 mesmo com a tela em `demo-unit`. Inspecao REAL da captura revelou **Nenhuma projecao para este recorte**, enquanto a fixture PostgreSQL continha fatos em ITAIM. Isso era **FALSE_POSITIVE_BROWSER_INTEGRATION** — passar por carregar a tela nao prova leitura do mesmo sujeito.
- Contra-rota: teste deve selecionar a unidade exata, exigir contagem da fixture, modo e fonte, e retornar a Home sem transformar demonstracao em unidade operacional.

## Intervencao minima, opt-in
1. `tools/product_system_server.ts`: `DELIVERYOS_PRODUCT_READ_UNIT` permite acrescentar **somente com `DELIVERYOS_DATABASE_URL` configurada**, e id validado (A-Z, 0-9, _ ou -, de 2 a 32 caracteres), uma unidade de **leitura parcial** ao seletor existente. Valor inferido de banco, cliente ou pedido e proibido. Sem a flag, navegacao antiga preservada. A flag nao e autenticacao e nao autoriza acesso na loja.
2. `src/product/ui/app.js`: em `#/copiloto`, quando `entregas_observadas` veio de `platform.event_log` com grupos observados, os selos identificam **parcial** e o modo declarado pelo evento, em vez de 'somente demonstracao'. Nas outras telas, a unidade de leitura parcial fica desabilitada e um contexto ativo desse tipo retorna para `demo-unit` ANTES de consultar a Home/Operacao Viva.
3. `tests/product/run-entregas-servidor-pg-tests.ts`: S9 exercita Chromium 390×844 e 1440×900, seleciona ITAIM no proprio controle de UI, exige `ITAIM + simulado + 7 viagens na projecao historica`, consulta a mesma porta HTTP e PostgreSQL da S7, confere selo `parcial/simulado`, salva captura e verifica que Home volta para `demo-unit` e bloqueia o seletor da unidade parcial.

## Evidencias e limites
- PostgreSQL 18.6 **isolado/efemero**, Linux WSL em Foxxy, UNIX socket privado, sem porta TCP, seeds `source_mode=simulated`, nenhum banco comercial. Chromium headless local de Playwright com biblioteca do sistema extraida em user cache sem sudo, usuario ou pagamento.
- `ENTREGAS_SERVIDOR_PG: 9/9 PASS` incluindo S7 API compartilhada, S5 Entregas visual, S9 Copiloto visual e guarda da Home. **10 PNGs** gerados em diretorio temporario fora do repositorio. Cluster encerrado/apagado (`VISUAL_ISOLATED_PG_CLEANUP_DONE`), nenhum efeito em servicos da loja.
- Compilacao `npm run build:platform` OK; `tsc --noEmit` OK; Product System 52/52, Home 44/44, Copiloto 41/41, ordem visual 6/6 e `tests/product/run-copiloto-entregas-http-browser.ts` sem DB PASS. `git diff --check` OK.
- **NÃO** prova fonte Gestor iFood real, API iFood (fora de escopo), identidade entre pedido Gestor e Teknisa, Android fisico, TLS produtivo, autorizacao de acesso a outras unidades, turnos atuais, CI remoto ou aprovacao humana.
- As 7 viagens sao **historico sintetico no PostgreSQL**, NAO 7 viagens ativas em Itaim. Motor de pressao / decisoes reais continuam sem fonte.
- A entrada opt-in so pode ser usada em piloto depois de confirmar escopo e autorizacao humana; os testes locais nao autorizam merge/deploy.

## Proximo gate
Revisar a alteracao e executar CI no HEAD final; validar a mesma cadeia com Android fisico, autorizacao/escopo e dados reais; para Gestor, obter evidencia de tela permitida antes de qualquer adapter. Product Home `/` continua protagonista conforme Constituicao. Sem novo motor.
