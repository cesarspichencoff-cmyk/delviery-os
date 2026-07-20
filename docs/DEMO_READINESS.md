# Prontidão de Demonstração — DeliveryOS (Auditoria 2026-07-20)

> O que pode ser mostrado com segurança hoje, o que NÃO pode, e um roteiro honesto.

## 1. Veredito

**Pronto para demonstração local controlada: SIM — Copiloto (`101680a`) e Entregas-demo (`bb567a6`).**
**SELECAO não foi localizado** como implementação; não há shell. Entregas é **demo executável** (99 testes, 4 superfícies — ver [ENTREGAS_AUDIT_FROZEN](ENTREGAS_AUDIT_FROZEN.md)), não piloto. Apresentar Entregas como pronto para operação real, ou citar Seleção como pronto, seria afirmação falsa.

## 2. O que abre limpo (Copiloto)

- `node tools/servir_v1.js` → `http://localhost:5179/` (ou `servir_v1_shadow.js` para observação sombra).
- Redireciona para `/app-v1/index.html`, abre em **Calmo vivo** (`body[data-mode]="calmo"`), sem erro de console, sem erro de rede.
- Motor real produz Calmo → Ambiente → Foco legitimamente (provado em `interface-v33-smoke.test.js`).
- Rótulo honesto no topo: "Fonte simulada (D4A) · dados sintéticos (não é operação real)".
- 317 testes verdes (221 live + 43 capacidade + 53 copiloto).

## 3. Riscos de vergonha em apresentação (reais)

| Risco | Gravidade | Mitigação honesta (não fake) |
|---|---|---|
| **Cozinha e Caixa aparecem permanentemente "sem dados"** | Alto para plateia leiga | Explicar no roteiro: são estações sem fonte de dado ainda (Caixa) ou sem praça própria no motor (Cozinha). NÃO preencher com mock. Decisão de UX pendente com César (ver [IMPROVEMENT_RECOMMENDATIONS.md](IMPROVEMENT_RECOMMENDATIONS.md)). |
| **Não há tela inicial / shell** | Alto se a narrativa é "3 módulos" | Não prometer navegação entre módulos. Demonstrar o Copiloto como o módulo pronto; Entregas como fundação em validação. |
| **Dado é sintético** | Médio | O rótulo já está na tela. Ser explícito: "isto é o motor real rodando sobre cenário simulado; a operação real entra depois da validação". |
| **"Seleção" não existe** | Alto se citado | Não citar Seleção como pronto. Se for parte da visão, apresentá-lo como conceito, não produto. |
| Modo sombra invisível | Baixo (é o ponto) | Mostrar o log técnico `observacoes.runtime.jsonl` separadamente para provar que a inteligência observa sem interferir. |

## 4. Roteiro seguro de demonstração

1. **Abertura** — Copiloto em Calmo. "Silêncio é saúde: quando não há nada urgente, a tela não grita."
2. **Ambiente** — avançar o replay até o clima mudar. "Meteorologia da operação, sem alarme."
3. **Foco** — chegar a uma exceção real (motoboy/pronto). "A única coisa que precisa de você agora."
4. **Capacidade Viva em sombra** — abrir `observacoes.runtime.jsonl`: "uma segunda inteligência já lê a operação e registra o que faria — sem tocar na tela, sem decidir nada. Validada às cegas (26/26)."
5. **Honestidade dos dados** — apontar o rótulo "fonte simulada" e as células Cozinha/Caixa: "o sistema nunca inventa. Onde não há fonte, ele diz que não há."
6. **Entregas** — apresentar como **domínio em validação** (Gate Zero fechado, aguardando decisão do César), NUNCA como pronto.
7. **Próximos passos** — fonte real, shell dos módulos, decisão sobre Seleção.

## 5. O que NÃO fazer na demo

- Não navegar para telas que não existem (Seleção, shell).
- Não chamar dado sintético de real.
- Não preencher Cozinha/Caixa para "ficar bonito".
- Não rodar em WiFi de terceiros com `HOST=0.0.0.0` (expõe o repo — hoje o default já é localhost; ver [SECURITY_AND_PRIVACY_REVIEW.md](SECURITY_AND_PRIVACY_REVIEW.md)).
- Não afirmar prontidão de piloto/produção.

## 6. Checklist pré-demo

- [ ] `git status` limpo no worktree do Copiloto.
- [ ] 317 testes verdes (rodar 2× por causa de portas — ver [RELEASE_GATES.md](RELEASE_GATES.md)).
- [ ] Servidor em `localhost` (default seguro).
- [ ] `observacoes.runtime.jsonl` limpo antes de começar (para o log contar a história do vivo).
- [ ] Navegador em janela limpa, sem QA (`?qa=1`) exposto.
