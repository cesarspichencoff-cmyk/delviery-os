# Auditoria — Camada de Conhecimento do Cardápio (TATÁ)

> Base estrutural **set-once** do DeliveryOS. Não é preenchimento por pedido.
> Gerada por `build_cardapio_knowledge.js` a partir de `data/cardapio_fonte.txt` (lista real).
> **Não** houve tuning, ajuste de baseline, nem alteração do motor/visual.

## 1. Totais
- **Produtos recebidos (linhas):** 217
- **Itens canônicos (após dedup):** 199
- **Duplicados colapsados:** 18 (em 18 itens canônicos)
- **Itens sem descrição:** 24
- **Itens de baixa confiança / revisão manual:** 5

## 2. Quantidade por praça (praça principal)
| Praça | Itens |
|---|---|
| combinados | 20 |
| duplas | 64 |
| enrolados | 16 |
| enrolados_quentes | 11 |
| cozinha | 31 |
| sobremesa | 9 |
| bar | 36 |
| montagem | 5 |
| (sem praça / não-produção) | 7 |

### Critério de sucesso (praças obrigatórias separadas e não-zeradas)
- ✅ **combinados**: 20
- ✅ **duplas**: 64
- ✅ **enrolados**: 16
- ✅ **enrolados_quentes**: 11
- ✅ **cozinha**: 31
- ✅ **sobremesa**: 9
- ✅ **bar**: 36
- ✅ **montagem**: 5

## 3. Quantidade por categoria operacional
| Categoria | Itens |
|---|---|
| dupla | 61 |
| bebida | 36 |
| prato_quente | 25 |
| combinado | 18 |
| enrolado | 16 |
| enrolado_quente | 11 |
| sobremesa | 9 |
| entrada | 8 |
| acompanhamento | 6 |
| complemento | 3 |
| nao_producao | 3 |
| menu_composto | 2 |
| outros | 1 |

## 4. Até 10 exemplos por praça
### combinados (20)
  - **Combinado Especial Sashimi + Sushi 1 pessoa** — _especial_, misto · proteínas: salmao, atum, vieira, tobiko, codorna
  - **Combinado Especial Sashimi + Sushi 2 pessoas** — _especial_, misto · proteínas: salmao, atum, vieira, tobiko, codorna
  - **Combinado Especial Sushi + Sashimi 2 pessoas** — _especial_, misto · proteínas: salmao, atum, vieira, tobiko, codorna
  - **Combinado Especial Sushi 1 Pessoa** — _especial_, misto · proteínas: salmao, atum, polvo, vieira, buri, tobiko, codorna
  - **Combinado Especial Sushi 2 pessoas** — _especial_, misto · proteínas: salmao, atum, polvo, vieira, buri, tobiko, codorna
  - **Combinado Executivo Sushi** — _executivo_, misto · proteínas: salmao, atum, peixe branco
  - **Combinado Executivo Sushi + Sashimi** — _executivo_, misto · proteínas: salmao, atum, peixe
  - **Combinado Executivo Sushi Salmão** — _executivo_, misto · proteínas: salmao
  - **Combinado Kids** — _kids_, misto · proteínas: salmao
  - **Combinado Salmão 1 pessoa** — _salmao_, misto · proteínas: salmao

### duplas (64)
  - **By Luizinho Especial** — _dupla_, frio · proteínas: salmao, ikura, codorna
  - **Carpaccio de Polvo Espanhol** — _entrada_fria_, frio · proteínas: polvo · ⚠️ inferido_com_baixa_confianca
  - **Carpaccio de Salmão Trufado** — _entrada_fria_, frio · proteínas: salmao · ⚠️ inferido_com_baixa_confianca
  - **Dyo de Atum** — _dyo_, frio · proteínas: atum
  - **Dyo de Atum com Foie Gras** — _dyo_, frio · proteínas: atum, foie gras
  - **Dyo de Codorna Trufado** — _dyo_, frio · proteínas: salmao, codorna
  - **Dyo de Ikura** — _dyo_, frio · proteínas: salmao, ikura, ovas
  - **Dyo de Salmão** — _dyo_, frio · proteínas: salmao
  - **Dyo de Salmão Shimeji** — _dyo_, frio · proteínas: salmao
  - **Dyo de Salmão com Vieira Trufada** — _dyo_, frio · proteínas: salmao, vieira

