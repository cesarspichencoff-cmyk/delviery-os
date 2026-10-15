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

## Fronteiras de confiança críticas (AINDA NÃO RESOLVIDAS)
1. **Não existe login humano, IdP, assinatura externa, provedor autorizado, cookie emitido pela aplicação nem prova de navegador real.** A emissão de sessão recebe uma atestação propositalmente fictícia; isso prova lógica de sessão apenas. Não usar com dados pessoais.
2. **Nenhuma migration, política, credencial de banco ou sessão foi instalada** na aplicação ou em loja. O RLS temporário foi criado e destruído apenas no banco isolado. Nenhum merge/deploy/piloto.
3. **GUC customizada não é autoridade criptográfica: risco COMPROVADO por contraprova no CI.** O mesmo papel pôde alterar `deliveryos.unit_scope` e ler outra unidade no banco sintético. A mitigação com papéis RLS por unidade foi provada apenas em teste, ainda não integrada. Para produção, bloquear o desenho de GUC isolada e revisar proteção contra SQL injection, papéis, privilégios e isolamento de todas as tabelas.
4. **Pool do teste não é a conexão do produto real.** A demonstração usa `PgSqlClient` e SQL de teste, não o encadeamento completo da rota HTTP Product System. Falta integração transacional e revisão do papel real.
5. Efeito de novos writes, CSRF, logs de sessão, autenticação MFA, gerenciamento de privilégios e revogação distribuída não foram exercitados.
6. G1 Gestor/Teknisa, G2 Home com dados factuais, G3 mesma Trip Android físico/TLS/PG/navegador e G4/G5 permanecem abertos.

**Próximo passo prioritário:** obter superfície de edição autorizada do autenticador e fonte legítima de identidade organizacional; construir integração específica com verificações de assinatura/issuer/audience, associação de unidade aprovada e transação SQL fail-closed. Submeter projeto/rollback RLS para revisão antes de qualquer alteração produtiva. Não promover os testes sintéticos a autenticação operacional.
