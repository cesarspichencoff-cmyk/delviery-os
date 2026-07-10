# Arquitetura Pré-Loja — V0

> Fase 1 do programa Plataforma Pré-Loja. Branch `feature/preloja-fable`, base `a441bc7`.
> Desenho do que as Fases 2-7 constroem. **Nada aqui está implementado ainda.** Princípio único:
> tudo que não depende da loja fica pronto e testado; a inspeção real só escolhe e valida os dois
> adaptadores reais (Epson TM-T20X e Gestor iFood), que NÃO fazem parte deste programa.

---

## 1. Visão geral

```
                       ┌───────────────────────────────────────────────┐
                       │              ADAPTADORES (plugáveis)          │
                       │                                               │
  [FUTURO, pós-loja]   │  epsonFilaImpressao()   gestorIFoodStatus()   │  ← NÃO construídos aqui
                       │  ────────────────────   ──────────────────    │
  [ESTE programa]      │  simuladorComanda()     simuladorStatus()     │  ← Fase 3
                       └───────────────┬───────────────┬───────────────┘
                                       │ eventos       │ eventos
                                       ▼               ▼
                       ┌───────────────────────────────────────────────┐
                       │            src/live/ — NÚCLEO (Fase 2)        │
                       │                                               │
                       │  contrato → validação → normalização →        │
                       │  deduplicação → consolidação → persistência   │
                       │  (JSONL append-only) → snapshot → qualidade   │
                       └───────────────────┬───────────────────────────┘
                                           │ snapshot {NIGHT, rows, qualidade}
                                           ▼
                       ┌───────────────────────────────────────────────┐
                       │  CÉREBRO (intocado): motor.js + decisao.js    │
                       │  MOTOR.step() · DECISAO.decidir({active})     │
                       └───────────────────┬───────────────────────────┘
                                           ▼
                       ┌───────────────────────────────────────────────┐
                       │  app-v1 (Fase 4, por flag) — Calmo/Ambiente/  │
                       │  Foco/Mapa/Pressão/Sinais, mesmos de hoje     │
                       └───────────────────────────────────────────────┘

  Transversais: flags (Fase 4/6) · offline/recuperação (Fase 5) ·
  embalagens V1 (Fase 6, módulo isolado por flag) · Windows/sombra (Fase 7)
```

O núcleo nunca sabe QUAL adaptador o alimenta — só recebe eventos no contrato. Trocar simulador por
adaptador real (pós-inspeção) não muda uma linha do núcleo: esse é o critério de pronto do programa.

## 2. Layout de diretórios (a criar nas fases)

```
src/live/                      Fase 2 — núcleo (CommonJS, mesmo padrão do repo)
  contrato.js                  tipos/validador dos eventos (schema por código, sem lib)
  normalizar.js                texto/idempotência de campos (reusa espírito de _norm do motor)
  dedup.js                     chaves por fonte + idempotência de replay
  consolidar.js                casamento comanda×status pelo código iFood; parciais explícitos
  persistir.js                 JSONL append-only + leitura tolerante a linha truncada
  snapshot.js                  estado atual {NIGHT, rows, qualidade} reconstruível do log
  qualidade.js                 saúde das fontes, idade do dado, contadores de incerteza
  __tests__/*.test.js          node:test nativo (zero dependência)
tools/live/                    Fase 3 — simuladores e cenários
tools/windows/                 Fase 7 — inicialização, healthcheck, sombra, rollback
src/embalagens/                Fase 6 — motor de embalagens V1 isolado por flag
docs/preloja/                  documentação do programa (esta pasta)
data/live/                     runtime real/simulado — FORA do Git (linha nova no .gitignore)
```

## 3. Contrato de eventos (formalizado na Fase 2; forma prevista)

Envelope comum — toda entrada no núcleo é um evento:

```json
{
  "tipo": "comanda_impressa | status_ifood | pedido_cancelado | pedido_reimpresso |
           pedido_alterado | fonte_conectada | fonte_desconectada | pedido_vivo",
  "fonte": "sim_comanda | sim_status | (futuro: epson_fila | gestor_ifood)",
  "recebido_em": "ISO-8601 local",
  "dados": { }
}
```

Regras invioláveis do contrato:
- **Nunca inventar dado**: campo não observado = ausente/`null`, jamais preenchido por padrão.
- **Nunca nome de cliente como chave** (chaves: `pedido_interno` para comanda; código iFood + dia
  para status; casamento pelo código iFood).
- **Toda incerteza explícita**: o consolidado carrega `parcial`, `incerto{...}` e `casamento`
  (como as fontes foram unidas — por qual chave, com que confiança).
