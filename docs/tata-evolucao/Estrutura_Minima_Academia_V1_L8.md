# Estrutura Mínima da Academia V1 — L8

> Arquitetura de conteúdo e informação. **Não** é wireframe, stack, código nem Sprint Visual executada.  
> Princípio: **menos áreas visíveis, mais inteligência por trás.**

---

## 1. Avaliação crítica da navegação

Áreas candidatas: Hoje · Minha evolução · Formação · Casos · Prática · Passaporte · Área do líder.

| Área | Precisa ser aba top-level? | Recomendação L8 |
|---|---|---|
| **Hoje** | Sim | Entrada; 1 ação dominante |
| **Passaporte** (= Minha evolução) | Sim (unificar) | “Minha evolução” **é** o Passaporte — não duplicar |
| **Formação** | Sim | Microlições e trilhas |
| **Casos** | Preferir **dentro de Formação/Prática** | Evitar silo; casos são meio, não destino |
| **Prática** | Sim (ou unir a Formação como etapa) | Simulação + aplicação + validação |
| **Área do líder** | Sim, **só se perfil LE** | Não poluir o funcionário |

### Navegação recomendada V1 (4 áreas)

1. **Hoje**  
2. **Formação** (inclui casos como objetos de estudo)  
3. **Prática** (simulação + pedido de validação)  
4. **Passaporte**  

5. **Líder** (condicional)

Casos não precisam de ícone próprio se estiverem embutidos na jornada Formação → Prática.

---

## 2. Definição por área

### 2.1 Hoje
| Campo | Conteúdo |
|---|---|
| Finalidade | Responder o próximo passo de evolução **agora** |
| Usuário | Funcionário; LE vê versão com “quem validar” |
| Ação dominante | Continuar microlição **ou** concluir prova pendente **ou** aplicar no turno |
| Essencial | 1 card de próximo passo; 1 foco; estado da trilha |
| Não mostrar | Ranking; fila de métricas da loja; comparações; alertas operacionais do DeliveryOS |
| Relação | Empurra para Formação, Prática ou Passaporte |

### 2.2 Formação
| Campo | Conteúdo |
|---|---|
| Finalidade | Consumir microlições e casos da trilha |
| Usuário | Funcionário |
| Ação dominante | Abrir próxima microlição (5–8 min) |
| Essencial | Trilha; módulo atual; progresso de **conteúdo** (secundário) |
| Não mostrar | Nota de personalidade; 45/55/65; limites $ de colegas |
| Relação | Ao terminar bloco → Prática (S) |

### 2.3 Casos (camada, não aba obrigatória)
| Campo | Conteúdo |
|---|---|
| Finalidade | Decisão em situação anonimizada |
| Usuário | Funcionário / LE (revisão) |
| Ação dominante | Escolher e justificar |
| Essencial | Situação; opções; feedback de raciocínio |
| Não mostrar | Diálogo real; nomes; prints identificáveis |
| Relação | Dentro de Formação ou Prática |

### 2.4 Prática
| Campo | Conteúdo |
|---|---|
| Finalidade | Simulação + evidência de comportamento |
| Usuário | Funcionário; LE valida |
| Ação dominante | Enviar evidência / concluir simulação |
| Essencial | Prova S ou B pendente; rubrica curta |
| Não mostrar | Dossiê privado; histórico disciplinar |
| Relação | Aprovações alimentam Passaporte |

### 2.5 Passaporte (Minha evolução)
| Campo | Conteúdo |
|---|---|
| Finalidade | Ver evolução e requisitos para avançar |
| Usuário | Funcionário |
| Ação dominante | Entender próximo marco |
| Essencial | Campos permitidos do Passaporte L8 |
| Não mostrar | Tudo proibido no Passaporte |
| Relação | Volta para Hoje/Formação |

### 2.6 Área do líder
| Campo | Conteúdo |
|---|---|
| Finalidade | Uma decisão dominante por vez (jornada do líder) |
| Usuário | LE / César |
| Ação dominante | Validar **uma** evidência ou definir **um** foco |
| Essencial | Fila curta de validações; trilhas pendentes da equipe; captura de caso |
| Não mostrar | Dashboard multi-KPI; ranking de equipe; dossiê completo de todos de uma vez (evitar “RH policial”) |
| Relação | Escreve no Passaporte; propõe caso à governança |

---

## 3. Relação com DeliveryOS

| | DeliveryOS | Academia / TATÁ Evolução |
|---|---|---|
| Pergunta | O que precisa da sua atenção **agora**? (turno) | Qual é o seu **próximo passo** para evoluir? |
| Momento | Pico e operação | Fora do crítico; microblocos |
| Visual | Família premium compartilhada (brief) | Mesma família; identidade própria de evolução |
| Dados | Pedidos, qualidade, apto | Trilhas, provas, passaporte |

**Não** embutir a Academia como aba do Foco do turno na Fase 1 sem decisão explícita.

---

## 4. O que a Academia V1 **não** é

- LMS escolar · feed social · gamificação infantil · RH · clone do DeliveryOS com gráficos.

---

## 5. Futuro técnico (só direção — sem stack)

- Conteúdo versionado (governança).  
- Provas K/S/B/C como objetos.  
- Passaporte e dossiê com ACLs.  
- Integração futura opcional com sinais do DeliveryOS (estado do pedido) — **não** nesta L8.

---

*Academia V1 L8 · arquitetura · 4+1 áreas · sem wireframe.*
