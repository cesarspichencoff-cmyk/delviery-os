# CAIXA_MOOCA — Source semantics bounded read — 2026-10-01

## Missão

Ler somente pequenas janelas de contexto de código nos arquivos já provados pelo scanner, para fechar a semântica dos IDs, joins e observações do delivery sem acessar SQL ou pedido real.

## Esta etapa NÃO autoriza

- SQL;
- leitura de pedido real;
- leitura de logs;
- impressão;
- spooler;
- rede;
- alteração de Odhen/Teknisa;
- fiscal/SEFAZ;
- leitura ampla de arquivos fora da whitelist.

## Fonte

Repositório: `cesarspichencoff-cmyk/delviery-os`
Branch: `fix/odhen-routing-config-proof-20260930`

Use o HEAD atual da branch e registre o SHA exato.

## Script permitido

`tools/odhen_source_semantics_probe_readonly.ps1`

O script só considera estes nomes de arquivo:
- `routes.json`
- `Delivery.php`
- `MSDEQuery.php`
- `ImpressaoDelivery.php`
- `Printing.php`
- `imp.js`
- `index.js`
- `DeliveryRepository.js`
- `DeliveryService.js`
- `PerifericosService.js`
- `DeliveryController.js`
- `orderDelivery.json`

E somente sob as quatro raízes já provadas:
- `C:\TEKNISA\odhen-perifericos\src`
- `C:\TEKNISA\odhen-perifericos\routes`
- `C:\TEKNISA\odhenPOS\mobile`
- `C:\TEKNISA\odhenPOS\backend_74000`

## O que ele pode retornar

Para cada ocorrência dos tokens técnicos, no máximo:
- caminho;
- SHA-256 do arquivo;
- linha da ocorrência;
- até 4 linhas anteriores;
- a linha da ocorrência;
- até 8 linhas posteriores.

Máximo de 8 ocorrências por token por arquivo.

Objetivo específico desta rodada:
1. provar o significado prático de `NRCOMANDA`, `NRCOMANDAEXT` e `NRVENDAREST` no fluxo delivery;
2. provar como pedido e itens se ligam;
3. provar onde entram `CDPRODUTO`, `NMPRODUTO` e `QTPRODCOMVEN`;
4. separar semanticamente `DSOBSDESCIT`, `DSOBSPEDDIGCMD`, `DSOBSCOMANDA` e `TXPRODCOMVEN`;
5. identificar a cadeia `getAllDeliveryOrders` / `DeliveryRepository` / `BUSCA_ITPEDIDO_ENTREGA`.

## Comando permitido

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\odhen_source_semantics_probe_readonly.ps1 `
  -OdhenRoot "C:\TEKNISA\odhen-perifericos"
```

Não passe `-OdhenPosRoot`; deixe o script derivar `C:\TEKNISA\odhenPOS` como diretório irmão.

## Resultado a devolver

Devolva:
- HEAD;
- SHA-256 do script;
- exit code;
- `files_considered`;
- `errors`;
- `effects` completo;
- JSON completo do probe.

Além do JSON, faça um resumo factual separado em quatro blocos:

### A. Identidades
- evidência de `NRCOMANDA`;
- evidência de `NRCOMANDAEXT`;
- evidência de `NRVENDAREST`;
- o que o código prova;
- o que ainda permanece UNKNOWN.

### B. Pedido → itens
- função/consulta que carrega itens;
- chaves usadas no vínculo;
- onde entram `CDPRODUTO`, `NMPRODUTO`, `QTPRODCOMVEN`.

### C. Observações
- `DSOBSDESCIT`;
- `DSOBSPEDDIGCMD`;
- `DSOBSCOMANDA`;
- `TXPRODCOMVEN`;
- separar item-level, order-level e UNKNOWN apenas se o código realmente sustentar isso.

### D. Cadeia delivery
- `getAllDeliveryOrders`;
- `DeliveryRepository`;
- `BUSCA_ITPEDIDO_ENTREGA`;
- sequência de chamadas demonstrável pelo código.

## Regras de interpretação

- FACT somente quando o trecho de código sustentar diretamente;
- INFERENCE deve ser rotulada;
- não inferir que `NRCOMANDAEXT` é a sequência exibida do iFood sem evidência explícita;
- não inferir serviço LUNCH/DINNER nesta rodada;
- não transformar nome de variável em semântica de negócio sem prova contextual.

## Gate obrigatório

Depois de devolver o resultado, PARE.

Não execute SQL.
Não abra pedido real.
Não faça teste de impressora.
Não altere scanner ou código local.

Sucesso desta etapa significa fechar a semântica do código estático; não significa autorizar leitura operacional.