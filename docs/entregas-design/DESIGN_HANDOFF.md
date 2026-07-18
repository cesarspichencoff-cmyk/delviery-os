# Design Handoff — Protótipo Entregas V0.1

| Campo | Valor |
|---|---|
| Protótipo | `prototipos/entregas-v01/` |
| Branch | `research/tata-evolucao-grok` |
| Missões | 2A decisões · 2B protótipo |
| Contratos domínio | `docs/deliveryos/*` — **não reinventados** |

---

## 1. Conceito

**“Entregas é a linha de confiança da viagem, da preparação ao fechamento confirmado.”**

Trajetória explícita:

PREPARAÇÃO → CONFERÊNCIA → HANDOFF → SAÍDA → PARADAS → TENTATIVAS → EXCEÇÕES → RETORNO → RECONCILIAÇÃO → FECHAMENTO

| Visual | Significado |
|---|---|
| Sólido / verde | Fato confirmado |
| Tracejado / técnico | Provisório, offline, sync |
| Âmbar | Tensão operacional (não culpa) |
| Linha contínua | Trip como objeto — não cards soltos |

---

## 2. Decisões preservadas (2A)

Presença ≠ disponibilidade · volumes bloqueiam saída · tentativa não encerra entrega · mapa apoio · offline honesto · reenvio com novo id · sem ranking/GPS punitivo · Foco não é desta UI · E01–E10 · fechamento real com reconciliação

---

## 3. Desktop — Mesa de Expedição

- Filas: não pode sair, pronta, em rota, exige ação, retorno, fechamento pendente, sync  
- Viagem em foco + viagens contextuais (cenário 1) para leitura em 5 segundos  
- Detalhe: stage rail + timeline epistemológica + ações  
- Mapa em gaveta opcional  

---

## 4. Mobile — Próximo Passo

- Conexão: conectado / instável / offline / sincronizando  
- CTA dominante por estado  
- Exceções em sheet  
- Volumes e ref operacional  
- Sem ranking, chat, mapa obrigatório  

---

## 5. Estados de fechamento

| Estado | Significado no protótipo |
|---|---|
| Fechada | Encerrada e conferida |
| Fechamento pendente | Retorno provisório / falta reconciliação |
| Encerrada · ocorrência aberta | Transporte ok, ocorrência segue |
| Aguardando sync | Execução no aparelho, loja ainda não viu tudo |

---

## 6. Cenários (20)

1 preparação · 2 divergência volume · 3 aguardando entregador · 4 handoff · 5 em rota · 6 entrega confirmada · 7 não atende · 8 endereço · 9 avaria · 10 recusada · 11 parcial · 12 offline · 13 aguardando sync · 14 sincronizando · 15 conflito · 16 retorno · 17 fechamento pendente · 18 encerrada · 19 ocorrência aberta · 20 reenvio  

Seletor: **Demo (não é produto)**.

---

## 7. Arquivos

```
prototipos/entregas-v01/
  index.html
  styles.css
  app.js
  README.md
docs/entregas-design/DESIGN_HANDOFF.md
```

---

## 8. Como executar

```bash
cd prototipos/entregas-v01
# abrir index.html
# ou: python -m http.server 5190
```

Sem dependências.

---

## 9. Itens simulados

Dados, riders, GPS, sync real, atribuição, override, resolução de conflito (toasts + troca de cenário).

---

## 10. Acessibilidade

Contraste cream/deep · alvos ≥48px no mobile · `prefers-reduced-motion` · badges + texto (não só cor) · `aria-live` no toast · labels em modais  

---

## 11. Limitações

Um trip em detalhe por cenário · mesa multi-viagem só ilustrativa no cenário 1 · sem persistência · não é produção  

---

## 12. Próximos passos técnicos

Mesa com N viagens live · reconciliação de volumes passo a passo real · paper checklist · fatos → Copiloto (outro worktree) · validação com operação (dados fora do Git)  
