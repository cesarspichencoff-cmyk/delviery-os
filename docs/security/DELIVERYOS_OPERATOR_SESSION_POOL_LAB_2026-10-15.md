# G0/G4 — sessão fictícia e isolamento transacional RLS (somente laboratório)

Data: 15/10/2026. Estado: **LAB_TEST_PASS, PRODUCTION_NO_GO**, sem autorização de usuário real.
Candidato de base: PR #123, isolado desta implementação experimental.

## Por que o teste existe
O PR #123 prova a integridade da resposta HTTP por unidade (S10, S14) e um papel RLS temporário com política fixa para Itaim (S12). Contudo, a prova não cobria a reutilização de conexão entre **duas identidades distintas** com alternância rápida de unidade, `COMMIT`, `ROLLBACK` e revogação. Este laboratório fecha **só essa lacuna de ensaio**, sem criar login do DeliveryOS.

## Artefatos
- `tests/product/lab/operator-session-simulated.ts`: registro **somente em memória**, com sujeitos fictícios, concessões de unidade, TTL no máximo 10 min e token opaco aleatório de 32 bytes, guardado internamente por hash. Reavalia vínculo/atividade/revisão em toda leitura e permite revogar. Atestação `LAB_SYNTHETIC_ONLY` é **inventada pelo teste**, não identidade comprovada por terceiros.
- `tests/product/run-operator-session-lab-tests.ts`: 27 contraprovas, incluindo cookie `Secure; HttpOnly; SameSite=Strict` **simulado**, expiração, revogação, cookies duplicados, rotas fora de escopo, cabeçalhos `X-User/X-Unit/X-Role` falsos e troca entre operadores sintéticos. O servidor HTTP de teste reutiliza a função `checarAcessoEscopado` do produto mediante credencial **interna ao harness**. **Não instala sessão em `tools/product_system_server.ts` e não cria fluxo de login web.**
- `tests/product/run-operator-session-rls-pool-lab-tests.ts`: 15 contraprovas PostgreSQL. Exige GitHub Actions, `RUNNER_TEMP`, porta 55441, host `localhost` e socket `operator-pg-socket-*` **criado pelo próprio runner**; sem esses controles, encerra com código 78 e NÃO anuncia verde.
- `.github/workflows/deliveryos-operator-session-lab.yml`: instala somente dependências de teste, cria cluster PostgreSQL 16 efêmero sem endereço TCP, executa verificações TypeScript e sessões/SQL e encerra o cluster via `pg_ctl stop`.

## Prova remota
**[GitHub Actions 38793275078](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38793275078) SUCCESS**, Linux runner limpo:
- `OPERATOR_SESSION_SYNTHETIC_LAB: 27/27 PASS`.
- `OPERATOR_SESSION_RLS_POOL_LAB: 15/15 PASS`.
- `ESCOPO_API_SHADOW_CONTRACT=PASS` (regressão de guarda HTTP existente).
- `OPERATOR_SESSION_ONLY_SYNTHETIC=PASS`, TypeScript compilou e o PostgreSQL efêmero parou com sucesso.

RLS: um papel `LOGIN NOSUPERUSER NOBYPASSRLS`, sem poder de DDL, possui `SELECT` só em `platform.event_log` e `identity.device`. Duas policies temporárias avaliam `unit_id = NULLIF(current_setting('deliveryos.unit_scope',true),'')`. Uma **única conexão** (pool `max=1`) recebe o escopo por `set_config(..., true)` dentro de transação, após a validação **fictícia** da sessão. Sem contexto SQL, ambas as tabelas retornam zero; sessão fictícia Itaim vê um fato/aparelho, sessão Vila-Lab vê só o seu, inclusive após alternância, quatro transações concorrentes e rollback injetado. Role não pode consultar `identity.actor` nem desativar RLS. Revogação/expiração negam consulta antes da transação.

## Auditoria adversarial adicional — GUC mutável versus papel por unidade (15/10/2026)

A estratégia do ensaio original era `unit_id = NULLIF(current_setting('deliveryos.unit_scope', true), '')` com um mesmo papel compartilhado entre unidades. **O teste adicional comprovou que isso não impõe, sozinho, uma fronteira de autorização**: dentro da própria transação o papel pode escolher novo valor para a GUC e ver fatos de outra unidade se houver possibilidade de executar SQL arbitrário. `SET LOCAL`, mesmo limpando o estado em `COMMIT` e `ROLLBACK`, não resolve a hipótese de manipulação *durante* a transação. O resultado é **PROVEN no banco sintético**, não prova de exploração no DeliveryOS real.

