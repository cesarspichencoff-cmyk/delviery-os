# Matriz de Permissões e Privacidade — V0.9

> Quem cria, vê, edita, valida, aprova, contesta, arquiva — e o que é **proibido**.  
> Alinha Passaporte, dossiê, Canal A–D e `Politica_Privacidade_Evidencia_V1.md`.

---

## 1. Legenda da matriz

| Código | Significado |
|---|---|
| **C** | Pode criar |
| **V** | Pode visualizar |
| **E** | Pode editar |
| **Val** | Pode validar |
| **A** | Pode aprovar (efeito) |
| **Ct** | Pode contestar |
| **Ar** | Pode arquivar |
| **—** | Sem acesso / não aplicável |
| **P** | **Proibido** |
| **DP** | **DECISÃO PENDENTE DO CÉSAR** |

Atores: **F** funcionário · **L** líder (LE) · **Ç** César · **IA** · **DOS** DeliveryOS · **TE** TATÁ Evolução · **INT** integração futura.

---

## 2. Matriz por objeto

| Objeto | F | L | Ç | IA | DOS | TE | INT |
|---|---|---|---|---|---|---|---|
| **Passaporte pessoal (próprio)** | V | V equipe* | V/E/A | C rascunho** | — | C/E após Val | transporte C |
| **Passaporte de outrem** | P | V equipe* | V | P ranking | P | V ACL | ACL |
| **Evidência prática (própria)** | C/V/Ct | Val/V | V/A/Ar | C sugestão | P runtime | C/V | — |
| **Evidência operacional anonimizada** | — | V/C/Val | V/A/Ar | C agrupar | C origem | V após handoff | C canal A |
| **Hipótese de recorrência** | — | V/C | V/A | **C** só | C sinal | V | C |
| **Caso aprovado** | V formação | V | V/A/Ar | C rascunho | V consulta se publicado tema | **C/E/A** | — |
| **Caso rejeitado** | — | V se criou | V/Ar | V | — | V | audit |
| **Protocolo vigente** | V se aplicável | V | V/A | C rascunho P publicar | **V consulta** | **C/A** | publica pós-A |
| **Competência** | V própria trilha | V/Val | V/A | C sugestão P Val final | P | C/E | — |
| **Validação** | V própria | **Val** | Val/A | P Val final | P | registra | — |
| **Dossiê privado** | P (não vê) | **DP** | **V/E/A/Ar** | C organiza P decide | P | armazena | P vazamento |
| **Prontidão para promoção** | P | P auto | **V/E/A** | **P** decisão; C texto no máximo | P | guarda se Ç | P |
| **Conteúdo disciplinar** | P no TE | P no TE | externo | **P** | P | **P** no Passaporte/dossiê dev | P |
| **Auditoria (IntegrationAuditRecord)** | — | V limitado | V | V anomalia | V próprio | V | **C** |
| **Contestação** | **C/V** própria | C/V | V/A | C detectar | C se fato | C/V | C |

\* LE visualiza Passaporte da equipe no mínimo necessário para validar e definir foco — **sem** ranking.  
\*\* IA pode rascunhar texto de Passaporte; **só humano** publica campo.

### Dossiê — LE

Acesso integral da Liderança em exercício ao dossiê: **DECISÃO PENDENTE DO CÉSAR**.  
Default V0.9: **somente César** tem acesso integral.

---

## 3. Passaporte — o que pode chegar

### Permitido
competência aprovada · evidência prática **validada** · ponto forte **reconhecido** · foco de desenvolvimento **aprovado** · próximo passo · requisito · conquista · evolução recente  

### Proibido
hipótese · acusação · evidência não revisada · recorrência não validada · dados disciplinares · comparação · ranking · suspeita · comentário privado da liderança  

---

## 4. Dossiê privado

| Campo | Conteúdo |
|---|---|
| Finalidade | Apoiar desenvolvimento e decisão humana — não RH punitivo automatizado |
| Permitidos | evidências, recorrências por **tema**, autonomia, treino, críticos factuais, prontidão (hipótese **humana**), intervenções sugeridas, status |
| Proibidos | personalidade, intenção inferida, disciplina automática, ranking, PII cliente, chat bruto |
| Retenção | aprendizado_ativo / auditoria (ver retenção V0.9) |
| Acesso | César total; LE = **DP**; funcionário não vê; IA organiza |
| Registro de acesso | obrigatório conceitualmente (quem/quando/por quê) |
| Contestação / correção | via ContestationRecord nos itens de evidência |
| Arquivamento | status arquivado com motivo |
| Hipótese vs evidência | campos e labels **separados**; hipótese nunca vira Passaporte sozinha |

---

## 5. Padrão mínimo de privacidade

1. Minimização de dados  
2. Finalidade explícita por canal  
3. Separação de ambientes (runtime DOS ≠ dev TE ≠ dossiê)  
4. Anonimização por padrão no Canal A  
5. Pseudonimização se `person_reference` for necessário (Canal C)  
6. Acesso mínimo necessário  
7. Rastreabilidade (audit)  
8. Contestação e correção  
9. Retenção limitada por classe  
10. Arquivamento e exclusão quando permitida  
11. Revisão humana nos handoffs de aprendizado  

### Nunca copiar para o TATÁ Evolução

telefone · endereço · CPF · dados financeiros do cliente · observações pessoais irrelevantes · mensagens privadas · fotos pessoais · informações médicas · dados disciplinares · conversas sem função operacional  

### Privacy_class

| Classe | Uso |
|---|---|
| `publica_interna` | protocolo vigente sem PII |
| `restrita` | caso de formação; evidência anonimizada |
| `sensivel` | PracticeEvidence com person_ref |
| `proibida` | não transportar; bloquear INT |

---

## 6. Separação desenvolvimento × disciplina (contrato)

| Desenvolvimento (TE) | Disciplina (externo) |
|---|---|
| treino, apoio, reensino, processo, consistência | advertência, suspensão, desligamento, rebaixamento |
| Passaporte e dossiê de **desenvolvimento** | processo humano **fora** do TE |
| Evidência justifica aprendizado | Evidência **não** justifica punição automática |

Advertências e histórico disciplinar **não** entram automaticamente no Passaporte nem no dossiê de desenvolvimento.

---

## 7. Canais e privacidade

| Canal | Privacy default | person_reference |
|---|---|---|
| A | restrita / anon | não (processo) |
| B | publica_interna | não |
| C | sensivel | sim (pseudo), ACL |
| D | publica_interna agregada | **nunca** individual |

---

*Permissões e privacidade V0.9 · minimização · sem ranking · dossiê LE pendente.*
