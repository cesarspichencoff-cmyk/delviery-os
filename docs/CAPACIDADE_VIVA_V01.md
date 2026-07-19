# Capacidade Viva V0.1

## Tese

O DeliveryOS deve estimar **quanto cada praça ainda consegue suportar** e indicar a **menor intervenção** capaz de recuperar o fluxo — sem ranking de pessoas, sem automação de pausa e sem precisão falsa.

Perguntas-guia:

1. A operação ainda absorve o que entra?
2. Qual praça se aproxima do limite?
3. O problema é quantidade, complexidade ou envelhecimento?
4. Há exceção crítica escondida?
5. Qual a menor intervenção?
6. Priorizar, investigar, motoboy ou pausar?
7. A intervenção funcionou?

## Entradas

### Turno (equipe)

Contagens por praça + flutuantes + limitação excepcional + observação opcional.  
**Não** rastreia posição individual.

### Itens (fixtures nesta fase)

Cada item: praça, quantidade, complexidade, tempo típico, paralelização, dependências.  
Classificação de cardápio real TATÁ **não** está fechada.

### Pedidos / fonte

Sinais de envelhecimento, pronto parado, motoboy esperando, comanda ausente, qualidade da fonte.

## Modelo

- **Carga ponderada** = qtd × complexidade × urgência × concentração × dependências (pesos configuráveis).
- **Capacidade** = equipe do turno / referência provisória, ajustada por limitação e flutuantes.
- **Contexto temporal** = fatores provisórios por dia/hora (não verdade absoluta).
- **ISF (interno)** = pressão prevista / capacidade ajustada por praça.
- **Estado geral** = praça **mais crítica** (nunca média que esconde).

Estados: `controlavel` · `atencao` · `proximo_limite` · `acima_capacidade`.

## Configurações

Arquivo: `data/capacidade-viva/config.default.json`  
Versionamento: `src/capacidade-viva/versionamento.js` (anterior, novo, data, motivo, versão).

Referências provisórias (não universais): Sushi 8, Conferência 5–6, Caixa 3.

## Intervenções

Lista ordenada da menor para a maior; **pausa geral por último**.  
`auto_apply` sempre `false` — decisão humana.

## Recuperação

Janelas configuráveis (5 / 10–15 / 20 min).  
Classes: recuperação líquida, melhora parcial, sem resultado, deslocou problema, dados insuficientes, ação não executada.  
**Não** avalia funcionários.

## Feedback humano

ajudou · ajudou parcialmente · não ajudou · criou outro problema · não sei (+ observação).  
Não obrigatório no pico.

## Interface

Sem redesign. Adapters em `toV33ViewHints` e `/api/capacidade-viva/avaliar`.  
Sem dados suficientes: *“Não tenho leitura suficiente para recomendar.”*

## Limitações V0.1

- Fixtures demonstrativas de itens (não cardápio real calibrado).
- Sem iFood contínuo, ASR/TTS, memória de produção, visão, financeiro.
- Quentes × Cozinha configuráveis, não consolidados.
- ISF é índice interno — não KPI de dashboard.

## Dados necessários para calibração real

- Histórico de filas e tempos por praça.
- Composição real de itens por pedido.
- Equipe típica por turno/dia.
- Outcomes de intervenções (com feedback humano).
- Validação de aliases de praça com a operação.

## O que ainda é simulado

ASR/TTS, microfone, iFood contínuo, memória persistente de produção, financeiro, visão, Caixa/Estoque/Entregas como produtos, deploy.
