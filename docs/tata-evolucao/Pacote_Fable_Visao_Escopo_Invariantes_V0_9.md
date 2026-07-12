# Pacote Fable — Visão, Escopo e Invariantes V0.9

> Contrato de produto para **futuro** handoff ao Fable.  
> **Não** é implementação · **não** chama Fable · **não** escolhe stack.  
> Detalhe canônico: Visão Mestra V1 · L8 corrigida · Protótipo V0.2 · Contrato INT V0.9.

---

## 1. Identidade canônica

**TATÁ Evolução** é um sistema vivo de **cultura, formação e inteligência operacional**.

Transforma experiência real da operação em:

- cultura aplicada;
- competência demonstrada;
- autonomia responsável;
- melhor tomada de decisão;
- melhoria contínua;
- menor dependência da presença constante do César.

### Não é

sistema disciplinar · plataforma de RH · LMS escolar · ranking · avaliação de personalidade · promoção automática · extensão do runtime DeliveryOS · dashboard genérico.

### Promessa central

> **“Qual é o seu próximo passo para evoluir?”**

Compreensão do próximo passo em **&lt; 10 segundos**.

### Frase-guia irmã (DeliveryOS — não misturar)

> “O que precisa da sua atenção **agora**?”

Fontes: `Visao_Mestra_TATA_Evolucao_V1.md`.

---

## 2. Problemas que resolve (primeira versão)

| Problema | Como |
|---|---|
| Dependência do hub César para decisões rotineiras | Regras + protocolos + autonomia progressiva |
| Comunicação “cadê?” sem decisão | ESTADO + IMPACTO + AÇÃO |
| Colaboração sem dono da sacola | P5 + competências |
| Recuperação sem ciclo / $ improvisado | F2 + regra $ provisória |
| Conteúdo ≠ competência | K/S/B/C + evidência |
| Formação como punição | Anti-punição + positivos + contestação |
| Sem memória de aprendizado | Governança de casos → conteúdo |

---

## 3. Escopo funcional da primeira versão

| # | Inclui |
|---|---|
| 1 | Hoje / próximo passo |
| 2 | Formação Onda 1 (F1 + F2 núcleo) |
| 3 | Casos e prática embutidos |
| 4 | Registro curto de evidência (30–45 s meta) |
| 5 | Validação (DS/AO/LE) |
| 6 | Contestação |
| 7 | Passaporte V0 (7 campos) |
| 8 | Fila mínima do líder/validador |
| 9 | Governança de conteúdo (owner, versão) |
| 10 | Operação **independente** do DeliveryOS |
| 11 | Funcionar em **papel** (paridade) |
| 12 | Preparação futura de integração **sem** dependência técnica |

### Explicitamente fora da V1

F3/F4 completas · ranking · gamificação · promoção automática · dossiê amplo · disciplina · alertas 45/55/65 · integração live · write em Calmo/Ambiente/Foco · biblioteca extensa · vídeos longos · multi-loja · outras áreas · IA decidindo competência/RH · stack/banco/API nesta missão.

Fontes: L8 Arquitetura · Gate Pacote Fable V0.2 · Auditoria.

---

## 4. Papéis conceituais (resumo)

| Papel | Finalidade | Proibido (essencial) |
|---|---|---|
| **Participante** | Evoluir; realizar atividades; contestar | Ver dossiê; rankear |
| **DS** | Validar DJ/DP no escopo | LE full; dossiê; $ sozinho |
| **AO** | Validar fluxo/escala; não usurpar LE | Redistribuir como LE |
| **LE** | Autonomia ampliada; conflitos; C amostra | Dossiê integral; disciplina no TE |
| **César** | Sensível; LE/PL; dossiê; oficiais; $ limites | — |
| **Owner de conteúdo** | Escrever/versionar conteúdo | Publicar oficial sem César |
| **IA** | Organizar/sugerir | Decidir competência/promoção/punição/$ |
| **TATÁ Evolução** | Sistema de verdade de formação | Escrever live DOS |
| **DeliveryOS** | Runtime operacional | Concluir competência; alterar Passaporte |
| **Integração futura** | Transporte auditável | Ampliar permissões; auto-regra |

Detalhe: `Pacote_Fable_Permissoes_Privacidade_V0_9.md` · `Mapa_Validadores_Conflitos_V0_2.md`.

