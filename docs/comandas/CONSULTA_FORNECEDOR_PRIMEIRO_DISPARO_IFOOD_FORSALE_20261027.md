# Consulta técnica direcionada — primeira via nativa iFood/ForSale no Itaim

**Status:** minuta técnica NÃO ENVIADA, nenhum acesso remoto ou alteração de configuração autorizado.
**Destinatário sugerido somente após aprovação humana:** suporte responsável pela integração marketplace Odhen Retail / iFood da Teknisa. A documentação pública da integração informa `delivery@teknisa.com` para solicitações de integração; confirmar com o contato comercial antes de usar em incidente.

**Assunto sugerido:** TATÁ Sushi Itaim — identificar origem e supressão seletiva da primeira comanda de produção iFood sem alterar fiscal/mesa/balcão

## Contexto mínimo sem dados pessoais

No Itaim, recebemos pedidos de iFood na integração do Odhen Retail/ForSale. Pretendemos homologar um emissor próprio de comandas, mantendo a entrada e os registros de pedidos pela Teknisa, mas evitando que **a antiga via de produção** e a **nova via equivalente** consumam papel duplicado. O objetivo não é desativar a integração, a venda, a emissão fiscal, relatórios obrigatórios nem as comandas de mesa/balcão.

O ambiente mantém ForSale/Retail, backend Odhen POS e Odhen Periféricos. Identificamos no código do backend parâmetros **compartilhados** `IDIMPPEDPROD` (mesa/balcão/reimpressão) e `IDIMPAUTENTREG` (relatório automático pós-venda), que **não são seguros para mudança global**. O periférico também admite envio por ponte HTTP, escrita em porta ou arquivo e pode encaminhar trabalhos ao backup. O Gestor iFood contém caminhos próprios de impressão que precisam de avaliação independente. Não solicitamos seu desligamento.

## Perguntas objetivas ao fornecedor

1. **Evento de primeira via:** em qual módulo, executável, rotina ou serviço do Retail / ForSale, para a origem `IFO` / `DLV_IFO`, ocorre o **primeiro despacho de impressão de produção**? Diferenciar: captura como pré-pedido, criação de comanda, pedido liberado, impressão para cozinha e relatório pós-venda.
2. **Versão e ponto de controle:** o comportamento é parametrizável na versão instalada? Favor indicar **nome do parâmetro, tabela/campo ou tela e escopo exato**, sem solicitar senha, acesso SQL de escrita ou dados de clientes.
3. **Escopo cirúrgico:** existe configuração oficial capaz de **não emitir somente as vias antigas de produção dos pedidos iFood** na unidade, preservando mesa, balcão, delivery de outros canais, reimpressão autorizada e documentos fiscais? Se não existir, confirmar explicitamente.
4. **Rota e backup:** após a criação da via, o pedido segue ao Odhen Periféricos por ponte `/print`, PHP por porta, arquivo Delphi, ou outro caminho? A **reserva / impBackup** participa do mesmo fluxo? Como impedir papel duplicado sem desativar impressora física compartilhada?
5. **Relação entre canais:** o Gestor de Pedidos iFood pode receber/imprimir vias simultaneamente à integração Retail? Qual configuração **suporta** deixar o Gestor apenas para consulta e sem emitir, preservando a integração sem redundância?
6. **Evento verificável:** qual evidência **somente leitura** é suportada para correlacionar uma revisão de pedido iFood com **o primeiro despacho de produção e seu destino** sem requisitar uma nova impressão? Preferimos metadados minimizados sem nome, telefone, endereço, itens do cliente, token ou documentação fiscal.
7. **Transição e reversão:** qual procedimento homologado permite um piloto de um único pedido, com rollback seguro, tratamento de trabalhos já aceitos na fila e dupla emissão eventual? Favor apontar riscos e restrições de suporte.

## Resposta suficiente para destravar a PR

A resposta técnica precisa identificar **evento/componente de disparo**, **escopo da supressão**, **destino principal e reserva** e **meio de verificar a primeira tentativa**, preferencialmente com versão, documentação e limites. Apenas informar que o pedido é integrado ou que a comanda existe **não prova** que a impressão foi disparada.

**Efeitos proibidos até aprovação específica:** nenhuma troca de `IDIMPPEDPROD`/`IDIMPAUTENTREG`, serviço, driver, fila, impressora, spooler, Gestor, SQL, fiscal, sequência TATÁ, prova física ou deploy. Nenhuma amostra com dado de cliente é necessária para a consulta inicial.

**Fonte de acompanhamento:** [PR #127](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/127), em DRAFT/HOLD. Esta minuta é preparatória; não foi enviada.
