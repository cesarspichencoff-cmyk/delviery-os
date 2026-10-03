# Product System — rechecagem B5–B8

Data: 2026-10-03
Base: `fac0ce32d5522087b6a3ab021f568526bd66be4c`
Branch: `tmp/product-blockers-recheck-20261003`
Escopo: **leitura/auditoria local; sem produção**

## B5 — reclassificado

A formulação de 2026-08-01 dizia que nenhum dos cinco sinais do aparelho tinha rota de leitura.
Isso não é mais verdade no código atual.

`GET /api/entregas` lê a realidade no momento da requisição usando `lerRealidade(...)`. O bloco
real separado da demonstração expõe: vínculo de credencial, última sessão, versão do app,
revogação, última posição, última sincronização, frescor do GPS, modo e contagem dos fatos.

O único sinal daquela lista que continua sem fonte remota é **fila offline**: a fila mora no
telefone e nenhuma rota devolve sua profundidade. O campo continua `integracao_pendente` por
desenho honesto. Product System: **44/44 PASS**.

## B6 — permanece aberto

Operação Viva entrega estado atual, não série de mudanças; Copiloto entrega avaliação atual, não
histórico de status. As duas viewmodels declaram a ausência explicitamente.

## B7 — permanece aberto

Product System continua uma superfície read-only sem autenticação/sessão humana para registrar
retirada ou aceite operacional. Não há autorização para inventar uma ação sem ator.

## B8 — permanece aberto

O seletor multi-unidade preserva contexto, mas `UNIDADES` contém apenas `demo-unit`. Não existe
segunda fonte ligada à troca de unidade.

## Fronteira

Esta prova só corrige a precisão do mapa de blockers. Não adiciona telemetria de telefone,
histórico, autenticação, escrita operacional ou segunda unidade.
