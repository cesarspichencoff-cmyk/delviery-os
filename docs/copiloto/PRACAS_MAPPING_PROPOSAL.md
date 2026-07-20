# Proposta de Mapeamento das Praças — Copiloto (especificação, sem código)

> **Proposta operacional inicial. Nenhum código foi alterado.** O mapeamento atual do
> `app.js` (baseline `101680a`) permanece como está até decisão do César. Este documento
> registra a divergência entre os dois vocabulários e propõe a ligação explícita.

## 1. Os dois vocabulários (não equivalentes automaticamente)

- **Motor — 8 praças canônicas de produção:** `combinados · duplas · enrolados · enrolados_quentes · cozinha_quentes · sobremesa · bar_bebidas · montagem_outros`.
- **Interface — 6 conceitos visuais:** `Sushi · Quentes · Cozinha · Caixa · Conferência · Motoboy`.

A interface criou conceitos visuais **sem ligação explícita** com as fontes do motor. Cozinha e Caixa estavam **hardcoded em estado de validação** (`app.js:315`, `app.js:329`) — por isso não reagiam aos dados.

## 2. Matriz objetiva corrigida

| Conceito visual | Tipo | Fonte canônica | Regra de agregação | Cobertura atual | Fontes ausentes | Estado |
|---|---|---|---|---|---|---|
| **Sushi** | agregação visual de produção | `combinados` + `duplas` + `enrolados` | pressão combinada das 3 (pior estado + explicar qual praça contribuiu) | sim (composição sintética rotulada) | composição real (motor B) | ativa |
| **Quentes** | praça visual de produção | `enrolados_quentes` **(só)** | direta | **hoje inclui também `cozinha_quentes`** (a corrigir) | — | ativa, mapeamento a corrigir |
| **Cozinha** | praça visual de produção | `cozinha_quentes` | direta | **nenhuma — hardcoded `validacao`** | ligação com `cozinha_quentes` | **inerte (a corrigir)** |
| **Conferência/Montagem** | célula derivada / praça? | `montagem_outros` (a confirmar) | a definir | deriva de `sits`, não da praça | confirmação do significado | ambígua |
| **Caixa** | **célula operacional derivada** | não é praça — deriva de prontos/saída/expedição | leitura derivada explicável | **parcial** (só prontos hoje) | sacola, comanda, retirada, mensagens | viva, leitura parcial — ver [CAIXA_OPERATIONAL_MODEL](CAIXA_OPERATIONAL_MODEL.md) |
| **Motoboy** | célula operacional derivada (futura) | eventos do ENTREGAS | leitura derivada | **não integrada** | integração Copiloto×ENTREGAS | aguardando integração |
| — `sobremesa` | praça canônica | `sobremesa` | — | **sem círculo próprio** | representação visual | fora da 1ª camada |
| — `bar_bebidas` | praça canônica | `bar_bebidas` | — | **sem círculo próprio** | representação visual | fora da 1ª camada |

## 3. Mapeamento proposto (para decisão do César)

### Sushi — agregação visual
`combinados + duplas + enrolados`. Representa a pressão **combinada** das três. Regra deve **respeitar o significado dos indicadores do motor** e **explicar qual praça contribuiu** para o estado — não somar valores de formas incompatíveis. (Coincide com o comportamento atual.)

### Quentes — praça visual
Fonte: **`enrolados_quentes` apenas**. **Não incluir `cozinha_quentes`.** (Muda o comportamento atual, que agrega as duas.)

### Cozinha — praça visual
Fonte: **`cozinha_quentes`**. Deve **receber dados reais** dessa praça; **não deixar hardcoded em validação**. **Não duplicar `cozinha_quentes` em Quentes e Cozinha ao mesmo tempo** (por isso Quentes perde `cozinha_quentes`).

### Conferência ou Montagem
Fonte possível: **`montagem_outros`**. **Antes de chamar de "Conferência", comprovar** se `montagem_outros` é a conferência final. Se representar preparação/embalagem/montagem ampla, usar **"Montagem"**. Não escolher "Conferência" só por soar melhor.

### Bar e Sobremesa
`bar_bebidas` e `sobremesa` são praças canônicas **sem representação própria** entre os 6 círculos. **Não inventar círculos automaticamente.** Opções para o César:
1. incorporar em outra leitura;
2. manter fora da primeira camada;
3. apresentar em contexto secundário;
4. criar células futuras.

## 4. Impacto do mapeamento proposto vs. código atual (`101680a`)

| Célula | Hoje (código) | Proposto | É mudança? |
|---|---|---|---|
| Sushi | combinados+duplas+enrolados | igual | não |
| Quentes | enrolados_quentes **+ cozinha_quentes** | enrolados_quentes só | **sim** |
| Cozinha | hardcoded `validacao` | cozinha_quentes real | **sim** |
| Conferência | deriva de `sits` | confirmar montagem_outros → Conferência/Montagem | **talvez (nome/fonte)** |
| Caixa | hardcoded `validacao` | célula derivada, leitura parcial | **sim** |
| Motoboy | deriva de `sits` saída | célula derivada futura (ENTREGAS) | futuro |

**Nenhuma dessas mudanças foi implementada.** Todas dependem de decisão do César e de uma fase de implementação própria (que tocaria `app.js` — proibido nesta etapa).

## 5. Decisões pendentes do César

1. Aprovar separar `cozinha_quentes` de Quentes e ligá-lo à célula Cozinha.
2. Confirmar o significado de `montagem_outros` → nome "Conferência" ou "Montagem".
3. Destino de `bar_bebidas` e `sobremesa` (4 opções, §3).
4. Caixa e Motoboy como células derivadas — ver [CAIXA_OPERATIONAL_MODEL](CAIXA_OPERATIONAL_MODEL.md).
5. Momento da implementação (nenhuma feita agora).
