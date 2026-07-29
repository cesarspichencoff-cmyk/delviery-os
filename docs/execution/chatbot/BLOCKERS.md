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
