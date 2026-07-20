# ENTREGAS V1.0.3 — Registro de correções

## Origem
Conferência documental da versão COR-ENTREGAS-V1 @ 1.0.2.

## Correção 1 — trip_return_started (seção 11.1)

**Problema:** colunas deslocadas no Markdown/DOCX (pré-condições na coluna "Para").

**Correção:**

| De | Evento | Para | Ator | Pré-condições | Falha segura |
|---|---|---|---|---|---|
| em_rota | trip_return_started | retornando | motoboy/sistema | viagem ativa; papel ou regra autorizada; não exige require_all_active_stops_resolved | rejeitar se a viagem não estiver ativa ou a origem não estiver autorizada; G3 pode gerar entrega_sem_confirmacao para deliveries active=true sem desfecho |

Matriz Transicoes_Trip alinhada.

## Correção 2 — active=false e G1–G5

**Problema:** alguns trechos diziam apenas G2–G5.

**Correção:** delivery com active=false não recebe pendência por **G1, G2, G3, G4 ou G5**.

Aplicado em seções 14.2, 16, 16.1 e anexos.

## Arquivos 1.0.3
1. CONTRATO_OPERACIONAL_REAL_ENTREGAS_V1_0_3.docx
2. CONTRATO_OPERACIONAL_REAL_ENTREGAS_V1_0_3.md
3. ENTREGAS_V1_0_3_MATRIZ_ESTADOS_EVENTOS_TRANSICOES.xlsx
4. ENTREGAS_V1_0_3_POLITICAS_PILOTO.xlsx
5. ENTREGAS_V1_0_3_CENARIOS_ACEITE.xlsx
6. ENTREGAS_V1_0_3_REGISTRO_DECISOES.md
7. ENTREGAS_V1_0_3_REGISTRO_CORRECOES.md

## Preservação
Versão 1.0.2 **não** foi sobrescrita, renomeada ou apagada.