- Artefato novo: `tests/product/run-operator-rls-guc-threat-lab-tests.ts`. Por construção só executa em GitHub Actions com PostgreSQL 16 no socket efêmero de propriedade do runner (`operator-pg-socket-*`, porta 55441), senão encerra com código 78 sem falso verde.
- Comparação controlada: (a) papel sem `BYPASSRLS` com policy vinculada à GUC variável demonstrou poder alternar Itaim/Vila-Lab; (b) **dois papéis LOGIN distintos**, sem membership cruzado, com policies RLS fixas `USING (unit_id = 'ITAIM')` e `USING (unit_id = 'VILA-LAB')`, conseguiram ler apenas a própria unidade, inclusive após alteração adversarial da GUC, consultas sem `WHERE`, teste de `SET ROLE`, acesso a tabela não concedida e concorrência. O papel não pôde alterar a policy ou desabilitar RLS.
- **[CI 38810692998](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38810692998) SUCCESS**, `OPERATOR_RLS_GUC_THREAT_LAB: 16/16 PASS`, preservando `27/27` de sessão sintética, `15/15` de pool anterior e regressão `ESCOPO_API_SHADOW_CONTRACT=PASS`. Testes/criação de roles/policies **somente** no PostgreSQL descartável do CI, com cleanup.
- **Decisão de segurança:** não promover o desenho com único papel e GUC modificável como isolamento obrigatório da base. Avaliar **credenciais e pools separados por unidade**, com papéis sem membros cruzados e policies fixas, ou outro mecanismo comprovadamente robusto e revisado. Isso traz custos de gestão de conexão, credenciais e ciclo de revogação que ainda não foram medidos.
- **Fronteira de prova da mitigação:** são apenas duas tabelas, dois pools/papéis de laboratório e dados sintéticos. Banco do DeliveryOS não foi alterado. A role do aplicativo ainda não foi vinculada a uma sessão **humana comprovada**. A aprovação é evidência de comportamento PostgreSQL nesse ensaio, não garantia para todos os schemas/portas, nem correção implantada.

## Prova adicional: sessão fictícia → pool fixo por unidade (15/10/2026)

A primeira auditoria de roles testou isolamento do próprio banco. O novo teste verifica **como o servidor deveria encaminhar uma sessão já validada à conexão da unidade correta**, sem permitir que navegador/URL escolham credenciais.

- Arquivo novo: tests/product/run-operator-role-routing-lab-tests.ts, com guarda de GitHub Actions, RUNNER_TEMP e socket UNIX privado operator-pg-socket-* (localhost, porta 55441). Fora desse ambiente sai com código 78, sem falso verde.
- Banco isolado do runner com dois fatos sintéticos, dois papéis LOGIN sem BYPASSRLS, sem membership cruzado, e duas policies por tabela em platform.event_log e identity.device. Cada unidade usa sua própria conexão PgSqlClient (pool max=1).
- Mapeamento FIXO no harness entre sessão fictícia previamente verificada e pool da unidade. Não interpola valores de navegador em logins, nomes de roles ou SQL. Um gerente fictício com duas concessões precisa emitir tokens/sessões específicos por unidade.
- Testes negativos: cookie falso é negado com HTTP 401 e zero SQL; URL cruzada, cabeçalho forjado, tentativa de texto SQL no seletor e troca indevida de unidade são negados com 403 antes de acessar PostgreSQL.
- Seis leituras concorrentes conservam o mesmo backend PID **dentro de cada unidade**, PIDs diferentes entre unidades e não vazam fatos. Mudança adversarial de GUC não supera policy fixa; SET ROLE de outra unidade e tentativa de desligar RLS são negados por 42501. Revogação e expiração impedem novas consultas.
- Prova: [GitHub Actions 38812505923](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38812505923) SUCCESS. OPERATOR_ROLE_ROUTING_LAB 18/18 PASS, junto com 27/27 sessões fictícias, 15/15 transações/pool, 16/16 auditoria adversarial GUC e regressão HTTP. Nenhuma fonte, credencial, usuário ou banco real foi acessado.
- **Atenção:** são apenas dois pools, duas tabelas e sessões artificiais; não mede escalabilidade, conexões máximas ou custos de dezenas de unidades. Não verifica views, funções SECURITY DEFINER, writes, SQL injection no servidor real, nem substitui identidade de operador/IdP. Não houve modificação em tools/product_system_server.ts, role produtiva, migration, merge ou deploy.

