# Proposta B — Modelo da Célula Conferência

> Proposta independente (Claude), sustentada por análise de **70.071 pedidos / 267 dias**.
> Nenhum código de produto implementado.

## 1. O que a Conferência é (definição do César, adotada)

Etapa onde **sacolas e comandas são finalizadas**: produtos de praças diferentes são reunidos;
bebidas, sobremesas, kits, molhos e itens externos são adicionados; volumes são organizados;
o pedido é conferido e liberado.

**Ela engasga mesmo com Sushi, Quentes e Cozinha fluindo.** Essa frase é a especificação central:
a Conferência não sofre pelo mesmo motivo que uma praça de produção sofre.

## 2. Por que uma praça e a Conferência sofrem por motivos diferentes

| | Praça de produção | Conferência |
|---|---|---|
| Sofre quando… | tem **muito a fazer** | tem **muito chegando pronto ao mesmo tempo** |
| Unidade de carga | item a produzir | **pedido a fechar** |
| Depende de | si mesma | **todas as praças + itens externos** |
| Gargalo típico | capacidade de produzir | **convergência e completude** |

Uma praça pode estar tranquila e ainda assim empurrar pressão para a Conferência — basta que
**termine junto** com as outras. A Conferência é uma **etapa de convergência**, e etapas de
convergência sofrem por *sincronia*, não por volume.

Isto tem consequência direta no modelo: **a variável da Conferência não é "quantos pedidos
existem", é "quantos pedidos chegaram ao fim quase juntos"**.

## 3. `montagem_outros` — investigação honesta

**O que se sabe (fato):** é uma das 8 praças canônicas do motor; no seed do cardápio ela é a praça
principal de itens que não pertencem às praças de produção; o motor a classifica em `CONFERENCIA`
(junto de `sobremesa` e `bar_bebidas`) — isto é, como praça que gera *esquecimento/fechamento/
conferência/sacola*, **não** sobrecarga de produção.

**O que ela mede (inferência):** a presença, no pedido, de itens cuja natureza é
montagem/embalagem/complemento. É um sinal de **composição**, não de **carga da etapa**.

**O que ela NÃO mede (fato, verificado):**
- não mede quantos pedidos estão na etapa final agora;
- não mede sacolas, comandas, volumes, conferências realizadas;
- não mede o trabalho de reunir itens de outras praças;
- **não existe nos dados de pedido** — os 70.071 pedidos não têm praça nem itens.

**Conclusão:** `montagem_outros` **não pode ser usada como medidor da carga da Conferência**.
Usá-la assim confundiria três coisas distintas: *praça* (onde), *etapa* (quando) e *carga* (quanto).
Ela serve, no futuro, como **um dos fatores de complexidade do pedido** — nunca como o estado da célula.

Hipótese principal registrada: `montagem_outros` ≈ **Montagem/Sacolas**, e deve ser tratada como
**sinal de pressão que a composição do pedido impõe à Conferência**, sujeita a confirmação do César.

## 4. Evidência que fundamenta o modelo

Da análise dos 267 dias (detalhe em [PADROES_DE_SUCESSO_E_FALHA](PADROES_DE_SUCESSO_E_FALHA.md)):

1. **Simultaneidade prediz o tempo interno** — pico de ativos × tempo até "pronto": **r = 0,842**.
2. **Volume não explica sofrimento** — existem **40 dias de alto volume fluidos** e **18 dias de volume moderado problemáticos**.
3. **Contraexemplo direto** — 2026-06-22 (268 ped, pico 42) → 8,2% atraso; 2026-02-04 (264 ped, pico **menor**, 37) → 70,8%.
4. **"% de atraso" é contaminado** por tempo prometido da plataforma (fev 56,6% vs mar 20,3% com operação equivalente).
5. **A operação vive em silêncio**: 91,2% do tempo abaixo de 30 ativos; "70+" existe por 207 minutos em 9 meses.

## 5. Avaliação das faixas 30 / 50 / 70

| Faixa proposta | Veredito com dados |
|---|---|
| **< 30 Calmo** | **Boa.** Cobre 91,2% do tempo. Coerente com "silêncio é saúde". |
| **30–49 Fluindo** | **Boa.** 7,1% do tempo — o regime de trabalho real. |
| **50–69 Atenção** | **Aceitável.** 1,6% do tempo; 28,1% dos dias tocam essa faixa. |
| **70+ Urgência** | **Rara demais.** 0,1% do tempo (207 min em 9 meses); só 4,9% dos dias. Dispara tarde e quase nunca. |

**Problema estrutural:** como **eixo único**, as faixas classificariam errado 58 dos 267 dias (22%) —
os 40 fluidos de alto volume e os 18 problemáticos de volume moderado.

**Recomendação:** manter 30/50/70 como **eixo de carga**, mas o estado da célula precisa de um
**segundo eixo**. Carga alta e estável ≠ carga média e acelerando.

