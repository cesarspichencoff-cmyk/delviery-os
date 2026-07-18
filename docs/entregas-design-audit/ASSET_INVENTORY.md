# Inventário de Ativos — Entregas (Worktree `deliveryos-tata-evolucao`)

| Campo | Valor |
|---|---|
| Worktree | `C:\Users\italo\Desktop\Claude\deliveryos-tata-evolucao` |
| Branch | `research/tata-evolucao-grok` |
| HEAD base | `a03508c` |
| Escopo | **Somente** este worktree |
| Wireframes/PDF Desktop fora do worktree | **Não inventariados** (fora do limite da missão) |

---

## 1. Núcleo canônico do domínio Entregas

| Arquivo | Tipo | Função | Avanço |
|---|---|---|---|
| `docs/deliveryos/Fundacao_Dominio_Entregas_V0_1.md` | Contrato de domínio | 25 objetos; fluxos própria + marketplace; fatos → OV | **Mais avançado (modelo)** |
| `docs/deliveryos/Fluxos_Estados_Entregas_V0_1.md` | Fluxos | 20 fluxos ponta a ponta; estados Delivery | Avançado |
| `docs/deliveryos/Modelo_Viagens_Motoboys_GPS_V0_1.md` | Modelo | Trip, presença≠disponibilidade, GPS sessão | Avançado |
| `docs/deliveryos/Modelo_Expedicao_Marketplace_V0_1.md` | Modelo | Handoff iFood/externo por posição | Avançado |
| `docs/deliveryos/Modelo_Comandas_Correlacao_Entregas_V0_1.md` | Modelo | Impressão ≠ Delivery; confiança de match | Avançado |
| `docs/deliveryos/Riscos_Privacidade_RedTeam_Entregas_V0_1.md` | Red team | Riscos A/M; U-01–U-12; GPS/ranking | Avançado |
| `docs/deliveryos/Contrato_Fronteiras_Dominios_DeliveryOS_V0_1.md` | Fronteiras | OV vs Entregas vs Evolução; Foco só OV | Avançado |
| `docs/deliveryos/Mapa_Mestre_Dominios_DeliveryOS_V0_1.md` | Mapa de domínios | Missão/usuários/eventos de Entregas | Avançado |
| `docs/deliveryos/Gate_Analise_Arquivos_Reais_Entregas_V0_1.md` | Gate | Próximos arquivos reais; **sem análise ainda** | Parcial (gate) |
| `docs/deliveryos/Registro_Dominios_Futuros_V0_1.md` | Registro | Domínios futuros | Pesquisa |

**Versão mais avançada do domínio:** pacote **Entregas V0.1** em `docs/deliveryos/*` (fundação + fluxos + viagens + marketplace + correlação + red team).

---

## 2. Wireframes

| Material | Presente neste worktree? |
|---|---|
| Wireframes de viagem / motoboy / handoff | **NÃO** |
| PDF/PPT de Entregas | **NÃO** |
| Pranchas HTML de Entregas | **NÃO** |

---

## 3. Protótipos / UI existentes (não são Entregas)

| Caminho | O que é | Reaproveitar para Entregas? |
|---|---|---|
| `app-v1/*` | Superfície Calmo/Ambiente/Foco (Operação Viva) | Gramática cognitiva **não** layout de viagem |
| `prototipos/parados-agora/*` | Protótipo Campo Vivo / motor | **Não** é UI de Trip/Delivery |

---

## 4. Código de runtime

| Caminho | Entregas? |
|---|---|
| `src/perfil-delivery/` | Motor de praças/atenção — **não** domínio Trip |
| `src/core/`, `src/live/` | Camada 0 / live (se presente na base) — **não** Entregas V0.1 implementado |
| Schemas/API Entregas | **Ausentes** |

---

## 5. Material TATÁ Evolução (adjacente, não Entregas)

Pacote Fable V0.9 e protótipos de formação em `docs/tata-evolucao/` tratam **cultura/formação**, não viagens.  
**Reaproveitável conceitualmente:** paper-first, offline R-OFF-01…10, anti-ranking, fato≠interpretação, idempotência de sync — **sem** copiar jornadas de treinamento para o motoboy.

---

## 6. Classificação do inventário

| Classe | Itens |
|---|---|
| **Desenhado (visual)** | 0 (neste worktree) |
| **Contratado operacionalmente** | 10 docs `deliveryos` Entregas V0.1 |
| **Pesquisado / gate** | Gate arquivos reais; desconhecidos U-01–U-12 |
| **Duplicado** | Sobreposição saudável Fundação ↔ Fluxos ↔ Viagens (mesmo modelo, ângulos diferentes) — **não** conflito grave |
| **Fora de escopo inventário** | Desktop `WF_ENTREGAS_*` (se existir na máquina) — **não** lido aqui |

---

## 7. Contagem

| Tipo | Qtd no worktree |
|---|---:|
| Contratos/modelos Entregas V0.1 | 10 |
| Wireframes Entregas | 0 |
| Protótipos UI Entregas | 0 |
| Protótipos UI OV (não-Entregas) | 2 pastas (`app-v1`, `parados-agora`) |