**Rota preferida para próxima revisão:** papéis realmente separados por unidade reduzem o risco da GUC mutável, mas dependem de autenticação humana confiável, gestão operacional de credenciais, revisão de todo o SQL, isolamento da connection pool e autorização antes de implantação.

## Contra-prova de tabelas filhas: pedidos e GPS sem coluna de unidade (15/10/2026)

**Novo bloqueio de segurança demonstrado** na implementação de LAB: os exemplos de RLS anteriores cobriam `platform.event_log` e `identity.device`, mas o modelo de entregas mantém a unidade em `entregas.trip.unit_id`. As tabelas `entregas.delivery` (inclusive `order_ref`) e `entregas.gps_point` (coordenadas) não contêm `unit_id`; ambas apontam para `trip_id`. **Proteger apenas a tabela pai não protege um SELECT direto nas tabelas filhas.**

- Teste versionado: `tests/product/run-entregas-related-rls-lab-tests.ts`. Requer exclusivamente PostgreSQL 16 socket UNIX `operator-pg-socket-*` dentro de `RUNNER_TEMP` no GitHub Actions, `localhost:55441`; em qualquer outro alvo **sai 78**, não emite verde e não cria papéis.
- Banco temporário migra o schema real até a versão atual, cria **duas viagens, duas entregas e dois pontos GPS sintéticos**. Um papel de demonstração com `SELECT` nas três tabelas, mas **sem RLS**, observa as duas unidades, inclusive os identificadores de pedido. Depois de ligar RLS **apenas em `trip`**, esse mesmo papel deixa de observar viagens, mas ainda consegue ler ambas as entregas e pontos GPS — **falha reproduzida** no contexto de bancada.
- Contraprova da mitigação: RLS fixo por role em `trip`, mais policies em `delivery` e `gps_point` que usam `EXISTS` sobre a viagem ligada por `trip_id` e verificam `t.unit_id`. Roles distintos Itaim/Vila-Lab, sem membership cruzado e com `SELECT` mínimo, observam somente sua viagem, seu pedido sintético e seu GPS. Sem policy, o papel adversarial vê zero linhas.
- Testou alterações da GUC, consultas concorrentes, tentativa de `SET ROLE` cruzado e `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` — sem obter os registros da outra unidade. O catálogo da bancada não apresentou função `SECURITY DEFINER` no schema `entregas` com as migrations carregadas; esse fato **não cobre outros schemas nem futuras funções**.
- **[GitHub Actions 38823299460](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38823299460) SUCCESS** — `ENTREGAS_RELATED_RLS_LAB: 20/20 PASS`, além das regressões `27/27` sessões fictícias, `15/15` contexto transacional, `16/16` falha GUC e papéis, `18/18` roteamento de sessões para pools distintos. Banco e políticas criados somente no runner e descartados ao concluir.
- **Não há correção de produção.** O papel `deliveryos_entregas_pilot` de `deploy/sql/papeis_minimos.sql` concede SELECT/INSERT/UPDATE em múltiplas tabelas operacionais, porém **não contém políticas RLS por unidade**. A existência do arquivo no repositório não comprova que essas permissões estejam aplicadas a um banco produtivo específico. Não comparar esta role produtiva com a role de leitura que é criada só nos testes.

### Inventário mínimo pendente antes de abrir acesso multiunidade

| Família | Situação estrutural observada | Obrigação antes de piloto |
| --- | --- | --- |
| `entregas.trip` | Possui `unit_id` | Política por role/unidade em banco autorizado |
| `entregas.delivery`, `entregas.gps_point` | Sem `unit_id`; FK/ligação por `trip_id` | Policy correlacionada com `trip` em todas as rotas diretas e joins |
| `entregas.occurrence`, `handoff`, `rider_state`, `domain_event`, `public_outbox`, `ready_order`, `term_acknowledgement` | Possuem `unit_id` no schema | Revisar concessões, políticas próprias e operações de escrita por tabela |
| `identity.actor`, `identity.device`, `orders.order_twin`, `sources.source_event` | Possuem unidade/campos pessoais ou operacionais | Menor privilégio e limite de fonte; separar identidade de banco de usuário |
| `platform.*` e funções/views/rotinas | Mistura fatos com unidade e estados técnicos sem unidade | Matriz efetiva de direitos, análise de funções e nenhuma exposição global por engano |

