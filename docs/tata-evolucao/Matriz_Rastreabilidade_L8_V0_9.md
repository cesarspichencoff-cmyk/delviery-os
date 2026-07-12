# Matriz de Rastreabilidade L8 — V0.9

> Uma linha por elemento relevante. **Não** inventar fonte.  
> Onde a origem operacional não comprova: **SEM EVIDÊNCIA LOCALIZADA**.  
> `status` usa classificações permitidas da missão de auditoria.

**Legenda status:** sustentado · sustentado_com_ressalva · parcialmente_sustentado · hipotese · decisao_cesar · sem_evidencia_localizada · duplicado · contraditorio · excessivo · fora_fase1 · remover · fundir · reescrever · manter  

**privacy:** publica_interna · restrita · sensivel · proibida  

---

## 1. Formações e módulos

| trace_id | artifact_id | tipo | doc_origem | finalidade | publico | fonte_op | evidencia | E | decisao | protocolo | comp | perm | privacy | owner | status | dep | risco | dup | acao |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T-F1 | F1 | formacao | BP_Cultura_L8 · Arq_L8 | cultura comum | todos | L1 L6B VM | princípios+WA | E3 | R-L6B-04 etc | P5 P10 P12 | C-T* | todos V | restrita | César/owner | sustentado_com_ressalva | L6B | excesso módulos | F3 | manter_cortar_onda1 |
| T-F1-M02 | F1-M02 | modulo | BP_F1 | 5 valores | todos | VM | doc | E1 | — | — | C-T01 | — | restrita | owner | sustentado_com_ressalva | F1 | RH genérico | — | manter_com_caso |
| T-F1-M05 | F1-M05 | modulo | BP_F1 | ajuda+dono | DJ-DS | L6B R02 | OP-11 | E2 | R-L6B-02 | P5 | C-T02 C-DJ03 | — | restrita | owner | sustentado | — | — | S* | manter |
| T-F1-M09 | F1-M09 | modulo | BP_F1 | estado pedido | todos | L1 OP | roteiro | E2 | César com | P10 | C-T03 | — | restrita | owner | sustentado | — | — | E* | manter |
| T-F1-M11 | F1-M11 | modulo | BP_F1 | ESTADO+IMPACTO+AÇÃO | todos | L1 César | decisão L8 | E2 | César L8 | P10 | C-T03 | — | restrita | owner | sustentado | — | template vazio | E01 | manter |
| T-F1-M13 | F1-M13 | modulo | BP_F1 | pico vs pós-pico | todos | L2C L1 | séries | E3 | César L8 | P8 P11 | — | — | restrita | owner | sustentado | L2C | carga | A03 | manter_leve |
| T-F1-M14 | F1-M14 | modulo | BP_F1 | janela 23h | todos | L2C | baseline | E3 | César | — | — | — | publica_interna | owner | sustentado | — | — | — | manter |
| T-F1-rest | F1-M01,03,04,06-08,10,12 | modulo | BP_F1 | núcleo cultural | todos | VM L6B | mista | E1-E2 | — | misto | C-T* | — | restrita | owner | sustentado_com_ressalva | — | 14 módulos | F3 | cortar_para_6a8 |
| T-F2 | F2 | formacao | BP_Atend_L8 | ciclo cliente | SAC CX LE+ | L5 L1 | avaliações+WA | E3 | SAC formal | P2 P6 P7 | C-SAC* | SAC V | restrita | owner | sustentado_com_ressalva | $ | volume 15 | CX | manter_nucleo_onda1 |
| T-F2-P6 | F2-M10 | modulo | BP_F2 | tipos recuperação | SAC CX | L5 lacuna | estrutura | E1 | $ pendente | P6 | C-SAC03 | A $ | restrita | César | parcialmente_sustentado | PEND-01 | inventar R$ | C* | manter_sem_valores |
| T-F3 | F3 | formacao | BP_LE_L8 | liderar turno | LE DS | OP-10 L2C | pico | E2 | — | P1 P8 P12 | C-LE* | LE | restrita | owner | sustentado_com_ressalva | F1 | dilui onda1 | F1 DS | fora_fase1_onda1 · onda2 |
| T-F4 | F4 | formacao | BP_PL_L8 | preparar LE | PL | — | indicação | E0-E1 | seletiva | P10 | C-PL01 | PL | restrita | César | parcialmente_sustentado | F1 | promoção implícita | F3 | onda2 · reescrever |
| T-F4-mat | F4-M01 | modulo | BP_F4 | maturidade | PL | — | SEM EVIDÊNCIA LOCALIZADA como comp | E0 | — | — | — | — | restrita | owner | reescrever | — | personalidade | — | reescrever_comportamento |

