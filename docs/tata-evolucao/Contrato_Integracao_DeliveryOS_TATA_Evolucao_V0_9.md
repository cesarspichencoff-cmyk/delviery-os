# Contrato de Integração DeliveryOS × TATÁ Evolução — V0.9

> Contrato **conceitual, operacional e de governança**.  
> **Não** implementa integração técnica · **não** altera live · **não** define stack · **não** cria banco compartilhado.  
> Branch: `research/tata-evolucao-grok` · Base L8: `5e42c24`.  
> Versão: **V0.9** · Status: **rascunho para validação do César e auditoria adversarial futura**.

---

## 1. Princípio central

| Sistema | Papel soberano |
|---|---|
| **DeliveryOS** | Observa e organiza a **realidade operacional** do turno. |
| **TATÁ Evolução** | Transforma **evidências aprovadas** em cultura, formação, competência, procedimento e autonomia. |

Os dois **cooperam sem perder soberania**.  
Um não é submódulo do outro. Integração futura é por **canais explícitos**, com revisão humana nos pontos de aprendizado e publicação.

### Frases-guia (inalteradas)

| Sistema | Pergunta |
|---|---|
| DeliveryOS | O que precisa da sua atenção **agora**? |
| TATÁ Evolução | Qual é o seu **próximo passo** para evoluir? |

---

## 2. Soberania do DeliveryOS

### 2.1 Fonte de verdade para

- fatos operacionais · eventos · timestamps · freshness · confiança · desconhecidos  
- estado da operação · **Calmo** · **Ambiente** · **Foco**  
- decisões operacionais · replay · deduplicação · fontes vivas · runtime  

### 2.2 TATÁ Evolução **não pode escrever** diretamente em

| Zona proibida | Motivo |
|---|---|
| fatos / estado live | Integridade do motor |
| freshness / confiança | Epistemologia DeliveryOS |
| Calmo / Ambiente / Foco | Estado cognitivo soberano |
| decisão operacional | Segurança do turno |
| deduplicação / histórico bruto | Replay e prova |
| resultado do motor | Não “ensinar” o runtime sem missão técnica |

---

## 3. Soberania do TATÁ Evolução

### 3.1 Fonte de verdade para

- formações · módulos · competências · simulações · casos **aprovados**  
- protocolos de aprendizado · versões de conteúdo  
- Passaporte de Evolução · evidências práticas **aprovadas**  
- focos de desenvolvimento · validações · governança de conteúdo  
- piloto · desenvolvimento de autonomia  

### 3.2 DeliveryOS **não pode**

| Ação proibida | Motivo |
|---|---|
| concluir competência | Exige prova humana K/S/B/C |
| aprovar formação / alterar Passaporte | Soberania Evolução |
| decidir promoção / prontidão | Humano (César) |
| registrar julgamento de personalidade | Fora do domínio |
| transformar fato isolado em regra | Governança L8 |
| criar punição / publicar conteúdo automaticamente | Separação disciplina × desenvolvimento |

---

## 4. Fluxo principal de ida (operação → aprendizado)

```text
DeliveryOS observa fato
  → registra evidência operacional (soberania DOS)
  → pode sugerir agrupamento ou recorrência (IA/sistema; não prova)
  → cria EvidenceCandidate (Canal A)
  → revisão humana
  → anonimização e classificação
  → ReviewedEvidence → candidato a OperationalCase
  → LearningProposal
  → aprovação humana
  → entrada no TATÁ Evolução
  → formação | prática | procedimento | comunicação | proposta de sistema
```

### Proibido

```text
fato isolado → regra automática → treinamento obrigatório automático → avaliação automática da pessoa
```

---

## 5. Fluxo principal de volta (aprendizado → consulta operacional)

```text
TATÁ Evolução aprova Protocol / ProtocolVersion
  → versão + owner + vigência
  → revisão humana final
  → publicação para consulta (Canal B)
  → DeliveryOS reconhece orientação vigente (somente leitura/consulta)
  → aplicação operacional gera novas evidências
  → resultado volta para revisão (Canal A / D agregados)
```

### Invariante crítica

