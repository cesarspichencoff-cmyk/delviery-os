# Taxonomia de Exceções de Rua — Entregas V0.1

| Status | **Fechado** para protótipo V0.1 |
|---|---|
| Princípio | Poucas categorias acionáveis; sem dezenas de labels |
| Objeto | Cada exceção gera **Attempt** e/ou **DeliveryIncident** (contrato V0.1) |

---

## 1. Catálogo (10 tipos)

| Código | Nome |
|---|---|
| `E01` | Cliente não atende |
| `E02` | Endereço incorreto ou incompleto |
| `E03` | Dificuldade de acesso |
| `E04` | Cliente pediu espera |
| `E05` | Entrega recusada |
| `E06` | Pedido ou embalagem avariados |
| `E07` | Volume divergente |
| `E08` | Problema de segurança |
| `E09` | Retorno necessário (genérico / residual) |
| `E10` | Outro motivo |

---

## 2. Definição por tipo

### E01 — Cliente não atende

| Campo | Definição |
|---|---|
| **Quando usar** | Chegou / tentou contato; cliente não responde no tempo operacional da tentativa |
| **Info mínima** | delivery_id · trip_id · stop · horário · método de contato (campainha/telefone/app — sem gravar áudio) |
| **Evidência possível** | Marca de chegada; nota curta; **não** exige foto de fachada |
| **Próxima ação** | Nova tentativa **ou** aguardar instrução LE **ou** seguir rota e retornar depois |
| **Quem decide** | Rider propõe; **LE** se segunda tentativa falhar ou política da loja exigir |
| **Abrir ocorrência** | Sim se ≥1 tentativa documentada sem sucesso e entrega ainda aberta |
| **Exigir retorno** | Não automático; se última parada e sem instrução, LE decide |
| **Resolvido quando** | Nova tentativa com confirmação de entrega **ou** reprogramação/cancelamento registrado **ou** retorno com volume à loja |

### E02 — Endereço incorreto ou incompleto

| Campo | Definição |
|---|---|
| **Quando usar** | Local não confere / incompleto impede entrega segura |
| **Info mínima** | O que está errado (1 linha); se chegou perto ou não |
| **Evidência possível** | Texto; opcional foto de número (sem rosto de terceiros) |
| **Próxima ação** | Contatar loja/LE para correção; **não** forçar entrega em local duvidoso |
| **Quem decide** | LE/expedição corrige ref; rider não “inventa” endereço |
| **Abrir ocorrência** | Sim |
| **Exigir retorno** | Se não houver correção a tempo na rota |
| **Resolvido quando** | Endereço atualizado + entrega confirmada **ou** retorno + reentrega |

### E03 — Dificuldade de acesso

| Campo | Definição |
|---|---|
| **Quando usar** | Portaria, elevador, chuva extrema, obra, condomínio sem liberação — **acesso físico**, não “cliente ausente” |
| **Info mínima** | Tipo de barreira (texto curto) |
| **Evidência possível** | Texto; sem gravação de segurança |
| **Próxima ação** | Aguardar liberação breve **ou** nova tentativa **ou** LE |
| **Quem decide** | Rider até tempo razoável; LE se bloquear a viagem |
| **Abrir ocorrência** | Se impedir conclusão da parada |
| **Exigir retorno** | Só se impossível na janela da viagem |
| **Resolvido quando** | Acesso obtido + entrega **ou** reprogramação |

### E04 — Cliente pediu espera

| Campo | Definição |
|---|---|
| **Quando usar** | Cliente pede para aguardar / voltar em X min **na mesma viagem** se viável |
| **Info mínima** | Tempo pedido (aprox.) |
| **Evidência possível** | Texto |
| **Próxima ação** | Esperar no local **ou** reordenar paradas e voltar |
| **Quem decide** | Rider se não quebrar resto da rota; senão LE |
| **Abrir ocorrência** | Opcional (log leve); obrigatória se virar não-entrega |
| **Exigir retorno** | Não |
| **Resolvido quando** | Entrega confirmada após espera/retorno ao stop **ou** vira E01/E05 |

### E05 — Entrega recusada

| Campo | Definição |
|---|---|
| **Quando usar** | Cliente recusa receber o pedido |
| **Info mínima** | Motivo em 1 linha (cliente/preço/item — sem julgamento) |
| **Evidência possível** | Texto; sem gravação confrontacional |
| **Próxima ação** | Não deixar pedido; **retorno à loja** com volumes |
| **Quem decide** | Fato do rider; LE trata reentrega/cancelamento depois |
| **Abrir ocorrência** | Sim |
| **Exigir retorno** | **Sim** (volumes voltam) |
| **Resolvido quando** | ReturnEvent + reconciliação de volumes na loja + decisão de reentrega/cancel (fora ou com reenvio) |

