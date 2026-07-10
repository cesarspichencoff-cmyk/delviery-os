# Checklist Adversarial — Revisão de Commits do Fable

> Usar em **cada** PR/commit da branch `feature/preloja-fable` (ou equivalente).
> Postura: **reprovar por omissão de prova**, não por gosto estético.
> Red Team Grok · HEAD de contexto da auditoria: `a441bc7`.
> Complementa achados em `Auditoria_Estrategica_DeliveryOS_Grok.md` e `Critica_Arquitetura_Fonte_Viva.md`.

---

## Como usar

1. Abrir o diff completo (`git log main..HEAD`, `git diff main...HEAD`).
2. Marcar cada item: **PASS** / **FAIL** / **N/A** (com justificativa de uma linha).
3. **FAIL em item Crítico** = não aprovar integração nem “validado na loja”.
4. Opinião sem arquivo/teste/métrica **não** conta como PASS.
5. Este checklist **não** autoriza merge em `main` — só qualifica o checkpoint.

### Legenda de severidade do item

- **C** — Crítico (bloqueia S1/T/P conforme nota)
- **A** — Alto
- **M** — Médio
- **B** — Baixo / polimento

---

## 0. Higiene do commit (antes de tudo)

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 0.1 | C | O commit altera só o que a missão autorizou? | Diff sem `motor.js` regras de decisão, sem seed, sem dados brutos, sem secrets |
| 0.2 | C | Entrou `data/raw`, `.jsonl` de cliente, cookie, token, senha? | Zero; `.gitignore` respeitado |
| 0.3 | C | Entrou PDF/PNG/JPG de comanda real com PII? | Zero rastreados |
| 0.4 | A | Mensagem de commit promete “validado/produção” sem evidência? | Linguagem honesta (lab/fixture/sombra) |
| 0.5 | A | Segundo cérebro / fork de `decidir` embutido na UI? | Reusa `motor.js`/`decisao.js`; sem cópia de score |
| 0.6 | M | `package.json` com deps novas? | Justificadas; missão atual proibia install no red team — Fable deve declarar |
| 0.7 | C | `npm install` de pacote que automatiza browser **com** click default? | Só se flag no-click e revisão |

---

## 1. Contrato de eventos

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 1.1 | C | Existe schema documentado do evento/fila? | Campos estáveis versionados (doc ou JSON schema) |
| 1.2 | C | Todo evento tem `event_id`, `observed_at`, `source`, `kind`? | Sim |
| 1.3 | C | IDs separados: `ifood_curto`, `pedido_interno`, `sequencia`, uuid interno? | Não colapsar sem regra |
| 1.4 | A | `source_ts` vs `observed_at` distintos quando existirem? | Sim ou documentado N/A |
| 1.5 | C | Estados de qualidade: `complete` / `partial` / `suspect` / `conflict`? | Sim |
| 1.6 | A | Heartbeat e erro são eventos de primeira classe? | Não só ausência de dados |
| 1.7 | M | Versionamento do schema (`schema_version`)? | Presente |

**Fail típico:** um único JSON “pedido completo” inventado no ar sem partial.

---

## 2. Validação

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 2.1 | C | Parser rejeita/marca lixo sem crashar o processo? | Teste com input truncado/binário |
| 2.2 | A | Campos opcionais ausentes não inventam default perigoso? | `null` + qualidade partial |
| 2.3 | A | Nomes de item passam pelo seam existente (`matchSeed` / fonte rows)? | Sem normalizer paralelo opaco |
| 2.4 | M | Validação de tipos/ranges (qtd > 0, etc.)? | Sim |
| 2.5 | A | Fixture de comanda **sem PII real**? | Dados fictícios |

---

## 3. Deduplicação

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 3.1 | C | Reimpressão do mesmo `pedido_interno` não cria 2 pedidos? | Teste X-04 |
| 3.2 | A | `dedup_key` estável e documentada? | Sim |
| 3.3 | A | Reimpressão com itens diferentes vira versão/`divergente`, não merge cego? | Sim |
| 3.4 | M | Heartbeats não “dedupam” status úteis? | Chaves distintas |

---

## 4. Consolidação (casamento de fontes)

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 4.1 | C | Casamento explícito por regra (não “último arquivo ganha”)? | Código legível + doc |
| 4.2 | C | Half-match permanece partial — **não** fabrica itens/status? | Teste R-09/R-10 |
| 4.3 | C | Colisão de curto → `conflict`, nunca merge silencioso? | Teste X-06 |
| 4.4 | A | Precedência cancel > status > print documentada em teste? | Sim |
| 4.5 | A | Motor só consome estados permitidos? | Gate no adaptador |
| 4.6 | M | Métricas de % casado/partial/conflict logáveis? | Sim |

