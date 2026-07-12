# Pacote Fable — Guia de Handoff Futuro V0.9

> Como ler o pacote quando (e se) o Fable for autorizado.  
> **Este documento não autoriza a chamada.**

---

## 1. Ordem de leitura (obrigatória)

1. `Pacote_Fable_Visao_Escopo_Invariantes_V0_9.md`  
2. `Pacote_Fable_Modelo_Dominio_V0_9.md`  
3. `Pacote_Fable_Maquinas_Estado_V0_9.md`  
4. `Pacote_Fable_Permissoes_Privacidade_V0_9.md`  
5. `Pacote_Fable_Fluxos_Criterios_Aceitacao_V0_9.md`  
6. `Pacote_Fable_PaperFirst_Offline_Integracao_V0_9.md`  
7. `Pacote_Fable_Catalogo_Testes_RedTeam_V0_9.md`  
8. `Pacote_Fable_Backlog_Fatiado_V0_9.md`  
9. `Gate_Congelamento_Fundacao_TATA_Evolucao_V0_9.md`  

### Detalhe sob demanda (não reler tudo)

| Tema | Onde |
|---|---|
| Conteúdo Onda 1 texto | Protótipo V0.2 micros/casos/sims |
| Caps piloto | Plano_Piloto_30_Dias_V0_2 |
| Validadores | Mapa_Validadores_Conflitos_V0_2 |
| INT profunda | Contrato_Integracao_*_V0_9 |
| Cultura/regras op | Modelo_Operacional_L6B · Autonomia V0.9 |
| Trilhas | Arquitetura_Formacoes_L8 |

---

## 2. O que o implementador deve entregar primeiro

P0 papel (se piloto) **ou** P1 digital mínimo com testes T-I01, T-I02, T-I04, T-I09, T-I12, CA-01…03.

### Definition of Done (fatia P1)

- [ ] Invariantes P0 em testes automatizados ou checklist QA  
- [ ] Paper parity documentada  
- [ ] Nenhum write em live/Foco  
- [ ] Sem ranking  
- [ ] Parámetros abertos **não** inventados (feature flags / config vazia)  

---

## 3. Perguntas que o Fable **não** deve responder sozinho

- Valores de compensação  
- Composição do kit  
- Prazo oficial de consistência C  
- Acesso LE além da fatia  
- Stack / cloud  
- “Vamos plugar no Foco porque é prático”

→ César + missão específica.

---

## 4. Anti-padrões de implementação

| Anti-padrão | Por quê |
|---|---|
| Dashboard multi-KPI primeiro | Viola promessa próximo passo |
| Score de cultura | I-05 I-25 |
| Notificação vira Foco DOS | I-09 |
| LMS com % curso = promoção | I-01 promoção |
| Form longo de evidência | I-24 |
| Dossiê estilo RH para LE | I-10 I-07 |

---

## 5. Contato de decisão

| Tipo | Quem |
|---|---|
| Cultura, $ , oficiais, dossiê, piloto real | César |
| Conteúdo Onda 1 | Owner + César |
| Runtime DOS | Missão DeliveryOS (não este pacote) |

---

## 6. Checklist pré-chamada Fable (César)

- [ ] Fundação congelada (gate)  
- [ ] Visual DeliveryOS / Sprint Visual se app  
- [ ] Parâmetros críticos decididos ou explicitamente “config later”  
- [ ] Autorização escrita da missão Fable  
- [ ] Branch/worktree isolado de live  

---

*Handoff futuro V0.9 · ler antes de codar · não codar agora.*