**Escopo da prova:** o novo teste cobre **três tabelas de entregas e duas unidades sintéticas**, não os demais fluxos, múltiplos bancos, papéis existentes, payloads reais, views, operações de escrita, gatilhos de segurança, performance, nem identidade humana. O acesso aos dados reais continua **NO_GO**. É necessária revisão de migration/RLS e rollback separado do PR de teste, com autorização expressa para aplicar qualquer política no banco de operação.

## Inventário de relações e concessões SQL do próprio repositório (15/10/2026)

**Contrato de auditoria agora executável:** `tests/product/run-schema-access-matrix-lab-tests.ts` migra um PostgreSQL 16 efêmero no socket privado `operator-pg-socket-*` do runner GitHub e rejeita banco externo (exit 78). O teste enumera `pg_class`, `pg_attribute`, políticas RLS e funções diretamente no catálogo SQL, em vez de presumir que os arquivos de DDL representam o schema materializado. Objetos novos sem classificação reprovam a suite.

| Classe do schema migrado | Relações | Resultado |
| --- | --- | --- |
| Unidade direta `unit_id` | 15, incluindo `identity`, fatos e entidades de entregas, fontes e pedidos | Precisam de revisão de policy por unidade conforme sensibilidade e acesso efetivo |
| Unidade via pai `trip_id` | `entregas.delivery`, `entregas.gps_point` | Requerem RLS próprio ligado à `entregas.trip`, não apenas RLS no pai |
| Sem coluna de unidade | `platform.audit`, `platform.job`, `platform.outbox`, `platform.schema_migration` | **Não assumir que o payload ou o contexto seja global/inofensivo**; inventariar campos, propósito, rota e nível de privilégio |
| **Total** | **21 relações** | Nenhuma view não mapeada no baseline; as 21 tabelas estão com RLS desabilitado nas migrations atuais |

O catálogo encontrou **três funções** nos schemas de migrations atuais e nenhuma marcada `SECURITY DEFINER`. Isso não garante segurança para funções futuras ou dependências fora desses schemas.

**Teste de GRANT real do repositório, mas exclusivamente em LAB:** em banco criado pela suíte é executado `deploy/sql/papeis_minimos.sql` via `psql -f`. O papel exato **`deliveryos_entregas_pilot`** é criado/conferido como não superusuário e não `BYPASSRLS`. `has_table_privilege` confirma SELECT em oito tabelas operacionais (viagens, entregas, handoff, ocorrências, rider state, domínio de eventos, public outbox, ready order) e em `platform.schema_migration`. Confirma ausência de SELECT direto em `entregas.gps_point`, `identity.actor` e `platform.event_log` e presença de DELETE/UPDATE em certas tabelas (papel operacional de escrita, **não** perfil de leitura de dashboard).

**Falha demonstrada somente no banco de teste:** com duas viagens e duas entregas sintéticas, conexão pelo papel exato `deliveryos_entregas_pilot` consegue `SELECT` de ambas as viagens e `order_ref` de ambas as unidades, na ausência de políticas RLS. A role não consegue ler `identity.actor` nem executar DDL para desligar RLS. **Essa prova NÃO afirma que o banco de produção possua essa role/grants ou ausência de RLS; compara a declaração versionada aplicada à migração versionada.**

**Prova [GitHub Actions 38824805676](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38824805676) SUCCESS:** `OPERATOR_DB_SCHEMA_ACCESS_MATRIX: 15/15 PASS`, mais `ENTREGAS_RELATED_RLS_LAB: 20/20`, sessões fictícias `27/27`, pool de sessão `15/15`, risco GUC `16/16`, roteamento de roles `18/18` e guarda HTTP anterior. O cluster PostgreSQL efêmero foi desligado ao final. Nenhum acesso real foi feito.

