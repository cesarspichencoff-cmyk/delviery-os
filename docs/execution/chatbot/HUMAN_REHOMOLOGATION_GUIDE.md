# Guia da nova homologação humana — respostas refinadas V2

## Objetivo

Permitir que César reavalie a experiência após a Mudança 004 sem apagar ou
reescrever os votos da rodada anterior.

## Como iniciar

Na raiz do projeto:

```powershell
npm run conversation-native:start
```

Depois, abrir:

`http://127.0.0.1:4179`

## O que mudou no painel

- a rodada refinada possui 43 casos críticos ou amostrais;
- oito cenários sintéticos inéditos foram adicionados;
- votos V2 usam `refined-ratings-v2.jsonl`;
- votos V1 continuam em `humanized-ratings.jsonl`;
- revisões continuam append-only;
- o detalhe técnico e a comparação anterior × refinada só abrem depois do novo
  voto do caso;
- o Atendimento Livre continua sem detalhes internos;
- comentários com indícios de PII falham antes do append.

## Ordem recomendada

1. Avaliar os casos pendentes da nova rodada.
2. Julgar naturalidade, acolhimento, clareza, utilidade, tamanho e confiança.
3. Usar tags apenas quando forem úteis para explicar a nota.
4. Abrir a decisão técnica somente depois de salvar o voto.
5. Comparar a resposta anterior e a refinada.
6. Testar situações adicionais no Atendimento Livre usando apenas dados
   sintéticos.
7. Exportar o pacote privado no modo Resultados.

## Persistência e privacidade

O progresso fica, por padrão, em:

`%LOCALAPPDATA%\DeliveryOS\human-homologation`

Nenhum voto é enviado, commitado ou usado para alterar automaticamente o motor.
Não inserir nomes, telefones, e-mails, números de pedidos, endereços, tokens ou
outros dados reais.

## Critério de decisão

O painel apresenta uma referência quantitativa, mas não aprova o chatbot.
César decide se a resposta refinada está pronta para a próxima etapa. Esta
rodada não libera produção, integrações reais ou provider generativo.
