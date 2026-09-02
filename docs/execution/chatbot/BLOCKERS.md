# Bloqueadores e limitações

## Bloqueadores locais

Nenhum ao término técnico da Mudança 004.

## Bloqueadores externos

- nova homologação humana da experiência refinada ainda pertence a César;
- produção permanece fora de escopo.

## Limitações conhecidas

- concorrência multiprocesso do simulador não está homologada;
- `npm ci` informa uma vulnerabilidade alta preexistente em `xlsx@0.18.5`;
- métricas de acolhimento e secura são heurísticas, não verdade objetiva.
- o validador oficial dos skills em Python ficou `N/A` porque `PyYAML` não está
  instalado e esta mudança proíbe adicionar dependências; a estrutura foi
  validada por Node nativo e por testes prospectivos independentes.
- o Playwright de navegador é uma ferramenta de desenvolvimento instalada sem
  alterar manifesto ou lockfile; o caminho do Chrome deve ser informado no
  ambiente de teste.

## Trabalho preservado

A branch local `feature/conversation-native-deliveryos-humanized-v1` foi concluída separadamente em `1b914c10ead99849dbde34810aec5a73d37bb739`. Ela não é ancestral da Mudança 001 e não será mesclada silenciosamente.

## Dados pendentes e dívidas aceitas

Nenhum dado real é necessário para o corpus sintético. Políticas ou fatos institucionais não confirmados continuam desconhecidos.

## Mudança 002

Os cinco gaps do baseline foram corrigidos ou classificados com fallback
explícito. Não há falha silenciosa restante no corpus, mas a aprovação humana da
voz continua pendente e não bloqueia a homologação técnica.

## Mudança 004

Os 50 votos V1 foram preservados e a rodada V2 está tecnicamente pronta.
Qualidade subjetiva e aprovação final da experiência refinada continuam
desconhecidas até a nova homologação de César. Produção, provider generativo,
integrações reais e concorrência multiprocesso permanecem fora de escopo.

## Mudança 005

Não há bloqueio técnico para iniciar a homologação humana local. Permanecem bloqueios para piloto/produção:

- nenhum vencedor humano: `human_winner=null`;
- computador do restaurante ainda não passou pelo Doctor;
- hospedagem real não foi identificada nem conectada nesta branch;
- Qwen3 4B ainda usa fallback em 10/260 casos e teve máximo de 17,0 s em CPU;
- Qwen3 1.7B usa fallback em 43/260 casos;
- aceleração CUDA não foi homologada;
- concorrência multiprocesso segue não homologada;
- endpoint, unidade e código de instalação reais não existem nesta execução.

Nenhum desses pontos autoriza escolher o menos ruim, ativar clientes ou instalar no restaurante.

## Mudança 005B

Não houve bloqueio de proveniência ou runtime, mas nenhum candidato novo passou
o gate técnico completo:

- Gemma 4 E4B foi executado e não se qualificou: Writer 292/292, mas Director
  apenas 2/8 e p95 de 30,47 s;
- Qwen3.5 4B foi executado e não se qualificou: Writer 289/292, mas Director
  apenas 2/8 e p95 de 26,83 s;
- o GGUF do Qwen3.5 é conversão secundária e não pode ser promovido sem nova
  decisão de distribuição;
- Gemma 4 12B permaneceu opcional e não passou o Doctor: máquina classificada
  como intermediária e modelo fora da lista compatível certificada;
- nenhum candidato pode ser chamado de vencedor antes do voto de César.

Como não existe candidato técnico novo, não há rodada humana a abrir nesta
mudança. O baseline e o instalador anterior permanecem disponíveis e imutáveis.

Limitação de QA herdada: `conversation-native:test` inclui um teste que executa
o gerador de respostas contra dois artefatos rastreados. A suíte passou 523/523,
mas deixou esses arquivos modificados; eles foram restaurados byte a byte e a
homologação isolada passou 31/31. A correção do isolamento pertence a mudança
separada e não altera o veredito dos modelos.

## Mudança 006

Não há bloqueador técnico para a homologação humana do Pattern Engine e dos
Writers. Permanecem limites deliberados:

- `human_winner=null`; nenhum Writer foi promovido;
- os dois Writers usam somente saídas locais já armazenadas da Mudança 005B;
  não houve nova inferência nem download de modelo;
- o catálogo de cardápio definitivo, a inteligência de recomendação e a
  separação validada por canal/unidade pertencem à Mudança 008;
- CRM completo, importações reais e Customer Intelligence pertencem à Mudança
  007;
