# Decisões — Mudança 001

## D-001 — Partir do conteúdo real com oráculo isolado

**Contexto:** a branch canônica `feature/conversation-native-deliveryos-real-content-v1` aponta para `26922b9` e descende de `04611f1`.

**Alternativas:** consolidar a branch humanizada; partir do estado canônico anterior à humanização.

**Decisão:** criar a Mudança 001 a partir de `26922b9`.

**Motivo:** medir o comportamento atual sem contaminar o baseline com a futura estratégia humanizada.

**Impacto:** a branch humanizada permanece preservada e separada.

**Reversibilidade:** total; nenhuma branch foi apagada ou reescrita.

## D-002 — Verificadores locais sem nova dependência

**Contexto:** a missão proíbe instalar ferramentas e exige controles negativos.

**Alternativas:** instalar framework de avaliação; usar Node nativo.

**Decisão:** usar `node:test`, runtime real e scripts CommonJS locais.

**Motivo:** reduz superfície, custo e risco, mantendo código de saída verificável.

**Impacto:** métricas heurísticas serão explicitamente separadas de fatos objetivos.

**Reversibilidade:** alta; os artefatos são autocontidos.

## D-003 — Hash ancorado no comportamento, não no commit documental

**Contexto:** a primeira versão do artefato incluía o HEAD corrente e mudava
quando somente documentação era commitada.

**Alternativas:** aceitar o hash volátil; remover toda proveniência; ancorar no
commit comportamental medido.

**Decisão:** registrar `26922b9` como `source_behavior_commit` e excluí-lo de
variações acidentais de HEAD.

**Motivo:** o mesmo comportamento e corpus devem produzir o mesmo artefato.

**Impacto:** duas execuções produziram arquivos idênticos byte a byte.

**Reversibilidade:** alta; a proveniência continua explícita.

## D-004 — Mudança 002 somente como especificação

**Contexto:** o baseline encontrou cinco lacunas de superfície e repetição
mensurável.

**Alternativas:** corrigir imediatamente; apenas preparar o próximo contrato.

**Decisão:** criar `SPEC`, `TASKS` e `ACCEPTANCE`, sem implementar humanização.

**Motivo:** preserva uma mudança por execução e permite gate de César.

**Impacto:** nenhuma resposta, decisão, política ou capacidade foi alterada.

**Reversibilidade:** total.

## D-005 — Reuso seletivo da branch humanizada anterior

**Contexto:** `1b914c10` contém uma tentativa anterior de perfil, estratégias,
compositor, validador, testes e painel.

**Alternativas:** fazer merge; copiar os arquivos; rejeitar tudo; reaproveitar
somente conceitos comprováveis.

**Decisão:** portar manualmente apenas variação por hash, orçamento de emoji,
consulta append-only para continuidade e evento sanitizado de rejeição.

**Motivo:** o código anterior altera o Engine, usa schema incompatível, consulta
`ideal_response` no validador e amplia o painel fora de escopo.

**Impacto:** a fundação da Mudança 001 permanece soberana.

**Reversibilidade:** alta; os novos módulos são isolados e testáveis.

## D-006 — Validação independente e recomposição sem texto bruto

**Contexto:** o store redige campos de texto por privacidade, mas o replay deve
devolver a mesma resposta.

**Decisão:** persistir somente o hash da entrada e recompor deterministicamente
a resposta quando o hash recebido coincide, sem reexecutar efeitos.

**Motivo:** concilia idempotência, privacidade e reprodutibilidade.

**Impacto:** resposta idêntica após reinício, um único efeito lógico e nenhum
conteúdo bruto novo no JSONL.

## D-007 — Métrica não substitui o gate humano

**Contexto:** o corpus comprova diversidade estrutural e segurança, mas não
prova preferência estética.

**Decisão:** publicar campos de avaliação vazios e reservar a aprovação da voz
TATÁ para César na Mudança 003.

**Motivo:** separar fato automatizado de julgamento humano.

**Impacto:** a Mudança 002 pode ser homologada tecnicamente sem afirmar
aprovação de experiência ou prontidão para produção.

## D-008 — Cegamento por contrato de transporte

