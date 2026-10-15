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

O servidor fixa `unit_id` ANTES de chamar a porta de Entregas; sem `unit_id` informado pelo navegador, usa a unidade do ambiente, nunca “todas”. A porta existente recebe `unit_id` para aparelhos e projeções. Se houver `historico_sem_modo` global positivo, a leitura é marcada indisponível, pois não há base para atribuir essa contagem à unidade. O default sem opt-in continua **exatamente como antes** — somente localhost de demonstração, não protegido por esta nova opção.

## Prova remota observada
Branch de laboratório `test/deliveryos-scoped-api-lab-20261015`.
**[GitHub Actions 38772038204](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38772038204) = SUCCESS**, PostgreSQL 16 próprio do runner com socket UNIX isolado, sem TCP público, e cleanup `pg_ctl stop`.

- `ESCOPO_API_SHADOW_CONTRACT=PASS`: configuração incompleta recusada, tokens errados/ausentes = 401, unidade/rota cruzada = 403.
- `ENTREGAS_SERVIDOR_PG: 8/8 PASS`, incluindo S10: banco isolado com Itaim e Vila-Lab; com token sintético autorizado retornou apenas Itaim; nomes, viagens e identidades sintéticas da Vila-Lab não apareceram nos JSONs de Entregas ou Copiloto; GETs diretos cruzados recusados; banco sem mutação.
- `npm run build:platform` e `npx tsc --noEmit` passaram; regressões Product System passaram.
- Primeiro CI `38771837933` falhou **antes da prova de banco** porque o runner não tinha `tsx` como dependência local. Foi corrigido com instalação versionada `tsx@4.23.15` apenas no runner, sem modificar o lockfile. Não apresentar o primeiro run como falha do controle de unidade.

## Limites NÃO resolvidos
1. **Não é login do operador.** O segredo é uma credencial do ambiente para API de bancada. Sem sessão de usuário confiável, controle de papéis, expiração e proxy autorizado, nenhum humano terá acesso produtivo. A UI atual não recebe nem deve receber esse token por JavaScript; a navegação em modo restrito não foi homologada.
2. **Não há isolamento de linha obrigatório no banco.** O leitor de replay canônico ainda pode carregar eventos de outras unidades em memória antes do recorte da projeção. A prova é de isolamento **das respostas HTTP**, não de RLS/PostgreSQL nem de separação entre processos/tenants. Antes de acesso multiusuário, colocar `WHERE unit_id` com garantias em todas as leituras ou configurar usuário de banco com política equivalente, e repetir ensaios adversariais.
3. Não foi exercitado legacy global `historico_sem_modo > 0` com dados reais. A guarda fail-closed existe, mas exige teste específico antes de afirmar cobertura integral desse caminho.
4. `/api/home` permanece demonstração e é **negada nesse modo API restrita**. Nenhuma informação de pedido, Gestor/iFood ou saúde de loja foi liberada.
5. Não há TLS, autorização externa, aparelho físico nem piloto. PR #120 continua DRAFT; segurança de produção NO_GO. A melhoria deve ser revisada adversarialmente antes de merge.

## Próxima prova material
Revisar autenticador humano confiável/sessão curta, fixação de unidade no servidor e isolamento de leitura **no PostgreSQL**, testar caso legado/corrupção e permissões de outras unidades, depois CI integrado e piloto autorizado. Não abrir proxy nem compartilhar credencial com frontend por atalho.
