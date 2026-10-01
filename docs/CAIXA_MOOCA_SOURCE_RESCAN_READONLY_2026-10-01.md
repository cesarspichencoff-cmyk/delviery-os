# CAIXA_MOOCA — Source rescan read-only — 2026-10-01

## Missão

Executar somente o scanner de código/configuração corrigido para a topologia real do CAIXA_MOOCA.

Esta etapa NÃO autoriza:
- SQL;
- leitura de linhas de pedido;
- impressão;
- spooler;
- leitura de logs;
- alteração de Odhen/Teknisa;
- rede;
- fiscal/SEFAZ;
- correção de configuração.

## Fonte

Repositório: `cesarspichencoff-cmyk/delviery-os`
Branch: `fix/odhen-routing-config-proof-20260930`

Use o HEAD atual da branch e registre o SHA exato.

## Script permitido

`tools/odhen_source_probe_readonly.ps1`

Topologia comprovada usada pelo script:
- `C:\TEKNISA\odhen-perifericos\src`
- `C:\TEKNISA\odhen-perifericos\routes`
- `C:\TEKNISA\odhenPOS\mobile`
- `C:\TEKNISA\odhenPOS\backend_74000`

O script deriva `C:\TEKNISA\odhenPOS` como diretório irmão de `C:\TEKNISA\odhen-perifericos`.

## Segurança

O scanner:
- lê apenas arquivos de código/configuração nas quatro raízes acima;
- exclui `Log`, `Logs`, `Temp`, `cache` e `node_modules`;
- calcula SHA-256 dos arquivos lidos;
- procura somente tokens técnicos;
- retorna somente token, caminho e número da linha, sem conteúdo da linha;
- não consulta banco;
- não lê pedido;
- não usa HTTP;
- não acessa impressora;
- não cria arquivo de saída por conta própria;
- não executa processo Odhen/Periféricos.

## Comando permitido

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\odhen_source_probe_readonly.ps1 `
  -OdhenRoot "C:\TEKNISA\odhen-perifericos"
```

Não forneça `-OdhenPosRoot` nesta execução; deixe o script derivar a raiz irmã automaticamente.

## Tokens que precisamos observar

- `NRCOMANDA`
- `NRCOMANDAEXT`
- `NRVENDAREST`
- `CDPRODUTO`
- `NMPRODUTO`
- `QTPRODCOMVEN`
- `DSOBSDESCIT`
- `DSOBSPEDDIGCMD`
- `DSOBSCOMANDA`
- `TXPRODCOMVEN`
- `DeliveryRepository`
- `getAllDeliveryOrders`
- `BUSCA_ITPEDIDO_ENTREGA`

## Resultado a devolver

Devolva:
- HEAD;
- SHA-256 do script;
- exit code;
- `perifericos_root_exists`;
- `odhen_pos_root_exists`;
- `scanned_roots`;
- `skipped_roots`;
- `files_scanned`;
- `errors`;
- lista de tokens únicos encontrados;
- para cada token, arquivo(s) e linha(s);
- effect boundary completo;
- JSON completo retornado pelo script.

## Gate obrigatório

Depois de devolver o resultado, PARE.

Não abra manualmente nenhum arquivo citado pelo scanner.
Não execute SQL.
Não leia pedido real.
Não teste impressora.
Não faça correção adicional.

Sucesso desta etapa significa provar a superfície de código real, não autorizar leitura de pedido.