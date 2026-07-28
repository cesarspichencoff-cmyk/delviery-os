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
