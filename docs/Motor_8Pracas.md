# Motor de 8 Praças — auditoria e arquitetura

> O DeliveryOS deixou de trabalhar com `quentes/sushi/enrolados/combinados` e passou a pensar
> com as **8 praças reais** da operação. O cardápio inline (20 itens sintéticos) foi **removido**:
> agora existe **uma única verdade** — `data/cardapio_knowledge_seed.json` (199 itens).

## 1. Fluxo oficial (uma verdade, um cérebro)

```
cardápio real (seed, 199 itens)
   → adapter (src/perfil-delivery/motor.js · adaptarItem)
   → resolver (mesmo motor)
   → sinais / diagnósticos
   → gerente de atenção (calmo / ambiente / foco)
   → interface (protótipo) e Auto Teste (Node)
```

- **`src/perfil-delivery/motor.js`** é o cérebro. Node (Auto Teste) e o protótipo usam o **mesmo arquivo** — nenhuma regra duplicada.
- **`prototipos/parados-agora/index.html`** virou casca: `tools/build_prototipo.js` injeta seed + motor + `app.js`. Não há mais cardápio inventado no HTML (`grep "const CARDAPIO="` → nada).
- **SEAM único**: `MOTOR.makeFonteSintetica(seed)` — trocar SÓ isto por KDS/impressora/API iFood não muda nenhuma regra.

## 2. Os três motores, separados de propósito

| Motor | Estado | Fonte | Confiança |
|---|---|---|---|
| (A) tempo / estado do pedido | **REAL** | relatório iFood (recebido/pronto/saiu/cancelado) | alta |
| (B) praça (qual bancada / carga / item dominante) | **SINTÉTICO** | composição pedido→itens fabricada | ilustrativo |
| (C) conhecimento do cardápio | **REAL** | `cardapio_knowledge_seed.json` (199 itens, 8 praças) | real, baseline não calibrado |

## 3. As 8 praças (vocabulário oficial)

Nome de banco/código → rótulo na interface. **Produção** gera sobrecarga; **Conferência/Montagem** gera esquecimento/fechamento/conferência/sacola.

| # | Código | Interface | Classe | Itens no cardápio |
|---|---|---|---|---|
| 1 | `combinados` | Combinados | produção | 20 |
| 2 | `duplas` | Duplas | produção | 64 |
| 3 | `enrolados` | Enrolados | produção | 16 |
| 4 | `enrolados_quentes` | Enrolados Quentes | produção | 11 |
| 5 | `cozinha_quentes` | **Quentes** (Cozinha / Quentes) | produção | 31 |
| 6 | `sobremesa` | Sobremesa | conferência | 9 |
| 7 | `bar_bebidas` | Bar | conferência | 36 |
| 8 | `montagem_outros` | Montagem | conferência | 5 |
| — | `null` | (não-produção: sabores, boné, nº pessoas, Club Vip) | — | 7 |

`sushi` **deixou de existir** como praça genérica — dividiu-se em duplas / combinados / enrolados / enrolados_quentes.

## 4. Exemplos por praça (do seed real)

- **combinados**: Combinado Especial/Executivo/Tradicional/Kids/Salmão.
- **duplas**: Sushi de X, Sashimi de X, Dyo de X, By Luizinho, Ebi Nikkei, Sashimi Tataki.
- **enrolados**: Uramaki (Califórnia/Vegan/Atum/Salmão), Temaki (Atum/Salmão/Barriga), Hossomaki, Baterá.
- **enrolados_quentes**: Hot Roll / Hot Roll Tatá / com Shimeji, Uramaki/Temaki Ebiten, Skin, **Ceviche · Tartar de Salmão · Tuna Shisô** (regra operacional — ver §6).
- **cozinha_quentes**: Katsu, Teppanyaki, Tempurá, Yakissoba, Guioza, Grelhado, entradas quentes (Shimeji/Shitake/Edamame/Nasu).
- **sobremesa**: Cookie, Mochi, Sorvete, Choux, Torta.
- **bar_bebidas**: Refri, Cerveja, Vinho, Sake, Água.
- **montagem_outros**: Gengibre, Gohan, Tarê, Wasabi, Sunomono.

## 5. Diagnósticos que o motor agora emite (não só alerta)

Cada um cruza **estado + situação + causa provável + próxima ação + impacto**:

| Diagnóstico | O que responde | Depende de |
|---|---|---|
| Praça de produção sobrecarregada | qual praça trava, quantos pedidos, item dominante, **quantos sairiam se ela liberar** | B (sintético) |
| Combinados segurando fluxo | quantos pedidos dependem de combinados / quantos já completos nas outras praças | B |
| Fechamento (praça única) | pedido que **só depende de uma praça** → dá pra fechar quando ela sair | A+C |
| Conferência | pedido grande / 2 sacolas / bebida+kit → separar e conferir | B+C |
| Saída travada | prontos parados, motoboy é o gargalo | **A (real)** |
| Pedido preso | pedido específico travado numa praça há X min | A+B |

Sinais **ainda não destravados** (honestidade): *item com pico de saída* e *item pausável saindo demais* precisam de **popularidade real de venda** — não vêm do cardápio nem da composição sintética.

## 6. Itens que precisam de validação humana (5)

Marcados `confianca_classificacao: media` / `revisao_manual: true`:

- **Ceviche · Tartar de Salmão · Tuna Shisô** → enviados a `enrolados_quentes` pela **regra operacional atual do César**. São frios (marinado/cru); a regra vence de propósito (não caem em duplas/sushi). Revalidar de qual bancada saem — corrigível no cadastro sem quebrar arquitetura.
- **Carpaccio de Polvo · Carpaccio de Salmão · Tartar de Atum** → peixe cru em "Entradas", inferidos como bancada fria (duplas), baixa confiança.
- **Missoshiro** → ambíguo cozinha × montagem.
- **Tatá Especial - Club Vip Gourmet** → rótulo/programa, não item de produção.

Duplicados tratados: **18** colapsados (217 linhas → 199 canônicos) — todos repetições legítimas (mesmo produto em 2 categorias). Detalhe em [Auditoria_Cardapio_Conhecimento.md](Auditoria_Cardapio_Conhecimento.md).

## 7. Resultado do Auto Teste v2 (30 dias reais)

Ver [AutoTeste_Operacional_8pracas.md](AutoTeste_Operacional_8pracas.md). Resumo: **nota 7.1/10**, precisão 42% (foco com pedido ruim vivo), **cobertura ~100%** (só 4 de 1013 pedidos ruins passaram 100% em calmo), foco em 16% do tempo. Saída travada é o foco nº1 (405/mês) — bate com a dor real (motoboy é o padrão mais citado no WhatsApp). Duplas satura muito (baseline provisório subestimado) → calibração é passo futuro.

## 8. O que continua pendente (deferido de propósito)

- **Tuning / baseline** por praça (Duplas sobretudo) — só depois da composição real.
- **Fonte real de itens por pedido** (KDS/impressora/API iFood) — o unlock que torna o motor de praça confiável. Troca só o `makeFonteSintetica`.
- **Popularidade de venda** (para pico de saída / item saindo demais) — vem do histórico, não do cardápio.