---

## 2. Trilhas

| trace_id | artifact_id | tipo | doc_origem | finalidade | publico | fonte_op | evidencia | E | decisao | protocolo | comp | perm | privacy | owner | status | dep | risco | dup | acao |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T-TR-DJ | TR-DJ | trilha | Arq_L8 | base montagem | DJ | OP-04 | kits L5 | E2 | — | P4 P5 | C-DJ* | LE Val | restrita | LE | sustentado | F1 | — | DP | manter |
| T-TR-DP | TR-DP | trilha | Arq_L8 | consistência | DP | OP L1 | omissão | E2 | — | P2 P3 | C-DP* | LE | restrita | LE | sustentado_com_ressalva | DJ | — | DJ | manter |
| T-TR-DS | TR-DS | trilha | Arq_L8 | fluxo multi | DS | OP-10 | boqueta | E2 | — | P1 P8 P10 | C-DS* | LE | restrita | LE | sustentado_com_ressalva | F3 trechos | quase-LE | LE | limitar_f3 |
| T-TR-CX | TR-CX | trilha | Arq_L8 | canal+$ | CX | OP-04 | multi-sacola | E2 | SAC×CX | P6 P9 | C-CX* | LE | restrita | LE | sustentado_com_ressalva | $ | usurpar SAC | SAC | manter |
| T-TR-SAC | TR-SAC | trilha | Arq_L8 | ciclo cliente | SAC | L5 César | formal SAC | E2 | SAC formal | P2 P6 P11 | C-SAC* | LE/Ç | restrita | LE | sustentado_com_ressalva | $ | — | CX | manter |
| T-TR-AO | TR-AO | trilha | Arq_L8 | apoio | AO | L6B | parcial | E1 | — | P1 | C-AO* | LE | restrita | LE | parcialmente_sustentado | — | LE light | DS LE | reescrever_limites |
| T-TR-LE | TR-LE | trilha | Arq_L8 | LE | LE | OP L6B | — | E2 | — | P1 P8 P12 | C-LE* | Ç | restrita | César | sustentado_com_ressalva | F3 | carga val | F3 | onda2 |
| T-TR-PL | TR-PL | trilha | Arq_L8 | preparação | PL | — | indicação | E0 | seletiva | — | C-PL01 | Ç | restrita | César | hipotese | F4 | promoção auto | F4 | onda2_seletiva |

---

## 3. Competências (todas as IDs L6B/L8)

