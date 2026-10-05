# DeliveryOS — auditoria operacional e fiscal — 2026-10-05

## Resultado executivo

A cadeia de leitura e decisão já funciona sobre pedidos reais. O maior risco não é mais “conseguir ler o pedido”; é ativar efeitos sem preservar os estados nativos do Teknisa/Odhen.

A correção de embalagem de 05/10 também fecha uma regressão importante: temperatura quente/frio exige segregação interna, mas não cria automaticamente duas sacolas externas. O caso real de 3 Kids + Edamame + Nasu + Unagui usa 1 Sacola G, com quente/frio separados por dentro e encaixe validado por medição.

## Entrada e continuidade

- DLV_IFO foi observado ao vivo no CAIXA_MOOCA.
- NRCOMANDAEXT foi provado como sequência curta do iFood no caso estudado.
- Leitura roda sob NT SERVICE\TataComandaReader com privilégio mínimo.
- Dedupe de replay está provado.
- Códigos brutos do Teknisa devem ser canonicalizados antes de qualquer julgamento de roteamento; o caso 9050506000 → 9.05.05.060.00 mostrou que comparar o código cru gera falso “não mapeado”.
- O serviço produtivo contínuo ainda não foi cortado: os watchers usados até aqui são provas controladas, não um daemon de produção ativo.

## Sequência TATÁ

Estado real no CAIXA:
- política 001..999;
- reset diário por loja;
- arquivo local atômico;
- zero bindings antes do cutover;
- próximo valor 001;
- replay usa o mesmo binding;
- prova sombra confirmou 001 → reuse 001 → 002 sem consumir o estado produtivo.

## Produção

Roteamento sombra em pedidos reais está provado. A impressão física ainda não está provada.

Antes de ativar impressão automática, cada impressora alvo precisa fechar calibração real: mídia, largura imprimível, transporte, caracteres/acentos, corte/feed, estados offline/papel/tampa e uma prova física controlada. Efeito de impressão ambíguo nunca deve receber retry automático.

## Embalagem, kits e conferência

Para o pedido real:
- 3 x 750 Kids;
- 2 x 650 seladas (Edamame + Nasu);
- 1 x 240 Unagui;
- 3 Kit Kids + 1 Kit Quente;
- 1 Sacola G;
- segregação quente/frio interna.

Regra geral corrigida: temperatura organiza internamente; quantidade e P/M/G externos dependem de encaixe/capacidade/estabilidade medidos. A rota defeituosa “quente + frio = 2 sacolas” fica bloqueada.

O teste adversarial isolado passou. A suíte completa da Academia desta revisão não foi reexecutada porque o staging no Foxxy foi bloqueado pela política do conector antes da execução; não declarar suite completa PASS até obter uma execução real.

## NFC-e — o que o ambiente real prova

O fluxo instalado tem três conceitos distintos:
1. Cupom Fiscal: gera pagamento/venda e processa retorno NFC-e.
2. Reimpressão: usa venda fiscal existente e imprime novamente.
3. Finalizar Pedido: ação separada.

Em amostra read-only de 12 pedidos DLV_IFO recentes:
- 2 ainda em status 3 não tinham venda fiscal/NFC-e;
- 10 em status X tinham venda criada e NFC-e autorizada (IDSTATUSNFCE=A), no caixa 001.

Portanto o caminho nativo fiscal está ativo no ambiente real. Ainda não está provado se cada emissão ocorreu de forma hands-free ou após o operador usar F7/Cupom Fiscal.

A arquitetura correta é observar e reconciliar o fluxo fiscal nativo; não construir emissor SEFAZ paralelo e não automatizar tecla F7. O código legado que condiciona fiscal a PRODUCTION_DISPATCH é incompatível com a própria decisão arquitetural registrada em 03/10 e não pode ser promovido para efeito real.

## Anti-travamento

O fluxo desejado é monotônico e desacoplado:
pedido nativo → snapshot/dedupe → decisão → intents de produção → observação do efeito → conferência.

Falha do DeliveryOS não deve impedir o Odhen de receber/vender/fiscalizar. UNKNOWN de embalagem/rota deve bloquear somente o efeito automatizado correspondente, não o pedido nativo.

Fiscal segue a mesma regra: PENDING/UNKNOWN não recebe retry cego. Primeiro consultar estado nativo; se a venda/NFC-e já existe, reconciliar. Só repetir uma ação quando houver prova de que nenhum efeito fiscal ocorreu.

## Portões restantes

- revalidar a suíte completa de embalagem após a correção 05/10;
- implementar resolução durável de LUNCH/DINNER sem inferência pelo relógio;
- transformar watcher controlado em serviço contínuo com checkpoint/restart e dedupe persistente;
- calibrar fisicamente as impressoras de produção;
- atualizar/bloquear o planner fiscal legado antes de qualquer efeito fiscal;
- provar runtime atual de QR Code v3 e protocolo SP de 17 posições;
- provar o gatilho nativo suportado para NFC-e do fluxo iFood, sem emulação de teclado;
- só depois realizar impressão física controlada e, separadamente, qualquer prova fiscal com efeito.

Nenhum item acima autoriza cutover automático por si só.
