# CAIXA_MOOCA — Targeted read-path proof — 2026-10-01

## Missão

Fechar o caminho de leitura do delivery por código estático atual, sem SQL e sem pedido real, para decidir se existe uma rota local/API que possa substituir o acesso SQL privilegiado.

## Esta etapa NÃO autoriza

- SQL;
- leitura de pedido real;
- chamada HTTP;
- leitura de logs;
- impressão;
- spooler;
- alteração de Odhen/Teknisa;
- fiscal/SEFAZ;
- leitura fora dos seis arquivos exatos definidos pelo script.

## Fonte

Repositório: `cesarspichencoff-cmyk/delviery-os`
Branch: `fix/odhen-routing-config-proof-20260930`

Use o HEAD atual da branch e registre o SHA exato.

## Script permitido

`tools/odhen_read_path_targeted_probe_readonly.ps1`

Ele lê somente estes seis arquivos exatos:

- `C:\TEKNISA\odhenPOS\backend_74000\routes.json`
- `C:\TEKNISA\odhenPOS\backend_74000\src\Controller\Delivery.php`
- `C:\TEKNISA\odhenPOS\backend_74000\src\Service\Delivery.php`
- `C:\TEKNISA\odhenPOS\backend_74000\src\Util\MSDEQuery.php`
- `C:\TEKNISA\odhenPOS\mobile\js\repositories\DeliveryRepository.js`
- `C:\TEKNISA\odhenPOS\mobile\js\services\DeliveryService.js`

Não há busca recursiva por nome de arquivo e não há limite de 8 ocorrências.

## Âncoras

O probe captura somente contexto ao redor de:

- `/DeliveryRepository`
- `/AllDeliveryRepository`
- `function getDeliveryOrders`
- `function getAllDeliveryOrders`
- `function getProdutosDlv`
- `function getMovcaixadlv`
- `GET_ALL_DELIVERY_ORDERS`
- `GET_PRODUTOS_PEDIDODLV`
- `DeliveryRepository.download`
- `RepositoryFactory.factory`

## Objetivo analítico

Responder apenas estas perguntas:

1. Qual rota chama a leitura de delivery?
2. Qual controller e qual service ela chama?
3. Quais parâmetros são exigidos?
4. `GET_ALL_DELIVERY_ORDERS` é somente SELECT?
5. `GET_PRODUTOS_PEDIDODLV` é somente SELECT?
6. Existe qualquer write/side effect dentro dessa cadeia?
7. O código mostra o método HTTP ou apenas a abstração `download`?
8. A rota local poderia ser candidata a fonte read-only sem usar o principal SQL sysadmin?

## Comando permitido

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\odhen_read_path_targeted_probe_readonly.ps1 `
  -OdhenRoot "C:\TEKNISA\odhen-perifericos"
```

Não passe `-OdhenPosRoot`; deixe o script derivar `C:\TEKNISA\odhenPOS`.

## Resultado a devolver

Devolva:
- HEAD;
- SHA-256 do script;
- exit code;
- `targets`;
- `errors`;
- `effects` completo;
- JSON completo;
- resumo factual das oito perguntas acima.

## Regras de conclusão

- FACT apenas quando sustentado pelo trecho atual;
- INFERENCE rotulada;
- se o método HTTP não estiver explícito, marque UNKNOWN;
- não chamar a rota;
- não testar endpoint;
- não abrir pedido;
- não usar SQL;
- não inferir segurança apenas porque a função se chama `download`.

## Gate

Depois de devolver o resultado, PARE.

Se a cadeia inteira for estática e somente leitura, isso gera apenas `READ_PATH_CANDIDATE_PROVEN`.
Não gera autorização para chamada real nem para leitura de pedido.