### enrolados (16)
  - **Baterá de Salmão** — _batera_, frio · proteínas: salmao, ovas
  - **Baterá de Spicy Tuna** — _batera_, frio · proteínas: atum, ovas, spicy tuna
  - **Hossomaki de Atum** — _hossomaki_, frio · proteínas: atum
  - **Hossomaki de Pepino** — _hossomaki_, frio
  - **Hossomaki de Salmão** — _hossomaki_, frio · proteínas: salmao
  - **Temaki de Atum** — _temaki_, frio · proteínas: atum
  - **Temaki de Atum Spicy** — _temaki_, frio · proteínas: atum
  - **Temaki de Barriga de Salmão** — _temaki_, frio · proteínas: salmao
  - **Temaki de Ikurá** — _temaki_, frio · proteínas: salmao, ikura, ovas
  - **Temaki de Salmão** — _temaki_, frio · proteínas: salmao

### enrolados_quentes (11)
  - **Ceviche** — _entrada_quente_, quente · proteínas: camarao, polvo, peixe branco
  - **Hot Roll** — _uramaki_, quente
  - **Hot Roll Tatá** — _uramaki_, quente · proteínas: salmao, camarao, kani
  - **Hot Roll com Shimeji** — _uramaki_, quente · proteínas: salmao
  - **Tartar de Salmão** — _entrada_quente_, quente · proteínas: salmao, massago
  - **Temaki Ebiten** — _temaki_, quente · proteínas: camarao
  - **Temaki de Salmão Skin** — _temaki_, quente · proteínas: salmao
  - **Tuna Shisô Tartar** — _entrada_quente_, quente · proteínas: atum, ovas
  - **Uramaki Ebiten** — _uramaki_, quente · proteínas: camarao, tobiko, ovas
  - **Uramaki Ebiten Especial** — _uramaki_, quente · proteínas: salmao, camarao

### cozinha (31)
  - **Beef com Nirá** — _prato_quente_, quente · proteínas: carne
  - **Chickenkatsu** — _katsu_, quente · proteínas: frango
  - **Ebi Spicy** — _tempura_, quente · proteínas: camarao
  - **Edamame** — _entrada_quente_, quente
  - **Fish Katsu** — _katsu_, quente · proteínas: peixe
  - **Frango Teriyaki** — _grelhado_, quente · proteínas: frango
  - **Grelhado Frutos do Mar** — _grelhado_, quente · proteínas: camarao, polvo, lula, vieira, peixe, frutos do mar
  - **Guioza** — _guioza_, quente · proteínas: suino
  - **Gyukatsu** — _katsu_, quente · proteínas: file mignon
  - **Katsudon** — _katsu_, quente · proteínas: lombo, suino

### sobremesa (9)
  - **Choux Cream** — _choux_, ambiente
  - **Cookie Três Chocolates** — _cookie_, ambiente
  - **Cookie de Matchá** — _cookie_, ambiente
  - **Cookie de Nutella** — _cookie_, ambiente
  - **Cookie de Pistache** — _cookie_, ambiente
  - **Mochi** — _mochi_, frio
  - **Sorvete de Baunilha** — _sorvete_, frio
  - **Sorvete de Chocolate** — _sorvete_, frio
  - **Tatá chocolate com sorvete de caramelo salgado** — _sorvete_, frio

### bar (36)
  - **Barone montalto acquerello pinot grigio** — _vinho_, ambiente
  - **Cerveja Blue Moon 355ml** — _cerveja_, frio
  - **Coca Cola Zero Lata 350ml** — _refrigerante_, frio
  - **Coca-Cola Lata 350ml** — _refrigerante_, frio
  - **Estandon brise marine rose** — _vinho_, ambiente
  - **Fanta Guaraná 350ml** — _refrigerante_, frio
  - **Fanta Guaraná Zero 350ml** — _refrigerante_, frio
  - **Hakushika Ginjo Namachozo 300ml** — _sake_, ambiente
  - **Hakushika aluminum can - 180 ml** — _sake_, ambiente
  - **Hakushika namachozo 300ml** — _sake_, ambiente

