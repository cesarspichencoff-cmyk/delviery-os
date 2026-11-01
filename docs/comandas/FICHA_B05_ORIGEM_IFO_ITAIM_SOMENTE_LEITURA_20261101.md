# TATÁ Comandas — ficha mínima B0.5 de origem iFood/ForSale (Itaim)

**Situação:** procedimento preparado em 01/11/2026, **NÃO EXECUTADO NO RETAIL**. Aplicável apenas a consulta acompanhada por responsável com permissão legítima. Não é autorização para acessar configurações, nem evidência de primeira impressão. PR #127 permanece DRAFT/HOLD.

## Objetivo e fronteira

Resolver **em qual filial, loja e caixa a integração `IFO` cria a comanda ForSale**; não presumir que o computador `CAIXA_MOOCA` seja o emissor. O resultado escolhe o **alvo técnico para investigação B1** (primeiro despacho nativo de produção), sem imprimir, alterar parâmetros, ler pedido ou consumir sequência.

**Permissões necessárias:** alguém já autenticado e autorizado a visualizar essas telas, com responsável acompanhando. Nenhum token, senha, cookie, sessão, documento do cliente, código de autorização, número de venda ou foto completa de tela deve ser coletado. Se a tela exigir **Editar**, elevar privilégio, abrir aba **Token** ou revelar segredo: **interromper** e registrar apenas `ACCESS_DENIED_OR_SENSITIVE_SCREEN`.

## Rota decisória conforme manual da Teknisa

**A — A origem `IFO` está vinculada à unidade Itaim?**

Em `Parametrização → Vendas → Integração → Cadastro de Integração`, localizar o identificador **IFO**, conferir apenas que a **Unidade** pertinente é a do Itaim e ler o indicador **Utiliza Loja e Caixa do Vendedor Padrão**. **Não editar, ativar, desativar ou salvar.** O exemplo do manual (filial 0005) é fictício para a TATÁ; não copiar valores de exemplo.

- **`NÃO`:** segundo o manual, a aba **Unidade** exige **Loja** e **Caixa** por filial. Conferir apenas o par de códigos não sensíveis caso apareça numa superfície já liberada, **sem abrir `Token`**. Se os valores só aparecerem numa tela com token, marcar `MAPPING_NOT_VISIBLE_WITHOUT_SECRET`; não tentar alternativa.
- **`SIM`:** **não** atribuir o pedido ao caixa local por inferência. Consultar a unidade Itaim em `Parametrização → Vendas → Parâmetros de Gestão de Vendas → Delivery`, aba **Parâmetros**, e localizar apenas o **código do Vendedor Padrão** (sem dados de consumidor). Depois, em `Parametrização → Vendas → Caixa → Cadastro de Caixa`, filtrar **Unidade + Loja** e, para os caixas com modalidade delivery, verificar **Parâmetros → Vendedores Associados**. A identidade de vendedor deve bater **exatamente**. Se houver zero ou múltiplos caixas candidatos, **não escolher por nome, estação ou horário**; `SELLER_CASHBOX_AMBIGUOUS_OR_MISSING`.

**B — Existe sincronização de delivery centralizado?**

A documentação mostra `Cadastro de Caixa → Parâmetros → Frente de Caixa → Frente Caixa (3) → Sincronização com Delivery`, indicador **Realiza sincronização com Delivery Centralizado**. Só observar se esse indicador estiver disponível **sem editar**. O valor `SIM`/`NÃO` não identifica o executável emissor, não atesta a topologia e **não autoriza mudança**.

**C — Como delimitar o próximo alvo?**

Com `IFO`, unidade, loja, caixa, vínculo de vendedor quando aplicável e sincronização apenas **observados**, o próximo alvo é o **componente/serviço de integração legitimamente identificado para aquele caixa**, a localizar por fonte de instalação/versão permitida. Não presumir `FosExp.exe`, `Account::order`, `ImpressaoDelivery`, Gestor iFood, GP iFood ou uma fila Windows como primeiro despacho só porque estão instalados.