| trace_id | artifact_id | tipo | doc_origem | finalidade | publico | fonte_op | evidencia | E | decisao | protocolo | comp | perm | privacy | owner | status | dep | risco | dup | acao |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T-CT01 | C-T01 | competencia | Mat_Comp_L6B | correção respeitosa | todos | cultura | doc | E1 | — | P12 | C-T01 | LE Val | sensivel | LE | sustentado_com_ressalva | valor | subjetivo | F3 | definir_ato |
| T-CT02 | C-T02 | competencia | L6B | ajuda com dono | DJ+ | R-L6B-02 | OP | E2 | R02 | P5 | C-T02 | LE | sensivel | LE | sustentado | — | — | S* | manter |
| T-CT03 | C-T03 | competencia | L6B | escala contexto | todos | L1 | WA padrões | E2 | com L8 | P10 | C-T03 | LE | sensivel | LE | sustentado | — | amostra chat | E* | manter |
| T-CT04 | C-T04 | competencia | L6B | aprendizado | LE+ | P12 | — | E1 | — | P12 | C-T04 | LE | sensivel | LE | parcialmente_sustentado | P12 | fofoca | L* | manter_leve |
| T-CDJ01 | C-DJ01 | competencia | L6B | montagem lacre | DJ | OP-04 | OP | E1 | R05 prov | P4 | C-DJ01 | LE | sensivel | LE | sustentado_com_ressalva | provisório | — | K* | manter |
| T-CDJ02 | C-DJ02 | competencia | L6B | kit | DJ | OP-04 L5 | omissão | E3 | — | P4 | C-DJ02 | LE | sensivel | LE | sustentado | PEND-10 | kit desatualizado | K01 | manter |
| T-CDJ03 | C-DJ03 | competencia | L6B | dono sacola | DJ | César | R02 | E2 | R02 | P5 | C-DJ03 | LE | sensivel | LE | sustentado | — | — | S* | manter |
| T-CDJ04 | C-DJ04 | competencia | L6B | expedição app | DJ | OP-04 | doc | E1 | R08 prov | — | C-DJ04 | LE | sensivel | LE | sustentado_com_ressalva | provisório | — | — | manter |
| T-CDP01 | C-DP01 | competencia | L6B | multi-sacola | DP | OP-08 | OP | E1 | R07 | P4 | C-DP01 | LE | sensivel | LE | sustentado_com_ressalva | — | — | K03 | manter |
| T-CDP02 | C-DP02 | competencia | L6B | pedido parado | DP | OP-11 | doc | E1 | — | P5 P8 | C-DP02 | LE | sensivel | LE | sustentado | — | — | S01 | manter |
| T-CDP03 | C-DP03 | competencia | L6B | omissão/troca loja | DP | L5 | — | E2 | — | P2 P3 | C-DP03 | LE | sensivel | LE | sustentado | — | — | O T | manter |
| T-CDS01 | C-DS01 | competencia | L6B | ler o todo | DS | OP-10 | SEM EVIDÊNCIA LOCALIZADA de rubrica | E1 | — | P8 | C-DS01 | LE | sensivel | LE | reescrever | — | vago | LE | reescrever_checklist |
| T-CDS02 | C-DS02 | competencia | L6B | pausa item | DS | P1 César | proposta | E1 | César pausa | P1 | C-DS02 | LE | sensivel | LE | sustentado_com_ressalva | piloto | — | P01 | manter |
| T-CDS03 | C-DS03 | competencia | L6B | gargalo | DS | L2C OP | atraso 19h | E3 | R03 | P8 | C-DS03 | LE | sensivel | LE | sustentado | — | — | A01 | manter |
| T-CDS04 | C-DS04 | competencia | L6B | escala | DS | L1 | — | E2 | — | P10 | C-DS04 | LE | sensivel | LE | sustentado | — | — | C-T03 | fundir_treino |
| T-CCX01-05 | C-CX01…05 | competencia | L6B | canal caixa | CX | OP L6B | — | E1-E2 | SAC×CX | P6 P9 | C-CX* | LE | sensivel | LE | sustentado_com_ressalva | $ CX04 | — | SAC | manter |
| T-CSAC01-05 | C-SAC01…05 | competencia | L6B | SAC | SAC | L5 | voz cliente | E2-E3 | SAC formal | P2 P6 | C-SAC* | LE/Ç | sensivel | LE | sustentado_com_ressalva | $ | — | — | manter |
| T-CAO01-03 | C-AO01…03 | competencia | L6B | AO | AO | L6B | fina | E1 | — | P1 | C-AO* | LE | sensivel | LE | parcialmente_sustentado | — | fiscalização AO02 | DS | reescrever |
| T-CLE01-04 | C-LE01…04 | competencia | L6B | LE | LE | OP | — | E1-E2 | $ LE02 | P1 P8 P12 | C-LE* | Ç | sensivel | César | sustentado_com_ressalva | $ | — | F3 | onda2 |
| T-CPL01 | C-PL01 | competencia | L6B | observar ensinar | PL | — | fraca | E0 | seletiva | P12 | C-PL01 | Ç | sensivel | César | reescrever | F4 | personalidade | F4 | reescrever |
| T-JANELA | JANELA-C | politica | L6B §3 | consistência | todos | — | SEM EVIDÊNCIA LOCALIZADA calibração | E0 | PEND-04 | — | * | Ç | restrita | César | decisao_cesar | — | ranking C | — | calibrar_ou_piloto_only |

---

## 4. Protocolos P1–P12

