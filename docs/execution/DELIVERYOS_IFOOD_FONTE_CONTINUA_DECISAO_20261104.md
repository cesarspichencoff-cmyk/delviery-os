# Delivery OS Itaim — Decisão de aquisição contínua de pedidos
**Data da revisão: 04/11/2026. Estado: análise de viabilidade, sem ativação operacional.**

## 1. Problema comprovado
O sensor do Gestor V3, em PR #137, passou em 40/40 testes sintéticos no Edge (Actions #41924294652). A interface real do Itaim, segundo relato do operador, contém cartões de grupos e detalhes individualizados por pedido. Porém ainda não há uma leitura técnica autenticada de pedido completo. O Reader instalado lê arquivos locais de controle, não constitui prova de pedidos vivos iFood. Não inferir cobertura, status de produção ou zero pedidos.

**Objetivo de fonte:** pedido com UUID durável, loja autorizada, número exibido, evento/revisão, produto com identificador e quantidade, complementos/observações e timestamps confiáveis. Somar por praça somente quando versão/escopo/proveniência forem comprovados.

## 2. Caminhos de aquisição — veredito
| Caminho | O que resolve | Limite atual | Decisão |
|---|---|---|---|
| Edge dedicado já autenticado, leitura passiva de um detalhe aberto | Primeiro vínculo concreto número → itens → quantidades, sem novo sistema | Acesso DOM sem console não comprovado; grupos fechados podem não estar renderizados; instância de CDP não demonstrada | **Rota A de prova mínima, em HOLD até mecanismo silencioso e sessão supervisionada** |
| Integração de fonte já autorizada pelo iFood / fornecedor atual de PDV | Potencial fonte contínua estruturada, preserva Gestor e evita nova sessão raspada | Não há nesta revisão prova de contrato, permissão, integrador, formato, frequência ou custo | **Investigar somente recursos existentes; não ligar/alterar fornecedor** |
| Exportações de pedidos + logística já obtidas | Fonte histórica com IDs, produtos e tempos, útil para reconciliação e replay | Não fornece atualização de segundos; janela do relatório pode não coincidir com dia-calendário | **Reuso controlado para análises, nunca declarar monitor ao vivo** |
| API oficial de Pedidos/Eventos em aplicativo próprio | Endpoints padronizados para detalhes, modificadores e eventos | Política de homologação recusa apps puramente read-only nos módulos operacionais; exige app funcional e CNPJ elegível, autorização de loja; eventos por polling exigem ACK | **Não iniciar integração própria somente de leitura; requer decisão arquitetural e autorização separadas** |

## 3. Evidência pública verificada
- Fonte oficial da composição: `GET /order/v1.0/orders/{id}` inclui `id`, `displayId`, `merchant`, `items[].uniqueId`, `items[].name`, `items[].quantity`, `items[].options` e `items[].observations`. O JSON também pode conter dados pessoais; uma projeção para o Delivery OS deve explicitamente descartá-los. https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/details
- Eventos incluem cancelamento, edição de pedido e associação de grupo de entrega; webhook oferece entrega ao menos uma vez e fora de ordem, exigindo deduplicação e reconciliação. https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/events e https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-overview
- **Bloqueio decisivo:** política de homologação restringe Order a PDV operacional e rejeita aplicações somente de leitura em módulos operacionais; exceções: Analytics e Financial. https://developer.ifood.com.br/en-US/docs/getting-started/homologation/categories
- Integração de eventos por polling requer ACK e testes operacionais incluindo confirmação, cancelamento e despacho; portanto `GET` não equivale a licença para um espelho read-only de produção. https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/homologation e https://developer.ifood.com.br/en-US/docs/getting-started/documentation/glossary
- A página oficial informa API gratuita para desenvolvedores elegíveis, mas requer CNPJ/CNAE de tecnologia e app funcional; custos terceiros/operacionais são distintos. https://developer.ifood.com.br/pt-BR

**UNKNOWN:** elegibilidade do CNPJ do potencial integrador, quem detém permissão de integração da loja Itaim, existência de feed read-only licenciado por fornecedor atual, latência real, impacto sobre integrações nativas já existentes. Não preencher essas lacunas por suposição.

## 4. Efeito permitido e próximo teste material
1. Preservar PR #137 em DRAFT/HOLD; não iniciar polling, ACK, webhook, autenticação OAuth, instalação de extensão, agendamento, impressão ou serviço no caixa.
2. Na rota Edge, primeiro demonstrar método de attach ao **perfil exato** `TataGestorObservationLab/DedicatedEdgeProfile` sem console, sem alterar foco/aba/sessão e com desligamento reversível. O arquivo `DevToolsActivePort` antigo não comprova conexão atual.
3. Provar **um pedido real já aberto**: identificar unidade autorizada, ID exibido + UUID quando disponível, itens com quantidades e modificadores, verificar contra a tela e registrar somente metadados de aceite/rejeição (sem PII, sem conteúdo de cliente).
4. Investigar com responsável técnico do integrador existente se já existe feed autorizado (não ler/alterar credenciais de caixa). Se não houver, não tratar a API oficial como atalho.
5. Abrir etapa B somente com uma fonte de pedido real verificada; ensaiar dedupe, edições, cancelamentos, grupos fechados, completude e atraso sem inferir demanda de pedidos não observados.

**Proibição de extrapolação:** sucesso em Edge sintético, API pública documentada, arquivo local recente ou login no Gestor não significam captação ao vivo, publicação no Copiloto ou homologação comercial.