- gateway real de WhatsApp permanece bloqueado, inclusive quando custo ou
  política forem desconhecidos;
- qualquer operação com custo externo diferente de zero, desconhecido ou com
  cobrança futura está bloqueada;
- computador do restaurante, hospedagem real e concorrência multiprocesso
  continuam não homologados.

Limitação de QA herdada mantida: a suíte Conversation passou 600/600, mas o
teste gerador ainda reescreve dois artefatos rastreados; eles foram novamente
restaurados byte a byte antes do fechamento.

## Fontes reais de cardápio + Writer local final

Não há bloqueio de artefato ou runtime para o Writer local: llama.cpp b10172 e
Gemma 4 E4B foram verificados pelos hashes aprovados e executados no painel.

Permanecem bloqueios deliberados para chamar o cardápio de real e homologado:

- 199 itens e 86 harmonizações aguardam curadoria humana;
- canal e unidade não estão confirmados nas propostas iniciais;
- preços, disponibilidade, alergênicos e contaminação cruzada permanecem
  desconhecidos quando a fonte não os confirma;
- iFood continua sem conteúdo inspecionado;
- preferências isoladas podem receber clarificação genérica do Pattern Engine;
- WhatsApp, hospedagem, produção e drivers reais continuam fora de escopo.

Nenhum desses pontos autoriza promover extração, fixture sintética ou inferência
do Writer a fato comercial.

## Correção pós-homologação humana 01

Não há bloqueador técnico conhecido para a segunda homologação humana local.
Permanece deliberadamente pendente a decisão de César sobre a qualidade da
experiência. Gemma pode ser rejeitado pelo gate e cair no compositor
determinístico; isso preserva a verdade, mas ainda deve ser avaliado por César
como experiência. WhatsApp, hospedagem, produção, drivers reais, curadoria
comercial e qualquer custo externo continuam bloqueados.

## Autonomous Experience Lab V1

Não há bloqueador técnico conhecido para uma nova avaliação humana livre. Os
hard gates, golden failures, duas seeds frescas abrangentes e a amostra das 20
famílias com Writer estão verdes.

Permanecem limites deliberados:

- `ADVISORY_NOT_INDEPENDENT` não equivale a aprovação humana;
- excelência, naturalidade e confiança final continuam dependentes de César;
- inferência Gemma completa 40+40 tem custo temporal local alto e não foi usada
  como condição única do gate;
- produção, WhatsApp, hospedagem, drivers reais, curadoria comercial e custo
  externo continuam bloqueados.

## B2 Minimal Architecture Proof V1

- `B2_TWO_SAFE_NON_PUBLICATIONS`: dois turnos foram bloqueados porque até os
  nomes das fixtures apareciam como linguagem interna; segurança preservada,
  experiência incompleta.
- `B2_INDEPENDENT_REVIEW_MISSING`: candidato, construtor e avaliação advisory
  pertencem à mesma sessão do Work.
- `B2_CONTEXT_EQUIVALENCE_NOT_PROVEN`: dois cenários compararam A com fatos reais
  disponíveis e B2 com fatos sintéticos desconhecidos.
- Impacto: impede `B2_ARCHITECTURE_VALIDATED`, mas não apaga a melhora observada.
- Correção futura mínima: uma única validação independente, com contexto
  equivalente e controle explícito dos gaps de publicação.

## B2 Overnight Autonomous Build & Proof

- `B2_PUBLICATION_GAPS_RESOLVED`: replay histórico passou 40/40 e os três
  controles direcionados do Writer/fallback publicaram sem silêncio.
- `B2_GENERALIZATION_NOT_INDEPENDENT`: as 30 conversas usaram planos fortes
  offline e sequência previamente roteirizada; não provam adaptação cognitiva
  em runtime.
- `B2_AB_IDENTITY_PARTLY_INFERABLE`: nomes artificiais e estilo tornaram A/B
  parcialmente reconhecível antes de abrir o selo.
- `B2_GEMMA_RECERTIFICATION_INCOMPLETE`: a repetição completa pós-gate terminou
  com crash local `1073807364`; não houve aprovação por amostra parcial.
- Impacto: bloqueia validação, robustez e pacote de migração; não bloqueia a
  preservação do protótipo B2 como hipótese promissora.

## Recovery pós-certificação B2

Não há bloqueador técnico conhecido para abrir o atendimento local ou entregar
o pacote targeted ao certificador independente.

Permanece um gate externo deliberado:

- integração de produto continua bloqueada até a recertificação independente
  das 23 unidades congeladas;
- produção, WhatsApp, deploy, drivers reais e gasto externo não foram
  autorizados nem executados.