**Contexto:** o artefato aprovado contém nomes de versões e dados técnicos.

**Decisão:** o bootstrap público recebe somente mensagens, respostas A/B,
categoria e identificador opaco. A ordem real e o detalhe técnico permanecem no
servidor e exigem voto persistido do caso correto.

**Impacto:** reload não altera a posição e inspeção visual pré-voto não revela
baseline, humanizada, intenção, estratégia ou oráculo.

## D-009 — Feedback privado fora do Git

**Decisão:** usar `%LOCALAPPDATA%\DeliveryOS\human-homologation` por padrão,
com raiz substituível por variável de ambiente e JSONL append-only.

**Motivo:** preservar progresso sem colocar votos, mensagens ou bancos locais
no repositório.

## D-010 — Comentário sensível falha antes do append

**Decisão:** recusar comentários com sinais de telefone, e-mail, CPF,
credencial, cookie, token, endereço pessoal ou referência de pedido.

**Motivo:** redigir depois da gravação ainda criaria uma janela de vazamento.

## D-011 — Playwright somente de desenvolvimento

**Decisão:** usar `@playwright/test@1.55.0` sem salvar dependência ou lockfile e
apontar explicitamente para um Chrome local no comando de teste.

**Impacto:** nenhuma dependência de produção foi alterada; o teste de navegador
continua reproduzível e falha fechado sem o caminho explícito.

## D-012 — Conhecimento selecionado antes do fallback

**Decisão:** pesquisar fatos operacionais, conteúdo público confirmado,
conhecimento relacionado e procedimentos oficiais antes de classificar um
fallback como legítimo.

**Motivo:** o feedback mostrou respostas genéricas mesmo quando o banco já
possuía informação aplicável.

**Impacto:** o Response Plan V2 registra candidatos, seleção, rejeições e fontes.

## D-013 — Dois gates independentes de qualidade de serviço

**Decisão:** separar `available_knowledge_unused` de
`humanized_but_unhelpful`, ambos fora do compositor.

**Motivo:** uma resposta pode soar acolhedora e ainda não responder nem orientar.

**Impacto:** 64/64 turnos refinados passam os dois gates e 14 mutações negativas
provam sensibilidade.

## D-014 — Re-homologação versionada

**Decisão:** preservar `humanized-ratings.jsonl` e gravar a rodada refinada em
`refined-ratings-v2.jsonl`.

**Motivo:** feedback anterior é evidência, não estado descartável.

**Impacto:** 43 casos críticos ou amostrais e oito inéditos podem ser
reavaliados sem alterar votos V1.

## D-015 — Sem limiar iFood inferido

**Decisão:** não hardcodar prazo de atraso a partir da pesquisa externa.

**Motivo:** páginas oficiais consultadas apresentaram referências de 10 e 15
minutos em contextos diferentes.

**Impacto:** o chatbot orienta o fluxo oficial sem transformar divergência
documental em regra operacional.

## Mudança 005

### D-016 — Transporte outbound HTTPS claim/lease

**Decisão:** o AI Node inicia heartbeat, claim e resultado; nenhuma porta do restaurante é publicada. WebSocket não é requisito e PostgreSQL é injetado pela plataforma futura.

### D-017 — Artefatos oficiais fixados

**Decisão:** Node 24.18.0, llama.cpp b10172 e GGUFs Qwen usam versão, URL oficial, tamanho, licença e SHA-256. Pesos e binários não entram no Git.

### D-018 — Reasoning local desligado

**Decisão:** iniciar llama.cpp com `--reasoning off`.

**Evidência:** a saudação caiu de 37,7 s/295 tokens para 8,6 s/17 tokens, sem mudar o texto validado.

### D-019 — Writer estrito e reproduzível

**Decisão:** Writer recebe 14 campos, produz somente `text`, inclui pergunta obrigatória e aceita seed explícita. Modelo nunca corrige fatos ou ações.

### D-020 — Bake-off cego de três candidatos

**Decisão:** comparar determinístico, Qwen3 4B e Qwen3 1.7B. Payload público não contém identidade, versão, natureza, latência ou avaliação automática; revelação exige voto.

### D-021 — Contexto público específico sem reinferência