| trace_id | artifact_id | tipo | doc_origem | finalidade | publico | fonte_op | evidencia | E | decisao | protocolo | comp | perm | privacy | owner | status | dep | risco | dup | acao |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T-P1 | P1 | protocolo | Prot_L6B · L8 | pausa/86 | DS AO LE | César L8 | proposta+15min | E1 | César | P1 | C-DS02 | LE C | publica_interna | César | pronto_com_parametro | Canal B checklist | stale | OP-10 65 | piloto_card |
| T-P2 | P2 | protocolo | L6B | faltante | DJ SAC | L5 | omissão | E3 | $ | P2 | C-DP03 | — | restrita | owner | pronto_piloto | — | — | O* | onda1 |
| T-P3 | P3 | protocolo | L6B | trocado | montagem SAC | L5 n baixo | — | E2 | $ | P3 | C-DP03 | — | restrita | owner | pronto_piloto | — | — | T01 | onda1_leve |
| T-P4 | P4 | protocolo | L6B OP04 | kit | DJ DP | OP L5 | kits | E2 | R05-06 | P4 | C-DJ02 | — | restrita | owner | pronto_com_validacao | PEND-10 | kit velho | K* | onda1 |
| T-P5 | P5 | protocolo | L6B | sacola | DJ-DS | R02 | oficial | E2 | R02 | P5 | C-DJ03 | — | publica_interna | César | pronto_piloto | — | — | S* | onda1_vigente |
| T-P6 | P6 | protocolo | L6B | compensação | SAC CX | L5 gap | tipos | E1 | $ PEND | P6 | C-SAC03 | A | restrita | César | pronto_parametro_pendente | PEND-01 | inventar $ | C* | tipos_only |
| T-P7 | P7 | protocolo | L6B | cancel | SAC CX | L2C rates | parcial | E1 | — | P7 | C-SAC | — | restrita | owner | fora_primeira_onda | — | — | X01 | posterior |
| T-P8 | P8 | protocolo | L6B | atraso | DS LE | L2C | 19h | E3 | R03 | P8 | C-DS03 | — | restrita | owner | pronto_piloto | proibir 45/55/65 | — | A* | onda1_leve |
| T-P9 | P9 | protocolo | L6B | falha sist | CX LE | OP | SEM EVIDÊNCIA LOCALIZADA freq | E0-E1 | — | P9 | C-CX01 | — | restrita | owner | necessita_validacao_op | — | — | F01 | posterior |
| T-P10 | P10 | protocolo | L6B | escala | todos | L1 | hub | E2 | com | P10 | C-T03 | — | publica_interna | owner | pronto_piloto | — | — | E* | onda1 |
| T-P11 | P11 | protocolo | L6B | pós-pico | SAC LE | L1 | chat 21-22 | E2 | César | P11 | C-SAC04 | — | restrita | owner | sustentado_com_ressalva | — | carga LE | PP* | onda2 |
| T-P12 | P12 | protocolo | L6B | aprendizado | LE | VM | fluxo casos | E1 | — | P12 | C-T04 | — | restrita | owner | pronto_leve | — | disciplina | L* | onda1_LE |
| T-R45 | R-L6B-12 | regra | L6B | 45/55/65 | — | OP-10 | não calibrado | E0 | não oficial | — | — | P usar | — | César | decisao_cesar | — | reentrada | P1 old | banir_treino |

---

## 5. Casos (36) — classificação onda

