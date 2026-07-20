# Relatório do Gate de Prontidão — ENTREGAS

| Campo | Valor |
|---|---|
| Data | 2026-07-20 |
| Módulo | ENTREGAS |
| Objetivo | Piloto controlado 1 unidade · poucos usuários · sem produção definitiva |

## EXPERIÊNCIA VISUAL ENTREGAS CONFIRMADA

Registrado em `docs/entregas/ux/EXPERIENCIA_VISUAL_CONFIRMADA.md`.  
Sem redesign visual amplo a partir deste ponto.

## Percentual de prontidão (estimativa evidenciada)

| Área | Peso | Nota | Contribuição |
|---|---|---|---|
| Domínio / COR / testes | 25% | 95% | 23.8 |
| UX aprovada (console/mobile/iFood) | 20% | 95% | 19.0 |
| Persistência single-instance + backup | 15% | 80% | 12.0 |
| Auth mínima por token | 10% | 75% | 7.5 |
| Offline robusto | 10% | 40% | 4.0 |
| Observabilidade | 5% | 85% | 4.3 |
| Runbook / rollback | 5% | 90% | 4.5 |
| Validação aparelhos reais na unidade | 10% | 20% | 2.0 |
| **Total** | | | **~77%** |

**Prontidão declarada: ~77%** para **piloto controlado acompanhado**, não para produção.

## Riscos bloqueadores (para produção)

Nenhum bloqueador **absoluto** para piloto **acompanhado pelo César** se:

1. Tokens reais forem configurados  
2. Uma única instância  
3. Wi-Fi estável  
4. Sem expectativa de offline total / multi-loja  

Bloqueadores se ignorados:

- Dois processos no mesmo store  
- Tokens `CHANGE_ME` em operação real  
- Tratar FileUnitOfWork como banco de produção  

## Riscos aceitáveis no piloto

- Offline parcial  
- HTTP sem TLS na LAN  
- Login via token/bootstrap  
- MapLibre experimental desligado  
- Sem Copiloto / shell  

## O que foi implementado neste gate

- Checkpoint visual + EXPERIÊNCIA CONFIRMADA  
- `PilotApplicationFacade` + FileUnitOfWork  
- `entregas_pilot_server` (banner piloto, sem demo seed, backup API)  
- Tokens / papéis mínimos  
- Backup versionado + restore com validação  
- Log operacional humano/técnico (`ops.log.jsonl`)  
- Testes `test:entregas:pilot-gate` (9)  
- Runbooks e limitações  

## O que foi testado (automatizado)

- Login / rejeição  
- Sessão obrigatória  
- Viagem + persistência reinício  
- command_id duplicado  
- Auth por papel  
- Backup + restore  
- iFood sem trip + duplicata  
- Suite domínio + UI pré-existente  

## O que permanece futuro / pendente

- Validação física Android na Wi-Fi da unidade (César)  
- Offline com fila durable pós-kill do browser  
- Formulário de login dedicado (sem console)  
- TLS  
- Multi-instância / DB  
- GPS prod · atribuição auto · Copiloto · shell  

## Evidências

| Tipo | Onde |
|---|---|
| Backup/restore | `run-pilot-gate-tests` + `pilot-backup.ts` |
| Offline | parcial — `PILOT_LIMITATIONS.md` |
| Celular | procedimento no runbook; **não** executado neste ambiente CI |
| Capturas UX | `capturas-ifood-final/`, `capturas-redesign/` |
| Testes | `npm run test:entregas:pilot-gate`, `npm run test:entregas` |

## Recomendação objetiva

# PILOTO AUTORIZADO (CONTROLADO)

**Com condições:**

1. Uso **acompanhado** pelo César  
2. **Uma** unidade · **uma** instância  
3. Tokens trocados · config piloto  
4. Sem GPS · sem multi-unidade · sem Copiloto  
5. Offline tratado como **melhor esforço** na Wi-Fi da loja  
6. Backup diário verificado  
7. **Não** iniciar operação real sem autorização expressa adicional do César para “ligar dados reais”  

### O que esta recomendação **não** é

- Não é go-live de produção  
- Não é push/deploy  
- Não libera equipe sem o César  
- Não esconde limitações do FileUnitOfWork  

---

## PARADA OBRIGATÓRIA

Gate de prontidão **documentado e instrumentado**.  

**Não** iniciar piloto real com dados da loja nesta entrega.  
**Não** push · **Não** deploy.  

Aguardar autorização expressa do César.