**Publicar protocolo ≠ alterar lógica do motor ou da decisão.**  
Tradução protocolo humano → regra executável exige: **missão técnica específica · testes · autorização · recertificação**.

---

## 6. Quatro canais conceituais

| Canal | Direção | Uso | Não fazer |
|---|---|---|---|
| **A — Evidência operacional anonimizada** | DOS → Evolução | fatos, recorrências candidatas, casos, lacunas, processo, boas práticas | PII por padrão; disciplina; ranking |
| **B — Publicação de protocolos** | Evolução → DOS | protocolo vigente, versão, escopo, função, validade, owner, revisão | alterar motor/decisão; publicar rascunho |
| **C — Evidência de desenvolvimento** | Evolução → armazenamento privado desenvolvimento | simulação, B/C, autonomia, foco | circular no runtime operacional DOS |
| **D — Resultado agregado de aprendizado** | Evolução → análise institucional | recorrência↓, autonomia↑, escalonamento, protocolos, ciclos | ranking individual; alimentar decisão live sem revisão |

Detalhe de objetos e envelope: `Modelo_Eventos_Evidencias_Compartilhadas_V0_9.md`.  
Fluxos e estados: `Fluxos_Ida_Volta_Protocolos_Aprendizado_V0_9.md`.

---

## 7. Integração com Calmo, Ambiente e Foco

| Regra | Conteúdo |
|---|---|
| Proibido | TATÁ Evolução criar diretamente Calmo, Ambiente ou Foco |
| Permitido (futuro, sob contrato) | protocolo vigente · orientação aprovada · contexto formativo · briefing autorizado · necessidade de revisão de procedimento |
| Quem decide estado cognitivo | **Somente DeliveryOS**, pelo próprio contrato |
| Aprendizado → Foco | **Nunca** só porque existe conteúdo relacionado |

---

## 8. Separação desenvolvimento × disciplina

| TATÁ Evolução **é** | TATÁ Evolução **não é** |
|---|---|
| formação, desenvolvimento, autonomia | sistema disciplinar |
| treino, reensino, apoio, processo | advertência, suspensão, desligamento automáticos |

Evidência operacional **pode** justificar: treinamento · revisão · apoio · reensino · mudança de processo · observação de consistência.  
Evidência operacional **não pode** justificar automaticamente: advertência · suspensão · desligamento · rebaixamento.  
Processo disciplinar permanece **externo e humano**.

---

## 9. Autoridade final (César)

Protocolos oficiais · limites financeiros · exceções comerciais · critérios de autonomia · promoção · rebaixamento · advertência · desligamento · ampliação de escopo · publicação de regras que alterem a operação.

### IA

| Pode | Não pode |
|---|---|
| organizar, resumir, sugerir, detectar inconsistências | intenção, culpa, personalidade, potencial definitivo, alinhamento cultural definitivo |
| | punição, promoção, desligamento, advertência, limite $, regra oficial, protocolo vigente sem humano |

---

## 10. Limites de automação (resumo)

| Classe | Significado |
|---|---|
| **A** | Automática permitida |
| **B** | Automática com revisão posterior |
| **C** | Sugestão da IA |
| **D** | Exige aprovação humana antes |
| **E** | Proibida |

| Ação | Classe |
|---|---|
| Deduplicar evento (runtime DOS) | A (soberania DOS) |
| Anonimizar campo conhecido (lista fechada) | A ou B |
| Agrupar evidências / sugerir caso / recorrência / formação | C |
| Publicar protocolo | D |
| Alterar regra operacional / motor | E sem missão técnica; depois D+recert |
| Criar Foco a partir do Evolução | E (sem contrato específico futuro) |
| Validar competência / aprovar evidência prática / alterar Passaporte | D (humano) |
| Registrar foco de desenvolvimento | D |
| Recomendar promoção | C no máximo (texto); decisão E para IA |
| Aplicar punição | E |

Detalhe: `Governanca_Aprovacao_Versionamento_V0_9.md`.

---

## 11. Privacidade (padrão mínimo)