| trace_id | artifact_id | tipo | doc_origem | finalidade | publico | fonte_op | evidencia | E | decisao | protocolo | comp | privacy | status | dup | acao |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T-B01 | CASE-L8-B01 | caso | Bib_L8 | colaboração+dono | DJ | R02 | L6B | E2 | R02 | P5 | C-T02 | restrita | sustentado | S* | onda1 |
| T-B02 | CASE-L8-B02 | caso | Bib | qualidade vs velocidade | DS LE | princípios | L6B | E1 | — | — | C-T* | restrita | sustentado | — | onda1 |
| T-B03 | CASE-L8-B03 | caso | Bib | comunicação clara | CX SAC | César com | L1 | E2 | com | P10 | C-T03 | restrita | sustentado | E* | onda1 |
| T-K01 | CASE-L8-K01 | caso | Bib OP | kit incompleto | DJ | OP04 L5 | E3 | — | P4 | C-DJ02 | restrita | sustentado | O/K | onda1 |
| T-K02 | CASE-L8-K02 | caso | Bib | quente/frio | DJ | OP04 | E1 | R05 | P4 | C-DJ01 | restrita | sustentado_com_ressalva | óbvio? | onda1 |
| T-K03 | CASE-L8-K03 | caso | Bib | multi-sacola | CX | OP04 | E1 | R07 | P4 | C-CX05 | restrita | sustentado_com_ressalva | — | onda1 |
| T-O01 | CASE-L8-O01 | caso | Bib L5 | omissão loja | DP | L5 | E3 | — | P2 | C-DP03 | restrita | sustentado | O03 | onda1 |
| T-O02 | CASE-L8-O02 | caso | Bib L5 | omissão cliente | SAC | L5 | E3 | $ | P2 P6 | C-SAC* | restrita | sustentado_com_ressalva | — | onda1 |
| T-O03 | CASE-L8-O03 | caso | Bib L5 | kit+avaliação | SAC | L5 | E2 | — | P2 | C-SAC | restrita | fundir | O01 | fundir_O01 |
| T-T01 | CASE-L8-T01 | caso | Bib L5 | troca | montagem | L5 n baixo | E2 | $ | P3 | C-DP03 | restrita | sustentado_com_ressalva | — | onda1_ou_2 |
| T-S01 | CASE-L8-S01 | caso | Bib OP11 | sem dono | todos | OP | E2 | R02 | P5 | C-DJ03 | restrita | sustentado | S02 | onda1 |
| T-S02 | CASE-L8-S02 | caso | Bib | transferência | DJ | R02 | E1 | R02 | P5 | C-DJ03 | restrita | fundir | S01 | fundir_S01 |
| T-S03 | CASE-L8-S03 | caso | Bib | pré-turno + | LE | R02 | E1 | R02 | P5 | C-LE | restrita | sustentado | — | onda1 |
| T-E01 | CASE-L8-E01 | caso | Bib L1 | me ajuda vazio | todos | L1 | E2 | com | P10 | C-T03 | restrita | sustentado | E03 | onda1 |
| T-E02 | CASE-L8-E02 | caso | Bib VM | silêncio LE | DP DS | VM §6 | E1 | — | P10 | C-T03 | restrita | hipotese | — | onda2 |
| T-E03 | CASE-L8-E03 | caso | Bib | escala boa + | DS | L1 | E1 | com | P10 | C-T03 | restrita | fundir | E01 | fundir_ou_manter |
| T-P01 | CASE-L8-P01 | caso | Bib | pausa registro | DS LE | César | E1 | pausa | P1 | C-DS02 | restrita | sustentado_com_ressalva | — | onda2 |
| T-A01 | CASE-L8-A01 | caso | Bib L2C | pico 19h | DS LE | L2C | E3 | R03 | P8 | C-DS03 | restrita | sustentado | — | onda2 |
| T-A02 | CASE-L8-A02 | caso | Bib | atraso cliente | SAC | L5 pouco texto atraso | E1 | — | P8 | C-SAC | restrita | parcialmente_sustentado | — | posterior |
| T-A03 | CASE-L8-A03 | caso | Bib | dois tempos | LE SAC | L2C L1 | E3 | César | P8 P11 | — | restrita | sustentado | A01 | onda2 |
| T-X01 | CASE-L8-X01 | caso | Bib | cancel | SAC | L2C | E1 | — | P7 | — | restrita | parcialmente_sustentado | — | posterior |
| T-F01 | CASE-L8-F01 | caso | Bib | falha print | CX | OP | E0-E1 | — | P9 | C-CX | restrita | sem_evidencia_localizada_freq | — | posterior |
| T-C01 | CASE-L8-C01 | caso | Bib | tipo recuperação | SAC | L5 gap | E1 | $ | P6 | C-SAC03 | restrita | parcialmente_sustentado | — | onda2 |
| T-C02 | CASE-L8-C02 | caso | Bib | SAC×CX $ | SAC CX | César | E1 | R01 | P6 | C-CX04 | restrita | sustentado_com_ressalva | — | onda1_leve |
| T-C03 | CASE-L8-C03 | caso | Bib | exceção comercial | L | — | E0 | César | P6 | C-LE | restrita | decisao_cesar | — | onda2 |
| T-R01 | CASE-L8-R01 | caso | Bib L5 | boa recuperação + | SAC | L5 proposto | E1 | — | P6 | C-SAC04 | restrita | hipotese | — | onda2 |
| T-R02 | CASE-L8-R02 | caso | Bib L5 | sem reply | SAC LE | L5 export | E2 gap | — | P12 | — | restrita | parcialmente_sustentado | — | posterior |
| T-L01 | CASE-L8-L01 | caso | Bib | correção sem humilhar | LE | cultura | E1 | — | P12 | C-T01 | restrita | sustentado_com_ressalva | L02 | onda2 |
| T-L02 | CASE-L8-L02 | caso | Bib | discordância + | PL LE | VM | E1 | — | P12 | C-T01 | restrita | fundir | L01 | onda2_fundir |
| T-PP01 | CASE-L8-PP01 | caso | Bib | fila 21h30 | SAC LE | L1 | E2 | — | P11 | C-SAC04 | restrita | sustentado | — | onda2 |
| T-PP02 | CASE-L8-PP02 | caso | Bib | aprendizado fechamento | LE | VM | E1 | — | P12 | C-T04 | restrita | fundir | L* P12 | fundir_P12 |
| T-M01 | CASE-L8-M01 | caso | Bib | motoboy | LE SAC | SEM EVIDÊNCIA LOCALIZADA densa | E0 | — | P10 | — | restrita | hipotese | — | posterior |
| T-Q01 | CASE-L8-Q01 | caso | Bib | segurança alimentar | todos | VM exceção | E1 | IE | — | C-SAC05 | restrita | sustentado_com_ressalva | — | onda2_leve |

