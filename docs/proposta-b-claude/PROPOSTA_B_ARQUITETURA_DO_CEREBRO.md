# Proposta B — Arquitetura do Cérebro Operacional

> Como o DeliveryOS pensa. Proposta independente (Claude).
> Nenhum código de produto implementado.

## 1. A tese

O cérebro operacional não é um modelo que prevê. É um **aparelho que sabe o que sabe**.

A diferença é decisiva. Um sistema que prevê e erra destrói confiança e é desligado. Um
sistema que declara com precisão o que observou, o que deduziu e o que ignora **pode ser útil
desde o primeiro dia, mesmo com dado pobre** — e vai ficando mais útil conforme a fonte melhora,
sem nunca ter mentido no caminho.

Isso não é modéstia. É a única arquitetura que sobrevive à realidade encontrada no inventário:
**9 meses de tempo e zero de composição.**

## 2. As cinco funções

```
        ┌───────────────────────────────────────────────────────┐
        │  1. OBSERVAR    o que a operação já emite             │
        │  2. RECONHECER  o que isso é, no vocabulário da casa  │
        │  3. SITUAR      contra prontidão, histórico, produto  │
        │  4. DECLARAR    estado + fatos + ausências + confiança│
        │  5. LEMBRAR     decisões, resultados, regras vivas    │
        └───────────────────────────────────────────────────────┘
```

A maioria dos sistemas faz 1, pula 2 e 3, e transforma 4 num número. O valor está em 2, 3 e 5.

### 1. Observar
Ingestão idempotente com evidência e quarentena (ver [DATA_MODEL](PROPOSTA_B_DATA_MODEL.md)).
Nunca inventa carimbo ausente. Hoje observa: chegada, duração de preparo, botão pronto, atraso.

### 2. Reconhecer
Traduz para o vocabulário da casa: qual item, qual praça, qual etapa, qual tipo de pedido.
**É aqui que a lacuna dói:** sem linhas de item, o reconhecimento hoje para no pedido — não
chega ao item nem à praça. A arquitetura precisa tratar isso como estado normal declarado,
não como erro.

### 3. Situar
O mesmo número significa coisas diferentes em contextos diferentes. 60 pedidos ativos numa
sexta com equipe completa ≠ 60 numa segunda com a Conferência descoberta. Situar cruza:
prontidão do turno · histórico comparável (mesmo dia da semana, mesma faixa horária) ·
conhecimento do produto · ocorrências abertas.

**Situar é o que separa um painel de um cérebro.**

### 4. Declarar
Saída sempre com a mesma anatomia — nunca um score solto:

```
estado        · a palavra (Calmo / Fluindo / Atenção / Urgência / Leitura parcial / Fonte indisponível)
fatos         · o que foi observado, com número e janela
fatores       · o que está pesando (e quanto cada um pesa)
tendência     · para onde parece ir, e com que base
confiança     · alta / média / baixa — e por quê
ausências     · o que NÃO foi observado (obrigatório, nunca omitido)
sugestão      · a menor ação humana útil — ou silêncio
```

### 5. Lembrar
Decisões (L4) são append-only e datadas. Uma regra criada em março que foi abandonada em maio
deve aparecer como **abandonada**, com motivo — não sumir. É isso que impede o sistema de
"esquecer junto com a equipe" e reintroduzir soluções que já falharam.

## 3. Os quatro planos

```
┌── PLANO DO PRODUTO ─────────────────────────────────┐
│  Copiloto V3.3 (Calmo/Ambiente/Foco) · células      │  ← só apresenta
└──────────────────▲──────────────────────────────────┘
                   │  leitura declarada (nunca score)
┌── PLANO DA LEITURA ─────────────────────────────────┐
│  Conferência · Prontidão · Capacidade Viva (sombra) │  ← interpreta
└──────────────────▲──────────────────────────────────┘
                   │  janelas + conhecimento
┌── PLANO DO CONHECIMENTO ────────────────────────────┐
│  Produto (itens/preparo/risco) · Memória humana     │  ← contextualiza
└──────────────────▲──────────────────────────────────┘
                   │  fatos com evidência
┌── PLANO DA OBSERVAÇÃO ──────────────────────────────┐
│  Ingestão · normalização · evidência · quarentena   │  ← observa
└─────────────────────────────────────────────────────┘
```

**Regras de fronteira (inegociáveis):**
- O plano do produto **nunca** calcula estado — só apresenta o que a leitura declarou.
- A leitura **nunca** inventa fato — só combina o que a observação entregou.
- Toda leitura carrega `model_version` e `fontes_ausentes[]`.
- Nada sobe de plano sem evidência; nada vira verdade sem decisão humana registrada.

## 4. Como o cérebro cresce sem mentir

Três degraus, cada um com valor próprio. O sistema **declara em qual degrau está**.

| Degrau | Fonte nova | O que passa a saber |
|---|---|---|
| **1 · Agora** | nenhuma | ritmo, simultaneidade real, atraso, comparação com dias semelhantes |
| **2 · Barato** | valor do pedido (já existe no XLSX bruto) + prontidão mínima | magnitude aproximada do pedido; separa pressão de fragilidade prévia |
| **3 · Real** | linhas de item + praça + equipe | carga por praça, complexidade real, risco por item, volumes |

O degrau 2 é o de melhor razão custo/benefício e está **subutilizado hoje** — o valor
monetário existe no relatório e foi descartado na sanitização.

## 5. Aprendizado — e seu limite

O cérebro aprende assim, e **só** assim:

```
observação → evidência → proposta → aprovação humana → regra vigente (datada)
```

Nunca `observação → regra`. Nenhuma regra nasce automática, nenhuma se altera sozinha, nenhuma
permanece sem quem a aprovou. Uma regra revogada continua no histórico com o motivo.

Motivo: numa operação de 4 anos, a memória do "porquê" é o ativo mais frágil — some com
rotatividade. Um cérebro que registra o porquê vale mais que um que otimiza o quê.

## 6. Onde a Capacidade Viva se encaixa

Permanece **em sombra**, como está. Nesta arquitetura ela é um **leitor entre outros** no plano
da leitura — não a autoridade. Pode, no futuro, observar praças, agregações e células
derivadas. **Não pode**: decidir automaticamente, mover pessoas, atribuir tarefas, punir,
ranquear, esconder incerteza ou transformar leitura parcial em verdade.

A promoção de sombra para visível é uma **decisão registrada** (L4), com critério prévio e
confronto humano — nunca consequência automática de "estar funcionando bem".

## 7. O que esta arquitetura recusa

- Recusa **score único** como saída — colapsa fatos distintos e não é acionável.
- Recusa **previsão sem intervalo e sem base declarada**.
- Recusa **completar dado ausente por estimativa** apresentada como observação.
- Recusa **regra automática permanente**.
- Recusa **avaliação individual** em qualquer plano.
- Recusa **crescer em sofisticação antes de crescer em fonte** — modelo bom com dado pobre é teatro.

## 8. Critério de sucesso

Não é acurácia. É:

> **quanto tempo a equipe consegue parar de olhar a tela, confiando que, se importar, o sistema chama** —
> e, quando ele chamar, a frase dele bater com o que a pessoa vê no salão.

Um cérebro que erra pouco mas fala sempre falhou. Um que fala raro e certo venceu.
