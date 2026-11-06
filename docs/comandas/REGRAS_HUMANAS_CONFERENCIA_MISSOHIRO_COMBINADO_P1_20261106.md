# Conferência TATÁ Itaim — regras humanas específicas (06/11/2026)

**Fonte:** declaração direta de César em conversa do projeto VÉRTICE 2.2, em resposta ao diagnóstico da Conferência, complementando a confirmação de que o Missoshiro é sopa quente da Cozinha e o combinado investigado é frio para uma pessoa.

**Estado de aplicação:** `HUMAN_CONFIRMED_RULES / REVIEW_ONLY`. Este documento é fonte de requisitos humanos, **não é alteração de catálogo, regra embarcada, execução no caixa, prova de origem iFood, emissão ou aprovação de impressão**. Não contém pedido real, identificadores, códigos nativos ou observações de cliente.

## Regras confirmadas (escopo específico)

| Produto discutido | Classe térmica | Embalagem individual | Kit | Sacola externa |
| --- | --- | --- | --- | --- |
| **Missoshiro** | Sopa **quente**, preparo da **Cozinha** | **Pote de isopor** (sem volume/capacidade ou especificação de tampa presumidos) | **Nenhum** | **P (pequena)**, **sempre separada de qualquer item frio** |
| **Combinado Salmão/Atum para 1 pessoa** (referido por César como **“Combinado salmão p/1”** durante esta confirmação) | **Frio** | **Caixa 750 ml** | **1 × Kit p/1** para uma unidade do combinado | **M (média)**, para uma unidade do combinado na composição discutida |

## Proibição e precedência

- **Missoshiro e itens frios nunca compartilham a mesma sacola externa.** Não basta separar por dentro: deve existir segregação **por sacolas externas distintas**. Missoshiro **não recebe Kit Quente nem Kit p/1 por conta própria**.
- A regra específica do Missoshiro **prevalece sobre** a regra genérica de 05/10/2026 que permite quente/frio na mesma sacola quando segregados internamente. **Não revogar a regra geral** para outros itens quentes sem confirmação humana específica.
- Para **uma unidade de cada** produto acima, a montagem mínima correspondente a esses dois itens exige **1 × P (Missoshiro) + 1 × M (combinado)**, sem sacola compartilhada. Isso **não determina** o total definitivo de volumes quando houver terceiros produtos, várias unidades ou exigências de capacidade/encaixe adicionais.
- **Não classificar Missoshiro como Nasu no Missô** nem copiar desse outro produto a caixa 650 selada ou o Kit Quente. O pote de isopor do Missoshiro não é uma caixa 650 selada.
- O combinado desta confirmação **não herda automaticamente** regras de todos os Combinados Executivos nem do **Salmão/Atum 2 Pessoas**. O nome usado nesta conversa é uma referência humana, não autorização para colidir ou generalizar códigos de produto.

## Portões técnicos ainda necessários

1. Vincular cada descrição à identidade nativa exata e ao código canônico do produto, sem depender de similaridade textual, `item_index` ou código de outra variedade. Confirmar a correspondência do “combinado salmão p/1” com o produto “Salmão/Atum 1 Pessoa” antes de ativar qualquer mapeamento; preservar eventual dúvida.
2. Revisar a classificação no catálogo e nas regras do motor apenas em branch/ambiente de teste com identidade comprovada. Não alterar o `app-data.json` instalado no `CAIXA_MOOCA`.
3. Executar testes offline de regressão, incluindo: Missoshiro sozinho sem kit em P; Missoshiro + combinado frio exigindo P e M separadas; combinado sozinho em caixa 750, Kit p/1 e M; terceiro item desconhecido mantém a sacola total `UNKNOWN`; regras genéricas de outros itens quentes permanecem intactas; nenhum dado privado ou conteúdo de pedido é exposto.
4. Resolver independentemente a destinação da **observação geral** do pedido, a completude semântica da revisão SQL, identidade independente iFood, persistência da sequência, origem do primeiro despacho e controles de duplicação antes de qualquer prévia operacional/impressão.

**Proibido nesta etapa:** classificar por nome aproximado, forçar `ready=true`, ocultar bloqueios `KITS_NOT_FACT`/`BAG_SIZE_NOT_FACT`, acionar impressora/spooler, iniciar processos ou comandos no caixa, alterar Teknisa, realizar deploy, merge ou cutover.

**Gates:** `CONFERENCE_PREVIEW=HOLD` · `PRINT=HOLD` · `CUTOVER=HOLD` · `PR=#135 DRAFT`.
