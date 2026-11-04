# Delivery OS Itaim — Gestor visualizador isolado V2 → sensor V3, pronto para ensaio supervisionado
**04/11/2026. Estado:** `STAGED_CODE` + `FOXYY_EDGE_FIXTURE_PASS`, **HOLD em campo/produção**.  
**Autoridade:** César autorizou preparação do visualizador oculto para teste posterior; não autorizou, por implicação, reinício de navegador operacional, reativação das tarefas antigas, uso de credenciais extraídas nem escrita no Gestor.

## Estado efetivamente recuperado do caixa (somente leitura)
- `%LOCALAPPDATA%\TataGestorObservationLab\GestorWebReadOnlyV2`: extensão Manifest V3 (`probe.js`, `worker.js`), receptor local `127.0.0.1:5195` e arquivo `latest.structure.json` existentes. **Não** copiamos chave do receiver nem armazenamos senha/cookie. O V2 foi criado para métricas estruturais somente: `identifiersCaptured=false`, `personalDataCaptured=false`, `verifiedMerchant=false`, `verifiedCoverage=false`.
- A última captura V2 conhecida, em 03/11/2026 13:40:27 UTC (10:40 BRT), indica a rota `expedition` e `STRUCTURE_ONLY_UNVERIFIED`. Não comprova pedidos, loja Itaim, detalhes ou estado do pedido.
- Existem perfis separados `%LOCALAPPDATA%\DeliveryOS-Edge-Gestor-Itaim` e `-V2`, mas o diagnóstico ao vivo de 04/11 não encontrou janela visível qualificável; observação estrutural não prova sessão autenticada útil.
- Seis tarefas antigas de Edge/UIA/watchdog seguem DESATIVADAS por interferência visual. **Não reativar.**
- Gestor operacional `Gestor de Pedidos.exe` e `msedge.exe` permaneceram sem cliques/navegação/alterações nesta auditoria.

## V3 construído nesta PR, com reutilização estrita
- `runtime/reporting/gestor_v3_visible_sensor.js`: sensor isolado para **documento já aberto**, usando seletores qualificados por teste. Extrai candidatos visíveis de pedidos, status de cabeçalho, e linhas/quantidades/complementos de **um detalhe já aberto**, sem navegar/clicar, sem rede, sem modificar DOM/foco/rolagem e sem gravar dados. A UI não comprova preparação física; `READY_HEADER_VISIBLE` não é pronto por praça.
- `watch()`: acompanha alterações passivamente com MutationObserver, deduplica repetições, oferece `reconcile()` para o ciclo controlado pelo processo externo e falha em `HOLD_STALE` quando a última leitura envelhece. O sensor **não** inicia cronômetro de fundo e **não** promete frequência garantida sem prova real.
- Scope hard-gated: `FIXTURE` apenas em host local/em branco; `FIELD_REVIEW` apenas no host real exato. Mesmo em revisão, `merchantVerified=false`, `coverageVerified=false`, `ordersPublishable=0` e `coverage=VISIBLE_ONLY`.
- Salvaguardas: linhas ocultas, referência duplicada, desconhecido de status, quantidade ilegível, extração de texto pessoal suspeito, vínculo detalhe-pedido ausente, múltiplos detalhes, lista vazia, 201+ cards, TTL vencido, configuração errada → HOLD. Não exportar dados reais/PII até homologação de retenção e proteção.
- **Não** substituir o GestorWebReadOnlyV2 instalado, não conectar à porta `5195`, não alterar receiver/extension/credentials/tarefas, não alterar o motor ou a Home; estes sensores são o futuro **adaptador**, não segundo motor.

## Provas reproduzidas no Foxxy
- `node tests/gestor-shadow/run-v3-visible-sensor-browser-tests.cjs` → **25/25 PASS** em Microsoft Edge real com dados fictícios.
- Inclui detecção de mudança de status, cancelamento, itens/modificadores, dedupe, stale, privacidade, dois pedidos, mensagem ilegível, zero foco/scroll/DOM alterados e zero requisições externas.
- O workflow `.github/workflows/deliveryos-silent-fixture-windows.yml` ganhou job Windows para repetir 25 testes (resultado CI validar separadamente).
- Sem prints, API iFood, sessão real, segredos nem pedido efetivo.

## Plano de ensaio — 05/11/2026 (não executar automaticamente)
**Gate 0 — silêncio:** confirmar ociosidade/janela de teste, supervisor presente quando necessário, kill switch manual, nenhum pop-up/sons, nenhuma nova tarefa; **não** abrir segunda janela do mesmo perfil operacional.

**Gate 1 — acesso autorizado:** usar apenas sessão isolada autenticada normalmente do Itaim e validar loja/unidade *independentemente* do texto autodeclarado. Sem senha extraída/cookie copiado/DevTools remoto em interface produtiva. Se ausência de sessão ou janela visível → `HOLD`.

**Gate 2 — seletor real:** observar uma lista real e **um detalhe já aberto legitimamente** sem mudar status. Qualificar no DOM real os seletores de lista, referência, estado e itens. O V3 contém mapeamento **somente de bancada**, portanto a compatibilidade real continua desconhecida. Campos ausentes são UNKNOWN, nunca estimativa.

**Gate 3 — dados e mudança:** para 1→5→lote representativo de pedidos, confirmar identidade, itens, quantidade, adicionais, observações, timestamp disponível, alteração, cancelamento, virtualização/paginação, volume/sacolas quando realmente mostrados; proteger PII. Abrir detalhes automaticamente ou usar CDP exige prova de ausência de efeitos e autorização específica; antes disso o sensor só lê detalhes já visíveis.

**Gate 4 — 60 s e Copiloto:** medir cobertura total contra fonte, lag, retries, CPU/RAM, janela sem interferência e fonte obsoleta explícita; inserir fatos somente em **shadow** no motor único Operação Viva/Home, com ranking por produto/praça e prioridade conforme S1–S22. S14 duas sacolas apenas quando motivo comprovado, não heurística; preparo físico e pronto de praça não vêm de status do cabeçalho. TATÁ Comandas segue fonte de conferência/enriquecimento em outro projeto.

**Critérios de STOP:** qualquer alteração de foco/visibilidade do caixa, captura de PII, perda de vínculo de pedido, falha de autorização, dupla sessão ambígua, CPU fora do limite, evento duplicado não idempotente, cardinalidade/paginação desconhecida disfarçada de completa, atraso > SLA sem alerta, ou processo relançando a janela.

**Prova atual:** `V3_CODE_STAGED` e `25/25_SYNTHETIC_BROWSER`. **Não** `GESTOR_REAL_PROVEN`, não `60S_PROVEN`, não `DEPLOYED`, não `10/10`.
