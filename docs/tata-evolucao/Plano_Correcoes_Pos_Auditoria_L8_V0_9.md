# Plano de Correções Pós-Auditoria L8 — V0.9

> **Não aplica** correções nesta missão.  
> Prioriza o que a próxima missão de correção deve fazer nos artefatos L8 (e alinhamentos mínimos com contrato).  
> Contrato de integração **não** sobe para V1 aqui.

---

## 1. Princípios da correção futura

1. Cortar antes de adicionar.  
2. Onda 1 = F1+F2 núcleo + P2/P4/P5/P10 + 10–12 casos.  
3. Papel first; app não bloqueia.  
4. Alinhar dossiê à decisão César (LE sem full).  
5. Sem inventar $.  
6. Sem 45/55/65.  
7. Não expandir integração técnica.

---

## 2. Dez correções prioritárias

| # | Correção | Artefatos | Esforço | Bloqueia piloto? |
|---|---|---|---|---|
| **C1** | Definir **pacote Onda 1** (módulos F1/F2 cortados 6–8 cada) | Blueprints F1 F2 · Arq | M | Sim se não cortar carga |
| **C2** | Selecionar **10–12 casos** piloto; marcar resto posterior/fundir | Biblioteca_Casos | M | Sim para qualidade |
| **C3** | Passaporte V0: **6–7 campos**; fundir próximos/evolução; adiar ideias; add contestação + quem valida | Passaporte_L8 | M | Sim UX/confiança |
| **C4** | Dossiê: ACL LE **fatia** (decisão César); cortar/questionar prontidão e intervenções no V0 | Passaporte_L8 · Matriz INT se eco | M | Sim privacidade |
| **C5** | Reescrever competências vagas: C-DS01 checklist; C-PL01 atos; banir “maturidade” como comp | Matriz_Comp · BP_F4 | M | Não total |
| **C6** | Hard caps piloto: min/sem; 1 B/pessoa/sem; N casos; métricas 3–4 | Plano_Piloto · Met_L8 | P | Sim |
| **C7** | Metadados protocolo piloto/Canal B: owner versão valid_from/until suspensão feedback rollback | Prot · Arq · Gov | M | Se publicar B |
| **C8** | Política $ no treino: tipos only + “sempre escalar se dúvida” até PEND-01 | BP_F2 · P6 · B-09 | P | Parcial |
| **C9** | Congelar Onda 2: F3/F4/B-15/16 fora da 1ª entrega; TR-DS trechos F3 limitados | Arq · Backlog (recomendação) | P | Anti-diluição |
| **C10** | Anti-punição: ≥2 casos positivos no piloto; mix +/− na captura; comunicação propósito | Bib · Piloto · B-03 | P | Clima |

---

## 3. Remover / fundir / reescrever / manter (recomendado)

### Remover da 1ª entrega (não apagar biblioteca total)
- Casos Onda posterior (M01, F01, X01, R02, A02…) como ativos  
- F3/F4 completas na Onda 1  
- Aba “Casos” se reaparecer  
- M5/M8 como KPI formal no piloto  
- Ideias reconhecidas no Passaporte V0  
- Ferramenta dossiê multi-user (B-19 full)

### Fundir
- O01+O03 · S01+S02 · E01+E03 (opcional) · L01+L02 · Passaporte próximos+evolução · C-T03 treino com C-DS04  

### Reescrever
- C-DS01 · C-PL01 · F4 maturidade · AO limites · Passaporte contestação · ACL dossiê LE · critérios “pronto” B-05/B-17 com números menores  

### Manter
- F1/F2 como Onda 1 · R-L6B-01…04 · P5 oficial · P10 · K/S/B/C · anti-ranking · papel piloto · soberanias INT · ban 45/55/65 · SAC formal  

---

## 4. Backlog — reordenação **recomendada** (não aplicar)

```text
P0 papel Onda 1:
  B-03 → B-04/B-05(corte) → B-06 B-10 B-11 → B-07 B-08 → B-12 → B-20 → B-21

Paralelo não bloqueante:
  B-02 visual · B-09 $ César

P1 depois de papel estável:
  B-13 B-14 protótipo

P2 Onda 2:
  B-15 B-16 B-17(corte) B-18 B-19 mínimo

P0 pós-piloto:
  B-22 B-23 · B-24 lista
```

---

## 5. Decisões César necessárias antes/durante correção

| ID | Decisão | Para destravar |
|---|---|---|
| D1 | Limites $ ou “sempre A” | C8 · P6 |
| D2 | Lista final Onda 1 módulos/casos (aprovar corte) | C1 C2 |
| D3 | N evidências B e N casos capturados no D0 | C6 |
| D4 | Quais P no Canal B provisório (se algum) | C7 |
| D5 | PEND-05 validadores | permissões |
| D6 | PEND-10 kit atual | P4 |
| D7 | Janelas C: candidato-only no piloto? | M8 |
| D8 | Confirmar ACL dossiê LE (já decidido — só formalizar docs) | C4 |

---

## 6. O que **não** fazer na correção

- Não implementar INT/Fable/código.  
- Não promover contrato V0.9→V1 sem decisão.  
- Não abrir L7.  
- Não adicionar formação 5.  
- Não reintroduzir 45/55/65.  
- Não inventar R$.  
- Não avaliar pessoas.  

---

## 7. Critério de pronto da **próxima** missão de correção

- [ ] Onda 1 documentada com lista fechada  
- [ ] ≤12 casos piloto  
- [ ] Passaporte V0 campos finais + contestação  
- [ ] Dossiê ACL alinhada à decisão César  
- [ ] Piloto com caps de tempo/validação  
- [ ] Métricas piloto ≤4  
- [ ] Backlog recomendado aceito ou rejeitado por César  
- [ ] Nenhuma implementação técnica  

---

## 8. Veredito de caminho

| Caminho | Adequado? |
|---|---|
| Correção documental enxuta | **Sim — próximo passo** |
| Reestruturar L8 do zero | **Não** necessário |
| Sprint Visual | Paralelo OK; não bloqueia papel |
| Fable INT | Só após correção + auditoria aceite + gate |

---

*Plano de correções V0.9 · priorizado · **não aplicado** nesta missão.*
