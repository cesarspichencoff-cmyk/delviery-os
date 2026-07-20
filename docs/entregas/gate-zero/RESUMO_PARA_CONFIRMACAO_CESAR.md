# RESUMO PARA CONFIRMAÇÃO — CÉSAR (V2)

| Campo | Valor |
|---|---|
| Pacote | **ENTREGAS_GATE_ZERO_PACOTE_REVISAO_CESAR_V2** |
| Data | 2026-07-20 |
| Processo Gate Zero | **Aprovado** |
| Núcleo da reconstrução | **Correto** (reconhecido na revisão) |
| Estrutura operacional | **CONFIRMADA** (César · 2026-07-20) · Gate Zero **encerrado** |
| Este V2 | Correções documentais finais pré-confirmação |
| Bloqueado | Plano técnico · fundação · domínio · banco · telas · migrations · GPS · código |

**Frase que desbloqueia o próximo gate:**

```text
ESTRUTURA OPERACIONAL CONFIRMADA
```

### Conteúdo do pacote V2 (somente markdown de revisão)

| # | Arquivo |
|---|---|
| 0 | `RESUMO_PARA_CONFIRMACAO_CESAR.md` (esta folha) |
| 1 | `VALIDACAO_ESTRUTURA_REAL_ENTREGAS.md` |
| 2 | `MAPA_CAMPOS_COMANDAS.md` |
| 3 | `MAPA_PLANILHA_MOTOBOY.md` |
| 4 | `MATRIZ_MENSAGENS_EVENTOS.md` |
| 5 | `AUDITORIA_APP_ENTREGAS_ANTERIOR.md` |
| 6 | **`DECISOES_PILOTO_RECOMENDADAS.md`** (novo) |

**Excluído:** `_tmp_*`, planilha bruta, fotos, exports WhatsApp, PII, conversas pessoais.

### Alterações V2 + esclarecimento iFood

1. Separação **motoboy da casa** (`Trip.courier_actor_id` COR) × ref. externa **só no Handoff**.  
2. Handoff: verificação obrigatória **pelo funcionário interno** (não “se souber”).  
3. Enumerações: **COR-ENTREGAS-V1 @ 1.0.3** + 6 regras preservadas.  
4. Adendo **DECISOES_PILOTO_RECOMENDADAS.md**.  
5. **Esclarecimento:** entregador iFood **não é usuário** do Entregas (sem cadastro/conta/app/Trip/GPS/rota/ranking/disponibilidade/confirmação ao cliente).  
6. UI: **EXPEDIÇÃO IFOOD** / **HANDOFF IFOOD** — foco no pedido, não em “Entregadores iFood”.

---

## 1. Como funciona hoje

**Pedido próprio**  
Comanda → separação → agrupamento manual de paradas → saída (grupo + form **IDA** até 5 blocos) → rota/exceções no WhatsApp → entrega frágil → form **VOLTA** → disponibilidade **inferida**.

**iFood**  
Sacola aguarda → courier **externo** → identificar/conferir/repassar → fim responsabilidade da loja. **Fora** da planilha Motoboy. **Não** é Trip da casa.

**Recuperação**  
Chat/bilateral, sem `occurrence_id` formal.

Base: **705** idas · **501** voltas · 23/03–12/07/2026 · multi-parada 526/155/23/1 (números **inalterados**).

---

## 2. O que está errado ou frágil hoje

Sem `trip_id`; pareamento por nome/ordem; SLA artificial possível; volta genérica; alterações só no chat; handoff iFood sem registro; ocorrência sem ciclo; disponibilidade inferida; painéis com janela fixa; protótipo anterior com handoff confuso.

---

## 3. O que será preservado

Dois fluxos (próprio × iFood); multi-pedido; comanda como artefato (reimpressão ≠ nova entrega); coordenação humana; confirmação humana de entrega; sem ranking/punição; COR como segurança/consistência; fontes reais como “como funciona hoje”.

---

## 4. O que será alterado no novo sistema

| Hoje | Proposto (após confirmação + auth código) |
|---|---|
| Form sem chave | `trip_id` + `Trip.courier_actor_id` (motoboy **casa**) |
| Paradas no form | Deliveries + eventos imutáveis; N variável; piloto teto config 5 |
| iFood invisível | **Handoff** com `external_courier_ref` + verificação + volumes |
| Chat = log | Eventos; WA só comunicação |
| Volta genérica | Retorno de viagem + status por entrega (regras COR) |
| Disponibilidade inferida | Estados explícitos; pausa/apoio vencem auto-disponível |

---

## 5. Quais decisões ainda dependem do César

1. Frase formal `ESTRUTURA OPERACIONAL CONFIRMADA`.  
2. As **19** decisões de `DECISOES_PILOTO_RECOMENDADAS.md` (aceitar / ajustar / rejeitar).  
3. Cobertura total dos layouts de comanda.  
4. Calibração futura de GPS/retorno no piloto (parâmetros, não reabrir COR).

---

## 6. Cinco paradas: planilha ou produto?

| | |
|---|---|
| **Planilha/formulário atual** | Hard limit **5** (fato). Observado até 4 na base. |
| **Produto / domínio** | Quantidade **variável** de paradas (proposta 1). |
| **Piloto** | Limite **configurável = 5** (proposta 2). |
| **Schema** | **Não** hardcoded (proposta 3). |

---

## 7. Retorno e disponibilidade (interpretação)

