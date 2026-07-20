# DECISÕES DE PILOTO RECOMENDADAS

| Campo | Valor |
|---|---|
| Documento | `DECISOES_PILOTO_RECOMENDADAS.md` |
| Gate | Zero — adendo pré-confirmação |
| Data | 2026-07-20 |
| Status | **Proposta** a confirmar pelo César (não implementada; não altera o COR) |
| Autoridade de enumerações | **COR-ENTREGAS-V1 @ 1.0.3** exclusivamente |
| Pacote | `ENTREGAS_GATE_ZERO_PACOTE_REVISAO_CESAR_V2` |

> Estas decisões **não** reabrem o COR.  
> Parametrizam o piloto e fecham ambiguidades de operação.  
> Só valem após `ESTRUTURA OPERACIONAL CONFIRMADA` (e, para código, autorização posterior).

---

## Atores e papéis (sem ambiguidade)

| Papel | Campo canônico COR 1.0.3 | Objeto | Usuário do módulo Entregas? | Proibido |
|---|---|---|---|---|
| Motoboy da casa (rider) | `Trip.courier_actor_id` | Trip | **Sim** (quando houver app/piloto) | Usar para courier iFood |
| Courier externo iFood | `external_courier_ref` (mínimo) | **Somente Handoff** | **NÃO** | Conta, app, Trip, GPS, rota, ranking, disponibilidade, confirmação ao cliente |
| Conferência / expedição (interno) | `conference_actor` | Handoff | **Sim** (funcionário autorizado) | — |
| Quem repassa fisicamente (interno) | `handoff_actor` | Handoff | **Sim** (pode ser o mesmo papel) | — |

**Leitura humana:** “rider da casa” = `Trip.courier_actor_id` do COR.  
**Nunca** um mesmo conceito técnico para os dois papéis.

### Entregador iFood — fora do módulo como usuário

O entregador do iFood **não** será usuário do módulo Entregas. **Não criar** para ele:

- cadastro operacional; conta; aplicativo mobile;  
- estado de disponibilidade; Trip; GPS; rota;  
- ranking; acompanhamento individual;  
- confirmação de entrega ao cliente.

A referência existe **exclusivamente** no agregado **Handoff**, para registrar o **repasse físico na loja**.

**Quem confirma o Handoff:** funcionário **interno autorizado** (pedido correto; courier verificado por método operacional; volumes esperados e entregues; responsável da conferência; horário do repasse; exceção se houver).

**Dado mínimo do externo (sem PII completa):** `courier_verified` · `courier_verification_method` · referência mascarada ou código da plataforma **quando disponível**. **Não** exigir nome completo, documento ou dado pessoal.

**Após `handoff_confirmed`:** não criar Trip; não GPS/rota; não confirmação no app do motoboy da casa; **encerra responsabilidade física da loja**; status posterior só via **futura integração oficial iFood**.

**UI:** não chamar “Entregadores iFood”. Usar **EXPEDIÇÃO IFOOD** ou **HANDOFF IFOOD**. Foco = **pedido e conferência**, não controle do entregador externo.

---

## Lista de decisões recomendadas (1–19)

| # | Decisão recomendada | Tipo |
|---|---|---|
| **1** | O domínio **suporta quantidade variável de paradas** (não “sempre 5”). | Produto / domínio |
| **2** | O **piloto inicia com limite configurável de cinco** paradas (espelha a planilha atual). | Piloto |
| **3** | O limite **não pode ser hardcoded no schema** (config/política de piloto). | Técnico (pós-auth) |
| **4** | Formulários **IDA/VOLTA convivem temporariamente** como contingência. | Piloto |
| **5** | O **aplicativo é a fonte operacional principal** durante o piloto. | Piloto |
| **6** | **WhatsApp** continua para comunicação; **nunca** como commit automático de estado. | Operação |
| **7** | **Volumes próprios** são registrados e conferidos; divergência resolve com **humano**. | Operação |
| **8** | **Volumes iFood são obrigatórios** para **concluir** Handoff (ato do **interno**; courier não é usuário). | Handoff / Expedição iFood |
| **8b** | Courier iFood **não** tem cadastro, conta, app, disponibilidade, Trip, GPS, rota, ranking nem confirmação de entrega no Entregas; UI = **EXPEDIÇÃO IFOOD** / **HANDOFF IFOOD**. | Escopo / UX |
| **9** | Fila `entrega_sem_confirmacao` pertence ao **líder de Delivery**, com **gerente** como backup. | Papéis |
| **10** | **Motoboy pode registrar confirmação tardia** de entrega. | Entrega |
| **11** | **Fechamento manual de Trip** autorizado apenas para **líder de Delivery** ou **gerente**. | Papéis |
| **12** | **Parâmetros GPS e retorno** são configuráveis e serão **calibrados no piloto**. | Piloto / COR políticas |
| **13** | **Pausa, indisponibilidade e `apoio_expedicao` vencem** disponibilidade automática. | Motoboy |
| **14** | Ocorrência só bloqueia disponibilidade quando `blocks_availability=true`. | Ocorrência |
| **15** | Histórico **705/501** permanece **arquivo somente leitura**; **não** vira eventos canônicos. | Dados |
| **16** | **Suprimentos** ficam **fora** do domínio Entregas. | Escopo |
| **17** | Campo **Entregador** da comanda **não atribui** motoboy da casa. | Comanda |
| **18** | **Layout desconhecido** de comanda exige **conferência manual**. | Comanda |
| **19** | Telefone, endereço e localização: **mínimo necessário**, controle de acesso e **retenção definida**. | Privacidade |