### montagem (5)
  - **Gengibre** — _guarnicao_, frio
  - **Gohan** — _guarnicao_, quente
  - **Sunomono** — _guarnicao_, frio
  - **Tarê** — _guarnicao_, frio
  - **Wasabi** — _guarnicao_, frio

### (sem praça / não-produção) (7)
  - **Baunilha** — _sabor_, desconhecido
  - **Boné Tatá Preto Estonado** — _merchandise_, desconhecido
  - **Boné Tatá chumbo** — _merchandise_, desconhecido
  - **Melão** — _sabor_, desconhecido
  - **Número de pessoas** — _meta_, desconhecido
  - **Pistache** — _sabor_, desconhecido
  - **Tatá Especial - Club Vip Gourmet** — _programa_, desconhecido · ⚠️ inferido_com_baixa_confianca

## 5. Itens ambíguos / baixa confiança (5)
- **Carpaccio de Polvo Espanhol** → praça `duplas` · Peixe cru em Entradas; não citado nas regras. Inferido como bancada fria (duplas/sashimi). Confirmar se sai da bancada de duplas ou de montagem.
- **Carpaccio de Salmão Trufado** → praça `duplas` · Peixe cru em Entradas; não citado nas regras. Inferido como bancada fria (duplas/sashimi). Confirmar se sai da bancada de duplas ou de montagem.
- **Missoshiro** → praça `cozinha` · Ambíguo: cozinha (se produção quente) x montagem (se só servido). Confirmar fluxo real.
- **Tartar de Atum Spicy** → praça `duplas` · Peixe cru em Entradas; não citado nas regras. Inferido como bancada fria (duplas/sashimi). Confirmar se sai da bancada de duplas ou de montagem.
- **Tatá Especial - Club Vip Gourmet** → praça `null` · Sem descrição; parece rótulo/programa (Club Vip Gourmet), não item de produção. Confirmar.

## 6. Itens que precisam de revisão manual (5)
- **Carpaccio de Polvo Espanhol** (Entradas) → `duplas` · Peixe cru em Entradas; não citado nas regras. Inferido como bancada fria (duplas/sashimi). Confirmar se sai da bancada de duplas ou de montagem.
- **Carpaccio de Salmão Trufado** (Entradas, Tatá Especial - Club Vip Gourmet) → `duplas` · Peixe cru em Entradas; não citado nas regras. Inferido como bancada fria (duplas/sashimi). Confirmar se sai da bancada de duplas ou de montagem.
- **Missoshiro** (Outros) → `cozinha` · Ambíguo: cozinha (se produção quente) x montagem (se só servido). Confirmar fluxo real.
- **Tartar de Atum Spicy** (Entradas) → `duplas` · Peixe cru em Entradas; não citado nas regras. Inferido como bancada fria (duplas/sashimi). Confirmar se sai da bancada de duplas ou de montagem.
- **Tatá Especial - Club Vip Gourmet** (Sugestões Tatá) → `null` · Sem descrição; parece rótulo/programa (Club Vip Gourmet), não item de produção. Confirmar.

## 7. Itens sem descrição (24)
- Baunilha (Sabores) → `—`
- Boné Tatá Preto Estonado (Outros) → `—`
- Boné Tatá chumbo (Outros) → `—`
- Coca Cola Zero Lata 350ml (Bebidas) → `bar`
- Coca-Cola Lata 350ml (Bebidas) → `bar`
- Cookie de Matchá (Sobremesas) → `sobremesa`
- Gohan (Outros) → `montagem`
- Hakushika Ginjo Namachozo 300ml (Sakes) → `bar`
- Heineken (Cervejas) → `bar`
- Melão (Sabores) → `—`
- Missoshiro (Outros) → `cozinha`
- Número de pessoas (Número de pessoas atendidas) → `—`
- Pistache (Sabores) → `—`
- Sake Junmai Shu Dry Hakutsuru 720ml (Sakes) → `bar`
- Sapporo (Cervejas) → `bar`
- Sashimi de Lula (Sashimis) → `duplas`
- Sprite 350ml (Bebidas) → `bar`
- Tarê (Outros) → `montagem`
- Tatá Especial - Club Vip Gourmet (Sugestões Tatá) → `—`
- Tempurá de Legumes (Pratos Quentes) → `cozinha`
- Yauemon Honjozo Kanzukuri 720ml (Sakes) → `bar`
- Yuaemon Honjozo Kanzukuri 300ml (Sakes) → `bar`
- Água Mineral Com Gás 350ml (Bebidas) → `bar`
- Água Mineral Sem Gás 350ml (Bebidas) → `bar`

