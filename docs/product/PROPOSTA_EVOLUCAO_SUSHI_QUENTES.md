# Proposta de evolução — Sushi Quentes como unidade operacional

> **Proposta, não decisão.** O domínio canônico **não mudou**: `src/product/viewmodels/areas.ts`
> segue intocado, D45 e D46 seguem valendo, e a migração **não ocorreu**.
>
> Escrita em 2026-08-05 pela missão `REVOLUTION 0-A`, a pedido do César, para registrar a diferença
> entre o domínio canônico e a realidade física da operação — com o impacto medido, não estimado.
>
> A alteração definitiva é **missão separada**, depois de validação do Lab, análise de impacto,
> replay e auditoria.

---

## 1. O que está em jogo

**Canônico hoje (D45/D46, confirmado pelo César em 2026-08-01):** cinco ambientes — Caixa, Sushi,
Cozinha, Conferência, Motoboy. `enrolados_quentes` ("Sushi Quentes") é **subárea de Sushi**, visível
dentro dele. A decisão foi correta para o que se sabia: o nome descreve praça e fluxo, não
temperatura, e o Sushi é ambiente geral com subáreas visíveis.

**Realidade física declarada pelo César em 2026-08-04:**

- Sushi Quentes fica **fisicamente separado** do Sushi;
- fica **no salão, perto do Caixa**;
- tem **produção, carga, ritmo, capacidade e gargalo próprios**;
- pode estar **sobrecarregado com o Sushi calmo**;
- pode precisar **virar o Foco e receber recomendação própria**.

**A consequência que decide a proposta:** tratada só como subárea agregada, a sobrecarga do Sushi
Quentes pode desaparecer dentro do estado do Sushi. Um gargalo real some da tela — que é exatamente
o que o produto existe para impedir.

---

## 2. O que o Lab implementou, e o que ele mediu

Projeção **local ao Lab**, em `labs/operacao-viva-v4/dominio/unidade-operacional.ts`:

```
ambiente canônico legado    SUSHI
subárea canônica legada     enrolados_quentes
unidade experimental        SUSHI_QUENTES     parent = SUSHI
```

A promoção acontece num lugar só — `unidadeDaPraca()` —, e a regra é: **a subárea manda mais que o
ambiente**. Um sinal de `enrolados_quentes` responde por `sushi_quentes` mesmo carregando
`ambiente: "sushi"` do lado canônico.

**A medição, na cena `sushi-quentes-isolado`** (carga real contra os baselines calibrados do motor:
`enrolados_quentes` 6 contra baseline 3 = razão 2,0 → severidade 3 pela regra do motor; Combinados,
Duplas e Enrolados no baseline):

| | Domínio canônico | Projeção do Lab |
|---|---|---|
| Estado do Sushi | pressionado (a subárea puxa o agregado) | **verde, fluindo** |
| Estado do Sushi Quentes | invisível como unidade | **vermelho, 100% de pressão** |
| Quem ocupa o Foco | "Sushi" | **"Sushi Quentes"** |
| Ação sugerida | reforçar o Sushi | reforçar a bancada do salão |

Guarda executável: `G2b` do `npm run test:lab:v4`, com o **par simétrico** — não basta o Sushi Quentes
ficar vermelho, o Sushi tem que continuar **verde ao lado**, senão um CSS que pintasse tudo passaria.
Mutação `MD3` devolve a absorção e derruba a guarda.

---

## 3. A divergência que isso revela em `sinais.ts` — e que NÃO foi corrigida

**S12 ("só quentes") decide por ambiente, não por unidade.** Em `src/product/viewmodels/sinais.ts`:

```ts
return pracas.every((pr) => ambienteDaPraca(pr) !== "sushi");
```

Como `enrolados_quentes` pertence ao ambiente `sushi`, **um pedido composto só de Sushi Quentes não
produz S12** — o motor canônico não diz que ele pode ser montado na bancada do caixa, embora ele não
dependa da bancada fria.

Isso está demonstrado, lado a lado, na cena `pedido-so-quente`: `G-701` (só Cozinha) recebe o sinal;
`G-702` (só Sushi Quentes) **não** recebe, e a tela diz por quê.

**`sinais.ts` não foi tocado.** Ele está entre os caminhos protegidos pelo PF4, e mudar a regra de um
sinal é decisão de produto (índice canônico §6, "abandono ou mudança de sinal exige o César").

---

## 4. Impacto de uma migração — por área

### 4.1 Contratos

| Artefato | Impacto |
|---|---|
| `AmbienteId` em `areas.ts` | ganha um sexto valor. **Union type**: todo `switch` e todo `Record<AmbienteId, …>` passa a exigir o caso novo — o compilador acusa, e isso é a favor |
| `PRACAS` | `enrolados_quentes` muda de `ambiente: "sushi"` para `"sushi_quentes"`, e de `papel: "subarea"` para `"producao"` |
| `AMBIENTES` | entrada nova, com `medicao: "carga_por_praca"` |
| `CAMINHO_DO_PEDIDO` | duas arestas novas: `caixa → sushi_quentes` e `sushi_quentes → conferencia` |
| `subareasDe("sushi")` | passa a devolver 3 em vez de 4 |

### 4.2 Sinais

- **S12** muda de comportamento para uma classe inteira de pedidos (os só-Sushi-Quentes passam a
  receber o sinal). **É mudança de sinal, e exige o César.**
