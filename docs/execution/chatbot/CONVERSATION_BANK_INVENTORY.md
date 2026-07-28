# Inventário do banco conversacional

## Resumo verificável

| Componente | Quantidade | Fonte canônica |
|---|---:|---|
| Intenções operacionais | 52 | `INTENT_ENTITY_CATALOG_V1.json` |
| Intenções cobertas pelo oráculo de cenários | 51 | `SCENARIO_CATALOG_V1.json` e testes de isolamento |
| Intenção operacional externa ao oráculo | 1 (`event.oke_pickup`) | catálogo operacional |
| Capacidades | 39 | `CAPABILITY_MATRIX_V1.json` |
| Blocos legados | 35 | `flows.v0.json` |
| Regras inegociáveis | 12 | `rules.v0.json` |
| Entidades | 25 | `INTENT_ENTITY_CATALOG_V1.json` |
| Níveis de escalonamento | 5 (`E0`–`E4`) | `ESCALATION_POLICY_V1.json` |
| Filas humanas | 5 | `ESCALATION_POLICY_V1.json` |
| Cenários sintéticos | 200 em 80 arquétipos | `SCENARIO_CATALOG_V1.json` |

Os catálogos operacionais carregados pelo runtime não incluem o catálogo de
cenários. O oráculo é lido pelo simulador, não pelo Engine em produção
simulada.

## Áreas, acesso atual e lacunas

| Área | Intenções/contratos | Dados e cenário | Resposta atual | Painel atual | Cobertura | Lacuna observada | Fonte |
|---|---|---|---|---|---|---|---|
| Informações da unidade | `information.address`, `information.hours` | endereço e horários confirmados; feriado é lacuna conhecida | informa fatos regulares; em incerteza pode cair no fallback genérico | mostra classificação e resposta após cenário/mensagem | catálogo + HREV-001–005 | feriado desconhecido perde a explicação específica no HREV-003 | catálogo público, Engine |
| Cardápio | `information.menu`, `menu.read` | três links públicos e cardápio local | entrega referência conhecida ou preserva incerteza | não oferece navegador próprio do banco de cardápio | catálogo + HREV-011–015 | riqueza do catálogo não fica navegável por assunto no painel | catálogo público |
| Pagamentos | `information.payment` | meios confirmados | resposta curta e factual | só aparece após consulta | HREV-016–017 | pouca contextualização; não há exploração por bandeira | catálogo público |
| Rolha e valet | `information.corkage`, `occurrence.valet` | taxas confirmadas | valores corretos e concisos | resultado em timeline | HREV-018–019 | conhecimento existe, mas não há índice visual de fatos | catálogo público |
| Reservas | `reservation.create`, `reservation.update` | link, tolerância e dependência de retorno | não confirma sem resultado; repete estrutura em consultas próximas | cenário e execução simulada | HREV-006–007, 010 | respostas seguras, porém muito semelhantes | políticas, catálogo público |
| Fila | `waitlist.create`, `waitlist.read` | link, prazo de chamada e estados | preserva ausência de confirmação | estado aparece após execução | HREV-008–009 | banco de estados não é explorável diretamente | políticas, catálogo público |
| Salão | `occurrence.dining_room` | ocorrência e handoff | rota operacional | timeline/CRM depois do evento | catálogo | pouca representação autônoma no corpus e no painel | catálogo de intenções |
| Grupo grande (R05) | `reservation.large_group` | `party_size`, nome e chegada | reconhece acima de oito e pergunta campos ausentes | classificação e handoff | HREV-038–040 | frase de preparação ainda pode soar conclusiva sem ação | Engine, R05 |
| Oke | `event.oke_pickup` | horário, link e regras públicas | intenção operacional própria | não está entre os 200 cenários do oráculo | HREV-037 | principal área existente no Engine e subexposta no painel/catálogo de cenários | catálogo operacional |
| Delivery próprio | `order.status`, capacidades `order.*`/`delivery.*` | link e limites públicos | informa ou solicita evidência | cenário/manual | HREV-021, 023–025 | várias capacidades são visíveis só após uma execução | catálogos |
| iFood | `order.status` e ocorrências | suporte deve ocorrer no pedido; sem acesso real | orienta sem fingir acesso | simulado | HREV-022, 024, 027 | resposta pode omitir o item concreto já relatado | catálogo público |
| Pedidos | status, alteração, cancelamento | referência pseudônima, canal e timeline | roteia com segurança | CRM e timeline | HREV-024–030 | o painel não oferece mapa das capacidades de pedido antes do uso | catálogos |
| Itens/O02 | quatro intenções de divergência | item, quantidade, personalização, ocorrência | coleta campos mínimos e não compensa | caso/handoff | HREV-026–030 | item já conhecido some em HREV-026/027 | Engine, O02 |
| Atrasos e entrega | preparação, coleta, rota, entregador | estados e freshness | evita prazo sem evidência | driver/resultado na execução | catálogo de cenários | distinções internas não têm visão comparativa no painel | catálogos |
| Qualidade | aparência, sabor, frescor e temperatura | ocorrência + evidência | conserva caso aberto | timeline/handoff | HREV-031–035 | fallback uniforme reduz a referência concreta ao relato | políticas |
| Segurança alimentar | alergênico, corpo estranho, sintomas | E3/E4, dados restritos, proibições médicas | não diagnostica nem admite causalidade | filas e evidência | HREV-031–035 | segurança está forte, mas acolhimento é pouco diferenciado | protocolo/políticas |
| Elogio e sugestão | `feedback.praise`, `feedback.suggestion` | registro sem risco alto | resposta curta | classificação após mensagem | HREV-047 | elogio recebe pouca riqueza relacional | catálogo |
| Privacidade | opt-out, acesso e correção | consentimento e minimização | bloqueia exposição de dados | eventos sanitizados | HREV-048, 050 | política existe, mas não há visão dedicada no painel | política/catálogo |
| Multiturno | contexto, correção e dois casos | CRM append-only e entidades versionadas | preserva pedido/canal; ainda perde item em alguns turnos | timeline e CRM | HREV-041–045 | continuidade estrutural melhor que continuidade linguística | Runtime/CRM |
| Handoff e falhas | `handoff.failure`, E1–E4, cinco filas | estado confirmado, fallback e saúde do driver | não declara transferência sem evidência | handoff/timeline | HREV-049 + cenários | catálogo rico, mas painel não mostra matriz completa de autoridade/filas | escalonamento |
| Falhas simuladas | timeout, retry, reinício, driver degradado, conflito | 200 cenários determinísticos | mensagem depende do resultado observado | cenário, replay, reset, relógio | suíte nativa | conteúdo é acessível por cenário, não como banco explicável | simulador |

## O que o Engine conhece e o painel não torna claramente acessível

O servidor do painel expõe os 200 cenários, triagem manual, snapshot, drivers,
relógio, replay e reset. Ele não possui endpoints de consulta direta para:

- as 52 intenções e suas famílias;
- as 39 capacidades e autoridades;
- os 35 blocos e 12 regras;
- as 25 entidades e respectivas classes de privacidade;
- a matriz completa de escalonamentos, filas e políticas;
- os fatos públicos organizados por domínio;
- a intenção `event.oke_pickup` como cenário do oráculo.

Isso explica parte da diferença entre riqueza estrutural e percepção: o banco
existe no Engine e nos contratos, mas o usuário vê uma resposta por vez e uma
lista de cenários, não um mapa do conhecimento já disponível. Esta constatação
não autoriza ampliar o painel na Mudança 001.
