# TATÁ Comandas — testemunha de tentativa V8.82

**Estado: DRAFT / HOLD / somente revisão offline.**

## Problema fechado nesta versão

Uma classificação de spooler pode estar logicamente correta e ainda assim ter
sido produzida pelo mesmo processo que submeteu a impressão, vinculada ao
pedido errado, reutilizada em outra tentativa ou apresentada fora da janela
temporal. Assinar a própria alegação não cria independência.

A V8.82 introduz um contrato puro de verificação para uma observação
**source-separated**. O registro assinado vincula, sem conteúdo do pedido:

- loja;
- hash de reserva/pedido/conteúdo/origem;
- fingerprint da intenção de impressão;
- tentativa;
- hash do contrato de rotas;
- instâncias distintas do coletor e do emissor;
- sucesso explícito de leitura e hash do snapshot bruto da fonte;
- início e fim da observação;
- nonce, revisão e identidade da testemunha;
- fatos normalizados do spooler e classificação alegada.

O verificador recalcula a classificação V8.80. A assinatura não pode promover
`PRINTED` a papel físico, nem transformar ausência momentânea de job em prova
de ausência de efeito. Contradição ou status desconhecido continuam em
`EFFECT_UNKNOWN_REQUIRES_RECONCILIATION`.

## Resultado permitido

Mesmo quando assinatura, pin, identidade, rota, tentativa, separação de fonte
e tempo são consistentes, o único sucesso é:

`SIGNED_SOURCE_SEPARATION_MATCH_RECONCILIATION_ONLY`

Esse resultado mantém obrigatoriamente:

- `independently_custodied_trust_proven=false`;
- `independent_failure_domain_proven=false`;
- `physical_print_proven=false`;
- `proven_no_effect=false`;
- `fiscal_dispatch_ready=false`;
- `automatic_retry_allowed=false`;
- `authorize_print=false` e `authorize_reprint=false`.

O contexto de confiança recebido pela função é apenas **fornecido**. A V8.82
confere sua consistência criptográfica, mas não consegue provar quem custodia a
chave, o pin da última revisão, o relógio ou o processo coletor no restaurante.

## Cenários adversariais obrigatórios

1. `PRINTED` assinado continua sem provar papel.
2. Rejeição pré-criação assinada continua sem provar ausência de efeito.
3. Contradição `rejeitado + status PRINTED sem job` permanece ambígua.
4. Status futuro/desconhecido permanece ambíguo.
5. Classificação alegada diferente da classificação recalculada bloqueia.
6. Coletor igual ao emissor, ou identidades trocadas, bloqueia.
7. Loja, vínculo do pedido, intenção, tentativa, rota, instância ou revisão
   divergente bloqueia.
8. Observação vencida, futura, longa demais ou com relógio não canônico
   bloqueia.
9. Nonce revogado, assinatura alterada, chave substituída ou pin externo
   divergente bloqueia.
10. Campo inesperado, lista duplicada/não canônica ou fonte autodeclarada pelo
    emissor bloqueia.
11. Falha de leitura assinada continua em `WITNESS_SOURCE_UNAVAILABLE`.
12. Um registro não pode ser reutilizado como prova de outra tentativa.
13. O módulo de produção não gera chaves, não assina, não acessa arquivos,
    rede, serviço, spooler ou impressora.

## O que ainda falta para independência real

- processo coletor separado do emissor no host real;
- identidade e permissões efetivas desse processo verificadas no Windows;
- custódia externa da chave pública e do pin monotônico da última revisão;
- relógio, revogação, retenção e falha de leitura sob autoridade separada;
- vínculo a uma fonte atual da loja correspondente;
- reconciliação com o emissor legado GP/Teknisa e com qualquer backlog;
- confirmação física em papel e aceite humano, sob autorização própria.

O mapa pinado nesta PR identifica `0001 - TATA ITAIM`. Ele não comprova a
topologia da `CAIXA_MOOCA` ou de qualquer outra loja.

## Limite de efeito

Esta versão contém somente TypeScript puro, testes com chave Ed25519 efêmera em
memória e documentação. Não há coletor operacional, chave persistida, conexão
externa ou instalação.

**NO MERGE / NO DEPLOY / NO INSTALL / NO PRINT / NO SPOOLER WRITE / NO GP OR
TEKNISA CHANGE / NO FISCAL OR SEFAZ CHANGE / NO CASH REGISTER ACCESS.**
