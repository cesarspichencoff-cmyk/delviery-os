# Arquitetura Pré-Loja — V0

> Fase 1 do programa Plataforma Pré-Loja. Branch `feature/preloja-fable`, base `a441bc7`.
> Desenho do que as Fases 2-8 constroem. **Nada aqui está implementado ainda.** Princípio único:
> tudo que não depende da loja fica pronto e testado; a inspeção real só escolhe e valida os dois
> adaptadores reais (Epson TM-T20X e Gestor iFood), que NÃO fazem parte deste programa.
>
> **CORRIGIDO PÓS-REVISÃO DO GROK:** revisado pela auditoria adversarial (F1-01 a F1-12) e
> corrigido pelo `docs/preloja/Addendum_PreRequisitos_Fase2_V0.md` — em conflito, **o Addendum
> vence**. Em especial: o envelope de eventos desta §3 foi SUBSTITUÍDO pelo envelope completo do
> Addendum §5; o gate de staleness (Addendum §4) é peça obrigatória do diagrama.

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
                       │  app-v1 (Fase 4, por flag) — superfície       │
                       │  MÍNIMA no vivo: Calmo/Ambiente/Foco + saúde  │
                       │  das fontes; Mapa/Pressão/Sinais só sob as    │
                       │  regras de fonte parcial do Addendum §10      │
                       └───────────────────────────────────────────────┘

  Transversais: gate de staleness (Addendum §4, ANTES de decidir) · flags (Fase 4) ·
  offline/recuperação (Fase 5) · Windows/sombra (Fase 7)
  [Fase 6 embalagens: SUSPENSA atrás do GATE EMBALAGENS VALIDADO PELO CÉSAR — fora do caminho crítico]
```

O núcleo nunca sabe QUAL adaptador o alimenta — só recebe eventos no contrato. Trocar simulador por
adaptador real (pós-inspeção) não muda uma linha do núcleo: esse é o critério de pronto do programa.

## 2. Layout de diretórios (a criar nas fases)

```
src/live/                      Fase 2 — núcleo (CommonJS, mesmo padrão do repo)
  contrato.js                  tipos/validador dos eventos (schema por código, sem lib)
  normalizar.js                texto/idempotência de campos (reusa espírito de _norm do motor)
  dedup.js                     chaves por fonte + idempotência de replay
  consolidar.js                casamento comanda×status com estados matched|partial|unmatched|conflict (Addendum §7) — o curto sozinho é insuficiente sob ambiguidade; parciais explícitos
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

## 3. Contrato de eventos — SUBSTITUÍDO pelo Addendum §5 (achado F1-02)

**O envelope simples que constava aqui (`{tipo, fonte, recebido_em, dados}`) foi considerado
incompleto pela revisão adversarial e está revogado.** O envelope obrigatório é o do
`Addendum_PreRequisitos_Fase2_V0.md` §5, com: `schema_version` · `event_id` · `event_type` ·
`source` · `source_event_id` · `idempotency_key` · `occurred_at`/`captured_at`/`received_at` ·
`correlation{ifood_short, pedido_interno, print_job_id}` · `payload` · `quality{completeness,
freshness, certainty, parsing_warnings, manual_correction_possible, manual_correction_detected,
digital_state_may_differ_from_paper, fields_missing, source_partial}`. Evento sem `schema_version`
não é aceito silenciosamente; versão desconhecida ⇒ rejeição ou quarentena. `pedido_vivo` tem
semântica definida no Addendum §5 (heartbeat de observação — "pedido continua visível na fonte").

Regras invioláveis do contrato (mantidas e ampliadas):
- **Nunca inventar dado**: campo não observado = ausente/`null`, jamais preenchido por padrão.
- **Nunca nome de cliente como chave**; telefone/endereço **não têm campo** no envelope.
- **Toda incerteza explícita**: o consolidado carrega `parcial`, `incerto{...}`, o **estado de
  casamento** (`matched | partial | unmatched | conflict` — Addendum §7) e como as fontes foram
  unidas (por qual chave).
- **Pedido parcial nunca parece completo**: sem itens → não alimenta praça; sem status → tempo
  marcado "aguardando fonte". **Pedido em `conflict` não vai ao motor.**
- **Snapshot é derivado**: reconstruível 100% do log de eventos; derivado nunca vira evento.
- **Adaptadores são somente leitura** (Addendum §11) — nenhum evento nasce de escrita na fonte.

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

## 5. Resiliência e offline (Fase 5 — regras de projeto) — CORRIGIDA pelo achado F1-01

- Snapshot sempre escrito com carimbo; a interface sempre mostra idade do dado quando > limiar.
- Fonte cai → `fonte_desconectada` → qualidade rebaixa a confiança dos campos daquela fonte;
  comanda local segue valendo sem internet; status congela como "último dado confiável".
- **Gate de staleness independente (Addendum §4) — mecanismo NOVO, obrigatório, aplicado ANTES do
  cálculo de recomendações.** Estados por fonte: `atual | atrasada | vencida | desconectada |
  desconhecida`; campos `occurred_at/captured_at/received_at/last_trusted_at/freshness_state/
  freshness_age_ms`; matriz de comportamento por combinação status×composição no Addendum.
  **A versão anterior desta seção atribuía a parada de recomendações ao `confComp` existente —
  isso estava errado** (o `confComp` não lê idade de fonte nem desconexão; jamais pararia uma
  recomendação por dado congelado). Limiares configuráveis, calibrados só na Fase Sombra.
- Reinício → replay do log do dia; idempotência por construção (mesmas linhas ⇒ mesmo snapshot).
- Escrita atômica por linha; leitura ignora (e conta) linha final truncada.

## 6. Motor de embalagens V1 (Fase 6 — SUSPENSA atrás de gate; achado F1-05)

**A Fase 6 está fora do caminho crítico do programa (F2→F3→F4→F5→F7→F8) e SUSPENSA até o
GATE EMBALAGENS VALIDADO PELO CÉSAR (Addendum §8)** — que exige as respostas das §15/§16 de
`docs/Logica_Embalagens_DeliveryOS_V0.md` e a matriz técnica, mais autorização separada. Ela não é
pré-requisito da fonte viva nem bloqueia o modo sombra. Quando (e se) autorizada, será a
transcrição fiel do documento oficial em módulo puro
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
- **Qualquer API de clique/interação com o Gestor iFood** (Addendum §11): somente leitura, nenhum
  clique em pronto/cancelar, nenhum chat, nenhum envio, nenhuma alteração de status, nenhuma
  captura de senha, nenhum cookie no Git, nenhuma chamada de escrita — nem "só para testar".
  Interação futura exige nova missão com autorização explícita.
- Serviço do Windows definitivo; instalador.
- Nuvem, banco remoto, login, financeiro, automação de ações no iFood, scraper real.
- Qualquer mudança em `motor.js`, `decisao.js`, seed, cardápio, dados históricos, baselines,
  score, confiança, candidatos.
