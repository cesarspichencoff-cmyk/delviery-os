# Auditoria de Permissões e Privacidade L8 × Contrato V0.9

> Cruza L8 (Passaporte, dossiê, jornadas, métricas) com `Matriz_Permissoes_Privacidade_V0_9.md` e decisões César desta auditoria.  
> **Não** altera artefatos auditados.

---

## 1. Decisão César aplicada (acesso LE ao dossiê)

| Pode (LE) | Não pode (LE) |
|---|---|
| Evidências que precisa **validar** | Hipóteses privadas |
| Competências sob sua responsabilidade | Histórico completo do dossiê |
| Foco de desenvolvimento **aprovado** | Prontidão para promoção |
| Próximos passos **operacionais** | Intervenções confidenciais |
| Acompanhamento direto necessário | Conteúdo disciplinar; anotações privadas do César |

**Acesso integral:** exclusivo do César.  
**Gap L8:** `Passaporte_e_Dossie_Desenvolvimento_L8.md` ainda marca acesso LE como pendente — **corrigir em missão de correção**, não aqui.

---

## 2. Testes de permissão (cenários)

| # | Teste | Resultado | Achado |
|---|---|---|---|
| 1 | Funcionário vê só o necessário | **Parcial** | Passaporte OK se campos cortados; sem UX de contestação |
| 2 | LE valida só o que cabe | **Parcial** | Modelo 1 B/pessoa OK; PEND-05 formador ambíguo |
| 3 | César autoridade final | **OK** | $ loja promoção protocolo |
| 4 | IA não decide | **OK** no contrato; L8 alinhado | Risco se produção ignorar |
| 5 | DOS não altera desenvolvimento | **OK** | Canal C isolado |
| 6 | TE não altera live | **OK** | Contrato |
| 7 | Integração não amplia acesso | **OK** se INT respeitar ACL | Risco implementação |
| 8 | LE abre dossiê completo | **Deve falhar** | Decisão César; L8 desatualizado vs decisão |
| 9 | Passaporte com hipótese | **Deve falhar** | Campos proibidos listados — OK doc |
| 10 | Métrica vira ranking | **Proibido** | Declaração OK; M4/M8 risco implementação |
| 11 | PracticeEvidence no runtime DOS | **Proibido** | Contrato Canal C |
| 12 | person_reference em caso de formação | **Proibido por padrão** | Biblioteca L8 OK (sem nomes) |

---

## 3. Permissões excessivas ou ausentes

### Excessivas (risco)

| Item | Por quê | Ação recomendada (correção futura) |
|---|---|---|
| LE “V equipe” Passaporte sem limite | Pode virar mural comparativo | Explicitar: 1 pessoa por vez; sem lista rankeável |
| `prontidao_promocao` no dossiê V0 | Pressão / auto-decisão futura | Só César; questionar no piloto |
| `intervencoes_recomendadas` amplas | Parece RH | Mínimo factual |
| Amostra de chats para C-T03 | Privacidade de mensagens | Só pseudo/agregado; sem export Git |
| AO02 “auditoria de padrão” | Vigilância de pares | Reescrever como apoio a processo |

### Ausentes (gap)

| Item | Por quê | Ação |
|---|---|---|
| Contestação no Passaporte | Funcionário não sabe como contestar competência | Adicionar na correção |
| “Quem valida” visível | Jornada incompleta | Campo ou texto na trilha |
| Log de acesso ao dossiê (L8) | Contrato exige; L8 não operacionaliza | Na correção / INT |
| ACL formador ≠ LE | PEND-05 | Decisão César |
| Escrita de foco: só LE/César | Implícito | Explicitar |

---

## 4. Privacidade — violações e riscos

| Risco | Severidade | Estado doc | Mitigação contratual |
|---|---|---|---|
| PII em casos | Baixa (L8 anon) | OK | Manter |
| Chat WA em evidência C-T03 | Média | Ressalva | Não no Git; amostra privada |
| Dossiê como disciplina | Alta | Separado no papel | Treino LE + ACL |
| Passaporte como desempenho | Média | Anti-ranking declarado | Cortar campos + UI |
| M1 com pessoa | Alta se mal feito | Agregado declarado | Só tema |
| Compensação com valor cliente | Média | $ pendente | Não copiar ticket |
| Fotos/comandas | Alta se L7 | L7 fechado | Gate mídia |
| Retenção sem prazo legal | Média | Pendente | Sem parecer; minimizar agora |
| Export métricas multi-pessoa | Média | Proibido ranking | ACL INT |

**Não copiar para TE (reafirmado):** telefone, endereço, CPF, $ cliente, msgs privadas, fotos pessoais, médico, disciplina, conversas sem função.

---

## 5. Separação desenvolvimento × disciplina

| Check | Resultado |
|---|---|
| L8 declara Passaporte sem disciplina | **OK** |
| Contrato proíbe punição auto | **OK** |
| Risco cultural “projeto = punição” | **Alto** se só falhas (red team #29) |
| Casos positivos na biblioteca | **Presentes** mas secundários na Onda 1 se cortar mal | Garantir ≥2 positivos no piloto |

---

## 6. Alinhamento com Canal B provisório (César)

Publicação provisória exige: status · aprovação César · owner · versão · escopo · valid_from/until · suspensão · feedback · rollback.  
**L8 protocolos rascunho** não listam todos esses metadados de publicação → **gap de governança de conteúdo** a fechar na correção (sem implementar INT).

---

## 7. Veredito permissões/privacidade

| Dimensão | Veredito |
|---|---|
| Desenho L8 | **Aprovado com ressalvas** |
| Contrato INT | **Mais completo** que L8 em ACL/contestação |
| Bloqueador de correção | Atualizar dossiê LE; contestação; cortar campos; anti-ranking operacional |
| Bloqueador de piloto papel | Baixo se LE treinado e sem dossiê digital |

---

*Auditoria permissões/privacidade L8 V0.9 · sem alterar ACL nos docs originais.*