**Contagem casos:** 36 rastreados · Onda1 prioritários ~14 (com fusões → ~10–12) · Onda2 ~12 · posterior ~8–10.

---

## 6. Simulações (âncoras)

| trace_id | artifact_id | tipo | doc_origem | status | acao |
|---|---|---|---|---|---|
| T-SIM-F1 | sim F1 cadê?/sacola/erro | simulacao | BP_F1 | sustentado | onda1 |
| T-SIM-F2 | sim F2 omissão/ciclo/$ | simulacao | BP_F2 | sustentado_com_ressalva | onda1 |
| T-SIM-F3 | sim F3 pico/pausa | simulacao | BP_F3 | fora_fase1_onda1 | onda2 |
| T-SIM-F4 | sim F4 limite/feedback | simulacao | BP_F4 | parcialmente_sustentado | onda2 |

---

## 7. Métricas M1–M10

| trace_id | artifact_id | tipo | doc_origem | finalidade | fonte_op | evidencia | E | status | risco | acao |
|---|---|---|---|---|---|---|---|---|---|---|
| T-M1 | M1 | metrica | Met_L8 | erros prioritários | casos L5 | parcial | E2 | sustentado_com_ressalva | nominal vigilância | agregado_only |
| T-M2 | M2 | metrica | Met_L8 | dependência LE | amostra | qualitativa | E1 | hipotese | silenciar dúvida | amostra |
| T-M3 | M3 | metrica | Met_L8 | qualidade escala | amostra msg | L1 | E2 | sustentado | template vazio | piloto |
| T-M4 | M4 | metrica | Met_L8 | provas B | Passaporte | contável | E1 | sustentado | ranking B | sem_placar |
| T-M5 | M5 | metrica | Met_L8 | tempo autonomia | datas | SEM baseline | E0 | parcialmente_sustentado | pressão | adiar_kpi |
| T-M6 | M6 | metrica | Met_L8 | fechamento ciclo | SAC reg | L5 gap | E1 | parcialmente_sustentado | fechar papel | pós_registro |
| T-M7 | M7 | metrica | Met_L8 | uso protocolo | obs | teatro | E1 | sustentado_com_ressalva | teatro | amostra |
| T-M8 | M8 | metrica | Met_L8 | consistência | janela | candidata | E0 | sustentado_com_ressalva | ranking C | adiar |
| T-M9 | M9 | metrica | Met_L8 | comunicação | rubrica | parcial | E1 | sustentado_com_ressalva | estilo | amostra |
| T-M10 | M10 | metrica | Met_L8 | casos→aprendizado | gov | contável | E1 | sustentado | volume vazio | piloto |