Minimização · finalidade explícita · separação de ambientes · anonimização por padrão · pseudonimização se necessário · acesso mínimo · rastreabilidade · contestação · correção · retenção limitada · arquivamento · exclusão quando permitida · revisão humana.

**Não copiar** para o Evolução: telefone · endereço · CPF · dados financeiros do cliente · observações pessoais irrelevantes · mensagens privadas · fotos pessoais · informações médicas · dados disciplinares · conversas sem função operacional.

Alinha-se a `Politica_Privacidade_Evidencia_V1.md`. Detalhe: `Matriz_Permissoes_Privacidade_V0_9.md`.

---

## 12. Tempo e identidade de evento

- Timezone da loja: **America/Sao_Paulo**.  
- `operational_day_key = local_date`.  
- Fluxo normal: horário local **&lt; 23:00**; fora do fluxo: **≥ 23:00**.  
- Timestamps explícitos; **nenhum horário silenciosamente em UTC**.  
- Eventos **idempotentes**; replay **não** recria casos/propostas duplicados.  
- O mesmo fato **não** conta N vezes só por aparecer em WhatsApp + DOS + export.

---

## 13. Rastreabilidade (todo fluxo deve responder)

de onde veio · quem revisou · quem aprovou · qual versão · qual evidência · qual confiança · qual finalidade · quem pode ver · quando expira · como contestar · qual sistema é proprietário.

---

## 14. Validação cirúrgica (4 temas — sem mineração ampla)

Consulta apenas a derivados/documentos já catalogados (L6A/L6B/L8). **Até 10 unidades conceituais por tema.** Sem PII no Git.

| Tema | Contrato suporta? | Campo / lacuna | Permissão / humano | Risco privacidade |
|---|---|---|---|---|
| **Compensação** | Sim (tipos + P6 + matriz $ pendente) | `valor_maximo` vazio; tipo de recuperação no payload | César aprova limites e exceção comercial | Não levar ticket $ do cliente |
| **Pausa / item 86** | Sim (P1 + 5 campos + revisão 15 min) | Registro de motivo/retorno pode faltar no live atual | DS/AO/LE criam; L pausa loja | Sem nome fixo; posição/função |
| **Recuperação do cliente** | Sim (ciclo SAC; Canal A/D) | Reply histórico ausente no export L5 | SAC fecha ciclo; humano aprova caso | Não copiar chat bruto |
| **Decisões repetidas do César** | Sim (hub → LearningProposal; não regra auto) | Distinguir decisão estratégica vs rotina | Só César oficializa regra/protocolo | Não personalizar dossiê por rumor |

---

## 15. Documentos do pacote V0.9

| Arquivo | Conteúdo |
|---|---|
| `Modelo_Eventos_Evidencias_Compartilhadas_V0_9.md` | Objetos, envelope, E0–E5, estados |
| `Governanca_Aprovacao_Versionamento_V0_9.md` | Papéis, aprovação, versionamento, automação |
| `Matriz_Permissoes_Privacidade_V0_9.md` | Matriz + Passaporte/dossiê + privacidade |
| `Retencao_Contestacao_Correcao_V0_9.md` | Classes de retenção, contestação, correção |
| `Fluxos_Ida_Volta_Protocolos_Aprendizado_V0_9.md` | Fluxos, conflitos, antifragilidade |
| `RedTeam_Integracao_DeliveryOS_TATA_V0_9.md` | 20 cenários |
| `Gate_Futura_Implementacao_Integracao_V0_9.md` | Pacote Fable, dependências, não-objetivos |

---

## 16. O que este contrato **não** faz

- Código · schema SQL · API · fila · stack · Fable · Sprint Visual · alteração `src/live/**` · mineração ampla · decisão de acesso LE ao dossiê · limites $ inventados · prazos jurídicos definitivos.

---

## 17. Versionamento deste documento

| Campo | Valor |
|---|---|
| version_id | V0.9 |
| owner | César (aprovação final) |
| status | em validação |
| substitui | — (primeiro contrato formal) |
| rollback | N/A documental |

---

*Contrato V0.9 · soberanias explícitas · cooperação sem fusão · sem implementação.*
