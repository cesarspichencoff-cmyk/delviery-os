# Proposta B — Prontidão de Abertura

> Como o DeliveryOS deveria saber, **antes do primeiro pedido**, se a operação está pronta.
> Proposta independente (Claude). Nenhum código de produto implementado.

## 1. Por que isto vem antes da Conferência

A Conferência engasga por dois motivos distintos, e o sistema hoje não sabe diferenciá-los:

1. **Pressão** — chegou mais do que a etapa absorve.
2. **Fragilidade prévia** — a operação começou o turno já sem condição (faltou embalagem,
   faltou gente, faltou molho pré-preparado, a impressora falhou).

Sem prontidão, todo engasgo parece pressão. Isso leva à decisão errada: mandar acelerar
quando o problema era falta de sacola. **A prontidão é o denominador da leitura do turno** —
sem ela, a Capacidade Viva mede numerador sem contexto.

Registro honesto: hoje **não existe nenhuma fonte estruturada de prontidão** no DeliveryOS
(ver [INVENTARIO_FONTES_PRIMARIAS](INVENTARIO_FONTES_PRIMARIAS.md) §4). Tudo nesta seção é
**coleta nova a ser criada** — não é leitura de dado existente.

## 2. Princípio: o checklist não é burocracia, é o estado inicial do sistema

Regras de projeto:

- **Não pedir input no pico.** A prontidão é capturada **antes** da abertura, uma vez.
- **Toda pergunta precisa mudar uma decisão.** Se a resposta não altera leitura, risco ou
  capacidade, a pergunta não entra.
- **Resposta rápida por padrão**: o caminho comum é confirmar tudo de uma vez; só o que está
  fora do normal exige detalhe.
- **Nunca vira nota de desempenho de pessoa.** Prontidão descreve a operação, não quem abriu.
- **Sem percentual inventado.** Nada de "operação 87% pronta".

## 3. Domínios de prontidão

### 3.1 Equipe
- pessoas por setor (Sushi, Quentes, Cozinha, Conferência, Caixa/Atendimento, Entregas)
- **posições realmente cobertas** (não headcount — se há 5 pessoas mas ninguém na Conferência, a Conferência está descoberta)
- experiência do time do dia (primeiro dia de alguém muda o risco)
- ausências não repostas

Referência do César (a validar): Conferência com 4–5 pessoas seg–qui, 6–7 sex–sáb, 4–5 dom.

### 3.2 Cardápio
- itens pausados (e desde quando)
- itens críticos indisponíveis
- itens novos no dia (risco de erro alto — ninguém tem prática)
- alterações de receita/apresentação

### 3.3 Preparação (mise en place)
- peixes porcionados
- arroz
- molhos
- acompanhamentos
- pré-preparos com tempo de reposição longo

### 3.4 Materiais de finalização — **o mais ligado à Conferência**
- sacolas (por tamanho)
- embalagens (por tipo)
- kits / talheres / hashi
- etiquetas
- bobinas de impressão

Estes são os materiais que **param a Conferência mesmo com a produção fluindo** — exatamente
o sintoma que o César descreve. Merecem verificação explícita.

### 3.5 Equipamentos e conectividade
- tablets, computadores, celulares
- impressoras (a falha mais citada em operação de delivery)
- internet
- maquininhas de pagamento

## 4. Classificação — quatro níveis com consequência distinta

| Nível | Significado | Efeito no sistema |
|---|---|---|
| **Bloqueador** | A operação **não pode** abrir assim | Impede declarar turno pronto; leitura fica em "não confiável" |
| **Crítico** | Abre, mas com risco alto e conhecido | Reduz capacidade estimada; eleva risco; leitura sinaliza a causa |
| **Atenção** | Vai funcionar, mas com margem menor | Contextualiza a leitura; explica engasgo se ocorrer |
| **Informativo** | Registro para memória | Não altera leitura; alimenta histórico |

**Exemplos de enquadramento** (a validar com o César):
- sem bobina de impressão → **Bloqueador** (não sai comanda)
- sem sacola grande → **Crítico** (pedido grande não fecha)
- Conferência com 3 pessoas numa sexta → **Crítico**
- molho X não pré-preparado → **Atenção**
- item novo hoje → **Atenção** (risco de erro e de tempo)
- 4 pessoas na Conferência numa segunda → **Informativo** (é o normal)

## 5. Como cada condição afeta a leitura

Cada item de prontidão declara explicitamente seu efeito em quatro eixos — **não um score**:

| Eixo | O que muda |
|---|---|
| **Capacidade** | quanto a etapa consegue absorver hoje |
| **Confiança** | quão confiável é a leitura do sistema hoje |
| **Risco** | probabilidade e impacto de erro |
| **Necessidade de intervenção** | se já nasce pedindo ação humana |

Exemplo de saída pretendida (linguagem do produto):

> "Conferência abriu com 4 pessoas numa sexta. O normal para sexta é 6–7.
> A capacidade da etapa final está menor que o habitual — se a noite vier como
> as últimas sextas, o acúmulo deve aparecer por volta das 20h.
> Isto é contexto, não alarme."

E, no caso de material:

> "Sem sacola grande registrada na abertura. Pedidos grandes podem travar na
> finalização mesmo com a produção fluindo. Confirmar antes do pico."

## 6. Versões (mesma escada da Conferência)

### Agora — sem coleta nova
Não é possível. **Não há fonte.** O sistema deve declarar honestamente:
*"Prontidão não observada"* — e nunca assumir que a operação abriu pronta.
Este é o estado atual e deve aparecer como tal.

### Intermediária — coleta mínima viável
Um registro de abertura com poucos toques, capturando: posições cobertas por setor,
materiais de finalização (sacola/embalagem/etiqueta/bobina), impressora/internet ok,
itens pausados. É o menor conjunto que já separa "pressão" de "fragilidade prévia".

### Ideal — prontidão contínua
Estoque de embalagem com baixa automática, escala integrada, saúde de equipamento
observada por heartbeat, itens pausados vindos do próprio canal. A abertura deixa de ser
um formulário e passa a ser um **estado derivado**.

## 7. O que esta proposta recusa

- Recusa **percentual de prontidão** — é precisão falsa sobre dado categórico.
- Recusa **checklist longo** — vira ritual ignorado e dado mentiroso.
- Recusa **nota por turno/pessoa** — prontidão descreve condição, não pessoas.
- Recusa **assumir prontidão** quando não houve registro — ausência é ausência.

## 8. Decisões que dependem do César

1. Confirmar o enquadramento (bloqueador/crítico/atenção/informativo) de cada item — §4.
2. Confirmar as referências de equipe por dia da semana e por setor.
3. Definir quais materiais de finalização realmente param a Conferência (lista fechada).
4. Definir quem registra a abertura e em quanto tempo isso precisa caber.
5. Autorizar (ou não) a coleta mínima viável da versão intermediária.