---

## 8. Jornadas

| trace_id | artifact_id | tipo | doc_origem | status | acao |
|---|---|---|---|---|---|
| T-JF1-10 | JF etapas 1–10 | jornada | Jorn_L8 | sustentado_com_ressalva | manter_simplificar_piloto |
| T-JL1-10 | JL etapas 1–10 | jornada | Jorn_L8 | sustentado | 1_decisao |
| T-JFvar | variantes novo/atual/PL/LE | jornada | Jorn_L8 | sustentado | manter |

---

## 9. Passaporte e dossiê

| trace_id | artifact_id | tipo | doc_origem | status | privacy | acao |
|---|---|---|---|---|---|---|
| T-PASS-trilha | trilha_atual | campo_passaporte | Pass_L8 | sustentado | sensivel | manter |
| T-PASS-cont | conteudos_concluidos | campo_passaporte | Pass_L8 | sustentado_com_ressalva | sensivel | secundario |
| T-PASS-comp | competencias_demonstradas | campo_passaporte | Pass_L8 | sustentado | sensivel | manter |
| T-PASS-fort | pontos_fortes | campo_passaporte | Pass_L8 | sustentado_com_ressalva | sensivel | so_humano |
| T-PASS-foco | foco_desenvolvimento | campo_passaporte | Pass_L8 | sustentado | sensivel | manter |
| T-PASS-prox | proximos_passos | campo_passaporte | Pass_L8 | fundir | sensivel | fundir_foco |
| T-PASS-req | requisitos_avancar | campo_passaporte | Pass_L8 | sustentado_com_ressalva | sensivel | anti_promocao |
| T-PASS-ideias | ideias_reconhecidas | campo_passaporte | Pass_L8 | excessivo | sensivel | adiar_v0 |
| T-PASS-conq | conquistas | campo_passaporte | Pass_L8 | sustentado_com_ressalva | sensivel | minimo_ou_adiar |
| T-PASS-evo | evolucao_recente | campo_passaporte | Pass_L8 | fundir | sensivel | fundir |
| T-PASS-evid | evidencias_aprovadas | campo_passaporte | Pass_L8 | sustentado | sensivel | max_3 |
| T-PASS-contesta | contestacao_UX | gap | — | sem_evidencia_localizada | — | reescrever_add |
| T-DOS-evid | evidencias dossiê | campo_dossie | Pass_L8 | sustentado | sensivel | César+fatia_LE |
| T-DOS-rec | recorrencias tema | campo_dossie | Pass_L8 | sustentado_com_ressalva | sensivel | so_tema |
| T-DOS-aut | autonomia | campo_dossie | Pass_L8 | sustentado | sensivel | manter |
| T-DOS-treino | necessidades_treino | campo_dossie | Pass_L8 | sustentado | sensivel | manter |
| T-DOS-crit | situacoes_criticas | campo_dossie | Pass_L8 | sustentado_com_ressalva | sensivel | fato_only |
| T-DOS-pront | prontidao_promocao | campo_dossie | Pass_L8 | excessivo_risco | sensivel | so_César · questionar_v0 |
| T-DOS-interv | intervencoes | campo_dossie | Pass_L8 | excessivo_risco | sensivel | so_César · minimo |
| T-DOS-status | status_desenvolvimento | campo_dossie | Pass_L8 | sustentado | sensivel | manter |
| T-DOS-ACL | acesso LE completo | politica | César missão audit | decisao_cesar | proibida LE full | aplicar_na_correcao |

---

## 10. Academia V1

| trace_id | artifact_id | tipo | doc_origem | status | acao |
|---|---|---|---|---|---|
| T-AC-hoje | Hoje | area_academia | Est_Acad_L8 | sustentado | manter |
| T-AC-form | Formação | area_academia | L8 | sustentado | manter |
| T-AC-prat | Prática | area_academia | L8 | sustentado_com_ressalva | fundir_ui_opcional |
| T-AC-pass | Passaporte | area_academia | L8 | sustentado | manter |
| T-AC-lid | Líder | area_academia | L8 | sustentado | condicional |
| T-AC-casos | Casos aba | area_academia | L8 | remover_como_aba | embutir |

