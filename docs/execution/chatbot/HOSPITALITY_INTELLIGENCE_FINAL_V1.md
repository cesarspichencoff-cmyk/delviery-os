# Hospitality Intelligence e catálogo público certificado V1

## Estado da entrega

Esta mudança amplia o caminho já existente do produto. Ela não cria outro motor conversacional:

`Pattern Engine → Journey State → contexto CRM/cardápio → Response Plan → Writer local ou compositor determinístico → validação pós-Writer → painel`

O estado técnico está pronto para curadoria e homologação humana. A expressão `EXPERIÊNCIA 10/10 HOMOLOGADA` não é produzida por código ou teste. Ela depende do voto de César, média humana mínima de 9 e aprovação dos fluxos centrais.

## Evidência pública importada

O arquivo `tools/conversation-crm/customer-menu/public-menu-evidence.v1.json` foi gerado do relatório externo de cobertura capturado em 1º de agosto de 2026. O relatório de origem possui SHA-256 `b63812ea7db5b55f1bfb035041e0a6e196b8f3e6fbdd7077859a39f548e3924e`.

| Fonte | Canal | Registros |
|---|---|---:|
| LiveMenu | salão | 268 |
| iFood | iFood | 158 |
| Total | separados por canal | 426 |

Cobertura conservadora dos 199 itens internos: 154 correspondências exatas, 16 variantes fortes, 10 casos para revisão humana e 19 não localizados. A união segura permite investigar 170 itens, mas não aprova nenhum item inteiro.

Campos públicos extraídos:

- nome: 426 `confirmed_public`;
- categoria: 426 `confirmed_public`;
- descrição: 291 `confirmed_public` e 135 `unknown`;
- quantidade: 113 `confirmed_public` e 313 `unknown`;
- preço: 426 `confirmed_public`, sempre associado a canal, unidade, variante e captura;
- alergênicos, contato cruzado, adaptações, substituições, disponibilidade atual e harmonizações: protegidos como desconhecidos até revisão específica.

O inventário contém 83 registros envolvidos em correspondências nominais entre canais e 81 registros com preço divergente. Esses números são facetas de revisão, não equivalência nem autorização de publicação. O relatório original mantém 35 pares exatos não ambíguos entre canais, dos quais 34 têm preço diferente.

## Curadoria por campo

Estados aceitos por campo:

- `confirmed_public`;
- `confirmed_internal`;
- `human_approved`;
- `inferred`;
- `unknown`;
- `conflicting`;
- `outdated`;
- `rejected`.

Estados do item:

- `extracted`;
- `under_review`;
- `approved_for_information`;
- `approved_for_recommendation`;
- `blocked`;
- `conflicting`;
- `outdated`.

A revisão em lote exige origem, canal e unidade homogêneos, seleção explícita, prévia com hash e confirmação humana final. O lote é limitado a 100 registros e somente pode decidir nome, categoria, descrição, quantidade e preço visíveis.

São proibidos em lote: alergênicos, contato cruzado, adaptações, substituições, disponibilidade e harmonizações. `approved_for_recommendation` também é proibido em lote. A aprovação individual para recomendação exige características e compatibilidades permitidas, confirmação de conflitos verificados e preservação de restrições.

Nenhum registro está aprovado automaticamente. No estado versionado da branch há 0 itens aprovados para informação, 0 itens aprovados para recomendação e 0 harmonizações humanas aprovadas. Por isso, o catálogo sintético continua isolado e seus nomes não são apresentados como produtos reais na conversa.

## Hospitality Intelligence

O contrato `deliveryos-hospitality-context-v1` acumula, de forma determinística:

- ocasião;
- canal e unidade;
- número de pessoas;
- orçamento;
- familiaridade com a experiência;
- ingredientes preferidos e excluídos;
- preferências de sabor, textura e preparo;
- restrições alimentares e alergias;
- experiência desejada;
- fatos confirmados e perguntas não resolvidas.

Os contextos reconhecidos incluem primeira visita, descoberta de cardápio, refeição rápida, jantar romântico, celebração, grupo, família, almoço de negócios, delivery, orçamento, experiência especial, preferência tradicional ou diferente, refeição leve, conforto, bebida, restrição e orientação preventiva de alergia.

Preferências isoladas como “mais leve”, “maçaricado”, “tradicional”, “diferente”, “sem fritura”, “sem cream cheese”, “mais em conta”, “para compartilhar”, “algo pequeno” e “estou com bastante fome” atualizam o estado sem reiniciar a jornada. Correções posteriores substituem apenas o aspecto corrigido.