**Novo gate negativo de G0/G4:** não conectar usuários humanos ao papel `deliveryos_entregas_pilot` como se fosse papel de leitura multiunidade. Antes de piloto, reconciliar `SELECT/INSERT/UPDATE/DELETE` por tabela/função, portadores de credenciais, joins sem `unit_id`, payloads globais, RLS de escrita (`USING` / `WITH CHECK`), impactos do trigger de delivery e migração/rollback. O desenho de autenticação humana permanece não implementado e não autorizado. O próximo passo pode testar controles de escrita por unidade **apenas em banco descartável**, nunca executar novas GRANTs/RLS na loja sem autorização.

## RLS de escrita: INSERT, UPDATE, DELETE e políticas WITH CHECK (15/10/2026)

**G0 — laboratório aprovado, banco operacional NÃO alterado.** O teste `tests/product/run-entregas-write-rls-lab-tests.ts` migra as tabelas oficiais e aplica o próprio `deploy/sql/papeis_minimos.sql` **exclusivamente** no PostgreSQL 16 temporário do runner GitHub. Só inicia com `GITHUB_ACTIONS=true`, socket UNIX privado dentro de `RUNNER_TEMP` e porta 55441; ambiente diferente sai com código 78, não gera PASS.

- **Falha de base demonstrada:** a role versionada `deliveryos_entregas_pilot`, na ausência de RLS, executou `UPDATE` de viagem Vila-Lab, `DELETE` de sua entrega e `INSERT` de item pronto de Vila-Lab apesar de não ter identidade/unidade humana vinculada. Toda a sequência ocorreu dentro de transação abortada deliberadamente; `ROLLBACK` e leitura pelo proprietário confirmaram viagem e entrega preservadas. Não equivale a ataque ou configuração observada na produção.
- **Contra-rota testada:** duas roles de bancada **separadas por unidade**, sem `BYPASSRLS`, com políticas `FOR ALL ... USING (...) WITH CHECK (...)` em `entregas.trip`, `entregas.ready_order` e `entregas.domain_event`. A tabela `entregas.delivery`, sem `unit_id`, valida o `trip_id` por `EXISTS` na viagem pai para ambas as expressões (`USING` e `WITH CHECK`).
- **Negativos comprovados para Itaim e Vila-Lab:** `UPDATE` e `DELETE` em linhas alheias não retornaram registros; `INSERT` de viagem ou fila de outra unidade foi negado; mudar `unit_id` de viagem/pedido pronto próprio ou reassociar `trip_id` de entrega para viagem alheia foi negado por `WITH CHECK`. `INSERT` de evento de domínio alheio foi recusado; a role de leitura/escrita não tem `DELETE` no log append-only.
- **Regressões positivas:** `INSERT` próprio de pedido pronto passou; `UPDATE` de viagem própria e `DELETE` de entrega própria passaram **dentro de transação revertida**. O trigger append-only `entregas.impedir_mutacao_domain_event` impediu `UPDATE` mesmo sob o proprietário do banco de teste.
- **Prova [GitHub Actions 38831026596](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38831026596) SUCCESS:** `ENTREGAS_WRITE_RLS_LAB: 34/34 PASS` na última versão de código, sem regressões nas suítes anteriores (27/27 sessão fictícia, 15/15 pool, 16/16 contraprova GUC, 18/18 roteamento role, 20/20 tabelas filhas, 15/15 matriz de GRANTs). PostgreSQL foi encerrado e banco descartado. A prova original de escrita 30/30 foi ampliada para 34/34.
- **Limites:** cobertas quatro tabelas (`trip`, `delivery`, `ready_order`, `domain_event`), só duas unidades e dados totalmente sintéticos; roles dos testes têm concessões próprias, **não representam a identidade real da equipe**. Não há migration RLS pronta, autorização produtiva, análise completa de `handoff`, `rider_state`, `occurrence`, `public_outbox`, políticas de escrita de todos os schemas, `SECURITY DEFINER`, cadeia de pagamento ou conexão de produção.

**Gate seguinte:** revisar as escritas restantes com `USING`/`WITH CHECK` e desenhar migration/rollback revisáveis com roles de aplicação separadas, após provar identidade humana confiável. **Nenhum dado de loja deve ser escrito para acelerar um teste.**

## Contra-prova de escrita e vínculo entre unidades — demais entidades (15/10/2026)

