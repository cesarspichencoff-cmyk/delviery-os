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

## Fronteiras de confiança críticas (AINDA NÃO RESOLVIDAS)
1. **Não existe login humano, IdP, assinatura externa, provedor autorizado, cookie emitido pela aplicação nem prova de navegador real.** A emissão de sessão recebe uma atestação propositalmente fictícia; isso prova lógica de sessão apenas. Não usar com dados pessoais.
2. **Nenhuma migration, política, credencial de banco ou sessão foi instalada** na aplicação ou em loja. O RLS temporário foi criado e destruído apenas no banco isolado. Nenhum merge/deploy/piloto.
3. **GUC customizada não é autoridade criptográfica.** Um cliente que pode executar SQL arbitrário com o mesmo papel pode tentar definir `deliveryos.unit_scope` para outra unidade. A prova pressupõe SQL controlado pelo servidor após sessão verificada. Antes de produção, revisar ameaça de SQL injection e considerar papel por tenant / mecanismo de contexto protegido, com política de menor privilégio e banco que recusa dados sem depender de input controlável pelo cliente.
4. **Pool do teste não é a conexão do produto real.** A demonstração usa `PgSqlClient` e SQL de teste, não o encadeamento completo da rota HTTP Product System. Falta integração transacional e revisão do papel real.
5. Efeito de novos writes, CSRF, logs de sessão, autenticação MFA, gerenciamento de privilégios e revogação distribuída não foram exercitados.
6. G1 Gestor/Teknisa, G2 Home com dados factuais, G3 mesma Trip Android físico/TLS/PG/navegador e G4/G5 permanecem abertos.

**Próximo passo prioritário:** obter superfície de edição autorizada do autenticador e fonte legítima de identidade organizacional; construir integração específica com verificações de assinatura/issuer/audience, associação de unidade aprovada e transação SQL fail-closed. Submeter projeto/rollback RLS para revisão antes de qualquer alteração produtiva. Não promover os testes sintéticos a autenticação operacional.
