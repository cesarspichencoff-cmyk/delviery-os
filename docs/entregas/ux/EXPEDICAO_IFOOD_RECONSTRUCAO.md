# Reconstrução da experiência — Expedição iFood

| Campo | Valor |
|---|---|
| Status | **Aguarda aprovação do César** |
| Superfície | somente `src/entregas/ui/ifood-handoff/` |
| Domínio / COR / contratos | **intocados** |
| Console / mobile casa | **intocados** |
| Commit esperado | após implementação |

## Problema

A superfície anterior ficou complexa (formulário permanente, muitos controles na primeira tela) e **não estava aprovada**.

## Direção

Sprint Visual V2: uma atenção dominante, uma ação soberana, poucos elementos por etapa.

### Home

- Contador: “N pedidos prontos”
- Destaque: “Pedido #… ficou pronto. Vá buscar na conferência.”
- Ação: **Buscar pedido**
- Lista recuada: ainda aguardam retirada / em mãos
- Secundário: “N em preparo”
- Vazio: “Nenhum pedido pronto agora…”

### Fluxo

1. Pronto para buscar → Buscar pedido  
2. Pedido em mãos → Aguardando motoboy  
3. Confira antes de entregar (sacolas · nome · número iFood)  
4. Entregar ao motoboy  
5. Expedição concluída (andamento no canal iFood)

### Avisos

- Atualiza contador  
- Destaque + animação curta  
- Som discreto configurável  
- **Uma vez por pedido**

## Artefatos

| Artefato | Caminho |
|---|---|
| Composições | `docs/entregas/ux/composicoes-v2/EXPEDICAO_IFOOD_RECONSTRUIDA.html` |
| Implementação | `src/entregas/ui/ifood-handoff/` |
| Capturas | `docs/entregas/ux/capturas-ifood-reconstrucao/` |
| Antes (referência) | `docs/entregas/ux/capturas-redesign/07_*.png` … (versão formulário) |

## PARADA

Sem push · sem deploy · aguardar César.
