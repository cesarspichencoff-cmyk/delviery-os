# Adendo técnico de governança — GPS no piloto V1

| Campo | Valor |
|---|---|
| Documento | Adendo ao `COR-ENTREGAS-V1@1.0.3` |
| Tipo | **Decisão de governança do produto** — não é parecer jurídico |
| Emitido por | César — responsável pelo produto e pela operação do TATÁ |
| Data | 2026-07-25 |
| Efeito | Supera a restrição de escopo do COR §4 quanto a GPS |
| Status | **Vigente** |

> Este documento registra uma decisão de produto. Não é parecer jurídico, não
> declara conformidade legal e não substitui avaliação jurídica. O tema
> jurídico não é reaberto nem encerrado aqui — permanece fora do escopo
> técnico deste adendo.

## 1. Decisão registrada

O responsável pelo produto decidiu expressamente:

1. O TATÁ Entregas V1 **deve incluir GPS real e funcional**.
2. O desenvolvimento **não aguarda** novo parecer jurídico.
3. Os contratos aplicáveis aos motoboys **já contêm previsão de rastreamento
   e controle durante a atividade de entrega**.
4. Ficam autorizados: implementação, teste em aparelhos reais e piloto
   operacional controlado.
5. A restrição do `COR-ENTREGAS-V1@1.0.3` que colocava GPS fora de escopo
   (§4) ou condicionado a parecer (§24d) está **superada por esta decisão
   posterior** do responsável pelo produto.
6. Esta decisão **não autoriza** GPS permanente, rastreamento fora da viagem,
   ranking automático ou punição automática.

## 2. O que muda no contrato

| COR 1.0.3 | Situação após este adendo |
|---|---|
| §4 — "GPS em produção" fora de escopo | **Superado** para o piloto V1 |
| §24(d) — implementação após parecer jurídico | **Superado** por decisão de produto |
| §3 §13 §21.1 §22 §27 — regras de uso do GPS | **Mantidos integralmente e agora exigíveis em código** |

As regras de uso **não** foram afrouxadas. O que muda é apenas a autorização
para implementar; todo o rigor operacional do COR continua obrigatório e passa
a ser verificável por teste automatizado.

## 3. Escopo autorizado

**GPS existe somente durante viagem ativa** (`em_rota`, `retornando`).
Finalidade única: rastreabilidade operacional da viagem — localizar a entrega
em andamento, detectar chegada, detectar retorno com segurança e preservar o
histórico da rota para auditoria da operação.

## 4. Proibições que permanecem (COR §21.1, §22, §27.18)

1. GPS permanente ou fora de viagem ativa.
2. Captura com o motoboy em pausa, indisponível ou fora do expediente.
3. Ranking de velocidade, rota ou produtividade individual.
4. Punição automática ou atribuição automática de culpa.
5. Avaliação de desempenho individual automatizada.
6. GPS isolado como prova de entrega, pagamento, recebimento ou identidade
   do cliente.
7. Ausência de sinal tratada como prova de conduta inadequada.
8. Coordenadas em logs comuns.
9. Exposição de rota a papel não autorizado.
10. Localização real de funcionário ou cliente em fixture, teste ou demo.

## 5. Feature flags (default seguro)

Configuração central, validada e observável. Ativação e **rollback sem
alterar código**.

| Flag | Default | Efeito |
|---|---|---|
| `gps_capture_enabled` | `false` | Habilita captura durante viagem ativa |
| `gps_background_enabled` | `false` | Só pode ligar se o runtime provar suporte |
| `gps_map_enabled` | `false` | Mapa e rota no console |
| `gps_return_detection_enabled` | `false` | Retorno automático por evidência real |
| `offline_queue_enabled` | `false` | Fila offline persistente no dispositivo |
| `persistent_outbox_enabled` | `false` | Outbox sobrevive a reinício |

## 6. Retenção

Configurável e documentada (`gps_retention_days`, default de piloto: 30 dias).
Expurgo por viagem encerrada. Coordenadas nunca saem para log comum; acesso
administrativo à rota é auditável por evento próprio.

## 7. Papéis autorizados a ver rota

| Papel | Localização atual | Rota histórica |
|---|---|---|
| `motoboy_interno` | própria viagem | própria viagem |
| `operador_expedicao` | sim (viagem ativa) | sim |
| `lider_delivery` / `gerente` | sim | sim + auditoria |
| Qualquer outro | não | não |

## 8. Critérios do piloto controlado

Antes de operar com pessoas reais: fundação verde; captura só com viagem
ativa provada; parada efetiva do watcher provada; freshness explícito na
tela; retorno automático só com evidência real cumulativa; offline com
reenvio idempotente; teste em aparelho real executado e registrado —
cenários não executados declarados como pendentes, nunca presumidos.

## 9. Rollback

Desligar as flags restaura o comportamento anterior sem alterar código. A
branch é isolada, sem merge. Nenhum dado de viagem é destruído por rollback.

## 10. Rastreabilidade desta decisão

Registrada neste adendo, versionada no repositório, referenciada pelos
módulos de GPS em código. O COR 1.0.3 permanece íntegro — este documento o
emenda, não o reescreve.
