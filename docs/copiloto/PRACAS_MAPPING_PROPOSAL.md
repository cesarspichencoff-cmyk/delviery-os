# Proposta de Mapeamento das Praças — Copiloto (especificação, sem código)

> **Proposta operacional. Nenhum código foi alterado.** O mapeamento atual do `app.js`
> (baseline `101680a`) permanece como está até decisão do César.

## 1. Os dois vocabulários (não equivalentes automaticamente)

- **Motor — 8 praças canônicas de produção:** `combinados · duplas · enrolados · enrolados_quentes · cozinha_quentes · sobremesa · bar_bebidas · montagem_outros`.
- **Interface — 6 conceitos visuais:** `Sushi · Quentes · Cozinha · Caixa · Conferência · Motoboy`.

A interface criou conceitos visuais **sem ligação explícita** com as fontes do motor. Cozinha e Caixa estavam **hardcoded em estado de validação** (`app.js:315`, `app.js:329`) — por isso não reagiam aos dados.

## 2. Matriz final das células

| Conceito visual | Tipo | Fonte canônica | Regra de agregação | Cobertura atual | Fontes ausentes | Estado |
|---|---|---|---|---|---|---|
| **Sushi** | agregação visual de produção | `combinados` + `duplas` + `enrolados` | pressão combinada das 3; explicar qual praça contribuiu | sim (composição sintética rotulada) | composição real | ativa |
| **Quentes** | praça visual de produção | `enrolados_quentes` **(só)** | direta | hoje inclui também `cozinha_quentes` (a corrigir) | — | ativa, mapeamento a corrigir |
| **Cozinha** | praça visual de produção | `cozinha_quentes` | direta | **nenhuma — hardcoded** | ligação com a praça | inerte (a corrigir) |
| **Caixa** | **célula operacional derivada** | não é praça — prontos/concentração (`p`); `r`/`c` só quando relevantes | leitura derivada explicável | **parcial** | sacola, comanda, saída, retirada, handoffs, viagens, ocorrências, mensagens | **viva, leitura parcial** |
| **Conferência** | **célula operacional derivada distinta** | **não comprovada / parcial** | — | **não comprovada** | início/fim de conferência, itens pendentes, checklist, tempo em conferência | precisa **fonte própria** |
| **Motoboy / Entregas** | célula derivada futura | eventos reais do ENTREGAS | — | **não integrada** | integração Copiloto×ENTREGAS | "Aguardando integração" |
| `sobremesa` | praça canônica | `sobremesa` | — | sem círculo próprio | representação visual | fora da 1ª camada |
| `bar_bebidas` | praça canônica | `bar_bebidas` | — | sem círculo próprio | representação visual | fora da 1ª camada |
| `montagem_outros` | praça canônica | — | — | **hipótese: Montagem/Sacolas** | comprovação | ver §4 |

## 3. Mapeamento proposto

### Sushi — agregação visual
`combinados + duplas + enrolados`. Pressão **combinada** das três; deve **respeitar o significado dos indicadores do motor** e **explicar qual praça contribuiu**. (Coincide com o comportamento atual.)

### Quentes — praça visual
Fonte: **`enrolados_quentes` apenas**. **Não incluir `cozinha_quentes`.**

### Cozinha — praça visual
Fonte: **`cozinha_quentes`**. Deve receber dados reais; **não deixar hardcoded**. **Não duplicar `cozinha_quentes` em Quentes e Cozinha.**

### Caixa — célula derivada
Fontes atuais: pedidos prontos; concentração temporal de prontos; `r`/`c` só quando realmente relevantes. Cobertura **parcial**. Ver [CAIXA_OPERATIONAL_MODEL.md](CAIXA_OPERATIONAL_MODEL.md).

### Conferência — célula derivada distinta
**Não é sinônimo de Caixa** e **não deve ser unificada** com ele. Fonte atual não comprovada; precisa de **fonte própria** (início da conferência, pedido em conferência, itens pendentes, checklist final, pedido conferido, tempo aguardando conferência). **Não alimentar com `montagem_outros` só para preencher a célula.**

### Motoboy / Entregas
Célula derivada **futura**, alimentada por eventos reais do ENTREGAS **após integração**. Enquanto não integrada: **"Aguardando integração"** — sem números simulados.

### Bar e Sobremesa
Praças canônicas **sem representação própria** entre os 6 círculos. **Não inventar círculos.** Opções ao César: incorporar em outra leitura · manter fora da 1ª camada · contexto secundário · células futuras.

## 4. `montagem_outros` — hipótese principal registrada

**Não mapear para "Conferência" sem comprovação.** Pela operação descrita, aproxima-se de preparação de sacola, comanda, montagem final, embalagem, itens externos e organização física da saída.

> `montagem_outros` → **Montagem / Sacolas** → **possível sinal de pressão para o Caixa**

Só servirá à **Conferência final** se houver evidência de **eventos de checklist ou validação item a item**.

## 5. Impacto do mapeamento proposto vs. código atual (`101680a`)

| Célula | Hoje (código) | Proposto | Mudança? |
|---|---|---|---|
| Sushi | combinados+duplas+enrolados | igual | não |
| Quentes | enrolados_quentes **+ cozinha_quentes** | enrolados_quentes só | **sim** |
| Cozinha | hardcoded `validacao` | `cozinha_quentes` real | **sim** |
| Caixa | hardcoded `validacao` | célula derivada, leitura parcial | **sim** |
| Conferência | deriva de `sits` | célula distinta com fonte própria (a definir) | **sim** |
| Motoboy | deriva de `sits` saída | "Aguardando integração" até ENTREGAS integrar | **sim** |

**Nenhuma dessas mudanças foi implementada.** Todas dependem de decisão do César e de uma fase própria de implementação.

## 6. Decisões pendentes do César

1. Separar `cozinha_quentes` de Quentes e ligá-lo à Cozinha.
2. Confirmar `montagem_outros` como Montagem/Sacolas e se serve de sinal de pressão do Caixa.
3. Definir a fonte própria da Conferência.
4. Destino de `bar_bebidas` e `sobremesa`.
5. Momento da integração ENTREGAS→Copiloto (célula Motoboy/Entregas).
6. Autorizar a leitura do Caixa em modo sombra.