## 6. O modelo: vetor de pressão, não score

A saída **nunca** é um número. São dois eixos observáveis + contexto:

```
EIXO 1 · CARGA        quantos pedidos estão vivos na etapa agora
EIXO 2 · CONVERGÊNCIA quantos ficaram prontos na mesma janela curta  ← específico da Conferência
CONTEXTO              prontidão do turno · comparação com dias semelhantes · ausências
```

O **eixo 2 é a contribuição própria desta proposta**. É ele que captura "engasgar mesmo com as
praças fluindo": mede a **convergência**, não a produção.

Estado = combinação declarada dos dois eixos, nunca a média deles:

| Carga | Convergência | Estado | Leitura |
|---|---|---|---|
| baixa | baixa | **Calmo** | silêncio |
| média | baixa | **Fluindo** | ritmo saudável |
| baixa/média | **alta** | **Atenção — convergência** | "chegou tudo junto" |
| alta | baixa | **Atenção — carga** | "muita coisa viva, mas espaçada" |
| alta | alta | **Urgência** | os dois ao mesmo tempo |
| qualquer | — | **Leitura parcial** | faltam fontes (hoje: sempre) |
| — | — | **Fonte indisponível** | não deu para atualizar |

## 7. As três versões

### 7.1 Versão utilizável AGORA (só dado existente)

**Pode:** carga (pedidos ativos por janela) · convergência aproximada (prontos por janela curta) ·
tendência (subindo/estável/descendo) · comparação com dias semelhantes (mesmo dia da semana e faixa horária).

**Não pode:** itens, unidades, variedade, complexidade, volumes, praça, equipe, materiais.

**Deve declarar sempre:** *"Leitura parcial: composição do pedido, equipe e materiais não são observados."*

Ressalva honesta: hoje o "pronto" existe como **duração**, não como carimbo absoluto — a convergência
é estimada, não medida. Precisa ser dito.

### 7.2 Versão intermediária (coleta incremental barata)

Acrescenta, em ordem de custo/benefício:
1. **Valor do pedido** — já existe no relatório bruto, foi descartado na sanitização. Proxy de magnitude, custo ~zero.
2. **Carimbo absoluto de "pronto"** — transforma convergência estimada em medida.
3. **Prontidão de abertura** — separa pressão de fragilidade prévia (ver [PRONTIDAO](PROPOSTA_B_PRONTIDAO_ABERTURA.md)).
4. **Equipe por setor** — permite capacidade contextual.

### 7.3 Versão ideal

Linhas de item + praça por pedido. Só então: carga por praça, complexidade real, volumes, risco por
item, e a "carga equivalente" que o César deseja. **Não antes** — antes disso, qualquer número de
complexidade seria fabricado.

## 8. Anatomia obrigatória da saída

Toda leitura declara, sem exceção:

```
estado      · a palavra
fatos       · números observados + janela usada
fatores     · o que pesa, e quanto
tendência   · direção + base do cálculo
confiança   · alta/média/baixa + porquê
ausências   · o que NÃO foi observado          ← obrigatório
sugestão    · a menor ação humana útil, ou silêncio
```

Exemplo com os dados de hoje:

> **Atenção — convergência.**
> 9 pedidos ficaram prontos nos últimos 6 minutos; 21 seguem vivos na operação.
> Nos últimos 4 domingos, essa faixa horária teve metade disso.
> Confiança média: o carimbo de "pronto" é estimado, não medido.
> Não observados: composição dos pedidos, equipe, sacolas e comandas.
> Vale olhar a etapa final antes que o próximo lote chegue.

## 9. O que este modelo recusa

- **Score opaco** ("Conferência 82%") — colapsa carga e convergência, que pedem ações diferentes.
- **Avaliação individual, culpa ou ranking** — o modelo lê a etapa, nunca a pessoa.
- **Ordem automática ou movimentação automática de pessoas** — sugere, quem decide é humano.
- **Usar `montagem_outros` como medidor da etapa** — confunde praça, etapa e carga (§3).
- **Usar "% de atraso" como verdade** — é contaminado por configuração da plataforma (§4.4).
- **Prometer complexidade/volumes agora** — não há fonte; seria número inventado.

## 10. Decisões que dependem do César

1. Confirmar se `montagem_outros` = Montagem/Sacolas e se pode ser fator de complexidade.
2. Confirmar se houve mudança de **tempo prometido** em fev/2026 (explica §4.4).
3. Definir a janela de convergência (proposta inicial: 6–10 min) contra a experiência real.
4. Autorizar recuperar o **valor do pedido** do relatório bruto.
5. Autorizar a coleta de **carimbo absoluto de "pronto"**.
6. Confirmar as referências de equipe da Conferência por dia da semana.
