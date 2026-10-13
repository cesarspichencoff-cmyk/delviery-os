# DeliveryOS — pré-ensaio Android sintético, GPS desligado

**13/10/2026 · Estado: ROTEIRO PREPARADO, NÃO EXECUTADO NO APARELHO.**

## Pré-condições verificadas
- Build candidata em `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3` na PR #108 (governança Q-019); PR #106 segue DRAFT/HOLD, **sem merge**.
- Testes de ponte 30/30, Android estrutural 43/43, native+consent 79/79, fonte 5/5, termo sintético 10/10; **são provas de laboratório**.
- ADB está instalado no Foxxy, mas `adb devices -l` não listou aparelhos. Não existe prova física.
- Capturas e [confronto visual](DELIVERYOS_CONFRONTO_VISUAL_E_PRE_ENSAIO_2026-10-13.md) disponíveis, sem aceite final do usuário.

## Regras de isolamento inegociáveis

1. Somente Foxxy e dispositivo explicitamente destinado a testes, em ambiente separado da operação. **Não tocar CAIXA_MOOCA**, produção, gateways, fontes PostgreSQL reais, Neemo/Teknisa ou iFood LIVE.
2. `GPS OFF` antes e durante toda a rodada: configuração da aplicação e permissão do SO, ambas conferidas; nenhum listener/service de localização nem notificação de rastreamento ativa; não criar coordenadas fictícias com aparência real.
3. `source_mode=simulated`, tenant/unidade laboratório, identidades sem PII, pedido sintético inequívoco, recibos e telas identificados como DEMO; recusar boot se modo indefinido; sem credencial operacional.
4. Sem pagamentos, impressão, QR real, push ao motoboy ou envio de pedidos. Não ativar captura nativa sem termo e consentimento reais em missão posterior autorizada.
5. No Android, manter `pilot` e `production` distintos. Nenhum APK é instalado pelo simples fato de este documento existir.

## Roteiro e critérios de prova

| Etapa | Ação sintética permitida | Aceite observável |
|---|---|---|
| P0 | Reconhecer Android por `adb devices -l`; registrar modelo, Android e origem do APK **sem alterar aparelho** | Um dispositivo de teste autorizado aparece; se não, STOP |
| P1 | Exibir login sintético e escopo de unidade | Sessão de teste, sem credenciais reais |
| P2 | Confirmar GPS desligado e consentimento/captura não habilitados | Nenhum evento geográfico nem notificação de serviço |
| P3 | Criar Trip de laboratório de **motoboy da casa** com pedido SIMULADO | Mesmo `trip_id`, unidade, modo e procedência nos recibos |
| P4 | Saída e fase em rota declaradas manualmente, sem geolocalização | Sequência de eventos consistente, sem confirmação automática |
| P5 | Cortar conectividade de laboratório; registrar evento; restaurar rede | Fila offline conservada e retransmissão idempotente; não declarar concluído antes da prova |
| P6 | Confirmar entrega manual sintética e retorno | Trip terminal, evento deduplicado, captura GPS continua OFF |
| P7 | Abrir Entregas e Copiloto Shadow sobre o **mesmo escopo de laboratório** | Mesma identidade de evento, mesmo modo `simulated`, nenhum texto LIVE falso |
| P8 | Reiniciar UI e observar retomada da leitura | Sem duplicar Trip ou produzir lacunas escondidas |

**Parar e reportar FAIL/UNKNOWN** diante de PII, GPS, fonte sem procedência, login real, solicitação de permissão do Android, serviço persistente, ausência de recibo, perda de evento ou qualquer outro resultado não verificável. Nenhuma etapa gera automaticamente autorização para pedido real.

## Pendente de ambiente

- Conectar **um Android de piloto** ao Foxxy e confirmar que o aparelho é próprio de testes.
- Comparar screenshots runtime com referências e registrar veredito humano.
- Substituir a suíte de mutação travada por execução supervisionada com rollback e timeout antes de reavaliá-la.

O ensaio com **um pedido próprio Neemo/Teknisa supervisionado e consentido** será missão posterior e separada. Courier externo iFood permanece handoff, não Trip interna.