## 8. Duplicados encontrados (18)
- **Baterá de Salmão** — 2× · disponível em: Sugestões Tatá, Baterás
- **Baunilha** — 2× · disponível em: Sabores
- **By Luizinho Especial** — 2× · disponível em: Sushis especiais, Sugestões Tatá
- **Choux Cream** — 2× · disponível em: Sobremesas (1), Sobremesas
- **Cookie Três Chocolates** — 2× · disponível em: Sobremesas, Sobremesas (1)
- **Cookie de Nutella** — 2× · disponível em: Sobremesas (1), Sobremesas
- **Cookie de Pistache** — 2× · disponível em: Sobremesas, Sobremesas (1)
- **Ebi Spicy** — 2× · disponível em: Entradas, Sugestões Tatá
- **Guioza** — 2× · disponível em: Entradas, Sugestões Tatá
- **Melão** — 2× · disponível em: Sabores
- **Mochi** — 2× · disponível em: Sobremesas (1), Sobremesas
- **Pistache** — 2× · disponível em: Sabores
- **Salmão Grelhado** — 2× · disponível em: Sugestões Tatá, Pratos Quentes
- **Sorvete de Baunilha** — 2× · disponível em: Sobremesas (1), Sobremesas
- **Sorvete de Chocolate** — 2× · disponível em: Sobremesas (1), Sobremesas
- **Tatá chocolate com sorvete de caramelo salgado** — 2× · disponível em: Sobremesas, Sobremesas + 1, Sobremesas (1)
- **Temaki de Salmão** — 2× · disponível em: Temakis, Sugestões Tatá
- **Yakissoba Misto** — 2× · disponível em: Sugestões Tatá, Pratos Quentes

## 9. Regras aplicadas (prioridade)
1. **Combinados** — qualquer "combinado" no nome/descrição/categoria → praça própria `combinados` (dependências internas parseadas da descrição).
2. **Menus compostos** — nome começa com "Menu" → `menu_composto`, praça `combinados`, com `pracas_dependentes`.
3. **Sobremesas** — categoria "Sobremesa*" ou item-sobremesa → `sobremesa` (os "Sabores" Baunilha/Melão/Pistache ficam como **complemento**, não sobremesa).
4. **Bebidas/Bar** — Bebidas/Cervejas/Vinhos/Sakes/Água → `bar`.
5. **Enrolados quentes** — ebiten, hot roll, skin, tartar de salmão, tuna shisô, ceviche → `enrolados_quentes` (vence enrolados).
6. **Enrolados** — uramaki, baterá, hossomaki, temaki (sem termo quente) → `enrolados`.
7. **Duplas** — dupla/sushi/nigiri/dyo/sashimi ou categoria de sushi/sashimi/dyo → `duplas`. Peixe cru em "Entradas" (carpaccio/tartar não-salmão) foi **inferido** como bancada fria (duplas) com baixa confiança.
8. **Cozinha/Quentes** — katsu, teriyaki, teppanyaki, tempurá, yakissoba, guioza, grelhado, entradas quentes → `cozinha` (temperatura quente).
9. **Montagem/Outros** — gengibre, gohan, tarê, wasabi, sunomono → `montagem`; boné/nº de pessoas → não-produção; Missoshiro/Club Vip → revisão manual.

## 10. Observações honestas (limites desta base)
- **Ingredientes** vêm da descrição por dicionário — itens sem descrição ficam com listas vazias (não inventei).
- **Popularidade / peso de venda NÃO existe aqui** — deve vir de dados reais de venda (relatório iFood/PDV), não de chute. Sem isso, "quantos pedidos tocam cada praça" continua dependendo da fonte real de itens por pedido.
- **quantidade_pecas** dos combinados fica `null` (são compostos); a contagem detalhada está na descrição.
- **cozinha** aqui = a bancada de quentes (equivalente ao "quentes" do motor atual). A unificação de vocabulário acontece só quando conectarmos ao motor.
- Peixe cru em Entradas (carpaccio/tartar de atum) e Missoshiro estão marcados para **revisão manual** — não force antes de confirmar o fluxo real.