---

## 11. Backlog B-01…B-24

| trace_id | artifact_id | tipo | status | onda | acao |
|---|---|---|---|---|---|
| T-B01d | B-01 | backlog | sustentado | 0 | feito |
| T-B02d | B-02 | backlog | sustentado_com_ressalva | 0 | paralelo_nao_bloquear_papel |
| T-B03d | B-03 | backlog | sustentado | 1 | manter |
| T-B04d | B-04 | backlog | sustentado | 1 | manter_nucleo |
| T-B05d | B-05 | backlog | sustentado_com_ressalva | 1 | cortar_qtd |
| T-B06d | B-06 | backlog | sustentado | 1 | manter |
| T-B07d | B-07 | backlog | sustentado | 1 | manter_nucleo |
| T-B08d | B-08 | backlog | sustentado | 1 | manter |
| T-B09d | B-09 | backlog | decisao_cesar | 1 | $ |
| T-B10d | B-10 | backlog | sustentado | 1 | manter |
| T-B11d | B-11 | backlog | sustentado | 1 | manter |
| T-B12d | B-12 | backlog | sustentado_com_ressalva | 1-2 | manter |
| T-B13d | B-13 | backlog | excessivo_se_bloqueia | 1 | papel_first |
| T-B14d | B-14 | backlog | sustentado_com_ressalva | 2 | apos_papel |
| T-B15d | B-15 | backlog | fora_fase1_onda1 | 2 | onda2 |
| T-B16d | B-16 | backlog | fora_fase1_onda1 | 2 | onda2 |
| T-B17d | B-17 | backlog | excessivo | 2 | cortar |
| T-B18d | B-18 | backlog | sustentado | 1-2 | leve |
| T-B19d | B-19 | backlog | excessivo_v0 | 2 | adiar_minimo |
| T-B20d | B-20 | backlog | sustentado | 3 | manter |
| T-B21d | B-21 | backlog | sustentado_com_ressalva | 3 | estresse_tempo |
| T-B22d | B-22 | backlog | sustentado | 4 | manter |
| T-B23d | B-23 | backlog | sustentado | 4 | manter |
| T-B24d | B-24 | backlog | sustentado | 4 | P2 |

---

## 12. Piloto e provas

| trace_id | artifact_id | tipo | doc_origem | status | acao |
|---|---|---|---|---|---|
| T-PIL | piloto_30d | piloto | Plano_Piloto_L8 | sustentado_com_ressalva | cortar_escopo |
| T-KSCB | provas_KSCB | modelo | VM Arq_L8 | sustentado | manter |
| T-VAL | 1_B_por_pessoa | atividade_piloto | Plano | sustentado | hard_limit |

---

## 13. Integração (elementos L8 × contrato)

| trace_id | artifact_id | tipo | status | canal | acao |
|---|---|---|---|---|---|
| T-INT-indep | F1 F2 cards papel | integracao | independente_DOS | — | manter |
| T-INT-opt | estado pedido formação | integracao | integracao_opcional | A futuro | nao_bloquear |
| T-INT-B | protocolo consulta DOS | integracao | futura_necessaria_piloto_opcional | B | checklist César |
| T-INT-C | PracticeEvidence | integracao | futura | C | fora_runtime |
| T-INT-D | M1 M10 agregados | integracao | opcional | D | sem_ranking |
| T-INT-proib | Foco via TE | integracao | proibido | — | manter_proibicao |
| T-INT-exec | protocolo→motor | integracao | depende_missao_tecnica | — | nunca_auto |

---

## 14. Totais

| Tipo | Linhas (aprox.) |
|---|---|
| Formações/módulos | 12 |
| Trilhas | 8 |
| Competências + janela | 30 |
| Protocolos + 45/55/65 | 13 |
| Casos | 36 |
| Simulações | 4 |
| Métricas | 10 |
| Jornadas | 3 |
| Passaporte/dossiê | 18 |
| Academia | 6 |
| Backlog | 24 |
| Piloto/provas | 3 |
| Integração | 7 |
| **Total** | **~174 linhas de rastreio (148 elementos únicos + gaps)** |

---

*Matriz V0.9 · sem fonte inventada · SEM EVIDÊNCIA LOCALIZADA quando couber.*