**Hoje:** form VOLTA + “voltando” no grupo; sem chave à ida; disponível inferido.

**COR (preservar):**  
- `trip_return_started` **não** exige `require_all_active_stops_resolved`.  
- **G3** pode criar `entrega_sem_confirmacao` ao entrar em `retornando`.  
- `require_all_active_stops_resolved` no **retorno automático/fechamento**.  
- Retorno automático **não** confirma entrega.  
- `entrega_sem_confirmacao` **não** bloqueia viagem.  
- `active=false` fora de **G1–G5**.  

**Piloto (proposta):** pausa / indisponivel / apoio_expedicao vencem auto-`disponivel`; ocorrência só bloqueia se `blocks_availability=true`.

---

## 8. Quem confirma o quê (proposta piloto + COR)

| Ato | Quem |
|---|---|
| **Handoff / Expedição iFood** | **Só funcionário interno** confirma pedido, courier verificado (método), volumes esperados/entregues, responsável, horário, exceção; courier **não** é usuário; **não** cria Trip |
| **Entrega ao cliente** | Motoboy da casa (`Trip.courier_actor_id`); GPS sozinho **não** basta |
| **Confirmação tardia** | Motoboy pode registrar (proposta 10) |
| Fila `entrega_sem_confirmacao` | **Líder de Delivery** (gerente backup) (proposta 9) |
| **Retorno normal** | Sistema sob condições cumulativas COR |
| **Fechamento manual de Trip** | **Só** líder de Delivery ou gerente (proposta 11) |
| **Fechamento de ocorrência** | Líder de Delivery ou gerente |
| **WhatsApp** | Nunca commit de estado |

---

## 9. Campos das comandas que entram no sistema

order_ref / barcode; printed_at; origem/canal se presente; nome display (mascarável); endereço/complemento/bairro/CEP/referência para rota; forma de pagamento / já pago online; itens e quantidades (conferência); total/taxa só conferência; layout; reprint anti-dup.

**Handoff:** comanda alimenta pedido e volumes **esperados**; conclusão exige atos de loja (ver §12 e MAPA).

---

## 10. Campos descartados (privacidade / falta de finalidade)

| Descartado / restrito | Motivo |
|---|---|
| Telefone completo em export/logs | PII |
| “Entregador” impresso → `Trip.courier_actor_id` | Zona Odhen; **não** é rider (proposta 17) |
| “Entregador” impresso → `external_courier_ref` | Não é verificação de courier iFood |
| Match só por nome+endereço | Homônimos / dup |
| Cancelamento só pela comanda | Fonte = Gestor iFood |
| Itens impressos = verdade absoluta da sacola | Correção a caneta possível |
| PII/WA bruto no repositório | Fora do pacote |
| Histórico 705/501 como eventos canônicos | Arquivo RO (proposta 15) |

---

## 11. Mensagens → eventos (nunca auto-estado)

“Saindo”, “voltando”, “não atende”, “troco”, “ifood chegou”, “leve mais um”, “pedido voltou”, “ufa valeu” → no máximo **sugestão**.  
**Nunca** alteram estado sozinhas (proposta 6).

---

## 12. iFood fora de Trip — courier **não** é usuário

| | Pedido próprio | iFood |
|---|---|---|
| Objeto | **Trip** + **Delivery** | **Handoff** (UI: **EXPEDIÇÃO IFOOD** / **HANDOFF IFOOD**) |
| Quem usa o módulo | Motoboy da casa + operação | **Só funcionários internos** |
| Entregador da plataforma | — | **Não** é usuário: sem cadastro, conta, app, disponibilidade, Trip, GPS, rota, ranking, acompanhamento, confirmação ao cliente |
| Dado do externo | — | Mínimo: `courier_verified` · `courier_verification_method` · ref. mascarada/código plataforma **se houver** — **sem** nome completo/documento obrigatórios |
| Quem confirma o repasse | — | Interno: pedido correto · verificação · volumes esperados e entregues · responsável · horário · exceção |
| Após `handoff_confirmed` | — | Responsabilidade física da loja **encerra**; sem Trip/GPS/rota; status posterior só **integração oficial iFood** (futura) |
| Foco da tela | Rota própria | **Pedido e conferência**, não “Entregadores iFood” |

**Removido:** “courier externo (se souber)” como desculpa para concluir sem verificação.

---

## Autoridade de enumerações

```text
Implementação futura → COR-ENTREGAS-V1 @ 1.0.3
```

Não criar enums a partir deste resumo. Detalhe de estados/eventos: COR + anexos.

---

## Checklist

- [ ] Resumo V2  
- [ ] VALIDACAO (seções 13–16 revisadas)  
- [ ] MAPA_CAMPOS_COMANDAS  
- [ ] DECISOES_PILOTO_RECOMENDADAS (1–19)  
- [ ] Planilha / mensagens / auditoria app (inalteradas em números; contexto)  
- [ ] `ESTRUTURA OPERACIONAL CONFIRMADA` **ou** lista de correções  

| Item | Status |
|---|---|
| Processo Gate Zero | Aprovado |
| Núcleo reconstrução | Correto |
| Estrutura operacional | **Não confirmada** |
| Código / plano técnico | **Não iniciar** |

---

*RESUMO V2 · Gate Zero · ESTRUTURA OPERACIONAL CONFIRMADA · encerrado · 2026-07-20*