---

## Detalhe operacional das decisões críticas

### Paradas (1–3)

- Planilha atual: hard limit de 5 no formulário (fato observado).  
- Produto: N variável; piloto com config `max_stops_pilot = 5`.  
- Schema futuro: sem `CHECK` rígido “=5”; limite via política versionada.

### Contingência forms + app (4–6)

- App = fonte principal de ida/volta/trip no piloto.  
- Forms Google = backup se app/offline falhar; reconciliação humana.  
- Mensagem WA = comunicação; sugestão de evento no máximo; **zero** auto-commit.

### Volumes (7–8)

- Próprio: registrar e conferir; divergência não inventa verdade — humano decide.  
- iFood/Handoff: sem volumes esperados **e** conferidos + verificação de courier → handoff **não** conclui (pendente/exceção).

### Papéis de confirmação (9–11)

| Ato | Quem (proposta piloto) |
|---|---|
| Fila `entrega_sem_confirmacao` | Líder de Delivery (gerente backup) |
| Confirmação tardia de entrega | Motoboy (quando aplicável) |
| Fechamento manual de Trip | Só líder de Delivery ou gerente |
| Fechamento de ocorrência | Líder de Delivery ou gerente (COR) |
| Handoff concluído | Exige verificação de courier + volumes + atores COR |

### Disponibilidade (13–14)

- Após retorno normal: `disponivel` automático **salvo** pausa / indisponivel / apoio_expedicao.  
- Ocorrência aberta **não** bloqueia por padrão; só com `blocks_availability=true`.

### Dados e escopo (15–19)

- 705/501 = arquivo morto RO.  
- Suprimentos ≠ Entregas.  
- “Entregador” impresso ≠ `Trip.courier_actor_id`.  
- Layout desconhecido → fila manual.  
- PII: mínimo, ACL, retenção.

---

## Handoff / Expedição iFood — verificação (adendo)

Sem verificação funcional do courier **pelo funcionário interno**, o Handoff permanece **pendente** ou em **exceção**.  
O courier **não** opera o app; quem registra é o **interno autorizado**.

| Conceito | Quem age | Obrigatório para concluir? | PII |
|---|---|---|---|
| Pedido correto identificado | Interno | **sim** | order ref operacional |
| `courier_verified` | Interno confirma | **sim** (`true`) | sem nome/doc obrigatório |
| `courier_verification_method` | Interno | **sim** | método operacional (ex.: código app, visual crachá plataforma) |
| Ref. mascarada / código plataforma | Se disponível | opcional como ref. | **mínimo**; sem nome completo/documento exigidos |
| Volumes esperados | Interno + artefato | **sim** (decisão 8) | — |
| Volumes entregues/conferidos | Interno | **sim** | — |
| Responsável interno conferência | `conference_actor` | **sim** | actor interno |
| Horário do repasse | sistema + interno | **sim** (`handoff_at` / confirmed) | — |
| Exceção | Interno | quando houver | — |

**Proibido:** cadastro/conta/app/disponibilidade/Trip/GPS/rota/ranking do courier iFood.  
**Proibido:** concluir só com “chegou alguém” no WhatsApp.  
**Proibido:** criar `trip_id` a partir do Handoff (COR).  
**Após confirmado:** responsabilidade física da loja **encerra**; sem acompanhamento de rota do courier no Entregas.

---

## Enumerações e transições

A implementação **não** cria enumerações a partir deste adendo nem dos resumos do Gate Zero.

Fonte exclusiva:

```text
COR-ENTREGAS-V1 @ 1.0.3
```

incluindo matriz de estados/eventos/transições, políticas de piloto e cenários A01–A39.

### Regras COR preservadas obrigatoriamente

1. `trip_return_started` **não** exige `require_all_active_stops_resolved`.  
2. **G3** pode criar `entrega_sem_confirmacao` ao entrar em `retornando`.  
3. `require_all_active_stops_resolved` pertence ao **retorno automático / fechamento**, não ao início do retorno.  
4. `active=false` exclui Delivery de **G1, G2, G3, G4 e G5**.  
5. Retorno automático **não** confirma entrega.  
6. `entrega_sem_confirmacao` **não** bloqueia viagem.

---

## Como confirmar

- Marcar cada decisão 1–19 como aceita, aceita com alteração, ou rejeitada.  
- Depois da revisão integral do pacote V2, emitir:

```text
ESTRUTURA OPERACIONAL CONFIRMADA
```

---

*DECISOES_PILOTO_RECOMENDADAS · proposta · sem código · 2026-07-20*
