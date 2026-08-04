# Constituição do produto DeliveryOS

> **Documento vinculante.** Ele diz **o que o DeliveryOS é**, e o que nenhuma missão pode redefinir
> em silêncio. Não é plano, não é arquitetura e não é manual de trabalho.
>
> Criado em 2026-08-04 pela missão `REVOLUTION 0-A`, sobre HEAD `fae35c9`, branch
> `feature/deliveryos-hybrid-platform-foundation-v1`.
>
> **Ele não concorre com os documentos fundadores.** `docs/Constituicao.md` (filosofia da empresa),
> `docs/Leis_Fundamentais.md` (as 12 leis) e `docs/Manifesto_Produto_Design.md` continuam mandando
> mais. Onde houver conflito, eles vencem. O que este documento acrescenta é a **definição de produto**
> — que existia espalhada por mapas, auditorias e conversas, e por isso derivou três vezes.
>
> Não confundir com `docs/PRODUCT_CONSTITUTION.md`, que é a constituição de **identidade e cânone
> visual do ecossistema TATÁ**. Esta aqui é a do **produto DeliveryOS**.

---

## 1. Por que esta constituição existe

O produto do DeliveryOS derivou três vezes, sempre pelo mesmo mecanismo: **quem retomava o trabalho
encontrava o estado técnico e não encontrava o produto.**

- A primeira deriva pôs 32 perguntas de produto sem resposta em quatro documentos, e nenhuma estava
  registrada como bloqueio. Corrigida pelo índice canônico e pela categoria de bloqueio de produto.
- A segunda desenhou a home sobre `app-v1` e sobre o Design System — os dois níveis mais baixos da
  autoridade visual — porque nenhuma ordem de leitura chegava à hierarquia. Corrigida por `CLAUDE.md`
  §11 item 4 e pela guarda `npm run test:platform:visual-order`.
- A terceira, mais silenciosa: **Entregas virou a home por ter sido a primeira coisa implementada**,
  não por decisão de produto. Um módulo de aprofundamento ocupou o lugar do produto principal.

As três têm a mesma causa: **a definição do produto não estava escrita num lugar só, vinculante.**
Agora está.

---

## 2. O que o DeliveryOS é

O DeliveryOS é a **plataforma operacional completa** — domínios, dados, interfaces, memória e ativos
de inteligência. Ele é um **sistema nervoso operacional**: existe para reduzir investigação e carga
mental de quem opera sob pressão.

> Toda operação de delivery sob pressão para de produzir para se procurar.
> O DeliveryOS é o sentido que falta.

**Mede-se por quanto tempo a equipe consegue parar de olhar**, confiando que, se importar, o sistema
chama.

### 2.1 O produto principal

**O produto principal é o COPILOTO DA OPERAÇÃO DO RESTAURANTE.**

Ele é o ativo operacional central *dentro* do DeliveryOS. Não é a plataforma inteira, não é banco de
dados, não é rede de informações. Atua sobre sinais e estados **já sustentados** — não coleta dado
novo — e, **dentro do Foco**, reduz a decisão e oferece orientação prática.

### 2.2 O segundo produto prioritário

**ENTREGAS é o segundo produto prioritário.** É superfície operacional de aprofundamento: quem está
na rua e com o quê.

**Entregas não é a home.** A recomendação antiga de tratá-la como lançamento principal está
**revogada** por esta constituição.

### 2.3 O que é paralelo

**CRM e chatbot são paralelos e não bloqueiam nenhuma missão do produto principal.**

### 2.4 O que não representa o DeliveryOS

**Somente Entregas não é DeliveryOS. Somente um Copiloto de frota não é DeliveryOS.** Uma release que
entregue só um dos dois é uma release parcial, e precisa se declarar parcial.

### 2.5 O que o DeliveryOS nunca será

Dashboard · ERP · SaaS comum · lista de alertas · painel corporativo · ferramenta de vigilância ou
punição · sistema que pede input no pico · kanban de pedido · BI bonito.

**Dashboard mostra tudo e manda procurar. O DeliveryOS dá a única coisa e esconde o resto.**

---

## 3. O que o Copiloto operacional precisa compreender

Quando — e **somente quando** — as fontes sustentarem:

| Grupo | O que |
|---|---|
| Pedido | pedidos entrando · evolução dos pedidos · pedidos, itens, quantidades e observações |
| Origem | iFood e Gestor iFood · Teknisa–Odhen |
| Espaço | ambientes, praças e subáreas |
| Carga | carga conhecida · **carga desconhecida** |
| Tempo | ritmo · tendência · mudança de movimento |
| Atraso | pedidos atrasados · pedidos parados |
| Composição | pedido somente quente · duas sacolas **somente com motivo sustentado** · risco de conferência · itens saindo mais |
| Pressão | gargalos |
| Fonte | saúde das fontes · atraso das fontes · divergência entre fontes |
| Decisão | problema que merece atenção · ação humana recomendada |
| Lastro | evidência · confiança · validade · condição de retirada |

