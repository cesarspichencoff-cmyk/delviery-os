# Guia de homologação local do AI Node

## Objetivo

Comparar sem viés a resposta determinística e os dois candidatos locais. Esta homologação não ativa produção nem envia mensagens.

## Preparar armazenamento externo

Escolha duas pastas fora do repositório:

- `<pacote>/review/bakeoff`: artefatos finalizados e somente leitura;
- `<dados-privados>/bakeoff-votes-human`: votos append-only de César.

Não use as pastas `bakeoff-votes-qa*`, que contêm somente testes sintéticos da interface.

## Iniciar

Na raiz do projeto:

```powershell
$env:PORT = "4189"
$bundle = "<pacote>/review/bakeoff"
$votes = "<dados-privados>/bakeoff-votes-human"
npm run conversation-local-ai:bakeoff-panel -- --bundle-root $bundle --votes-root $votes
```

Abra `http://127.0.0.1:4189`. O servidor recusa bundle com hash divergente e escuta somente em loopback.

## Como avaliar

Para cada caso:

1. leia o contexto sintético;
2. escolha A, B ou C sem tentar descobrir a tecnologia;
3. atribua nota de 1 a 5 para naturalidade, saudação, continuidade, compreensão, retomada, utilidade, confiança e “César enviaria”;
4. registre a escolha;
5. somente depois do voto veja a identidade revelada;
6. aguarde o avanço automático.

Não há campo de texto livre, para reduzir risco de PII. Revisão posterior cria novo evento ligado ao voto anterior; nada é sobrescrito.

## Regras de decisão

Um candidato só pode vencer se:

- zero fato crítico, ação, promessa, compensação ou diagnóstico inventado;
- nenhum reasoning ou informação interna exposta;
- R05, O02 e segurança permanecem corretos;
- César preferir a maioria das respostas relevantes e considerar que as enviaria;
- ganho não depender apenas de comprimento;
- latência e hardware do restaurante passarem no Doctor/piloto.

Não escolher o menos ruim. Empate, baixa confiança ou qualidade insuficiente mantém `BAKE-OFF LOCAL SEM VENCEDOR`.

## Encerrar e preservar

Use `Ctrl+C` no terminal do painel. Preserve a pasta privada de votos fora do Git. Não compartilhe o artefato privado de mapeamento antes da votação. O pacote público pode ser revisto, mas não contém identidade de candidato.

## Rollback

Nenhuma ativação ocorre nesta etapa. Para voltar ao comportamento anterior, mantenha `CONVERSATION_LOCAL_AI_ENABLED=false` e `CONVERSATION_AI_FALLBACK=deterministic`. Se o node estiver instalado em piloto, revogue-o no bridge antes de desinstalar.