**Decisão:** substituir somente mensagens genéricas exibidas e recalcular envelopes/hashes após prova de zero divergência de input/opções/resultados. Reexecutar modelos seria custo de CPU sem mudança semântica.

### D-022 — Nenhum vencedor sem César

**Decisão:** métricas automáticas habilitam o painel, mas não escolhem modelo. `human_winner` permanece `null` até homologação cega.

## Mudança 005B

### D-023 — Priorizar pesos oficiais e preservar o instalador

**Contexto:** Gemma 4 E4B já possui GGUF QAT oficial; Qwen3.5 4B possui pesos
oficiais pós-treinados, mas não GGUF no namespace Qwen.

**Decisão:** usar o GGUF oficial Google para Gemma e aceitar o Qwen3.5 de
bartowski somente como conversão secundária rastreada para teste. Nenhum deles
entra no manifesto ou ZIP da Mudança 005.

**Motivo:** maximizar proveniência sem baixar 25 GB de pesos oficiais e criar
uma cadeia de conversão não instalada apenas para o bake-off.

**Impacto:** Qwen3.5 pode ser qualificado tecnicamente, mas promoção futura
exige nova decisão de distribuição.

**Reversibilidade:** total; artefatos ficam fora do Git e candidatos desligados.

### D-024 — Não atualizar llama.cpp sem falha reproduzida

**Decisão:** testar b10172 primeiro. A release b10173 foi publicada 37 minutos
depois e não contém justificativa material para substituir o runtime aprovado.

**Motivo:** Gemma 4 e Qwen3.5 já eram suportados em releases anteriores.

**Impacto:** rollback é o próprio runtime canônico e o instalador fica imutável.

### D-025 — GBNF deve refletir o validador semântico

**Decisão:** restringir os mapas de fatos e referências a valores escalares no
schema canônico antes de gerar a GBNF.

**Motivo:** o primeiro probe real do Gemma produziu uma lista dentro de
`references_resolved`; a gramática permitia, mas o validador corretamente
recusava. O desalinhamento era do schema, não um caso para prompt tuning.

**Impacto:** a geração não consegue mais emitir coleção nesses mapas; parsing e
semântica continuam independentes e qualquer divergência cai em fallback.

### D-026 — Gemma 4 E4B não é candidato completo

**Decisão:** encerrar o Gemma E4B como `not_qualified` e não executar a bateria
adversarial reservada aos candidatos qualificados.

**Motivo:** o Writer passou 292/292 com p95 de 10,38 s, mas o Director acertou
apenas 2/8 movimentos e teve p95 de 30,47 s.

**Impacto:** preservar o resultado excelente do Writer para análise futura sem
enviar o modelo à homologação humana desta mudança. Qwen3.5 será avaliado sem
qualquer ajuste derivado das respostas do Gemma.

### D-027 — Qwen3.5 4B não é candidato completo

**Decisão:** encerrar o Qwen3.5 4B como `not_qualified` e não executar a bateria
adversarial reservada aos candidatos tecnicamente qualificados.

**Motivo:** o Writer passou o gate com 289/292 saídas aceitas, três fallbacks
seguros e p95 de 9,70 s, mas o Director acertou apenas 2/8 movimentos em duas
execuções com as mesmas seeds e teve p95 de 26,83 s.

**Impacto:** nenhum candidato atual segue ao painel cego. O resultado não
altera o baseline Qwen3 4B, o fallback determinístico ou o instalador.

### D-028 — Não executar Gemma 4 12B na máquina intermediária

**Decisão:** encerrar o candidato opcional como `not_executed_doctor_gate`, sem
download e sem criar arquivo de resultado fictício.

**Motivo:** o Doctor pós-Qwen classificou o equipamento como `intermediario` e
sua lista certificada de modelos compatíveis não contém 12B. Além disso, os dois
candidatos obrigatórios já falharam o Director e o E4B excedeu a latência
operacional; RAM nominal e espaço em disco não substituem o gate completo.

**Impacto:** evita carga e aquecimento sem hipótese técnica suficiente. A
ausência do opcional não bloqueia a conclusão da Mudança 005B.

### D-029 — Não fabricar rodada humana sem candidato técnico

