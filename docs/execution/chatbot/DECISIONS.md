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

