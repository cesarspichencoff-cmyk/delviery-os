# Relatório da inteligência de atendimento — Mudança 004

## Resultado

A Mudança 004 transforma o feedback humano da rodada V1 em uma camada
determinística de inteligência de atendimento. O motor passou a buscar
conhecimento aplicável antes de recorrer a fallback, selecionar fatos e
procedimentos com fonte explícita, escolher um playbook e produzir resposta
direta, orientação, ação observável ou pergunta mínima.

Isto é um aceite técnico. A nova voz ainda precisa ser homologada por César.

## Diagnóstico e pesquisa

Foram consolidadas 50 avaliações individuais, 46 comparações cegas e três
feedbacks do Atendimento Livre. A nota média anterior foi 2,86/5. Os padrões
dominantes foram resposta robótica, informação disponível não utilizada,
acolhimento insuficiente e perguntas que não avançavam a situação.

A pesquisa operacional usou fontes oficiais para os fluxos do iFood, segurança
dos alimentos e urgência em saúde, além de literatura acadêmica sobre
recuperação de serviço. Quando as páginas oficiais do iFood divergiram entre 10
e 15 minutos, nenhum limiar foi transformado em regra.

## Arquitetura aplicada

- matriz de cobertura: 52/52 intenções;
- playbooks: 16 contratos versionados;
- busca: fatos do Engine, fatos públicos confirmados, conhecimento relacionado
  e procedimentos oficiais;
- Response Plan V2: necessidade, resposta direta, candidatos, seleção,
  rejeições, fontes, playbook, modo de ação, orientação de canal, direção,
  perguntas e limites;
- composição: informação específica antes de fallback genérico;
- validação: links, números, promessas, causalidade, diagnóstico, repetição,
  perguntas obrigatórias e qualidade de serviço;
- gates independentes: `available_knowledge_unused` e
  `humanized_but_unhelpful`.

## Antes e depois

O artefato comparativo alinha os mesmos 50 casos e 56 turnos. Houve mudança
controlada em 47 turnos. A comparação não incorpora notas ou comentários
privados. Cada linha registra somente fingerprints sintéticos, textos do corpus,
playbook, modo de ação e resultado dos gates.

Exemplos de refinamento:

- fatos confirmados de criança, pagamentos, cardápios e experiências deixam de
  cair em fallback genérico;
- reserva com autosserviço disponível recebe o caminho aplicável sem pergunta
  incompatível;
- item faltando recebe direção de canal e preserva o item conhecido;
- iFood recebe procedimento oficial sem culpa ou promessa de reembolso;
- segurança alimentar recebe tom sério, orientação de saúde quando necessária,
  zero diagnóstico, causalidade, promoção ou emoji;
- elogio recebe reconhecimento concreto em vez de saída vazia.

## Corpus V2

- 50 casos anteriores e 8 casos inéditos;
- 64 turnos;
- validação final: 64/64;
- uso de conhecimento: 64/64;
- utilidade e direção: 64/64;
- acessos externos: zero;
- drivers reais: zero;
- texto bruto persistido: zero;
- hash do corpus:
  `e54171b06305c488c5a9eadd87215eb86395c4af4ac57c5d7a38752cd2d0429a`;
- hash das métricas:
  `5fb8089e3d28986463f3ef779021fb92d4f7789a0fb3b18bc7507cd71e8fe783`;
- hash antes/depois:
  `b586fee6400dd130687b7b4a73684caea1ea6b63443ad9c55ae1f7de32bd1710`.

## Controles negativos

As 14 mutações ficaram vermelhas: busca ampla desligada, primeiro fato apenas,
playbook removido, direção removida, empatia vazia, ação inventada, culpa da
plataforma, reembolso prometido, segurança tratada como qualidade simples,
canal ignorado, pergunta repetida, contexto perdido, resposta direta omitida e
informação não confirmada.

## Certificação

- Conversation Native: 329/329;
- catálogo: 200/200;
- privacidade: aprovada, com controle positivo;
- TATA-SC-194: aprovado;
- contexto, recuperação e oráculo direcionados: 27/27;
- painel Node e corpus: 15/15;
- Playwright em Chrome: 11/11;
- controles negativos do painel: 12/12 vermelhos;
- Conference Brain combinado: 350/350;
- PRESENCE.CONFLICT: 1/1;
- Live: 243/243;
- Capacidade Viva: 43/43;
- Copiloto: 53/53;
- cardápio: 199 itens;
- fonte histórica: 16/16.

A primeira invocação combinada do Conference Brain omitiu
`DELIVERYOS_AUDIT_TARGET_ROOT` e falhou no bootstrap de um teste independente.
A mesma suíte foi repetida com a raiz explícita e terminou 350/350. Não houve
mudança de código ou expectativa para obter o resultado.

## Limitações

- qualidade subjetiva continua pendente da nova homologação de César;
- concorrência multiprocesso permanece não homologada;
- produção, provider generativo e integrações reais permanecem bloqueados;
- os votos e comentários humanos continuam privados, fora do Git;
- fatos institucionais não confirmados continuam desconhecidos.