- **S5** passa a nascer com `ambiente: "sushi_quentes"`. Séries históricas que agrupam por ambiente
  ganham uma categoria e perdem volume em "sushi".
- **S7, S8, S18** herdam o ambiente da praça: mudam de rótulo, não de regra.

### 4.3 Projeções e replay

- `home-vm.ts`: `pressaoDoAmbiente` passa a agregar 3 praças em Sushi em vez de 4. **O número muda**
  para toda leitura histórica.
- **Replay não é retrocompatível em APRESENTAÇÃO.** Os eventos não mudam — a projeção sobre eles
  muda. Uma leitura de 2026-07 reprojetada depois da migração mostra Sushi menos carregado e uma
  unidade nova. Isso precisa estar declarado, ou vira "o histórico mudou sozinho".
- `src/product/eventos/catalogo-operacional.ts`: `trabalho_praca_observado@1` carrega **praça**, não
  ambiente — **não muda**. É a favor da migração: o fato de origem já é granular.

### 4.4 Fixtures e testes

| Gate | O que quebra |
|---|---|
| `test:platform:home` (44) | as cenas contam 5 ambientes; contagens e cores mudam |
| `test:platform:organismo` (27) | `FORMA` e `FILEIRAS` em `home.js` têm 5 áreas |
| `test:platform:r1` (24) | rótulos: precisa incluir o ambiente novo |
| `test:platform:figma-parity` (23) | a matriz do organismo tem 18 cenários sobre 5 áreas |
| **PF4 e os 7 gates de congelamento** | `areas.ts`, `viewmodels/` e `ui/` estão congelados desde `73f2f0b`. **Migrar exige reancorar os baselines**, e isso é decisão do César |

### 4.5 Consumidores

Nenhum consumidor externo — não há API pública sobre `AmbienteId`. O Android e o runtime crítico não
conhecem ambientes: eles falam de viagem e dispositivo.

---

## 5. A regra física que veio junto — `ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT`

Declarada pelo César em 2026-08-04. **Independência produtiva não é independência de consolidação.**

Para cada pedido existe **um** ponto de abertura e consolidação. Todas as sacolas daquele pedido são
abertas ali, todos os itens convergem para ali. Não existe parte no Caixa e parte no Delivery, não
existe junção posterior, e sacola já aberta não muda de ambiente.

- pedido **com qualquer item de Sushi** → Delivery/Conferência, **obrigatório**. Vale para Sushi ·
  Sushi+Sushi Quentes · Sushi+Cozinha · Sushi+Sushi Quentes+Cozinha;
- pedido **sem Sushi** (só Sushi Quentes e/ou Cozinha) → **apenas candidato à avaliação**. O fluxo
  normal continua sendo Delivery/Conferência. O Caixa só é recomendado com as **seis** condições
  positivamente comprovadas **antes da abertura da sacola**: composição completa conhecida ·
  capacidade do Caixa · materiais e acompanhamentos · conferência integral ali · benefício
  operacional sustentado · permanência integral no fluxo.

**Ausência de Sushi nunca é elegibilidade automática.** Informação ausente, desconhecida ou não
observada mantém o pedido no fluxo normal. Guardas `G8a`–`G8e`; mutação `MD4` transforma "não
observada" em "comprovada" e é acusada.

### O limite que precisa ser dito alto

**Com as fontes de hoje, a rota do Caixa é inalcançável fora de fixture.** `capacidade_do_caixa` não
pode ser comprovada por medição: **nenhuma fonte mede a fila da Caixa** (PB5, `Mapa_Ambientes` §7). Na
cena `consolidacao-caixa-comprovada` ela é **declarada pela fixture**, e o texto na tela diz isso.

Ou seja: a regra do Caixa está implementada, testada, e **não é operável** até existir fonte. Isso não
é defeito — é a regra se recusando a funcionar sem lastro.

---

## 6. Caminho recomendado, se o César aprovar

1. **Validar no Lab.** O César abre `sushi-quentes-isolado`, `consolidacao-com-sushi`,
   `consolidacao-caixa-comprovada` e `consolidacao-caixa-nao-observada` e diz se a leitura bate com a
   loja.
2. **Decidir S12 separadamente.** A mudança de sinal é a parte que muda comportamento operacional, e
   ela pode ser aprovada ou recusada independentemente da mudança de ambiente.
3. **Reancorar os gates.** Migrar `areas.ts` exige mover os baselines de congelamento dos sete gates
   R5. Decisão do César, com o motivo registrado em `DECISIONS.md`.
4. **Migrar em um commit só**, com `areas.ts`, `home.js`, `home.css`, as fixtures e as quatro matrizes
   juntos — um estado intermediário com 5 ambientes no domínio e 6 na tela é pior que qualquer um dos
   dois.
5. **Declarar a mudança de projeção** em `docs/execution/DECISIONS.md`: leituras históricas
   reprojetadas mostram números diferentes, e isso precisa estar escrito antes de alguém notar.
6. **Não migrar o Figma junto.** PB11/PB13 seguem abertos por cota de plano (D59).

## 7. O que esta proposta não faz

Não altera `areas.ts` · não revoga D45 nem D46 · não altera `sinais.ts` nem S12 · não reancora
baseline nenhum · não migra domínio · não decide. **Ela mede o custo para que a decisão seja possível.**
