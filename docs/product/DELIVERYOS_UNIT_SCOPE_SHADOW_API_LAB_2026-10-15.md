# DeliveryOS — barreira de leitura por unidade, somente API local SHADOW

Data: 15/10/2026. Estado: **LAB_TEST_PASS / PILOTO_NO_GO**. Não há login humano nem deploy.

## Problema comprovado na base do PR #120
`DELIVERYOS_PRODUCT_READ_UNIT` só acrescentava a unidade ao seletor visual. A API aceitava `GET /api/entregas?unidade=VILA-LAB` e `GET /api/copiloto?unit_id=VILA-LAB` mesmo com Itaim selecionada. O teste histórico S8 usa duas unidades sintéticas e comprova que o recorte era de apresentação, não uma barreira de acesso.

## Proteção implementada sob opt-in, nunca default
O modo de laboratório só é habilitado quando **todos** os valores são válidos:
- `DELIVERYOS_PRODUCT_SCOPE_MODE=shadow_lab`;
- `DELIVERYOS_PRODUCT_SCOPE_UNIT=ITAIM` (exemplo sintético);
- `DELIVERYOS_PRODUCT_READ_UNIT=ITAIM` coincide com o escopo;
- `DELIVERYOS_PRODUCT_SCOPE_TOKEN` é uma credencial de 32 bytes codificada em 64 hex (fornecida pelo servidor de teste, nunca incluída no HTML/JS);
- `DELIVERYOS_DATABASE_URL` aponta para PostgreSQL da bancada;
- `CONFERENCE_BRAIN_DATA_DIR` e `TATA_READER_INSTALL_ROOT` estão ausentes, para não publicar stores de abrangência desconhecida.

Parâmetro parcial/inválido recusa o boot, em vez de cair silenciosamente no modo sem proteção. A instância mantém `127.0.0.1` como binding da porta.

Todas as rotas `/api/*` exigem **Bearer** correspondente antes de qualquer resposta. A verificação compara o token em tempo constante; o valor não aparece na interface nem nos logs. Com credencial correta, somente `/api/health`, `/api/entregas` e `/api/copiloto` estão na allowlist. Consultas cruzadas, parâmetros de unidade duplicados, rotas auxiliares (fonte, histórico, Operação Viva, navegação, store) recebem **403**, sem tentar ler esses dados.

O servidor fixa `unit_id` ANTES de chamar a porta de Entregas; sem `unit_id` informado pelo navegador, usa a unidade do ambiente, nunca “todas”. A porta existente recebe `unit_id` para aparelhos e projeções. No modo SQL recortado, `historico_sem_modo` conta apenas fatos da unidade selecionada. Se esse histórico legado local existir, a leitura é marcada indisponível; não se transforma ausência de modo em dado confiável. O default sem opt-in continua **exatamente como antes** — somente localhost de demonstração, não protegido por esta nova opção.

## Prova remota observada
Branch de laboratório `test/deliveryos-scoped-api-lab-20261015`.
**[GitHub Actions 38772038204](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38772038204) = SUCCESS**, PostgreSQL 16 próprio do runner com socket UNIX isolado, sem TCP público, e cleanup `pg_ctl stop`.

- `ESCOPO_API_SHADOW_CONTRACT=PASS`: configuração incompleta recusada, tokens errados/ausentes = 401, unidade/rota cruzada = 403.
- `ENTREGAS_SERVIDOR_PG: 8/8 PASS`, incluindo S10: banco isolado com Itaim e Vila-Lab; com token sintético autorizado retornou apenas Itaim; nomes, viagens e identidades sintéticas da Vila-Lab não apareceram nos JSONs de Entregas ou Copiloto; GETs diretos cruzados recusados; banco sem mutação.
- `npm run build:platform` e `npx tsc --noEmit` passaram; regressões Product System passaram.
- Primeiro CI `38771837933` falhou **antes da prova de banco** porque o runner não tinha `tsx` como dependência local. Foi corrigido com instalação versionada `tsx@4.23.15` apenas no runner, sem modificar o lockfile. Não apresentar o primeiro run como falha do controle de unidade.