**Decisão:** não criar `blind-round-1.json`, `blind-round-2.json` ou bundle de
homologação 005B.

**Motivo:** ambos os modelos novos falharam o Director. A infraestrutura cega
anterior permanece testada, mas abrir votação transformaria um gate técnico
vermelho em escolha do menos ruim.

**Impacto:** César não recebe uma falsa escolha. `human_winner` continua `null`
e o baseline permanece soberano.

## Mudança 006

### D-030 — O Pattern Engine é soberano sobre o Writer

**Decisão:** resolver movimento conversacional, Journey, fatos, correções,
referências, pergunta obrigatória e limites antes de chamar qualquer Writer.

**Motivo:** fluência não é autoridade operacional. O modelo local pode redigir
somente dentro do envelope aprovado e cai em fallback determinístico se alterar
fato, pergunta, ação, canal ou política.

### D-031 — Estado conversacional estrutural é event-sourced

**Decisão:** persistir decisões sanitizadas e reconstruir Journey, step, stack,
pendências e correções por replay, com stack máxima de três jornadas.

**Motivo:** retomada e idempotência não podem depender da memória do processo ou
de texto bruto do cliente.

### D-032 — Contextos futuros entram por contratos fechados

**Decisão:** Customer Context, Menu Context, Recommendation Context, Channel
Policy e Cost Policy são entradas opcionais validadas. Mocks de ferramentas
futuras retornam indisponibilidade e não ecoam dados.

**Motivo:** preparar compatibilidade sem antecipar CRM, catálogo, recomendador
ou gateway real.

### D-033 — Cardápio oficial é inventariado, não consolidado

**Decisão:** tratar as seis fontes internas localizadas como oficiais para
auditoria de cobertura do contrato, preservando origem, canal, unidade,
ausências e divergências. Nenhum preço, descrição ou ingrediente foi alterado.

**Motivo:** a página do DeliveryOS consome uma base operacional, mas não prova
um catálogo único por canal e unidade. A consolidação pertence à Mudança 008.

### D-034 — Custo externo zero é gate fail-closed

**Decisão:** manter `FINANCIAL_MODE=ZERO_EXTERNAL_COST`, gasto externo máximo de
R$ 0,00 e bloquear custo pago, desconhecido, trial com cobrança, BSP pago,
campanha ou infraestrutura adicional.

**Motivo:** ausência de evidência de gratuidade não é autorização financeira.

### D-035 — Homologação usa saídas armazenadas sem promoção

**Decisão:** comparar o compositor determinístico com as saídas Writer já
armazenadas de Gemma 4 E4B e Qwen3.5 4B em 20 casos cegos, com o mesmo plano e
estado por trio.

**Motivo:** isolar qualidade de linguagem, evitar nova inferência e impedir que
identidade técnica ou métricas escolham por César. `human_winner` permanece
`null` e `promotion_authorized=false`.

## Fontes reais de cardápio + Writer local final

### D-036 — Gemma 4 E4B entra somente como Writer local

**Contexto:** os artefatos aprovados da Mudança 005B não estavam instalados no
runtime de homologação, embora a proveniência e os hashes estivessem disponíveis.

**Alternativas:** manter o painel desconectado; promover o modelo a Director;
ou instalar os artefatos certificados fora do Git e chamá-lo apenas depois do
envelope aprovado.

**Decisão:** instalar llama.cpp b10172 e Gemma 4 E4B no diretório local
configurável, validar os hashes e usar o modelo exclusivamente como Writer.

**Motivo:** entrega linguagem local sem transferir autoridade de jornada, fatos,
perguntas, canais, segurança ou ações ao modelo.

**Impacto e reversibilidade:** falha fecha no compositor determinístico com
código específico. A integração pode ser desligada sem alterar Pattern Engine,
CRM, catálogo, contrato ou dados.

### D-037 — Extração real entra como proposta, nunca como fato

**Contexto:** existem 199 registros operacionais e 86 harmonizações extraídas de
fonte oficial interna, mas faltam canal, unidade e confirmações comerciais ou de
segurança em parte relevante do material.

**Alternativas:** promover automaticamente; ignorar as fontes; ou criar uma fila
de revisão humana append-only.

