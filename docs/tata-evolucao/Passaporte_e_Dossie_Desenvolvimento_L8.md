# Passaporte de Evolução e Dossiê Privado — L8

> Duas camadas **separadas**. O funcionário vê o Passaporte. O dossiê é **inicialmente só do César**.  
> IA organiza e sugere; **IA não decide** promoção, rebaixamento, advertência, desligamento, intenção, personalidade, potencial definitivo nem alinhamento cultural definitivo.

---

## 1. Passaporte de Evolução (visível ao funcionário)

### 1.1 Finalidade
Responder: **“Qual é o meu próximo passo para evoluir?”**  
Motivar com clareza e respeito — sem competição pública.

### 1.2 Campos permitidos

| Campo | Descrição | Origem |
|---|---|---|
| trilha_atual | Função + formação em curso | Atribuição LE/César |
| conteudos_concluidos | Microlições / módulos | Sistema de formação (futuro) |
| competencias_demonstradas | IDs com provas aprovadas (K/S/B/C) | Validação humana |
| pontos_fortes_reconhecidos | Só o que LE/César **reconheceu** | Humano |
| foco_desenvolvimento | Um foco principal | Humano |
| proximos_passos | 1–3 ações concretas | Humano + regra de trilha |
| requisitos_para_avancar | Marcos de autonomia / provas faltantes | Matriz + trilha |
| ideias_reconhecidas | Ideias aprovadas no fluxo de casos | Governança |
| conquistas | Marcos não competitivos (ex.: F1 completa) | Sistema + humano |
| evolucao_recente | Mudança desde última validação | Resumo |
| evidencias_praticas_aprovadas | Lista curta de evidências **já validadas** | Humano |

### 1.3 Proibido no Passaporte

- Ranking · comparação com colegas · hipóteses internas · suspeitas  
- Avaliações não validadas · julgamentos de personalidade · informações disciplinares  
- “Score” público · placar de erros · 45/55/65 · valores de compensação de terceiros  

### 1.4 Regras de escrita

- Fatos e comportamentos observáveis.  
- Tom de respeito (valor TATÁ).  
- Conteúdo concluído **≠** competência (mostrar provas separadas).

---

## 2. Dossiê privado de desenvolvimento (César)

### 2.1 Finalidade
Apoiar decisão humana de desenvolvimento com memória estruturada — **não** RH punitivo automatizado.

### 2.2 Campos permitidos

| Campo | Uso |
|---|---|
| evidencias | Notas B/C, casos, observações |
| recorrencias | Temas (omissão, comunicação…), não “ficha criminal” |
| autonomia_demonstrada | O que já executa na matriz |
| necessidades_treinamento | Lacunas F1–F4 / função |
| situacoes_criticas | Eventos graves com fato (segurança, etc.) |
| prontidao_promocao | **Hipótese de trabalho humana**, nunca automática |
| intervencoes_recomendadas | Treino, sombra, conversa — sugestão |
| status_desenvolvimento | Ver §2.3 |

### 2.3 Status do dossiê / item

| Status | Significado |
|---|---|
| aberto | Em observação |
| em desenvolvimento | Plano ativo |
| corrigido | Comportamento/recorrência endereçada |
| consolidado | Consistência demonstrada |
| evidencia_insuficiente | Não concluir nada |
| arquivado | Encerrado com motivo |

### 2.4 O que a IA pode / não pode

| Pode | Não pode |
|---|---|
| Organizar evidências | Decidir promoção |
| Sugerir foco de treino | Rebaixar, advertir, desligar |
| Agrupar recorrências por **tema** | Inferir intenção ou personalidade |
| Lembrar provas pendentes | Declarar potencial ou alinhamento cultural **definitivos** |
| Rascunhar texto de Passaporte para LE editar | Publicar no Passaporte sem humano |

### 2.5 Acesso (Fase 1)

| Papel | Acesso |
|---|---|
| César | Total |
| LE | **Pendente decisão César** (mínimo: só o necessário para validar provas da equipe) |
| Funcionário | **Não** vê dossiê; vê Passaporte |
| IA | Processa sob política de privacidade; sem export público |

---

## 3. Fluxo entre as duas camadas

```text
Observação / simulação / ciclo real
  → evidência candidata
  → validação humana (LE/César)
  → se aprovada: espelha no Passaporte (campos permitidos)
  → detalhe sensível / recorrência: só dossiê
  → avanço de autonomia: humano
  → promoção de cargo: só César (fora do produto automático)
```

---

## 4. Privacidade e Git

- Nenhum dossiê real de pessoa no repositório.  
- Este documento é **arquitetura**.  
- Política: `Politica_Privacidade_Evidencia_V1.md`.

---

## 5. Critérios de pronto da arquitetura

- [x] Passaporte e dossiê separados.  
- [x] Campos permitidos/proibidos explícitos.  
- [x] Limites da IA explícitos.  
- [ ] Acesso LE ao dossiê: decisão César.  
- [ ] Prazos de consistência por competência: decisão César.

---

*Passaporte + Dossiê L8 · sem ranking · sem implementação.*