## Prova ampliada — filtro SQL antecipado (15/10/2026)

- **Correção no código:** `lerFatosParaReplayNaTransacao` ganhou argumento opcional de unidade. A porta de Entregas passa `unit_id` a esse leitor Q-016, mantendo comportamento global apenas quando não houver unidade; `identity.device`, `gps_batch_received` mais recente e contagens por aparelho aplicam `WHERE unit_id = $1` em SQL antes de entregar registros ao Node.
- **Leitor incremental Q-026:** o cursor de `platform.event_log` também recebe `AND unit_id = $2`; consultas GPS e contagens seguem o mesmo filtro. A decodificação do envelope continua canônica. Não cria segundo decodificador.
- **Prova adversarial S11:** para cada um dos leitores, um adaptador instrumentado executa consultas sobre PostgreSQL com duas unidades sintéticas, registra SQL e parâmetros e exige escopo de unidade em **todas** as três consultas de `platform.event_log` e na consulta de `identity.device`, com dados devolvidos somente para Itaim e sem escrita. Essa é prova de cláusula de consulta aplicada e isolamento HTTP nos testes — **não** uma política de RLS.
- **CI específico [38778604797](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38778604797) SUCCESS:** `ENTREGAS_SERVIDOR_PG: 9/9 PASS`, incluindo S10 (HTTP 401/403 e nenhuma resposta da Vila-Lab) e S11 (filtro SQL anterior à materialização no canônico + incremental); guarda de configuração PASS. PostgreSQL efêmero, sem acesso operacional.
- **CI completo [38778604862](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38778604862) SUCCESS**: 31 passos e zero falhas, após build, navegador, acessibilidade, PostgreSQL, produto e governança na mesma HEAD de código `7ca1b8562deb416b2bd4c7c55f6e2e8bb097f2d4`.
- **Limite formal:** SQL `WHERE unit_id` em leitores auditados **não** restringe permissões do papel do banco; RLS/roles e autenticação humana confiável continuam obrigatórios antes de piloto em rede. O legado pré-0003 local é próximo teste obrigatório.

## Limites NÃO resolvidos
1. **Não é login do operador.** O segredo é uma credencial do ambiente para API de bancada. Sem sessão de usuário confiável, controle de papéis, expiração e proxy autorizado, nenhum humano terá acesso produtivo. A UI atual não recebe nem deve receber esse token por JavaScript; a navegação em modo restrito não foi homologada.
2. **O modo SHADOW passa `WHERE unit_id` ao SQL antes de materializar eventos, lotes e contagens** nos leitores canônico e incremental. Esse teste confirma filtro de consulta, **NÃO RLS ou privilégio PostgreSQL segregado**: o cliente do servidor ainda pode executar outras queries fora dessas portas, pois o papel do banco não tem restrição por tenant. Para produção, aplicar política/role do banco e auditar todas as portas.
3. Ainda falta exercício adversarial do legado **da própria unidade** com `historico_sem_modo > 0`. A migration 0003 mantém colunas nulas em linhas pré-existentes, mas sua restrição `NOT VALID` impede inserir novas linhas nulas normalmente; um teste de legado precisa simular um banco migrado com fatos pré-0003, não falsificar fonte real.
4. `/api/home` permanece demonstração e é **negada nesse modo API restrita**. Nenhuma informação de pedido, Gestor/iFood ou saúde de loja foi liberada.
5. Não há TLS, autorização externa, aparelho físico nem piloto. PR #120 continua DRAFT; segurança de produção NO_GO. A melhoria deve ser revisada adversarialmente antes de merge.

## Próxima prova material
Revisar autenticador humano confiável/sessão curta, testar caso legado/corrupção, aplicar RLS ou papel PostgreSQL realmente restrito por unidade e validar consultas sob esse papel em testes negativos; depois ensaio integrado e piloto autorizado. Não abrir proxy nem compartilhar credencial com frontend por atalho.
