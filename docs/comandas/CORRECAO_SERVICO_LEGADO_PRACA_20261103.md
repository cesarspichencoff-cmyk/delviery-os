# TATÁ Comandas — correção de motivos legados de serviço, 03/11/2026

## Problema real observado, sem dados do cliente

No replay em sombra do CAIXA_MOOCA (Itaim), com um evento Reader V2 e sua decisão correspondente, a cadeia validou a revisão e a faixa após 23h, mas reteve o conteúdo. A decisão V2 já capturada continha os códigos `UPSTREAM_SERVICE_HOURS_OUTSIDE_WINDOW` e `SERVICE_REQUIRED_SUSHI1_9.15.00.050.00`; a origem de evento continha `SERVICE_HOURS_OUTSIDE_WINDOW`. O produto tinha classificação presente, kit FACT e embalagem sem desconhecidos, mas isso **não** prova por si só todos os outros gates de produção.

O leitor/consumidor V1 usa o estado de serviço para escolher entre as praças `00009` e `00003`. A cadeia nova interpreta separadamente o relógio nativo do pedido, com jantar até 23:59, conforme decisão de César.

## Mudanças restritas

1. O classificador reconhece **somente** `SERVICE_HOURS_OUTSIDE_WINDOW` como motivo de horário legado, e `UPSTREAM_SERVICE_HOURS_OUTSIDE_WINDOW` como tal apenas se a própria origem declarar esse código e não contiver bloqueios de outra classe.
2. `SERVICE_REQUIRED_SUSHI1/2_<código canônico>` passa a representar a exigência histórica de praça pareada, não um defeito de produto. O código deve obedecer ao formato canônico exato.
3. Antes da projeção de vias, a cadeia exige que o produto apareça na revisão nativa, que as duas praças esperadas estejam realmente configuradas sem duplicatas e que a seleção por horário escolha exclusivamente a praça correta. Caso contrário, **L4 HOLD** com motivo específico. Serviço antigo nunca concede impressão.
4. A origem do número TATÁ, a autenticação independente, o motor de embalagens, as observações, os status nativos, os IDs iFood/Teknisa e a impressora física permanecem sujeitos às respectivas provas. Nada passa a imprimir.

## Testes de regressão no Foxxy

- Cadeia nativa **28/28**: três testes novos, além dos 25 anteriores, cobrem serviço antigo + roteamento correto, produto/pareamento divergente e motivos mistos/novos ou horário fora do atendimento.
- Medidas virtuais do Figma **12/12**.
- Manifesto pinado dos 34 arquivos **5/5**, repinado depois da mudança de código.
- Bundle offline de 52 arquivos **6/6**, com novo campo `candidate_manifest_sha256`; `source_baseline_commit` é referência histórica, **não** uma alegação de que a candidata atual tem os mesmos bytes da versão antiga.
- A publicação e a CI Linux/Windows exigem verificação no HEAD publicado; testes locais não substituem essa prova.

## Fronteira operacional

A alteração é uma **candidata de revisão isolada**, não uma mudança aplicada ao leitor de produção. O pacote que já está no CAIXA_MOOCA é a versão anterior; nenhum serviço, ACL, SQL, fiscal, spooler, impressão ou numeração real será alterado. O mesmo par real poderá ser reproduzido em sombra **somente após** CI aprovada, bundle refeito e manifesto conferido por hash independente. A decisão real poderá continuar em HOLD por outras causas: o software nunca deve gerar uma liberação artificial.
