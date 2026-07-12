# Passaporte e Dossiê — L8 V0 (pós-correção)

> Simplificado para **&lt;10 segundos** de leitura do próximo passo.  
> Anti-punição · sem ranking · contrato INT como limite · **não** sistema disciplinar.

---

## 0. Anti-punição

O TATÁ Evolução forma e desenvolve. **Não** disciplina.  
Falha isolada ≠ diagnóstico de pessoa. Competência não cai por um único caso. Contestação permitida.

---

## 1. Passaporte V0 (visível ao funcionário)

### 1.1 Campos **mantidos** (somente estes)

| Campo | Finalidade | Origem | Quem edita/aprova |
|---|---|---|---|
| **trilha_atual** | Onde estou | Atribuição LE/César | LE/César |
| **proximo_passo** | Uma ação dominante | Humano + trilha | LE (ou DS no escopo) |
| **competencias_demonstradas** | O que já demonstrei (IDs + prova) | Validação humana | Validador autorizado |
| **evidencia_necessaria** | O que preciso demonstrar agora | Trilha / foco | LE/DS |
| **validador_possivel** | Quem pode validar | Matriz validadores | Sistema/LE |
| **foco_desenvolvimento** | Foco aprovado (1) | LE/César | LE/César |
| **status_contestacao** | aberta / resolvida / nenhuma | Contestation | Funcionário abre; César/LE resolve no escopo |

### 1.2 Removidos ou adiados do V0

| Campo antigo | Ação |
|---|---|
| conteudos_concluidos | Secundário — fora da face V0 (pode existir em Formação) |
| proximos_passos (lista) | **Fundido** em `proximo_passo` |
| evolucao_recente | **Fundido** em `proximo_passo` / competências |
| ideias_reconhecidas | **Adiado** |
| conquistas extensas | **Adiado** (no máx. 1 marco não competitivo futuro) |
| requisitos_para_avancar longos | Embutido em `evidencia_necessaria` |
| evidencias_praticas lista longa | Só o necessário em `evidencia_necessaria` + última B |
| prontidão promoção | **Proibido** no Passaporte |

### 1.3 Perguntas respondidas em &lt;10 s

| Pergunta | Campo |
|---|---|
| Onde estou? | trilha_atual |
| Qual meu próximo passo? | proximo_passo |
| O que preciso demonstrar? | evidencia_necessaria |
| Quem valida? | validador_possivel |
| Como contestar? | status_contestacao + caminho: avisar LE/César e registrar motivo em 1 linha |

### 1.4 Proibido no Passaporte

Ranking · comparação · hipótese · acusação · evidência não revisada · disciplina · personalidade · suspeita · comentário privado · 45/55/65 · valores $ de terceiros.

---

## 2. Dossiê privado V0

### 2.1 Finalidade
Apoiar desenvolvimento legítimo do César — **não** RH punitivo.

### 2.2 Campos **mantidos**

| Campo | Nota |
|---|---|
| evidencias_aprovadas | Fatos validados |
| recorrencias_validadas_por_tema | Tema, não ficha criminal |
| autonomia_demonstrada | Marcos matriz |
| foco_desenvolvimento | Alinhado Passaporte |
| intervencoes_realizadas | Só o que **foi feito** (treino, conversa) — não “potencial” |
| status | aberto / em desenvolvimento / corrigido / consolidado / evidencia_insuficiente / arquivado |

**Hipótese vs evidência:** labels obrigatórios; hipótese **não** vai ao Passaporte.

### 2.3 Retirados / adiados

prontidão promoção estruturada · potencial · perfil · personalidade · comentários sem finalidade · disciplina · observações não revisadas · intervenções “recomendadas” especulativas (só realizadas)

### 2.4 ACL (decisão César — aplicada)

| Papel | Acesso |
|---|---|
| **César** | Integral |
| **LE** | **Somente:** evidências a validar · competências sob responsabilidade · foco aprovado · próximo passo necessário. **Não:** hipóteses privadas, histórico completo, prontidão, intervenções confidenciais, disciplina, anotações César |
| **Funcionário** | Não vê dossiê; vê Passaporte |
| **IA** | Organiza; **não** decide |
| **DS/AO** | Não acessam dossiê; validam provas no escopo via fila de validação |

**Registrar:** quem acessou · quando · finalidade (audit conceitual; papel no piloto).

### 2.5 Contestação e correção
Conforme contrato INT: contestada ≠ consolidada. Correção versionada. César resolve conflitos sensíveis.

---

## 3. Fluxo mínimo

```text
Prova K/S/B → validador autorizado → se aprovada: Passaporte
Detalhe sensível / recorrência tema → dossiê (César; fatia LE se validação)
Contestação → status no Passaporte → resolução humana
```

---

*Passaporte/Dossiê V0 pós-correção · 7 campos · ACL LE fatia.*
