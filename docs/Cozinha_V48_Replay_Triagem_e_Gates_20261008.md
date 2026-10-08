# Cozinha V4.8 — replay real, triagem e portões

Data: 08/10/2026. Estado: SHADOW / teste local. Não está em produção, não imprime, não promove regras.

## Regra operacional

Duas comandas independentes com mesmo pedido e sequência:
- COZINHA — HOT / EBITEN / SHISO: somente preparações auxiliares com regras humanas comprovadas.
- COZINHA — PRATOS: somente os pratos roteados pelo motor atual à cozinha, com quantidades e observações próprias.

O pacote offline elimina a antiga via única de COZINHA quando usa as vias separadas. Não existe comanda extra misturada nem repetição das linhas de pratos.

## Auditoria documental da V4.8

Ferramenta: tools/auditar_candidatos_cozinha_v48.js.

Fonte: data/cardapio_knowledge_seed.json — catálogo HISTÓRICO gerado em 01/07/2026. Foram avaliados 199 nomes de produtos. Sete possuem termos que sugerem revisão humana; não são sete regras aprovadas.

Apenas Uramaki Ebiten Especial → 1 EBITEN por unidade está registrado como HUMAN_CONFIRMED no arquivo de regras da branch experimental. Esse arquivo declara coverage=PARTIAL. As outras seis ocorrências exigem confirmação operacional individual; nomes de produtos não estabelecem quantidades. A ausência dos termos HOT, EBITEN ou SHISÔ também NÃO autoriza supor zero.

Os relatórios docs/evidence/kitchen_rule_triage_v48_20261008.json e .md são material de triagem, nunca configuração de impressão. Não alteram data/kitchen_dependency_rules_v1.json nem o motor atual. A fonte na branch main não foi confirmada equivalente a esta branch.

## Replay de pedido real

Fonte: pedido real arquivado de 04/10 e provas capturadas em 05/10, nos registros data/tata_reader_real_order_*_20261005_*.json.

- 3 Combinados Kids, 1 Edamame, 1 Nasu no Misso e 1 Sushi de Unagui: 4 linhas, 6 unidades vendidas e 6 caixas comprovadas.
- O script tools/gerar_replay_cozinha_separada_v48.js concilia índices, códigos e quantidades da conferência com o roteamento real arquivado.
- Gera três trabalhos SOMENTE offline: Sushi (outra praça), COZINHA — PRATOS e CONFERÊNCIA. Não gera a comanda de COZINHA antiga.
- A via HOT/EBITEN/SHISO não é liberada: regras parcialmente conhecidas não provam o total desse pedido. Não emitir papel NÃO significa demanda zero.
- Os arquivos ESC/POS, texto e manifesto SHA-256 ficam no diretório temporário. Não há impressão, corte, rede fiscal, Odhen ou efeito em estoque.

## Verificações e execução

npm run auditar:kitchen-rules-v48
npm run verificar:kitchen-real-v48
npm run gerar:replay-cozinha-v48:offline

Os testes V4.8 verificam integridade, roteamento, não duplicação, quantidade, regras desconhecidas, fonte histórica e ausência de corte. A regressão da V4.7, V4.6 e V4.5 permanece obrigatória antes de qualquer promoção.

## Fronteira necessária para liberar

1. Validação humana por produto, porção e praça de todas as dependências HOT/EBITEN/SHISO relevantes, incluindo as não óbvias pelo nome.
2. Resolver como comprovar cobertura completa e versionar cada regra; reconciliar source branch com main.
3. Conectar a origem real dos pedidos com identidade, observações e revisões garantidas e sem reimpressão duplicada.
4. Calibrar Epson TM-T20 física e comparar papel com Figma: mídia real, área útil, acentos, fonte, hierarquia, densidade, comprimento e corte.
5. Piloto de chão monitorado; autorização separada para efeitos em produção.

Estado de prova: CODE_READY/SHADOW_TEST_PASS local. NÃO WORLD_PROVEN. Sem merge, deploy, cutover ou alteração do fluxo de impressão em uso.
