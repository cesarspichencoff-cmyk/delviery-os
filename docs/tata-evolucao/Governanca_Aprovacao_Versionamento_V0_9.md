# Governança, Aprovação e Versionamento — V0.9

> Quem pode o quê · como versionar · limites de automação.  
> Sem nomes reais de pessoas.

---

## 1. Papéis conceituais

| Papel | Função no contrato |
|---|---|
| **Funcionário** | Consome formação; gera prática; contesta evidência sobre si |
| **Validador operacional** | Revisa candidatos de evidência; valida prova B pontual |
| **Liderança em exercício (LE)** | Valida no turno; propõe casos; **não** decide cargo |
| **César** | Autoridade final de protocolo, $, disciplina, promoção, escopo |
| **Owner de conteúdo** | Escreve/versão conteúdo; não publica regra oficial sozinho |
| **IA** | Organiza, resume, sugere, detecta inconsistência |
| **DeliveryOS** | Fatos, runtime, Calmo/Ambiente/Foco, dedupe |
| **TATÁ Evolução** | Formação, Passaporte, protocolos de aprendizado |
| **Serviço futuro de integração** | Transporte, envelope, auditoria, idempotência |

---

## 2. Matriz de ações de governança (ciclo de vida)

| Ação | Funcionário | Validador | LE | César | Owner | IA | DOS | Evolução | Integração |
|---|---|---|---|---|---|---|---|---|---|
| Criar candidato (processo) | C | C | C | C | — | C | **A/C** | — | A transporte |
| Revisar candidato | — | **D** | **D** | **D** | — | C | — | — | — |
| Anonimizar | — | D | D | D | — | **A/B** campos lista | — | — | A/B |
| Aprovar evidência/caso | — | D (escopo) | D (escopo) | **D** | — | **E** final | — | registra | — |
| Rejeitar | — | D | D | D | — | E final | — | — | — |
| Contestar | **D** | D | D | D | — | C | — | — | — |
| Suspender | — | — | D (limite) | **D** | D conteúdo | E | — | D | — |
| Substituir versão | — | — | — | **D** | D rascunho | C | — | D | — |
| Publicar protocolo (Canal B) | — | — | — | **D** | propõe | E | consulta | D | publica só se D ok |
| Arquivar | — | — | D | D | D | C | soberania fatos | D | A audit |

Legenda: A automática · B auto+revisão · C sugestão · D humano antes · E proibida (para aquele ator).

---

## 3. Autoridade final (César) — lista fechada

- protocolos oficiais · limites financeiros · exceções comerciais  
- critérios de autonomia · promoção · rebaixamento · advertência · desligamento  
- ampliação para outras áreas · regras que alterem a operação  

---

## 4. Limites de automação (classificação completa)

| Ação | Classe | Notas |
|---|---|---|
| Deduplicar evento no DOS | **A** | Soberania runtime |
| Anonimizar campo de lista fechada | **A** ou **B** | Lista versionada; fora da lista = D |
| Agrupar evidências | **C** | Não prova E4 sozinho |
| Sugerir caso | **C** | |
| Sugerir recorrência | **C** | Exige validação humana para E4 |
| Sugerir formação | **C** | |
| Publicar protocolo | **D** | Humano |
| Alterar regra operacional / motor | **E** sem missão; depois D+testes+recert | |
| Criar Foco no DeliveryOS a partir do Evolução | **E** | Contrato futuro específico se houver |
| Validar competência | **D** | Humano |
| Aprovar evidência prática | **D** | |
| Alterar Passaporte | **D** | Só campos permitidos pós-validação |
| Registrar foco de desenvolvimento | **D** | Humano |
| Recomendar promoção | **C** texto no dossiê; **E** decisão IA | |
| Aplicar punição | **E** | |
| Criar Calmo/Ambiente | **E** para Evolução | |
| Treinamento obrigatório automático por 1 fato | **E** | |
| Avaliação automática da pessoa | **E** | |

---

## 5. Versionamento

### 5.1 O que versiona

schema do envelope · protocolo · competência · formação · caso · conteúdo · evidência **corrigida** · matriz de autonomia · este contrato.

### 5.2 Campos obrigatórios de versão

| Campo | Obrigatório |
|---|---|
| `version_id` | Sim |
| `owner` | Sim |
| `motivo` | Sim |
| `fonte` | Sim |
| `aprovado_por` | Sim se ≥ aprovado/vigente |
| `aprovado_em` | Sim se aprovado |
| `vigencia` (valid_from/until) | Sim se publicado |
| `substitui` (supersedes_id) | Se houver |
| `impacto` | Sim (formação/processo/sistema) |
| `rollback_possivel` | Sim (conceitual) |
| `status` | Sim |

### 5.3 Regras

1. Protocolo **substituído** não aparece como **vigente**.  
2. Evidência corrigida gera novo registro + link ao anterior (auditável); não reescrever silêncio.  
3. Caso aprovado baseado em evidência depois corrigida → `ContentRevisionRequest` + possível suspensão.  
4. Competência validada com regra desatualizada → revalidação ou marcação `necessita_revisao`.  
5. Schema: consumidores devem rejeitar `schema_version` desconhecida (fail-safe).  
6. Matriz de autonomia: mudança exige aprovação César se altera limites de ação.

### 5.4 ProtocolVersion — publicação

| Status | Canal B? |
|---|---|
| rascunho / em_validacao | Não |
| provisorio_de_piloto | Só se César marcar `publishable_as_pilot=true` |
| aprovado (ainda não vigente) | Não |
| **vigente** | **Sim** |
| suspenso / necessita_revisao / substituido / arquivado | Não (substituído auditável offline) |

---

## 6. Conflitos entre sistemas (estados)

Quando houver conflito crítico:

`incompatibilidade_detectada` → `revisao_necessaria` → (`conteudo_suspenso` \| `protocolo_suspenso`) → `aguardando_decisao` → `resolvido` \| `arquivado`

**Não** resolver automaticamente conflitos críticos. Detalhe operacional: `Fluxos_Ida_Volta_Protocolos_Aprendizado_V0_9.md`.

---

## 7. Rastreabilidade mínima por ato de aprovação

- target_id · version_id · evidence_refs · evidence_level · reviewer_role · approved_by · at · purpose · privacy_class · retention_class · contestation_path · owner_system  

---

## 8. Pacote para futuro Fable (governança)

Implementação futura deve respeitar:

- invariantes de soberania (§ Contrato)  
- classes A–E  
- estados de ProtocolVersion  
- proibição de write em live/Calmo/Foco  
- IntegrationAuditRecord em toda publicação e handoff  

---

*Governança V0.9 · humano no loop · versionamento auditável.*
