# Operacao Viva — diagnostico de comandas SHADOW V1

**Estado:** codigo e testes offline; **nao e integracao ativa ao Copiloto**, nao e produtor de eventos e nao e release.

## Funcao

A comanda termica e gerada, inspecionada e eventualmente bloqueada como prova tecnica offline. Isso **nao equivale** a observar no restaurante um pedido aceito, uma praca iniciando trabalho, um pedido pronto ou uma folha impressa.

A funcao pura diagnosticarComandasParaOperacaoVivaV1 (src/production/operacaoVivaComandasDiagnosticoV1.ts) aceita uma KitchenSeparatedBundleV47 e devolve apenas um resumo de diagnostico do material SHADOW. O resultado nao contem itens, observacoes, sequencia, dados de cliente, texto ESC/POS, bytes, dados fiscais nem prazo.

Por canal (OTHER_PRODUCTION, KITCHEN_COMPONENTS, KITCHEN_DISHES, CONFERENCE), classifica somente os arquivos de prova offline como:

- DISPONIVEL_OFFLINE: comprovante renderizado para inspecao offline, NAO enviado ou impresso;
- BLOQUEADO_OFFLINE: prova bloqueada sem bytes exportaveis;
- MISTO_OFFLINE: ao menos uma prova liberada e outra bloqueada no mesmo canal, sem declarar completude;
- NAO_GERADO_NA_AMOSTRA: este canal nao estava presente nesta amostra; **nao implica pedido sem esse canal**.

Pacote ausente, schema futuro, flag de impressao ligada, efeitos reais, canal inesperado, bytes invalidos ou prova inconsistente: integridade_estrutura=INDETERMINADA, todos os canais NAO_GERADO_NA_AMOSTRA e revisao obrigatoria. O contrato nunca inclui motivos brutos de falha ou rastros de texto potencialmente sensiveis.

## Fronteira obrigatoria

- fonte=PROVA_SHADOW_OFFLINE_NAO_AUTORITATIVA, sempre.
- identidade_pedido, estado_pedido_observado e ocorrido_em_origem permanecem null; **nao existe frescor real**.
- emite_fato_operacional, define_foco, autoriza_impressao, autoriza_integracao_produtiva, comprova_papel_fisico e todos os effects permanecem false.
- **Proibido** transformar este diagnostico em pedido_ciclo_observado, trabalho_praca_observado ou Foco. A Operacao Viva continua dona da atencao, regida pelas fontes de origem qualificadas.
- Nao toca no Android, nos produtores, em src/perfil-delivery/motor.js, nas regras reais, em impressoras ou nas fontes live.
- Este codigo **nao** prova completude de observacoes longas V5.6, aceitacao fisica da folha 998, proveniencia autenticada da comanda nem estado atual da producao.

## Ensaio reproduzivel

npm run verificar:operacao-viva-comandas-shadow

15 verificacoes, incluindo replay historico, privacidade, causas e efeitos bloqueados, adulteracao, canais mistos e ausencia de origem. O CI do PR executa esta suite junto aos gates termicos existentes. A aprovacao dos testes permite apenas **avaliacao tecnica de uma interface SHADOW**.

## Proxima integracao

A plataforma com Copiloto de Operacao Viva esta atualmente em uma arvore divergente, com contrato de eventos de origem distinto (src/product/eventos), e nao contem src/production. A ponte acima **nao e integracao produtiva entre essas arvores**. Para isso: escolher e validar um destino autorizado, preservar as regras de proveniencia, fazer composicao isolada com contrato explicito, validar contra eventos reais qualificados e obter autorizacao humana antes de merge/deploy.

Branch de base: feat/thermal-v54-caixa-photo-visual-qa-20261008 (PR #21). Sem alterar sua aprovacao de CI, sem imprimir ou fazer cutover.