---

## 5. Pedidos parciais

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 5.1 | C | API/fila expõe parcial sem parecer completo? | Flag obrigatória |
| 5.2 | A | UI/sombra não gera Foco de praça sem itens reais? | Ou bloqueia ou rotula sintético |
| 5.3 | A | Timeout de espera de casamento não vira inventado? | Expira para suspect/orphan |
| 5.4 | M | Orfãos reportados no relatório de sombra? | Contagem |

---

## 6. Cancelamento

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 6.1 | C | Cancel **só** de fonte de status (Gestor/export), nunca da comanda? | Código + teste |
| 6.2 | C | Cancel após print remove pedido de produção ativa no modelo? | Teste X-05 |
| 6.3 | A | Histórico de sombra preserva que houve print+cancel? | Não apagar fatos |
| 6.4 | M | Copy não culpa pessoa pelo cancel? | Lei 4 |

---

## 7. Recuperação

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 7.1 | C | Append-only em disco, não só RAM? | Reinício não zera fatos |
| 7.2 | C | Linha JSONL corrompida: skip + log, processo vive? | Teste X-08 |
| 7.3 | A | Single-instance lock? | Duas tasks não duplicam |
| 7.4 | A | Recover documentado (passos humanos)? | README/runbook curto |
| 7.5 | M | Rotação de log com tamanho máximo? | Sim |

---

## 8. Offline / rede

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 8.1 | C | Queda do Gestor ≠ crash do capturador de print? | Fontes independentes |
| 8.2 | A | Age do último status exposto? | Métrica/evento |
| 8.3 | A | Modo degradado documentado? | O que ainda funciona offline |
| 8.4 | M | Não exige internet para servir UI local já com dados? | Sim |

---

## 9. Simulação / fixtures

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 9.1 | C | Fixtures rotuladas `synthetic` vs `real_redacted`? | Nunca misturar |
| 9.2 | A | Testes cobrem: reimpressão, cancel, partial, conflict, RAW/binário? | Lista no PR |
| 9.3 | A | Nenhum teste “verde” depende de rede iFood real? | Offline CI-able |
| 9.4 | M | Golden files estáveis? | Diff legível |

---

## 10. Feature flags

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 10.1 | C | `SHADOW_ONLY` default true para captura nova? | UI de decisão off por default |
| 10.2 | C | `ALLOW_CLICK` default false e difícil de ligar? | Preferível inexistente |
| 10.3 | A | `BIND_LOCALHOST` default? | Não 0.0.0.0 sem flag |
| 10.4 | A | Flag por fonte (print / gestor) independente? | Pode desligar uma |
| 10.5 | M | Flags logadas no heartbeat? | Auditoria de config |

---

## 11. Embalagens

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 11.1 | C | Não implementa embalagens V0 como fato sem validação César? | Ou N/A |
| 11.2 | C | Se tocar em `segundaSacola`, confiança/hipótese explícita? | Não promover a fato |
| 11.3 | A | Hot roll exception respeitada se houver lógica? | Doc embalagens §7 |
| 11.4 | A | Atenção leve exige pedido identificável? | Auditoria praça |
| 11.5 | M | Divergência seed vs doc embalagens só registrada, seed intocado? | Sim |

---

## 12. Windows / spool / processo

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 12.1 | C | Captura de spool é **somente leitura**? | Sem pause/redirect/driver change |
| 12.2 | C | Evidência de zero impacto na impressão (ou “não testado na loja” honesto)? | Sem claim falso |
| 12.3 | A | Trata job efêmero (retry/buffer)? | Doc + código |
| 12.4 | A | Multi-printer: seleciona Epson por nome, não “primeira da lista”? | Sim |
| 12.5 | A | Privilégio: roda sem admin se possível; se admin, justificado? | Doc |
| 12.6 | M | Tray/status: conectado / aguardando / erro? | Sim |
| 12.7 | C | Pause/kill em um gesto? | Sim |

---