- **Pedido parcial nunca parece completo**: sem itens → não alimenta praça; sem status → tempo
  marcado "aguardando fonte".
- **Snapshot é derivado**: reconstruível 100% do log de eventos; derivado nunca vira evento.

Saída do núcleo (o que a interface/motor consomem):

```json
{
  "gerado_em": "...", "modo": "simulacao | vivo",
  "NIGHT": [ { "id", "curto", "r", "p", "s", "e", "c" } ],
  "rows":  [ { "pedido_id", "item_nome", "quantidade", "observacao" } ],
  "qualidade": {
    "fontes": { "comanda": {"estado","ultimo_evento_em"}, "status": {...} },
    "pedidos_parciais": 0, "duplicatas_ignoradas": 0, "reimpressos": 0,
    "linhas_invalidas": 0, "idade_do_dado_s": 0
  }
}
```

`NIGHT`/`rows` são **exatamente** o shape que `gerar_janela_v1.js` já produz e que o cérebro já
consome — nenhuma mudança no motor, nenhuma no contrato cognitivo.

## 4. Feature flags (Fase 4 e 6)

Um único módulo de configuração (ex.: `src/live/config.js`) lê variáveis de ambiente e as expõe ao
Node e — via endpoint/arquivo de config servido pelo `servir_v1` estendido — ao navegador:

- `DELIVERYOS_LIVE_SIM=false` (padrão) — desligada: `app-v1` continua carregando o JSON histórico,
  comportamento byte-idêntico ao de hoje; ligada: `app-v1` consome o snapshot vivo simulado por
  poll (fetch periódico), com os estados técnicos discretos no rodapé (simulação / fonte parcial /
  fonte desconectada / último dado confiável) — nunca um estado cognitivo novo.
- `DELIVERYOS_EMBALAGENS_V1=false` (padrão) — desligada: a classificação visual V0 atual do app-v1
  permanece intocada; ligada: os Sinais de Fluxo passam a consultar o módulo `src/embalagens/`
  (saída com `resultado, regra, motivo, confianca, pendencia`).

Rollback de comportamento = desligar flag. Sem rebuild, sem redeploy.

## 5. Resiliência e offline (Fase 5 — regras de projeto)

- Snapshot sempre escrito com carimbo; a interface sempre mostra idade do dado quando > limiar.
- Fonte cai → `fonte_desconectada` → qualidade rebaixa a confiança dos campos daquela fonte;
  comanda local segue valendo sem internet; status congela como "último dado confiável".
- Confiança insuficiente → o sistema **continua observando** e **para de recomendar ação**
  (o mecanismo é o já existente: confiança por fonte no cérebro; nenhum mecanismo novo).
- Reinício → replay do log do dia; idempotência por construção (mesmas linhas ⇒ mesmo snapshot).
- Escrita atômica por linha; leitura ignora (e conta) linha final truncada.

## 6. Motor de embalagens V1 (Fase 6 — isolado)

Transcrição fiel de `docs/Logica_Embalagens_DeliveryOS_V0.md` em módulo puro
(entrada: itens classificados por categoria; saída: caixas/sacolas/sinais), com:
- Tabela de categorias e caixas COMO DADOS (não ifs espalhados) — regra por categoria, não sabor.
- Alias só da tabela validada; **nome desconhecido ⇒ `resultado: incerto` + `pendencia`**, nunca
  regex ampla, nunca adivinhação.
- As 8 pendências do César (§15 do doc de embalagens) mapeadas: cada uma que estiver aberta gera
  `pendencia` na saída correspondente.
- Testes unitários por regra de caixa e por regra de sacola (a tabela do documento vira a tabela de
  casos de teste).

## 7. Windows e modo sombra (Fase 7 — preparação, não instalação)

`tools/windows/`: scripts de inicialização manual (`iniciar.cmd`/`.ps1`), healthcheck (Node
presente? porta livre? diretório runtime gravável?), pausa, sombra (roda e grava sem servir tela),
parada segura, rollback (desligar flags + parar processo; dados preservados), remoção documentada.
Sem serviço definitivo, sem instalação automática, sem exigir administrador (firewall é o único
ponto que pode exigir — documentado com justificativa, decisão do César na hora).

## 8. O que este programa NÃO constrói (fronteira explícita)

- Adaptador real da fila de impressão da Epson TM-T20X (pós-inspeção).
- Adaptador real do Gestor iFood (pós-inspeção; Modelo A/B/C/D indefinido).
- Serviço do Windows definitivo; instalador.
- Nuvem, banco remoto, login, financeiro, automação de ações no iFood, scraper real.
- Qualquer mudança em `motor.js`, `decisao.js`, seed, cardápio, dados históricos, baselines,
  score, confiança, candidatos.