O contexto de recomendação nunca cria uma ocorrência ou ação operacional por erro de classificação. Sinais reais de ocorrência, incluindo item faltando e incidente alimentar, suspendem a orientação de cardápio e permanecem sob R05, O02 e protocolos existentes.

## Catálogo, recomendação e segurança

O mecanismo preserva canal e unidade e retorna no máximo três opções. Uma opção indisponível ou stale é excluída; disponibilidade desconhecida gera aviso. As razões da recomendação permanecem estruturadas e não viram alegações de popularidade ou segurança.

Enquanto não houver itens reais aprovados, a resposta informa de forma natural que ainda não há opções daquele canal revisadas o bastante para uma indicação segura. IDs e candidatos sintéticos ficam apenas no diagnóstico posterior ao voto. Harmonizações sintéticas também não são publicadas ao cliente.

Alergia declarada é uma restrição preventiva. Ela não vira incidente sem evidência de consumo ou reação. A resposta declara que composição e contato cruzado precisam de confirmação da equipe. Um incidente ou urgência continua no protocolo operacional existente, sem diagnóstico ou causalidade inventada.

## Writer e gate de publicação

Gemma 4 E4B permanece exclusivamente como Writer local. O Writer recebe o envelope aprovado, não escolhe fatos, item, canal, ação ou pergunta. O gate pós-Writer valida fatos, links, números, tópicos, ação e direção antes da publicação.

Uma saída que introduza assunto não autorizado é rejeitada com motivo específico e substituída pelo compositor determinístico. O compositor usa a orientação aprovada de hospitalidade antes de qualquer fallback ambíguo e nunca abre ação operacional a partir dessa orientação.

Smoke real local em 2 de agosto de 2026:

- artefatos Gemma disponíveis e certificados;
- runtime `llama.cpp b10172`;
- resposta publicada pelo Writer local;
- gate `deliveryos-writer-publication-gate-v1` aplicado;
- custo externo R$ 0,00.

## Homologação conversacional

O catálogo possui 20 conversas obrigatórias com quatro turnos cada. O executor percorre o endpoint real em `http://127.0.0.1:4179` e cria runtime temporário limpo.

Resultado técnico da prova de 80 turnos:

| Métrica | Resultado |
|---|---:|
| Conversas | 20 |
| Turnos | 80 |
| Erros | 0 |
| Fallbacks genéricos | 0 |
| Linguagem interna | 0 |
| Respostas com mais de uma pergunta | 0 |
| Perguntas repetidas | 0 |
| Verificações de contexto | 41/41 |
| Preservação de contexto | 100% |

O painel mantém a conversa limpa. Pattern, Writer, fallback, fontes e diagnóstico ficam ocultos até o voto. A avaliação humana inclui compreensão, hospitalidade, contexto, ajuda à decisão, naturalidade, utilidade, segurança, disposição para enviar e nota de 0 a 10.

## Testes executados

- Conversation Native: 694/694;
- catálogo nativo: execução concluída com código 0;
- privacidade nativa: aprovado, controle positivo detectado e zero achado;
- TATA-SC-194: aprovado e sem sistema externo;
- Conference Brain: 314/314;
- Live: 243/243;
- Capacidade Viva: 43/43;
- Copiloto: 53/53;
- Playwright do painel: 11/11;
- cardápio e fonte histórica: aprovados;
- rota de hospitalidade: 20/20 conversas e 80/80 turnos.

## Execução local

Na raiz do projeto:

```powershell
npm run conversation-native:start
```

Abrir `http://127.0.0.1:4179`. O servidor aceita somente loopback e os drivers reais permanecem desativados.

Para repetir a prova determinística sem depender do Writer:

```powershell
node tools/conversation-crm/homologation/run-hospitality-route.js http://127.0.0.1:4179 <arquivo-de-evidencia.json> --self-host
```

## Limitações e gate humano

- a meta de 40 itens informativos, 20 recomendáveis, cinco bebidas e cinco harmonizações ainda depende de curadoria humana;
- disponibilidade atual, alergênicos, contato cruzado, adaptações e substituições continuam desconhecidos;
- 10 correspondências ambíguas e 19 itens não localizados exigem revisão;
- a inspeção visual automatizada passou, mas o voto visual e conversacional de César ainda não ocorreu;
- nenhum resultado automático concede “10/10”.

Não houve API paga, serviço externo, WhatsApp, hospedagem, importação de clientes reais, push, merge ou deploy.
