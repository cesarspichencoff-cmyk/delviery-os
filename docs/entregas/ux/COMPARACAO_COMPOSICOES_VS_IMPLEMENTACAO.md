# Comparação lado a lado — composições aprovadas × implementação

| Composição aprovada | Captura real | Observação |
|---|---|---|
| Mobile · a caminho | `capturas-redesign/04_mobile_a_caminho_390.png` | Abrir rota soberana; Cheguei secundário; sem Cliente não encontrado |
| Mobile · após chegada | `capturas-redesign/05_mobile_chegada_390.png` | Confirmar entrega; Cliente não encontrado disponível |
| Mobile · offline | `capturas-redesign/06_mobile_offline_390.png` | Sync automática; “Enviar agora” secundário |
| Expedição iFood (bloqueada) | `capturas-redesign/07_expedicao_bloqueada_1280.png` | Lista o que falta; Liberar desabilitado |
| Expedição pronta / concluída | `08` / `09` | Copy operacional do iFood |
| Console sem GPS | `capturas-redesign/03_console_em_rota_sem_gps_1440.png` | Sequência de endereços; sem pins inventados |
| MapLibre experimental | `capturas-redesign/10_maplibre_experimental_1280.png` | Prova isolada; status experimental |

Referência de direção: `composicoes-v2/CORRECOES_OBRIGATORIAS.html`

## Checklist de condições

| Condição | Status |
|---|---|
| A caminho sem “Cliente não encontrado” | OK |
| Fluxo Abrir rota → Cheguei → Confirmar entrega | OK |
| Liberar desabilitado com pendências claras | OK |
| Sem perfil de courier externo | OK |
| Copy expedição concluída (canal iFood) | OK |
| Console sem posição inventada | OK |
| Cartografia experimental | OK |
| Domínio / contratos intactos | OK (suite completa verde) |
