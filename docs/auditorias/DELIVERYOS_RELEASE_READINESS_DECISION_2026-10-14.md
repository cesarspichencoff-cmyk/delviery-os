# DeliveryOS — auditoria de prontidão de entrega e previsão

**14/10/2026 · NO_GO operacional.** Provas de laboratório verificadas; sem deploy, homologação física ou aceite humano.

## Produto que precisa ser entregue

Fonte vinculante: [Constituição DeliveryOS](../../product/DELIVERYOS_PRODUCT_CONSTITUTION.md) e [issue #103](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/103). **Copiloto é o produto principal na Home `/`**, Entregas é o segundo módulo prioritário. Lançar só o Android/viagens é release parcial. Entregadores próprios usam Trip; externos usam Handoff. iFood API live não é bloqueio da primeira V1. TATÁ Comandas [#102](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/102) evolui em paralelo e não deve bloquear a V1.

## Evidência técnica positiva

- [PR #117](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/117) HEAD `6bd3a1303412586825daee71d4e72cd0790d0e40`, **Draft/HOLD**, sem merge e sem CI remoto encontrado no commit atual. Ele acumula a cadeia de delegação e isolamento dos PRs anteriores. A diferença desde `7a011e1` altera somente uma guarda de audiência em teste.
- [Android HTTPS/WorkManager](DELIVERYOS_ANDROID_HTTPS_DELEGATION_WORKMANAGER_2026-10-14.md): **4/4** testes instrumentados com piloto oficial simulado; chegada, retenção com servidor indisponível, recuperação automática e retorno. A plataforma HTTPS no teste Android era **fixture**, não o servidor crítico.
- [PostgreSQL, crítico e Copiloto](DELIVERYOS_POSTGRES_CRITICAL_AUTH_COPILOTO_2026-10-14.md): consumidor **3/3**, wiring **6/6**, mesma Trip Android com **6 eventos públicos: 3 eventos equivalentes persistidos em platform.event_log, 3 eventos de parada isolados**; Copiloto ViewModel `observado`, uma viagem e replay sem duplicar. Servidor crítico oficial com PG e revogação imediata **11/11**; HTTP fila **8/8**; cadeia lógica **36/36**.
- A prova do Android com plataforma fixture e a prova do crítico oficial com PG foram **execuções diferentes**. A ViewModel não comprova a Home em navegador nem o funcionamento produtivo.
- [PR #107](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/107) teve CI Windows/Linux SUCCESS para cadeia de Comandas; serviço Windows de loja ainda não comprovado como V2 instalado. É trabalho paralelo.

## Bloqueios materiais e o que NÃO é bloqueio

| Prioridade | Bloqueio | Evidência mínima de fechamento |
| --- | --- | --- |
| P0 | Prova única Android → crítico oficial/PG → piloto TLS → recibos → projeção → Home/Entregas | Mesmo aparelho lógico ou físico, mesmo pedido e ambiente, revogação, offline/replay, observação em navegador, sem trocar fixture pelo crítico fora do teste |
| P0 | Origem verificada pedido próprio Neemo/Teknisa/comanda ↔ Trip | Uma entrega real autorizada, identidade e revisão do pedido comprovadas; não inferir chaves `IDORGCMDVENDA`/`NRCOMANDAEXT` nem converter formulários antigos em Trip |
| P0 | Candidato de release e CI do HEAD | Uma árvore consolidada Copiloto+Entregas, build final, jobs remotos e proteções de merge aplicáveis, sem merge de PRs experimentais em bloco |
| P0 | Host/segredos/persistência/TLS para piloto | Serviço e domínio definidos, acesso e configuração seguros, rollback e backup restaurado; nenhum target DeliveryOS implantado foi identificado em Vercel/Railway nesta auditoria |
| P1 | Copiloto na Home e experiência real | Navegador mobile, dados da mesma unidade atualizados; ausência de sensores = sem medição, jamais verde/calmo por falta de dados; V3.3 integrado sem sobrescrever app-v1 |
| P1 | Aparelho físico/termos/privacidade | Autorização de piloto, termo/política com escopo próprio, fluxo físico sob supervisão, GPS somente com base legal, rede instável e suporte operacional |
| Paralelo | TATÁ Comandas, impressão e API iFood live | Não bloquear Copiloto+Entregas V1 por essas frentes; tratá-las por contratos versionados e mudança autorizada separadamente |

**Portão de build esclarecido:** `npm run build` apenas compila TypeScript; o comando `npm run build:platform` já executa também `tools/copiar_contratos.js` e demais artefatos de deploy. O erro de contrato ausente no dist foi causado por preparo incompleto de laboratório e foi sanado; não classificá-lo como falha insolúvel do produto. Deve-se testar o pacote final produzido pelo comando oficial.

## Plano curto — uma linha de release

**G0 (0,5–1 dia útil):** congelar escopo V1 sem iFood live/comandas e árvore de release; escolher uma unidade, responsável pelo aceite, host e aparelho autorizado; validar gates CI do candidato.

**G1 (2–4 dias úteis de engenharia):** teste continuo no mesmo ambiente crítico PG/piloto/Android/ReadModel e **Home no navegador**, autorização de termos, revogação, isolamento, recibos, replay e rollback. Não fazer novas provas isoladas substituindo este gate.

**G2 (2–5 dias úteis, paralelo a G1):** validar **um pedido próprio** com chave real, saída/volta do motoboy e ligação verificável à Trip; aceitar dados ausentes com estado desconhecido. Integrar Copiloto/Home sem redesenho.

**G3 (2–4 dias úteis após G1/G2):** dispositivo físico e turno supervisionado, TLS/assinatura, privacidade, falha de rede real, backup/restauração e aceite humano; não substituir fluxo atual antes do sucesso.

## Previsão condicional para gestão (não compromisso)

| Marco | Estimativa | Premissas |
| --- | --- | --- |
| Demonstração técnica das provas existentes | Disponível agora | Relatórios e logs verificáveis, não app publicado |
| Piloto supervisionado de unidade única | **7–15 dias úteis** | Engenharia focada, host, Android e pedido verificável disponíveis rapidamente; autorização humana |
| V1 utilizável de Copiloto Home + Entregas numa unidade | **3–6 semanas** | G0–G3 aprovados, turnos de observação, fontes e rollback confiáveis |
| DeliveryOS abrangente com dados vivos de todas as praças e integrações adicionais | **Sem ETA defensável** | Fontes adicionais, Comandas e cutovers têm dependências independentes |

Sem confirmar host/dispositivo/pedido real, **não há data de entrega operacional que possa ser prometida**. Revisar a estimativa após o G1 e cada risco material.

## Autoridade, execução e fechamento

Engenharia fecha G0/G1 e CI no código final. Operação TATÁ/César autoriza a unidade e entrega física, o acesso a uma fonte real de pedido, política de privacidade, janela de turno, teste supervisionado e aceite. Infraestrutura escolhe capacidade incluída/gratuita suficiente antes de propor gasto, com backup e rollback. Produto garante Copiloto como Home e ausência declarada. Provas de laboratório não constituem produção nem aceite.

**Decisão:** NO_GO para produção nesta data; GO apenas para integração/testes isolados, com promoção condicionada a gates e autorização humana.