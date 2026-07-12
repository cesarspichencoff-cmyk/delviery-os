# Biblioteca de Casos Priorizada — L8 (pós-correção)

> **Exatamente 10 casos** na primeira biblioteca (piloto / protótipo).  
> Demais IDs da versão pré-auditoria: **catalogados / adiados** (histórico no Git).  
> Sem diálogo real · sem PII · anti-punição: 4 positivos obrigatórios.

---

## 1. Primeira biblioteca (10)

### Seis críticos

| case_id | Tema | Formação | Função | Situação | Decisão / raciocínio | P | Notas fusão |
|---|---|---|---|---|---|---|---|
| **CASE-L8-O01** | Item faltante | F2 | DP/SAC | Omissão na loja ou reclamação cliente (inclui kit omitido) | Parar se na loja; investigar fato vs percepção; corrigir ou ciclo SAC; **sem** inventar $ | P2 | **Fundido** O01+O03 |
| **CASE-L8-T01** | Item trocado | F2 | Montagem/SAC | Esperado A, saiu B | Isolar processo; corrigir/reenviar via SAC; aprendizado privado | P3 | Mantido |
| **CASE-L8-K01** | Kit incompleto | F1/F2 | DJ/DP | Kit incompleto antes de grampear | Completar tipo de kit; dono confere | P4 | Mantido (K02/K03 reforço futuro) |
| **CASE-L8-S01** | Pedido sem responsável | F1 | DJ–DS | Sem dono **ou** transferência implícita | Atribuir/transferir **explícito**; ajuda não encerra dono | P5 | **Fundido** S01+S02 |
| **CASE-L8-A01** | Atraso no pico | F1 | DS/LE | Volume/atraso ~19h | 5 critérios; ESTADO+IMPACTO+AÇÃO; **sem** 45/55/65 | P8 | Mantido essencial |
| **CASE-L8-E01** | Escalonamento sem contexto | F1 | Todos | “Me ajuda?” vazio vs mensagem com contexto | Reescrever com estado, impacto, ação | P10 | **Fundido** E01+E03 (duas opções no mesmo caso) |

### Quatro positivos

| case_id | Tema | Formação | Função | Situação | Resposta esperada | P |
|---|---|---|---|---|---|---|
| **CASE-L8-B01** | Colaboração com responsabilidade | F1 | DJ–DS | Colega ajuda; dono permanece | Ajuda + confirma dono | P5 |
| **CASE-L8-B03** | Comunicação clara (pós-pico / canal) | F1/F2 | CX/SAC | Status pedido no canal | ESTADO+IMPACTO+AÇÃO (ex.: aguarda Quentes; bloqueia conferência; precisa previsão) | P10/P11 leve |
| **CASE-L8-R01** | Recuperação bem conduzida | F2 | SAC | Reclamação; propõe tipo; escala $ se preciso; fecha ciclo | 7 passos L5 conceituais; **sem** inventar R$ | P6 tipos |
| **CASE-L8-B02** | Qualidade sob pressão | F1 | DJ/DS | Pressão por velocidade | Mantém padrão kit/quente-frio; não atalha | P4 |

---

## 2. Schema (inalterado em espírito)

case_id · formação · função · situação · contexto · info disponível/ausente · decisões possíveis · risco · princípio · resposta esperada · erros de raciocínio · evidência · validação César se $  

**Não** memorização: cada caso tem ≥2 opções plausíveis e feedback de raciocínio (produção futura de protótipo).

---

## 3. Adiados / fundidos (não apagados do histórico)

| ID antigo | Status |
|---|---|
| O03 | fundido → O01 |
| S02 | fundido → S01 |
| E03 | fundido → E01 |
| L01 L02 | fundido → CASE-L8-L01 (Onda 2) |
| K02 K03 | adiado reforço |
| P01 C01–C03 A02 A03 X01 F01 M01 Q01 R02 PP01 PP02 E02 S03… | adiado Onda 2 / posterior |

---

## 4. Uso no piloto

| Semana típica | Caso sugerido (rotação) |
|---|---|
| S1 | S01 ou B01 |
| S2 | K01 ou O01 |
| S3 | E01 ou B03 |
| S4 | T01 / A01 / R01 / B02 (escolher 1 âncora + reforço positivo) |

Máx **1 caso principal / pessoa / semana** (cap piloto).

---

*Biblioteca L8 pós-correção · 10 casos · 4 positivos.*
