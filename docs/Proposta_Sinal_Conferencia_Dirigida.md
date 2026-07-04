# Proposta Conceitual — Sinal de Conferência Dirigida

> Documento conceitual, **sem código**. Nasce da evidência de `docs/Relatorio_Evidencia_Composicao_Real_12_Janelas.md`.
> Não é decisão de implementação — é material para a próxima conversa de produto, quando aprovada.

## 1. Por que esse sinal existe

Doze janelas reais mostram um perfil de pedido que a operação da TATÁ enfrenta todo dia, não um caso
raro: **59% dos pedidos têm 2ª sacola/kit provável**, **91% carregam risco de conferência alto**
(medido na análise dos 11 dias), e **16,9% trazem uma observação do cliente** — incluindo, em 11 dias,
**24 pedidos com alergia declarada**. O sinal existe porque essa combinação (múltiplas praças + 2ª
sacola + bebida/kit/sobremesa + observação) é exatamente o perfil que o estudo de 4 anos de WhatsApp
já identificou como a origem mais crônica de erro: "faltou item", "esqueceram o molho", "faltou kit" —
415+ menções. Composição real, pela primeira vez, permite apontar *qual pedido* específico tem esse
perfil, no momento em que ele está sendo montado — não depois, quando o cliente reclama.

## 2. O que ele não é

- Não é checklist manual — ninguém marca nada.
- Não é formulário — nenhum campo novo para preencher.
- Não é cobrança de funcionária — não identifica nem pontua quem monta.
- Não é vigilância — não observa pessoas, observa pedidos.
- Não é mais uma etapa no fluxo físico — a conferência já acontece; o sinal só aponta onde ela merece
  mais atenção.
- Não deve pedir memória ao chão — nasce inteiramente da composição e observação que o pedido já traz.

## 3. O que ele deve fazer

Transformar composição real + observação em **atenção dirigida**: dizer não só "confira", mas *o quê*
e *por quê*. Linguagem candidata (na régua de 4 linhas + sussurro já estabelecida em
`docs/Camada_Decisao_Operacional.md`):

```
CONFIRA O #4421
2ª sacola provável · bebida + kit
→ separar 2ª sacola e conferir item a item
```

```
PEDIDO COM ALERGIA · #7802
troca de item por alergia — conferir antes do lacre
→ confirmar substituição feita corretamente
```

```
COMBINADO + BEBIDA + SOBREMESA · #3120
risco de item esquecido (3 categorias)
→ conferir os 3 grupos antes de fechar
```

Sempre proporcional: gravidade real (alergia) tem peso diferente de preferência leve (sem cebolinha).
Nunca "alarme genérico de conferência" — o sinal cai se não tiver especificidade.

## 4. Quando vira foco (critérios iniciais, sem tuning)

Ordem de severidade sugerida, a validar com o César antes de qualquer implementação:

1. **Alergia explícita na observação** — sempre foco, independente de mais nada (risco de saúde).
2. **2ª sacola + bebida ou 2ª sacola + sobremesa** — combinação historicamente citada como
   "fácil de esquecer" no estudo de WhatsApp.
3. **Observação com termo de troca/substituição** ("trocar", "no lugar de") — risco de a troca não
   ser executada.
4. **Pedido muito grande** (≥8 unidades, já existe como critério no motor) combinado com múltiplas
   praças.
5. **Combinado/menu + kit + bebida** — três categorias fáceis de esquecer na mesma sacola.

Estes são candidatos, não regras — qualquer threshold numérico exige a mesma disciplina das réguas
atuais (nascer de dado medido, não de intuição), e a fase de tuning (quando aprovada) é o lugar certo
para calibrar limites, não este documento.

## 5. Quando fica como ambiente ou detalhe (nunca foco)

| Tipo de observação | Tratamento |
|---|---|
| Alergia declarada | **Sempre foco** |
| Troca de item por alergia/restrição | Foco |
| "Sem X" simples (sem cebolinha, sem gengibre) sozinho, sem 2ª sacola | Detalhe dentro de um foco de conferência já existente — não abre foco sozinho |
| Molho à parte | Detalhe |
| Preferência de ponto ("bem passado") | Detalhe — nunca vira foco isolado |
| 2ª sacola sem nenhuma observação | Ambiente/conferência padrão, severidade baixa (já coberto pelo sinal de conferência atual) |

A diferença central: **observação crítica** (risco de saúde ou de erro grave) sempre emerge; observação
**leve** (preferência de gosto) nunca compete sozinha pela atenção — só some quando combinada com outro
fator de risco (2ª sacola, pedido grande).

## 6. Como preservar a filosofia do DeliveryOS

- **Nasce do pedido, não pede preenchimento** — toda a informação (2ª sacola, kit, observação) já
  existe na composição real capturada; zero digitação nova.
- **Reduz investigação** — hoje a montadora descobre a observação lendo a comanda; o sinal só
  antecipa e prioriza o que ela já veria, não cria trabalho novo.
- **Protege a equipe, não vigia nem pune** — o sinal não registra quem montou nem pontua erro; é
  puramente prospectivo (antes do lacre), nunca retrospectivo de pessoa.
- **Nunca grita lobo** — a régua de confiança já existente (`fonteReal`) se aplica aqui: sem composição
  real confiável, o sinal deveria nascer em confiança média/baixa, nunca crítico.
- **Proporcional** — alergia é grave e aparece grave; "sem cebolinha" nunca compete pela mesma
  atenção visual.

## 7. O que falta antes de qualquer implementação

Esta proposta é conceitual. Antes de virar código: (1) aprovação do César sobre os critérios da §4;
(2) decisão sobre onde este sinal se encaixa na Camada de Decisão existente (`decisao.js`) sem
duplicar a lógica de conferência que já existe; (3) fonte contínua de observação (hoje só um dos
formatos de export traz esse dado — ver `docs/Pedido_iFood_Fonte_Continua_Composicao_Logistica.md`).
Nenhum código foi escrito para este documento.
