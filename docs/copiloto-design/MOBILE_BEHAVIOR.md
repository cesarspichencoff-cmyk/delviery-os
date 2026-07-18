# Mobile Behavior — Copiloto Delivery

Superfície primária de pico: **celular / tablet de bancada**.  
Desktop é secundário para briefing, fechamento detalhado e sombra.

---

## 1. Princípios mobile

1. Uma mão, olho em 2 segundos  
2. Polegar alcança ação primária  
3. Sem scroll obrigatório para entender o Foco  
4. Voz e tela são irmãos — não rivais  
5. Offline / degraded: falha honesta, não spinner eterno  

---

## 2. Viewports alvo

| Dispositivo | Largura | Uso |
|---|---|---|
| Phone portrait | 360–430 | chão / líder |
| Phone landscape | evitar layout denso | se usado: mesmo Foco, menos chrome |
| Tablet | 768–1024 | balcão / TV futura (mesma hierarquia) |

---

## 3. Gestos e interações

| Gesto | Comportamento |
|---|---|
| Tap Foco | expande L1 (por quê / evidência) |
| Tap ação | confirma intenção (não executa hardware externo sozinho) |
| Swipe entre focos | **proibido** como carrossel de alertas |
| Pull-to-refresh | atualiza snapshot; se failed, banner |
| Long-press pedido | detalhe L2 |
| Botão mic | intent de voz; feedback de escuta |

---

## 4. Estrutura de tela no pico

```
┌─────────────────────────┐
│ [área]  [tech se need]  │  meta fina
│                         │
│   TÍTULO DO FOCO        │  sem scroll
│   resumo 1–2 linhas     │
│                         │
│   evidência • evidência │
│                         │
│  ┌───────────────────┐  │
│  │ Ação principal    │  │  thumb zone
│  └───────────────────┘  │
│  confiança (se preciso) │
│                    [mic]│
└─────────────────────────┘
```

Calmo: centro vazio útil + mic opcional.

---

## 5. Teclado e formulários

- Fechamento: respostas curtas; chips “Não sei” / “Pular”  
- Sem formulários multi-step longos no pico  
- Correção de transcrição: editar linha única  

---

## 6. Notificações mobile

| Nível | Sistema OS? | In-app |
|---|---|---|
| silent | não | não |
| discreet | não (padrão) | mudança na superfície se aberta |
| intervention | opcional, raro, com permissão | Foco |

Respeitar cooldown do contrato de silêncio.  
Agrupar; não 1 push por pedido.

---

## 7. Performance percebida

- Skeleton só no first load  
- Troca de Foco: cross-fade curto, sem confete  
- Prefetch cenários mock em dev  

---

## 8. Acessibilidade mobile

- Alvos ≥ 44pt  
- Contraste em Foco crítico sem depender só de cor  
- Não depender só de áudio  
- Reduce motion: cortar animações de troca  

---

## 9. Estados de rede

| Estado | UI |
|---|---|
| online healthy | normal |
| slow | “atualizando…” discreto |
| offline / failed | technical_state; última leitura com timestamp se houver |
| reconnect | não despejar fila de toasts |

---

## 10. O que não fazer no mobile

- Tabelas largas  
- Heatmaps de praça no pico  
- Hamburger com 12 módulos  
- Forçar landscape  
- Autoplay de voz sem gesto (exceto se política do turno permitir e usuário opt-in)
