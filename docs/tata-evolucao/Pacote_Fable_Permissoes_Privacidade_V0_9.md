# Pacote Fable — Permissões e Privacidade V0.9

> Matriz consolidada. Fontes: Matriz INT · Mapa Validadores V0.2 · Passaporte L8 · Auditoria.

Códigos: **V** visualizar · **C** criar · **E** editar · **S** enviar · **Val** validar · **Dev** devolver · **Ct** contestar · **A** aprovar · **Pub** publicar · **Sus** suspender · **Sub** substituir · **Ar** arquivar · **Aud** auditar · **—** sem · **P** proibido · **Ç** só César

Atores: **Part** · **DS** · **AO** · **LE** · **Ç** · **Own** · **IA** · **TE** · **DOS** · **INT**

---

## 1. Matriz por objeto

| Objeto | Part | DS | AO | LE | Ç | Own | IA | DOS | INT |
|---|---|---|---|---|---|---|---|---|---|
| Conteúdo / Activity | V (vigente) | V | V | V | V A Pub | C E S | C sugestão | — | — |
| Caso / Sim (fazer) | S (próprio) | Val escopo | Val escopo | Val | A | C E | — | — | — |
| Competência (definição) | V trilha | V | V | V | A | C E | C sug | — | — |
| PracticeEvidence | C* Ct própria V própria | C Val escopo | C Val escopo | C Val A | V A Ar Aud | — | C org P Val | **P** runtime | transporte C futuro |
| EvidenceValidation | V própria | C Val | C Val | C Val | Aud | — | **P** final | **P** | — |
| Contestation | C própria | V se envolvido | V | Val A | A Aud | — | C detectar | — | — |
| Passaporte | V próprio | V equipe** | V se val | V E foco | V E A | — | C rascunho P pub | **P** | — |
| Foco desenvolvimento | V próprio | propor escopo | propor | A E | A | — | C sug | **P** | — |
| **Dossiê** | **P** | **P** full | **P** | **fatia*** | **integral** | — | org P decide | **P** | **P** vazar |
| ProtocolVersion | V se aplicável | V | V | V | A Pub Sus Sub | C E | C rasc P Pub | **V** consulta B | Pub se A |
| PilotCycle / Gate | V info | V | V | C A gate | A Aud | — | C sug | — | — |
| AggregatedLearning | — | V tema | V | V | V | V | C | — | D futuro |
| AccessAudit | — | — | — | V lim | **Aud** | — | V anom | V próprio | C |
| IntegrationReference | — | — | — | V | A | — | C | C origem | C |

\*Participante “cria” evidência só se modelo permitir auto-registro; default V0.2: **validador observa e cria**.  
\*\*LE/DS veem Passaporte da equipe **1 a 1**, sem lista rankeável (**I-06**).  
\*\*\*LE fatia: só EV a validar · comps sob responsabilidade · foco aprovado · próximo passo. **Não:** hipóteses privadas, histórico full, prontidão, intervenções confidenciais, disciplina, anotações César (**I-10**).

---

## 2. Ações e riscos de abuso

| Papel | Abuso típico | Mitigação |
|---|---|---|
| DS/AO | Validar de favor / só falhas | Amostra César; mix +/−; **I-23** |
| LE | Dossiê como disciplina; centralizar | ACL; meta 60 min; **I-07 I-25** |
| Part | Jogar validação | Variar âncoras; C amostra |
| IA | “Promover” / aprovar | **I-04** bloqueio |
| INT | Ampliar ACL / PII | privacy_class; scrub |
| DOS | Escrever Passaporte | **P** |

---

## 3. Privacidade (padrão)

Minimização · finalidade · ambientes separados · anon A · pseudo se person_ref · ACL · rastreio · contestação · retenção limitada · **I-07**.

**Nunca no TE:** telefone, endereço, CPF, $ cliente, msgs privadas, fotos pessoais, médico, disciplina auto, conversas sem função.

---

## 4. Desenvolvimento × disciplina

TE: treino, apoio, processo, consistência.  
**Não:** advertência, suspensão, desligamento automáticos.  
Disciplina: processo **externo** humano.

---

## 5. Segregação sensível

Evidência sensível ($ comercial, acusação nominal, segurança grave): segundo olho obrigatório (**I-12**).

---

*Permissões e privacidade V0.9 · consolidado.*
