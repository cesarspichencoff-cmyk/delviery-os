# Operação com custo externo zero

## Contrato

- modo: `ZERO_EXTERNAL_COST`;
- teto de gasto externo: `0`;
- única situação liberada: `free_verified` com custo estimado `0`, sem gatilho
  de cobrança, trial automático, provedor externo necessário ou desconhecido;
- qualquer outro estado falha fechado.

Não foram adicionadas dependências, APIs pagas, GPU alugada, BSP, WhatsApp
pago, banco, storage, fila, vetor, hosting ou trial.

## Painel futuro “Custos e bloqueios”

Campos: recurso, verificação, custo estimado, evidência, desconhecidos, razão do
bloqueio e última revisão. Ações permitidas: inspecionar e exportar. Ações
proibidas: contratar, ativar trial, autorizar cobrança ou contornar gate.

Testes automatizados cobrem 15 casos financeiros, inclusive custo ausente,
desconhecido, positivo, potencialmente tarifado, trial, provedor externo e
WhatsApp iniciado pela empresa.