---

## 5. Catálogo de invariantes (não negociáveis)

| ID | Invariante |
|---|---|
| **I-01** | Conclusão de curso **não** conclui competência sozinha. |
| **I-02** | Evidência **contestada** não aparece como consolidada. |
| **I-03** | Falha isolada **não** define uma pessoa. |
| **I-04** | IA **não** decide promoção, punição ou competência. |
| **I-05** | **Nenhum** ranking individual. |
| **I-06** | Passaporte **não** compara pessoas. |
| **I-07** | Dado disciplinar **não** entra automaticamente no TE. |
| **I-08** | Protocolo humano **não** altera motor DeliveryOS. |
| **I-09** | TE **não** escreve Calmo, Ambiente ou Foco. |
| **I-10** | LE **não** tem acesso integral ao dossiê. |
| **I-11** | César: autoridade final em decisões sensíveis. |
| **I-12** | Mesma pessoa **não** cria+valida+aprova evidência sensível sozinha. |
| **I-13** | Alteração sensível é **auditável**. |
| **I-14** | Versão substituída **não** aparece como vigente. |
| **I-15** | Todo próximo passo tem **ação** associada. |
| **I-16** | Todo conteúdo tem **owner** e **versão**. |
| **I-17** | Evidência separa **fato observado** de interpretação. |
| **I-18** | Contestação **suspende** uso consolidado. |
| **I-19** | **Nenhum** valor financeiro inventado. |
| **I-20** | Composição de kit **não confirmada** não é ensinada como verdade. |
| **I-21** | V1 funciona **sem** integração DeliveryOS. |
| **I-22** | Piloto pode funcionar **sem** aplicativo. |
| **I-23** | Evidência positiva **real**, não elogio artificial. |
| **I-24** | Carga não transforma formação em burocracia (metas 32/60). |
| **I-25** | Produto **não** é sistema disciplinar disfarçado. |

Verificação: testes em `Pacote_Fable_Catalogo_Testes_RedTeam_V0_9.md`.

---

## 6. Modelo K / S / B / C

| Prova | Significa | Evidência mínima | Valida (base) | Contestável |
|---|---|---|---|---|
| **K** | Sabe explicar | Resposta oral/curta | DS/AO/formador | Sim se erro de registro |
| **S** | Decide em cenário | Caso/sim com escolha | DS/AO | Sim |
| **B** | Faz no turno | Fato observado 1 linha | DS/AO; LE se ampliada | Sim |
| **C** | Mantém no tempo | Amostra de turnos | LE; César amostra | Sim |

- Conteúdo ≠ competência (**I-01**).  
- Prazo de consistência (C): **parâmetro pendente** César (candidatos L6B).  
- Relação com autonomia: marcos na matriz — **não** promoção automática.  
- Risco crítico: por competência (L6B / Arq L8).

Fontes: Visão Mestra §8 · Matriz Competências · Arquitetura L8.

---

## 7. Caps e metas (piloto / V1 comportamento)

| Item | Máximo | Meta desenho |
|---|---|---|
| Min/func/sem | 40 | ≤32 |
| Min validação N=12 | 75 | ≤60 |
| Micro/sem | 2 | 1–2 |
| Caso ou sim/sem | 1 | 1 |
| Val/pessoa/sem | 1 | ≤1 |
| Registro EV | &lt;1 min | 30–45 s |
| Contestação abrir | — | ≤1 min |
| Próximo passo | — | &lt;10 s |

Fonte: Plano Piloto V0.2.

---

## 8. Regra financeira provisória

Toda compensação monetária, voucher, desconto, crédito ou estorno **comercial** exige **autorização da liderança**.  
SAC conduz ciclo; CX executa $ autorizado.  
**LIMITES FINANCEIROS PENDENTES DO CÉSAR** — parâmetro aberto (**I-19**).

---

## 9. Congelamento (definição)

| Congelar significa | Não significa |
|---|---|
| Visão e arquitetura aprovadas para handoff | Produto pronto |
| Mudança estrutural exige nova decisão | Fable chamado |
| Aguarda visual DeliveryOS + César | Piloto autorizado / visual aprovado / INT implementada |

Gate: `Gate_Congelamento_Fundacao_TATA_Evolucao_V0_9.md`.

---

*Pacote Fable · visão e invariantes V0.9.*
