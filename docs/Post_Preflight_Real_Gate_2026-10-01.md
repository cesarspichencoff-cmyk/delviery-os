# Gate pós-preflight real — topologia Odhen + identidade SQL — 2026-10-01

## Evidência recebida do CAIXA_MOOCA

O handoff v2 foi executado no HEAD correto.

Fatos reportados:
- READY_FOR_ONE_MINIMIZED_ORDER_READ_CANDIDATE=false;
- o principal SQL atual possui autoridade elevada e pode executar procedures;
- portanto ele NÃO serve como prova de uma fonte read-only;
- a varredura de código não encontrou arquivos porque o probe presumiu uma topologia de pastas incorreta;
- 6/6 impressoras esperadas têm fila no Windows;
- DELIVERY SUSHI 1 e DELIVERY SUSHI 2 foram observadas offline naquela captura.

## Correção de rota

Não repetir o mesmo preflight agora.

### Passo A — descobrir topologia sem conteúdo

Executar somente:

tools/odhen_topology_probe_readonly.ps1

O probe:
- enumera diretórios até profundidade limitada;
- lê apenas metadados de arquivos e extensões;
- NÃO lê conteúdo;
- exclui Log, Logs, Temp, cache e node_modules;
- NÃO toca banco;
- NÃO toca impressora;
- NÃO abre rede;
- NÃO lê pedido.

Objetivo:
descobrir as raízes reais de código/configuração antes de corrigir o scanner.

### Passo B — SQL permanece bloqueado

O principal Windows atual não será usado para ler pedido.

Não são aceitas como substituto de least privilege:
- transação com rollback;
- SELECT manual executado como sysadmin;
- confiar em disciplina humana para não escrever;
- usar uma conta elevada e chamar isso de read-only.

Rotas aceitáveis futuras:
1. identidade já existente com permissão SELECT apenas e sem EXECUTE/WRITE;
2. fonte/API nativa comprovadamente read-only e limitada ao pedido;
3. outro mecanismo local cujo efeito possível seja tecnicamente restrito a leitura.

Criar ou alterar usuário/permissão SQL é efeito administrativo e exige gate humano separado.

## Impressoras

A captura real de filas é útil e não precisa ser repetida ainda.

Estado conhecido da captura:
- 6/6 filas esperadas encontradas;
- DELIVERY SUSHI 1 offline;
- DELIVERY SUSHI 2 offline.

Isso NÃO prova falha permanente. É uma observação pontual do host naquele instante.

Nenhum teste físico deve ocorrer até fechar:
- topologia/fonte;
- identidade de leitura;
- semântica dos IDs;
- origem do serviço;
- estados reais das impressoras.

## Próximo gate

Após a topologia real:
- corrigir raízes do scanner;
- rodar apenas o source probe corrigido;
- decidir a rota read-only do pedido;
- somente então reavaliar leitura minimizada.

Nenhum pedido real está autorizado por este documento.