## 11. Sinais destravados pelo cardápio (entregável #3)

### 11.1 Contagem real dos sinais que os itens já emitem
| Sinal | Itens que emitem | Praças |
|---|---|---|
| item pausado | 192 | bar, enrolados, cozinha, duplas, enrolados_quentes, sobremesa, combinados, montagem |
| pedido só de frio | 101 | enrolados, duplas, bar, montagem, sobremesa |
| risco de conferência | 91 | enrolados, duplas, sobremesa, combinados, cozinha, enrolados_quentes |
| risco de ruptura | 82 | enrolados, duplas, sobremesa, combinados, cozinha, enrolados_quentes |
| duplas sobrecarregada | 64 | duplas |
| trava fechamento | 63 | cozinha, enrolados_quentes, combinados, montagem |
| alto tempo de produção | 63 | cozinha, enrolados_quentes, combinados, montagem |
| pedido só de quente | 43 | cozinha, enrolados_quentes, montagem |
| pode ser adiantado | 41 | bar, duplas, montagem, sobremesa, enrolados |
| pedido com bebida | 37 | bar, combinados |
| bar sobrecarregada | 36 | bar |
| cozinha sobrecarregada | 31 | cozinha |
| combinados sobrecarregada | 20 | combinados |
| depende de outra praça | 20 | combinados |
| risco de segunda sacola | 20 | combinados |
| enrolados sobrecarregada | 16 | enrolados |
| enrolados_quentes sobrecarregada | 11 | enrolados_quentes |
| pedido com sobremesa | 11 | sobremesa, combinados |
| sobremesa sobrecarregada | 9 | sobremesa |
| item de montagem fácil de esquecer | 6 | montagem, cozinha |
| montagem sobrecarregada | 5 | montagem |

### 11.2 Checklist da sua lista de sinais
- ✅ **destravado** — **praça dos combinados sobrecarregada** — 20 itens em `combinados`
- ✅ **destravado** — **praça das duplas sobrecarregada** — 64 itens em `duplas`
- ✅ **destravado** — **enrolados sobrecarregados** — 16 itens em `enrolados`
- ✅ **destravado** — **enrolados quentes sobrecarregados** — 11 itens em `enrolados_quentes`
- ✅ **destravado** — **cozinha/quentes sobrecarregada** — 31 itens em `cozinha`
- ✅ **destravado** — **sobremesa pendente** — 9 itens em `sobremesa` (praça separada)
- ✅ **destravado** — **bebida pendente** — 36 itens em `bar`
- ✅ **destravado** — **pedido só de quente / só de frio** — 43 itens quentes, 101 frios marcados por temperatura
- 🟡 **destravável no pedido** (o cardápio dá os ingredientes; o resolver combina no pedido) — **pedido fechável** — 136 itens NÃO travam fechamento; o resolver marca o pedido fechável quando nenhum item pendente trava
- 🟡 **destravável no pedido** (o cardápio dá os ingredientes; o resolver combina no pedido) — **pedido com mais de uma sacola** — sacolas_esperadas por item + soma no pedido (combos/menus já marcam risco de 2ª sacola)
- ✅ **destravado** — **item pausado** — 192 itens pausáveis (base para a camada de pausa/futuro)
- ⚠️ **falta dado real** — **item com pico de saída** — precisa de **popularidade real de venda** (não está no cardápio; vem do histórico iFood/PDV)
- 🟡 **destravável no pedido** (o cardápio dá os ingredientes; o resolver combina no pedido) — **pedido que depende de uma única praça** — 172 itens produzem sozinhos numa praça; o resolver detecta pedido de praça única
- ✅ **destravado** — **pedido que pode ser adiantado** — 41 itens frios estáveis marcados `pode ser adiantado`
- ✅ **destravado** — **risco maior de erro de conferência** — 91 itens de risco alto + 82 com risco de ruptura

> 🟡 = o cardápio fornece os campos (praça, trava_fechamento, sacolas, produz_sozinho); o **sinal final é do pedido**, calculado pelo resolver ao cruzar cardápio × pedido × estado. Nenhuma regra de decisão muda ao trocar a fonte de itens.
> ⚠️ = depende de dado que **não é do cardápio** (popularidade de venda) — set-once não resolve; vem do histórico real.