**Decisão:** manter 285 propostas pendentes e exigir revisão humana soberana.
Item aprovado exige canal e unidade; harmonização exige também vínculos com
prato e bebida reais.

**Motivo:** dado incompleto é preferível a dado errado, especialmente para
preço, disponibilidade, ingrediente, alergênico e contaminação cruzada.

**Impacto e reversibilidade:** as sete fixtures sintéticas continuam isoladas
até a primeira aprovação válida. Decisões de revisão geram novos eventos e não
alteram a fonte original.

### D-038 — Limite do Pattern Engine não será corrigido nesta mudança

**Contexto:** a homologação real mostrou que preferências isoladas como “mais
leve” e “maçaricado” podem cair em clarificação genérica sem canal e item real
aprovados.

**Decisão:** registrar o comportamento e não alterar o Pattern Engine.

**Motivo:** o escopo autoriza conexão, roteamento de Writer e curadoria de fonte;
proíbe trocar ou ampliar o Pattern Engine.

**Impacto e reversibilidade:** não há claim comercial inventado. A melhoria
conversacional fica para autorização futura baseada nesta evidência.

## Correção pós-homologação humana 01

### D-039 — Turno é analisado antes de ser redigido

**Contexto:** a rota real colapsava um turno composto na última subintenção,
atualizava preferências sem replanejar e expunha linguagem interna de auditoria.

**Decisão:** decompor deterministicamente o turno, alimentar o plano aprovado
com contexto, razões, trade-offs e incertezas e manter Gemma apenas na redação.
O validador pós-Writer bloqueia linguagem de mecanismo.

**Motivo:** a resposta precisa preservar verdade e estado enquanto aproxima o
cliente de uma escolha; fluência não pode corrigir perda estrutural nem ganhar
autoridade sobre item, preço, canal, referência ou segurança.

**Impacto e reversibilidade:** a mudança fica restrita à rota conversacional e
seus contratos/testes. Não altera catálogo, CRM, modelo ou integração externa.

## Autonomous Experience Lab V1

### D-040 — Homologação técnica conversacional vira laboratório autônomo

**Contexto:** a homologação humana V2 encontrou 12 falhas que um harness
adaptativo poderia ter detectado antes de consumir atenção de César.

**Decisão:** executar 40 conversas estruturadas e 40 mutadas pela rota real,
avaliar cada turno por gates determinísticos A–O e manter as reprovações humanas
como golden failures por classe.

**Motivo:** César deve julgar confiança e hospitalidade, não atuar como executor
manual de regressão previsível.

### D-041 — Segurança preventiva precede apoio à decisão

**Contexto:** o estado preservava alergia, mas o apoio à decisão era resolvido
antes do gate preventivo e permitia ao Writer comparar pratos.

**Decisão:** alergia ativa impede escolha ou ranqueamento e produz orientação
específica de confirmação com a equipe, inclusive nos turnos seguintes.

**Motivo:** continuidade de segurança é soberana; fluência não autoriza inferir
preparo seguro ou ausência de contaminação cruzada.

### D-042 — Avaliação de experiência permanece advisory

**Decisão:** registrar o avaliador de experiência como
`ADVISORY_NOT_INDEPENDENT` e nunca tratá-lo como aprovação humana.

**Motivo:** isolamento de entrada não transforma código do próprio sprint em
uma pessoa independente.

## 2026-08-10 — B2 permanece experimental e não validada

- Contexto: o Contract/Oracle V2 mostrou capacidade semântica forte, mas faltava
  prova de ponta a ponta com autoridade factual separada.
- Alternativas: migrar a variante cognitiva; rejeitá-la pelo histórico da Gemma;
  executar uma prova híbrida mínima e reversível.
- Decisão: executar apenas a prova B2 com Planner, DeliveryOS authority e Writer
  separados, preservando A e sem integração externa.
- Motivo: B2 venceu A materialmente, porém dois turnos ficaram sem publicação e
  a avaliação não foi independente.
- Impacto: `B2_PROMISING_NOT_VALIDATED`; nenhuma promoção.
- Reversibilidade: remover a branch experimental restaura integralmente o estado
  anterior; nenhum arquivo de produto foi alterado.
