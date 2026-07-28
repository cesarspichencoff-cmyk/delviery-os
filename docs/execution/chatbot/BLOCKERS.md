# Bloqueadores e limitações

## Bloqueadores locais

Nenhum ao término técnico da Mudança 003.

## Bloqueadores externos

- avaliação humana da experiência ainda pertence a César;
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

## Mudança 003

O painel está pronto, mas contém zero voto real de César. Qualidade subjetiva,
preferência A/B e aprovação final continuam desconhecidas. A Mudança 004 está
somente especificada e bloqueada por esse gate.
