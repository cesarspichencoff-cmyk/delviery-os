# Pacote de revisão — Redesign visual ENTREGAS

| Campo | Valor |
|---|---|
| Status | **IMPLEMENTADO · aguarda aprovação final da experiência** |
| Direção | Composições `CORRECOES_OBRIGATORIAS.html` aprovadas |
| Cânone | Sprint Visual DeliveryOS V2 |
| Domínio | **Intacto** (ApplicationService, commands, COR, contratos) |
| Push / deploy | **Não** |

## O que foi reconstruído

| Superfície | Caminho | Notas |
|---|---|---|
| Tokens canônicos | `src/entregas/ui/shared/tokens.css` | Spectral · Hanken · Plex · creme · verde #22563C |
| Console | `src/entregas/ui/console/` | Foco editorial + sequência de endereços (sem mapa inventado) |
| Mobile motoboy | `src/entregas/ui/rider-mobile/` | Ações por estado de domínio |
| Expedição iFood | `src/entregas/ui/ifood-handoff/` | Liberar desabilitado até requisitos; copy operacional |
| MapLibre experimental | `src/entregas/ui/map-poc/` | Prova isolada; **não** produção |
| Cliente HTTP | `src/entregas/ui/shared/client.js` | Labels humanos; sem lógica de domínio |

## Condições obrigatórias (implementadas)

1. **A caminho** → Abrir rota; sem “Cliente não encontrado”.  
   **Cheguei** disponível para registrar chegada.  
   **Após chegada** → Confirmar entrega + Cliente não encontrado.  
   Registrar problema = secundário contextual.

2. **Liberar pedido** desabilitado até: expedição iniciada, pedido OK, entregador verificado, método, volumes iguais, conferência física, responsável, ator da liberação. UI lista o que falta.

3. **Sem perfil** de courier externo — só método + ref mascarada opcional do ato.

4. Copy: *“Expedição concluída. O andamento posterior é acompanhado pelo canal do iFood.”*

5. Console sem GPS: **sequência de endereços**, não pins em mapa inventado.

6. Cartografia: direção mantida; status **experimental** até validação MapLibre.

## Como rodar

```bash
npm run ui:entregas
# http://127.0.0.1:5193/console/
# http://127.0.0.1:5193/rider-mobile/
# http://127.0.0.1:5193/ifood-handoff/
# http://127.0.0.1:5193/map-poc/
```

```bash
npm run test:entregas:ui
node tools/audit_visual_redesign.mjs
```

## Capturas

Geradas em `docs/entregas/ux/capturas-redesign/` (após audit).

## Comparação com composições

| Composição aprovada | Implementação |
|---|---|
| Mobile a caminho | `rider-mobile` phase `en_route` |
| Mobile após chegada | phase `arrived` |
| Mobile offline | sync-bar automática + link secundário |
| Expedição iFood | grid sem mapa + gate Liberar |
| Console sem GPS | `address-seq` / addr-chip |
| GPS futuro | **não** no console produtivo; só visão experimental no map-poc |

## Fora de escopo (respeitado)

- Domínio / COR / contratos públicos  
- Shell / Copiloto / GPS produção  
- Atribuição automática  
- Push / deploy  
- Worktree Copiloto V3.3  

## PARADA

Após este pacote: **aguardar aprovação final da experiência implementada**.