### E06 — Pedido ou embalagem avariados

| Campo | Definição |
|---|---|
| **Quando usar** | Dano visível antes ou no ato da entrega |
| **Info mínima** | O que está avariado (embalagem/item); se cliente aceitou ou não |
| **Evidência possível** | Foto **opcional** do produto/embalagem (sem pessoa); texto |
| **Próxima ação** | Se cliente recusa → E05+retorno; se aceita com ressalva → confirmação + ocorrência |
| **Quem decide** | Cliente no ato; LE se disputa |
| **Abrir ocorrência** | Sim |
| **Exigir retorno** | Se não entregue |
| **Resolvido quando** | Entrega com ressalva registrada **ou** retorno + tratativa loja |

### E07 — Volume divergente

| Campo | Definição |
|---|---|
| **Quando usar** | Contagem de volumes ≠ esperado em handoff, saída, entrega ou retorno |
| **Info mínima** | esperado vs contado; momento (pickup/saída/cliente/retorno) |
| **Evidência possível** | Contagem; nota; sem culpar pessoa na UI |
| **Próxima ação** | **Bloquear** saída se divergência na loja; na rua → ocorrência + LE; não “completar” em silêncio |
| **Quem decide** | Expedição/LE na loja; LE na divergência de rota |
| **Abrir ocorrência** | Sim se não resolvida na hora na loja |
| **Exigir retorno** | Se volume faltante na rua e política da loja exigir |
| **Resolvido quando** | Contagens batem em reconciliação **ou** divergência aceita com audit LE |

### E08 — Problema de segurança

| Campo | Definição |
|---|---|
| **Quando usar** | Risco a pessoa (assalto, agressão, local inseguro) — **prioridade humana** |
| **Info mínima** | “Segurança — não detalhar demais em campo aberto”; marcar código |
| **Evidência possível** | Mínima; **não** exigir foto de risco |
| **Próxima ação** | Sair do local; não insistir; LE/César conforme gravidade |
| **Quem decide** | Rider aborta parada; LE assume |
| **Abrir ocorrência** | Sim (sensível) |
| **Exigir retorno** | Sim, à loja, com volumes se seguro carregar |
| **Resolvido quando** | Rider seguro + trip tratada por LE; entrega **não** forçada |

### E09 — Retorno necessário (residual)

| Campo | Definição |
|---|---|
| **Quando usar** | Precisa voltar à loja e **não** se encaixa melhor em E01–E08 (ou múltiplos) |
| **Info mínima** | Motivo curto |
| **Próxima ação** | Ir para returning com volumes |
| **Quem decide** | Rider/LE |
| **Abrir ocorrência** | Sim se houver entrega incompleta |
| **Exigir retorno** | **Sim** |
| **Resolvido quando** | Return confirmed + reconciliação |

### E10 — Outro motivo

| Campo | Definição |
|---|---|
| **Quando usar** | Último recurso; texto obrigatório |
| **Info mínima** | Texto livre curto (operacional) |
| **Próxima ação** | LE classifica depois se recorrente |
| **Quem decide** | Rider registra; LE reclassifica se preciso |
| **Abrir ocorrência** | Sim |
| **Exigir retorno** | Conforme texto / LE |
| **Resolvido quando** | LE encerra ou reclassifica para tipo canônico |

---

## 3. Regras transversais

1. **Tentativa sem sucesso ≠ entrega encerrada.**  
2. Exceção **não** gera ranking nem score de rider.  
3. **E08** prevalece sobre “forçar entrega”.  
4. **E07** na loja **bloqueia** `ready_to_depart` até resolver ou override LE com audit.  
5. Foto nunca inclui rosto de cliente/terceiros por padrão.  
6. Tipos novos só com decisão de produto (não inventar no chão além de E10).

---

## 4. Mapa rápido: retorno obrigatório?

| Tipo | Retorno volumes à loja |
|---|---|
| E01 | Não automático |
| E02 | Se sem correção |
| E03 | Se impossível na janela |
| E04 | Não |
| E05 | **Sim** |
| E06 | Se não entregue |
| E07 | Conforme caso |
| E08 | **Sim** (se seguro) |
| E09 | **Sim** |
| E10 | LE |
