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