**Resultado remoto [CI 38833710801](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38833710801): SUCCESS**, `ENTREGAS_REMAINING_WRITE_RLS_LAB: 45/45 PASS`. Execução inteiramente em PostgreSQL 16 efêmero sob socket UNIX privado do GitHub Actions. Uma tentativa anterior [38833620222](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38833620222) FALHOU porque a fixture de `handoff` omitira o obrigatório `courier_verified`; a fixture foi corrigida e o CI seguinte comprovou o resultado. Não esconder o primeiro estado `FAILED` nem interpretar aquela falha como incidente de loja.

**Arquivos:** `tests/product/run-entregas-remaining-writes-rls-lab-tests.ts` e etapa correspondente em `.github/workflows/deliveryos-operator-session-lab.yml`.

- **Novas entidades com `unit_id` direto:** `entregas.handoff`, `entregas.occurrence`, `entregas.rider_state` e `entregas.public_outbox`. No banco temporário, policies por role/unidade `FOR ALL ... USING (...) WITH CHECK (...)` restringiram leituras e `UPDATE` cruzados, impediram mudar `unit_id` de registro próprio e negaram `INSERT` alheio em `handoff` e `public_outbox`. `UPDATE` legítimo na unidade própria continuou permitido.
- **Falha de relacionamento provada:** somente `unit_id='ITAIM'` na policy de `occurrence` **não impediu** criar uma ocorrência própria com `trip_id` de uma viagem da Vila-Lab; analogamente, `rider_state.active_trip_id` permitiu apontar para uma viagem alheia. Essa primeira configuração reproduziu duas ligações cruzadas sintéticas antes da exclusão dessas fixtures.
- **Mitigação demonstrada:** policies adicionais de `occurrence` e `rider_state` passaram a requerer que `trip_id`/`active_trip_id` (quando não nulos) correspondam a `entregas.trip` **da mesma unidade e visível ao role**. Em Itaim e Vila-Lab, novas referências e atualizações cruzadas foram negadas, enquanto inserções legítimas de ocorrência própria continuaram aceitas.
- **Outbox ainda com obrigação aberta:** `entregas.public_outbox.event_id` **não tem FK declarada** nas migrations correntes. Este teste **não comprova** a proveniência/consistência do evento externo contido em `event`, nem que esse ID necessariamente venha de `entregas.domain_event`; o fluxo produtor/consumidor precisa ser mapeado antes de impor uma FK ou policy correlacionada.
- **Impacto de compatibilidade desconhecido:** políticas rígidas que exigem viagem existente podem bloquear estados órfãos/legados legítimos ou mudanças de estado assíncronas. Os testes usam duas unidades e fixtures sintéticas; nenhum fluxo real foi executado. Antes de promover para migration é obrigatório verificar a semântica e o ciclo de vida real de `active_trip_id` e `occurrence.trip_id`, o impacto de JOIN/RLS, índices, payloads e rollback.

**Fronteira:** são regras testadas temporariamente em cinco tabelas incluindo `entregas.trip`, sem alterar roles, policies ou dados do banco da loja. Não significam autorização multiusuário real, prova de navegador/IdP, aprovação humana, migração pronta ou implementação em produção. Próximo passo seguro: inspecionar o produtor da `public_outbox`, vínculos de `handoff` por referências externas e permissões de fontes antes de projetar RLS produtivo com rollback.

## Outbox pública: divergência entre colunas, JSON e origem (16/10/2026)

**Novo resultado em laboratório:** `tests/product/run-public-outbox-envelope-rls-lab-tests.ts`, com as mesmas travas de runner GitHub e socket PostgreSQL 16 privado: recusa alvos externos com código 78 e usa somente migrations e fatos sintéticos. [GitHub Actions 38854199569](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38854199569) terminou **SUCCESS — `ENTREGAS_PUBLIC_OUTBOX_ENVELOPE_LAB: 29/29 PASS`**, preservando `ENTREGAS_REMAINING_WRITE_RLS_LAB: 45/45 PASS` e as regressões anteriores.