**Carga desconhecida está nesta lista de propósito.** Não saber é um estado do produto, não um buraco
a esconder.

---

## 4. Princípios obrigatórios

### 4.1 Quem decide

1. **Humano + inteligência artificial.** O humano decide; a máquina mostra.
2. A **Operação Viva** é a **autoridade final da atenção** — a única dona de Calmo, Ambiente e Foco.
   Nenhum outro domínio cria Foco diretamente.
3. **Feedback humano faz parte permanente do produto.** Não é fase de testes.
4. **Nenhuma regra é promovida automaticamente.** Aprendizado estrutural segue observação → evidência
   → proposta → **aprovação humana** → regra.

### 4.2 Como a atenção se comporta

5. **Calmo, Ambiente e Foco.** Foco é raro e acionável. Ambiente é clima, e **informa**. **Apenas o
   Foco orienta.**
6. **Existe uma prioridade principal** — no máximo uma orientação ocupa o Foco.
7. **Problemas secundários relevantes permanecem visíveis.** Exclusividade de slot governa a **ação
   prescrita**, nunca a visibilidade.
8. **Um ambiente crítico nunca desaparece porque outro virou Foco.**
9. **Calmo não é tela vazia.** É conclusão da consciência, com pulso vivo.

### 4.3 O que a interface não pode mentir

10. **Ausência de informação nunca significa Calmo, Verde ou saudável.**
11. **Toda afirmação operacional exige evidência, procedência e saúde da fonte.**
12. **Fato, inferência e ausência devem ser visualmente distintos.**
13. **Confiança não pode ser inventada** — e a ausência dela também não pode ser escondida. Quando
    não houver política que a apure, a interface diz `Confiança: não estimada`, sem percentual, score
    ou cor artificial. Severidade **não** vira confiança.
14. **Duas sacolas exige motivo sustentado.** Heurística ampla não é verdade operacional.
15. **Caixa sem fonte aparece como `sem medição automática`** — nunca verde por ausência de dado.
16. **Conferência pode preservar risco por pedido** mesmo sem medição confiável de carga da área.
17. Dado incompleto é aceitável. **Dado falso é veneno.**

### 4.4 O que a IA pode fazer nesta fase

18. **A IA começa read-only e em shadow.**
19. **A IA não executa ações em Gestor, iFood ou Odhen nesta fase.**

### 4.5 Como se constrói

20. **Não criar outro motor. Não criar outro Copiloto.**
21. **Não reescrever módulo verde sem defeito comprovado.**
22. **Figma não bloqueia a evolução.** Código e navegador podem ser a fonte operacional da experiência.
23. **Operação e segurança prevalecem sobre estética. Clareza prevalece sobre espetáculo.**

---

## 5. Decisões que exigem o César — nenhuma pode ser tomada por modelo

Herda e reafirma a lista do índice canônico §6:

mudança da **home** · mudança de dono de **Calmo, Ambiente ou Foco** · mudança do **papel do
Copiloto** · criação, remoção ou reorganização de **módulos visíveis** · alteração das **jornadas** de
gerente, boqueta, caixa e atendimento · mudança no **significado de um ambiente** · **conexão entre os
dois motores** · **abandono de um sinal** original · transformação de **tela técnica em experiência
principal** · mudança das **regras de pausa** · mudança das **ações recomendadas** · uso de **dado de
funcionário** que possa ampliar vigilância.

Decisões técnicas rotineiras que preservem estas regras **não** precisam interromper a execução.

---

## 6. O que esta constituição não decide

Ela **não** resolve os conflitos abertos do índice canônico §7 (C1, C2, C3, C5, C7, C8), **não**
promove nenhum laboratório experimental a produto, e **não** substitui a validação humana do César
sobre qualquer superfície.

Ela também **não** é autoridade visual. A expressão obedece a `docs/design/VISUAL_REFERENCE_HIERARCHY.md`.

---

## 7. Como usar

- **Antes de propor qualquer superfície:** ler esta constituição e o índice canônico §3.4, §4 e §8.
- **Antes de declarar um lançamento:** conferir §2.4 — parcial precisa se declarar parcial.
- **Ao encontrar uma pergunta de produto sem resposta:** registrar em `docs/execution/BLOCKERS.md`,
  seção **BLOQUEIOS DE PRODUTO E DECISÕES HUMANAS**.
- **Ao encontrar um princípio desta constituição sendo violado por código verde:** o código está
  errado, não o princípio. Registrar e parar.

*Constituição vinculante. Índice de onde o produto está escrito: `docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md`.*