## 13. Interface / contrato cognitivo

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 13.1 | C | `DECISAO.decidir` sempre com `active: sess.active` no path V1? | Gate 11 |
| 13.2 | C | Um estado por vez; sem lista de focos; sem segunda ação? | Contrato V1 |
| 13.3 | C | Health de fonte **separado** de Calmo operacional? | Não misturar |
| 13.4 | A | Age do snapshot visível ou força freeze? | Sim em live |
| 13.5 | A | Modo `replay|sombra|live` rotulado? | Sim |
| 13.6 | A | Itens como “impressos”, não “finais”? | Rasura |
| 13.7 | A | ID gritável (curto/sequência) com desambig se conflito? | Sim |
| 13.8 | A | Não reintroduz protótipo antigo sem `active` como demo? | Sim |
| 13.9 | M | Multi-praça: explica dependências se mostrar item? | Melhoria |
| 13.10 | C | Não implementa Mapa 6 ambientes com Caixa/Conferência verdes sem dado? | Bloqueio |
| 13.11 | A | DISPLAY Quentes/Cozinha: sem rename silencioso? | Validação César |
| 13.12 | M | Copy sem alarme falso / sem nome de pessoa? | Leis 4 e 12 |

---

## 14. Segurança

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 14.1 | C | Zero escrita em Odhen / iFood / impressora? | Arquitetura |
| 14.2 | C | Zero path de click em botões de ação? | Grep no diff |
| 14.3 | C | Seletores de automação: allowlist revisada? | Se houver DOM |
| 14.4 | A | Servidor não escuta em todas as interfaces por default? | Sim |
| 14.5 | A | Auth mínima se LAN? | Token/local |
| 14.6 | M | Dependências com surface de RCE evitadas ou justificadas? | Sim |

---

## 15. Privacidade

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 15.1 | C | Endereço/telefone **não** no snapshot do motor/UI default? | Minimização |
| 15.2 | C | Nome de cliente só se necessário e flagado? | Preferir não |
| 15.3 | C | Secrets/cookies **fora** do Git e do artefato versionado? | Sim |
| 15.4 | A | Retenção/purge de raw de comanda? | Doc |
| 15.5 | A | Logs sem corpo completo de PII? | Sim |
| 15.6 | M | Conformidade com `Politica_Dados.md` para qualquer path novo? | Sim |

---

## 16. Rollback

| # | Sev | Pergunta | PASS se… |
|---|---|---|---|
| 16.1 | C | Desligar capturador não quebra impressão? | Design |
| 16.2 | C | Desligar UI não quebra operação (óbvio, mas testado)? | Sim |
| 16.3 | A | Runbook: “se X, faça Y” em <5 passos? | Doc no PR |
| 16.4 | A | Feature flags permitem degradar para S0? | Sim |
| 16.5 | M | Marcação de versão do capturador no heartbeat para saber o que rodar? | Sim |

---

## 17. O que o Fable **não** deve “aproveitar o PR” para fazer

Marcar FAIL se aparecer no diff sem missão explícita:

- [ ] Tuning de `BASELINE` / `TEMPO_PRACA` / `FLOORS`
- [ ] Memória Operacional / Resolução formal
- [ ] Dashboard / lista de pedidos / KPIs
- [ ] Vigilância de funcionário / ranking
- [ ] Embalagens V0 completas como verdade
- [ ] Interceptação de porta da impressora
- [ ] OCR de produção
- [ ] “Consciência” como serviço/IA generativa
- [ ] Alterar `conferencia`/`saida` saudáveis sem medição
- [ ] Commit de dados brutos da loja

---

## 18. Template de parecer do revisor (copiar)

```text
Checkpoint Fable: <hash ou PR>
Revisor: Red Team / humano
Data:

Críticos FAIL: <ids>
Altos FAIL: <ids>
N/A justificados: <ids>

Pode ir para S1 lab? S/N
Pode ir para T loja? S/N
Pode ir para P visível? S/N

Linguagem proibida no PR: validado | produção | 100% | sem risco
Evidências anexas: <paths de testes/logs redacted>

Decisão: APROVAR CHECKPOINT / REPROVAR / APROVAR SÓ LAB
```

---

## 19. Greps sugeridos no diff (Windows PowerShell / rg)

```text
click|click\(|mouse\.|page\.click|dispatchEvent
password|cookie|Authorization|Bearer
0\.0\.0\.0|listen\(
segundaSacola|duas_sacolas
decidir\([^)]*\)(?!.*active)
cardapio_knowledge_seed
data/raw|ifood_real\.jsonl
```

Qualquer hit exige justificativa explícita no parecer.

---

*Checklist vivo: se o Fable introduzir superfície nova (ex.: pipe de named pipe ESC/POS), adicionar seção 20 nesta pasta em commit de red team — não no silêncio do PR de feature.*