## Registro mínimo sem dados pessoais

Não salvar uma exportação indiscriminada de configuração. Uma nota técnica separada, autorizada e revisada pelo responsável pode conter apenas os campos abaixo; **a ficha em si não declara seus valores presentes na operação**:

| Campo observável | Valor seguro permitido | Significado |
|---|---|---|
| unidade | `0001` se realmente observada | Escopo da consulta, não configuração presumida |
| projeto de integração | `IFO` / `NOT_VISIBLE` | Nome do conector, não credencial |
| loja e caixa via vendedor padrão | `SIM` / `NÃO` / `UNKNOWN` | Define qual ramo consultar |
| vendedor padrão | código interno não identificável de cliente, ou `UNKNOWN` | Somente no ramo `SIM` |
| loja/caixa candidatos | códigos mínimos, se não sensíveis e autorizados | Evidência, não identificação do emissor |
| vendedor associado ao caixa | `MATCH` / `NO_MATCH` / `AMBIGUOUS` / `NOT_VISIBLE` | Sem nome de funcionário ou dado pessoal |
| sincronização centralizada | `SIM` / `NÃO` / `NOT_VISIBLE` | Não comprova emissão |
| evidência da tela | data local e referência de superfície consultada | Sem screenshot integral, token ou conteúdo de pedido |
| acesso | `VIEW_ONLY` / `ACCESS_DENIED` / `SECRET_SCREEN_REQUIRED` | Impede reconsulta indevida |

**Resultado por classe:** `B05_UNVERIFIED` (até observação real); `B05_MAPPING_AMBIGUOUS_HOLD` (zero/múltiplos candidatos, vínculo inconsistente, tela protegida); ou `B05_MAPPING_REVIEWED_ONLY` (vínculo visual coerente, autorização/versão atuais verificadas). **Nenhuma das classes significa `FIRST_NATIVE_DISPATCH_PROVEN`, `PRINTED` ou liberação operacional.**

## O próximo B1, depois do B0.5

Pedir aprovação **específica da fonte**, dispositivo e método read-only para verificar um **evento natural** da mesma revisão de comanda `DLV_IFO` com: chave composta nativa, primeira tentativa distinta de reimpressão, componente/callsite e hash, transporte efetivo (ponte/PHP/arquivo), praça, destino principal e backup. Usar metadados mínimos; não criar pedido, monitorar indiscriminadamente, capturar payload ou habilitar reimpressão. Se não for possível sem segredo ou mudança em produção, parar.

O B1 não substitui a sequência TATÁ de 3 dígitos persistida sob chave forte, ausência de emissão dupla, preservação fiscal/mesa/balcão e piloto físico com autorização específica.

## Referências e ressalva de versão

- [Teknisa — Manual Integração iFood 4.2.0](https://ead.teknisa.com/wp-content/uploads/2025/11/Manual-Integracao-Teknisa-iFood.pdf), seções **3.a (Vendedor Padrão)**, **3.d (Caixa Associado ao Vendedor)**, **5.b (Identificador IFO / loja e caixa padrão)**, **5.d (Loja e Caixa por filial)** e **7.a (sincronização centralizada)**.
- [Auditoria do caminho de impressão e seus transportes](AUDITORIA_TRANSPORTE_NATIVO_TEK_IMPRESSAO_20261027.md).
- [Protocolo de leitura passiva e efeitos permitidos](PROTOCOLO_OBSERVACAO_PASSIVA_PRIMEIRO_DESPACHO_20261028.md).

A interface documentada usa exemplos e prints históricos de outra unidade. A documentação **não comprova os valores ou a disponibilidade real** do Retail do Itaim em 2026. Se a UI for diferente, não improvisar ações de configuração.

**Estado:** `B05_UNVERIFIED`; `FIRST_NATIVE_DISPATCH=UNKNOWN`; `PR_DRAFT_HOLD=true`; `PHYSICAL_PRINT_NOT_PROVEN=true`. **Nenhuma consulta, escrita, login ou impressão executados por este arquivo.**