**Risco reproduzido:** a definição oficial `entregas.public_outbox` tem `unit_id`, `event_id`, `idempotency_key` e JSON `event`, mas **não impõe igualdade entre coluna e envelope** nem FK de `event_id` para `entregas.domain_event`. Sob proprietário do banco descartável, um registro com coluna `unit_id='ITAIM'` e JSON `event.unit_id='VILA-LAB'` foi aceito; o teste executou `ROLLBACK`, portanto nenhum registro dessa tentativa permaneceu.

**Mitigação de consistência testada**, **não aplicada à aplicação**: roles separadas por unidade e policy RLS fixa `FOR ALL ... USING/WITH CHECK` exigiram igualdade entre `event.unit_id` e coluna `unit_id`, `event.event_id` e `event_id`, `event.idempotency_key` e `idempotency_key`, além de `event.source='entregas'`. Tanto inserção quanto UPDATE que divergiu foram negados, sem bloquear alteração legítima de `status`. Mesmo após mudança adversarial de GUC, a role não leu dados de outra unidade.

**Limite CRÍTICO demonstrado:** a própria role autorizada **ainda pôde inserir** um envelope coerente com `source_mode='real'` sem nenhum evento correspondente em `entregas.domain_event`. Logo, igualdade de JSON/colunas e `source='entregas'` são validação de **formato e consistência**, NÃO prova de que a fonte tenha emitido o evento e NÃO autorização para rotular eventos como reais. A prova executou somente em PostgreSQL efêmero; não indica incidente de loja.

**O contrato atual prevê sinais públicos não necessariamente derivados de um evento de domínio** (`buildSignalEvent` em `src/entregas/integration/public-event-builder.ts`). Portanto, adicionar indiscriminadamente `FOREIGN KEY (event_id) REFERENCES domain_event` pode quebrar sinais legítimos. Primeiro é obrigatório inventariar emissores e distinguir, com evidência verificável, eventos que exigem linhagem de domínio versus sinais independentes autorizados. O guardrail precisa validar a **autoridade da fonte** e o modo `real/simulated/control/UNKNOWN`, idealmente impedindo que o papel de leitura ou um cliente SQL arbitrário gere prova de observação real.

**Fronteira de autorização:** nenhuma migration, role, RLS, trigger ou emissor foi alterado no banco real. Falta integração com identidade humana autorizada, contrato de confiança dos produtores, atestação e testes adversariais de publicação/consumo ponta a ponta. **G0 laboratório PASS, origem real NO_GO.**

## Fronteiras de confiança críticas (AINDA NÃO RESOLVIDAS)
1. **Não existe login humano, IdP, assinatura externa, provedor autorizado, cookie emitido pela aplicação nem prova de navegador real.** A emissão de sessão recebe uma atestação propositalmente fictícia; isso prova lógica de sessão apenas. Não usar com dados pessoais.
2. **Nenhuma migration, política, credencial de banco ou sessão foi instalada** na aplicação ou em loja. O RLS temporário foi criado e destruído apenas no banco isolado. Nenhum merge/deploy/piloto.
3. **GUC customizada não é autoridade criptográfica: risco COMPROVADO por contraprova no CI.** O mesmo papel pôde alterar `deliveryos.unit_scope` e ler outra unidade no banco sintético. A mitigação com papéis RLS por unidade foi provada apenas em teste, ainda não integrada. Para produção, bloquear o desenho de GUC isolada e revisar proteção contra SQL injection, papéis, privilégios e isolamento de todas as tabelas.
4. **Pool do teste não é a conexão do produto real.** A demonstração usa `PgSqlClient` e SQL de teste, não o encadeamento completo da rota HTTP Product System. Falta integração transacional e revisão do papel real.
5. Escritas sintéticas em oito tabelas de domínio, com papéis e policies temporários, foram exercitadas; **escritas reais**, a proveniência da outbox, outras fontes/tabelas, CSRF, sessão humana, MFA, gestão de privilégios e revogação distribuída não foram homologadas.
6. G1 Gestor/Teknisa, G2 Home com dados factuais, G3 mesma Trip Android físico/TLS/PG/navegador e G4/G5 permanecem abertos.

**Próximo passo prioritário:** obter superfície de edição autorizada do autenticador e fonte legítima de identidade organizacional; construir integração específica com verificações de assinatura/issuer/audience, associação de unidade aprovada e transação SQL fail-closed. Submeter projeto/rollback RLS para revisão antes de qualquer alteração produtiva. Não promover os testes sintéticos a autenticação operacional.
