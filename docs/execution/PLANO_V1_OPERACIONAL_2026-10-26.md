# Delivery OS — plano para a primeira operação validada

Estado: plano de implementação e homologação. **Não é liberação de GPS, instalação de campo ou operação real.**

Objetivo: conectar a operação de Entregas do Itaim, o aplicativo Android e o copiloto aos mesmos fatos verificáveis, sem novo gasto e preservando o caixa que hospeda o teste na Mooca.

## Ponto de partida

| Parte | Comprovado | Falta comprovar |
|---|---|---|
| Acesso | HTTPS e abertura de Entregas confirmados por César; proteção restrita do NetBird aplicada | Sessão humana individual, funcionamento nativo sem login interativo do proxy |
| Servidor | PostgreSQL isolado; plataforma e banco internos; verificações HTTP e regras de rede passaram | Reinício do Windows, inicialização automática, recuperação e backup fora do host |
| Entregas | Candidato com domínio, APIs e testes; instalação atual em modo simulado | Fluxo operacional completo pela sessão autorizada e convergência do armazenamento dessa instalação |
| GPS | Código Android nativo, fila local e testes técnicos existem | GPS permanece desligado; termo não publicável; comportamento físico e recibos remotos pendentes |
| Copiloto | Diagnóstico da fonte instalado no ensaio; adaptador e projeção de pedidos testados | Lista real de pedidos, sessão humana individual e aplicação principal integrada ainda pendentes |
| Celular | César informou disponibilidade de um Xiaomi | Modelo, versão Android, instalação e testes físicos desconhecidos |

O histórico técnico não deve ser refeito por conveniência. Os 110 testes JVM e provas PostgreSQL existentes são base de regressão; não substituem observação em aparelho físico. Os scripts de preparação do host não representam um instalador operacional homologado.

## Pedidos da operação: requisito explícito

César confirmou que o copiloto deve evoluir para ler os pedidos, aproveitando o motor TATÁ quando útil. Esta frente passa a ser uma entrega central, junto com identidade, persistência e Android; não fica limitada à projeção de viagens ou a uma demonstração da tela.

Primeiro incremento implementado: `runtime/reporting/copiloto_tata_orders_v1.cjs` reutiliza o motor existente `tata_comanda_order_truth_v1.cjs`, preserva unidade e modo de origem, seleciona revisões pelo horário da fonte e sinaliza conflitos. A saída operacional minimizada inclui referências, itens, quantidades e KDS com sua semântica original; não publica recebimentos, dados de cliente ou coordenadas. Não infere prontidão, entrega, tempo de produção ou vínculo com viagem/GPS. Nove cenários sintéticos passam; etapa adicionada ao CI do produto. Não há nova leitura SQL nem publicação dessa camada na tela atual.

Na inspeção somente de serviço e metadados do host, `TataComandaReader` estava Running e o arquivo de checkpoint teve gravação recente. O status do host observado tinha data antiga. Nenhum payload de pedido, segredo ou configuração do leitor foi extraído; serviço não foi alterado. Progresso por data de arquivo não comprova completude, unidade correta ou saúde do leitor. A próxima prova é a linhagem da fonte e o mapeamento autorizado para Itaim, sem assumir que pedidos capturados na Mooca pertençam ao Itaim.

### Compatibilidade com o leitor instalado

Segundo incremento: `runtime/reporting/copiloto_tata_reader_adapter_v1.cjs` adapta o evento `deliveryos.tata-reader-stable-order-event.v1` ao motor existente e à projeção de pedidos do copiloto. Nove cenários de integração sintéticos cobrem essa cadeia. Exige contexto de mapeamento aprovado no chamador, modo explícito, efeitos somente de leitura e timestamps com fuso. Preserva o bloqueio do produtor e descarta observações, clientes e campos financeiros na saída operacional. Um status de item não é convertido em prontidão ou entrega.

A inspeção pontual no host observou códigos nativos `0001/01` e um evento com `ready_for_downstream_shadow=false`, bloqueado por `SERVICE_STATE_DATE_MISMATCH_ORDER_DATE` e `SERVICE_STATE_EXPIRED_FOR_ORDER`. Não foram exportados identificadores de pedidos, itens ou observações. O checkpoint contém esquema/entradas, sem identificação geográfica no topo. Esses fatos não comprovam que a fonte pertença ao Itaim nem autorizam remover bloqueios do leitor. É necessário verificar o mapeamento e a vigência do estado de serviço antes de alimentar a interface. Datas SQL sem fuso exigem política de origem explícita; não usar automaticamente o fuso do computador consumidor.

## Decisões de arquitetura

1. **Uma autoridade para cada fato.** O vínculo pedido–viagem–ator–aparelho precisa ser estável e verificável. Mapear as tabelas e eventos existentes antes de qualquer alteração. Aproveitar o backend PostgreSQL já implementado; convergir a instalação de teste depois de provar equivalência, idempotência e reversão. Não criar outro banco lógico concorrente para o copiloto.
2. **GPS nativo e vinculado à viagem.** O navegador oferece interface e consentimento; a captura é responsabilidade do Android. A ausência de permissão, identidade, aceite válido ou viagem autorizada impede a coleta. Coleta fora da jornada/viagem não entra por ampliação implícita de escopo.
3. **Autorização humana e do aparelho são diferentes.** Senha compartilhada do NetBird não identifica gerente ou motoboy. Token de aparelho não vira sessão de gestor. Unidade é derivada do vínculo autorizado; o seletor da tela não concede acesso.
4. **Copiloto operacional de leitura primeiro.** Usar as mesmas projeções de Entregas, com fato de origem, horário e estado de atualização. Recomendações não comandam a operação automaticamente. Começar pelos mecanismos existentes, sem dependência de IA paga. Dados gerenciais alheios à operação de entregas ficam fora deste escopo.
5. **Fonte indisponível aparece indisponível.** Demonstração, simulação e leitura real precisam ser separadas visivelmente. Dados ausentes ou antigos não viram zero, posição atual, pedido associado ou entrega concluída.
6. **Hospedagem preservada.** Mooca continua host inicial; Itaim continua unidade operacional. Banco e serviços internos permanecem privados. Não ampliar políticas de rede para corrigir falha de autenticação. Sem nova infraestrutura paga, domínio comprado ou dependência da API do iFood para a V1.

## Ordem de execução

As fases são ordenadas por dependência e evidência, não por prazo prometido. Preparação da interface e pesquisa do Android podem ocorrer durante os trabalhos de base, mas nenhuma tela pode declarar uma capacidade operacional ainda não validada.

| Fase | Entrega concreta | Prova exigida para avançar |
|---|---|---|
| 1. Contrato e acesso | Mapa das rotas web/nativas, sessão humana, cadastro de aparelho, papéis e unidade; ensaio com identidades fictícias | Negar credencial ausente/expirada/forjada, ator ou aparelho trocado, unidade alheia e revogação; nenhuma consulta indevida ao banco |
| 2. Fatos e persistência | Uma viagem controlada usa o backend durável previsto e alimenta as projeções compartilhadas | Mesmo pedido/viagem/ator/aparelho em servidor e telas; reinício preserva fatos; replay não duplica nem perde eventos; restauração de backup em banco separado |
| 3. Android e privacidade | URLs nativas verificadas, termo com recibo remoto, sincronização e parada de captura; APK de ensaio verificável | Aceite e recusa, falhas de autorização, fila offline, revogação, término online/remoto offline e recuperação do serviço passam nas provas técnicas; assinatura de campo sob custódia definida |
| 4. Aplicação principal e copiloto | Navegação integrada e leitura autenticada dos mesmos fatos; demonstrações identificadas ou retiradas das telas operacionais | Tela de Entregas e copiloto concordam sobre a mesma viagem; atraso/indisponibilidade ficam explícitos; nenhum comando automático ou dado de outra unidade |
| 5. Homologação física | Executar F01–F14 no Xiaomi, com participante e janela definidos para o ensaio | Recusa respeitada, captura restrita, tela bloqueada, offline/retorno, bateria, término e reinício observados; recibos conferidos no servidor |
| 6. Piloto acompanhado | Escopo pequeno do Itaim, contingência e responsável pela parada; crescimento só após avaliação | Loja e participante completam o ciclo aprovado, sem incidente de privacidade, perda/duplicação de fatos ou divergência entre Entregas e copiloto |

**Primeiro incremento de código:** fechar o contrato de acesso humano/nativo em laboratório e suas contra-provas, aproveitando o que já existe. Publicar a tela principal antes disso só mudaria a aparência do ambiente.

## Detalhes que podem bloquear a V1

### Acesso Android pelo HTTPS existente

O endereço que funciona no navegador ainda não comprova acesso do serviço Android em segundo plano. O aplicativo usa URLs de piloto e plataforma, e a plataforma atualmente escuta apenas em loopback.

- Auditar cada chamada do WebView e do cliente nativo, seus métodos, credenciais e recibos. Expor somente o conjunto necessário de rotas, com autorização própria; nunca o servidor interno inteiro por conveniência.
- A documentação atual do NetBird oferece autenticação por cabeçalho e ações por caminho. Essas são opções de transporte a provar, não decisões já aplicadas no painel.
- O NetBird remove o cabeçalho usado na sua autenticação antes de encaminhar a chamada. Por isso, usar o preset Bearer em `Authorization` pode remover o Bearer que o aplicativo precisa verificar. Não reutilizar esse cabeçalho sem prova ponta a ponta.
- Uma eventual exceção de autenticação no proxy deve se limitar a caminhos nativos já protegidos pela aplicação, testados com credenciais inválidas e revogadas. **Não liberar `/api` inteiro.** Nenhuma exceção foi aplicada por este plano.
- Evitar segredo global embutido no APK. Provisionamento, expiração, revogação e custódia por aparelho devem ter contrato explícito. A escolha final depende da prova do cliente nativo e da configuração disponível na conta, sem novo custo.
- Para leitura humana de fatos reais, implementar e validar o provedor de identidade autorizado e o vínculo individual; não promover o segredo `shadow_lab` a login de navegador.

### Persistência compartilhada

A instalação atual do piloto usa armazenamento isolado em arquivo, enquanto a plataforma usa PostgreSQL. A existência de testes de leitura GPS em PostgreSQL não demonstra que todo o fluxo operacional esteja convergido.

Antes de trocar a configuração, levantar os escritores e leitores reais, provar o backend existente em banco descartável, comparar os mesmos cenários e ensaiar restauração. Não migrar banco da loja nem reclassificar fatos simulados como reais. A convergência deve preservar o domínio e o histórico já provados.

### Consentimento e fila

O WebView já registra o aceite no servidor antes de repassá-lo ao Android. O worker pode conservar uma repetição pendente ao receber 401; isso não prova ausência do aceite inicial. A correção precisa distinguir o recibo inicial e o ciclo de repetição, sem criar outra autoridade de consentimento.

Separar falha transitória, autenticação/revogação e rejeição definitiva de domínio. Uma rejeição terminal não pode bloquear indefinidamente os fatos válidos seguintes; tampouco pode causar descarte silencioso. Provar a fila com recibo por evento, duplicatas, troca de sessão e reconexão.

### Término remoto enquanto o celular está offline

Um celular desconectado não recebe imediatamente uma ordem remota de parada. F13 continua bloqueador: o comportamento e o risco precisam ser decididos antes do campo.

Investigar uma autorização de captura com validade limitada e renovação, usando tempo monotônico e parada segura quando não houver prova válida após reinício, ou mecanismo equivalente. Apresentar as consequências para privacidade e continuidade da viagem antes de escolher qualquer duração. Este plano **não inventa prazo de captura, retenção ou regra trabalhista**.

### Recuperação do host

Ensaiar, sem reiniciar o caixa em horário de operação, a sequência de parada/partida dos processos próprios, prontidão, falha do banco e restauração em destino isolado. Preparar inicialização automática com proteções e logs sem segredos. O teste de reboot do Windows exige janela adequada; não executá-lo automaticamente no caixa.

Definir destino privado existente para backup criptografado fora do host e provar restauração. Git não recebe coordenadas, credenciais ou dados operacionais privados. Rever também expiração de sessão do NetBird, rotação dos IPs do proxy e recuperação após falta de energia: o endereço HTTPS, sozinho, não garante disponibilidade.

## Definição de pronto

- Pessoa e aparelho autenticados só operam os vínculos e a unidade autorizados.
- A viagem controlada percorre o fluxo de domínio aprovado e produz os mesmos fatos em Entregas e copiloto.
- Não há captura sem consentimento/viagem/autorização válida; recusa e parada local funcionam. F13 tem comportamento explícito aprovado e provado.
- Offline e reconexão preservam os fatos; sucesso só aparece após confirmação do servidor.
- Posição antiga ou fonte ausente tem indicação inequívoca; nenhuma inferência de pedido vira fato por semelhança de identificadores.
- Parada, recuperação, backup e restauração são observados, com contingência executável pela loja.
- O APK de campo e o Xiaomi passam nos cenários aplicáveis; compilar APK ou passar teste JVM não conta como aprovação física.
- GPS e operação real só são liberados no escopo humano aprovado, após apresentar o ensaio concreto e seus resultados. Não há liberação por este documento.

## Participações de César, somente no momento necessário

1. Quando chegarmos ao aparelho: observar modelo e versão do Xiaomi. A ausência dessa informação não impede o trabalho técnico anterior.
2. Antes de dados pessoais e campo: confirmar responsável pelo termo, contato, retenção, participante, janela e parada emergencial, a partir de proposta concreta. Não preencher informações legais por suposição.
3. Definir custódia da assinatura do APK e aprovar o escopo do ensaio físico. Não enviar chave privada ou senha pelo chat.

## Fontes para execução

- `PROJECT_STATE.json` e `docs/execution/evidencias/mooca-local-2026-10-26/remote-access-state.json`: instalação e limites atuais.
- `docs/entregas/pilot/GATE_CAMPO_ANDROID_COPILOTO_2026-10-20.md`: cenários físicos; estados históricos devem ser reconciliados com evidência posterior.
- `docs/security/DELIVERYOS_OPERATOR_AUTH_AND_RLS_GATE_2026-10-15.md`: contrato de sessão humana e segregação.
- `tools/entregas_pilot_server.ts`, `src/entregas/pilot/pilot-persistence-backend.ts` e `storage-cutover.ts`: backend e fronteiras existentes.
- `tools/product_system_server.ts` e `src/product/security/escopo-api-shadow.ts`: leitura/demonstração e limite do segredo de laboratório.
- `android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt`: credenciais, filas e recibos nativos.
- Documentação oficial consultada em 26/10/2026: https://docs.netbird.io/manage/reverse-proxy/authentication — alternativas de autenticação, remoção de cabeçalho e ação por caminho. Gratuidade atual da beta não é compromisso de preço futuro.

O plano pode ser ajustado quando uma prova revelar uma dependência diferente. Cada mudança deve registrar o motivo, preservar o que já funciona e manter separados código implementado, teste técnico, instalação, observação física e liberação operacional.

## Diagnóstico confirmado da fonte e CI

Os runs de produto `40424344253` e Android `40424344257` concluíram com sucesso no commit `7a0a87e2c6563c757ba601697628a1d93b669c78`.

A inspeção restrita de metadados de `production-service-state.json` no host encontrou esquema v2, `store_id=0001`, data operacional `2026-10-14`, serviço `LUNCH`, evidência `HUMAN_CONFIRMED_RULE` e inferência de relógio desligada. Não há `unit_id` ou `unit_name` nesse arquivo. A data antiga explica o bloqueio de data/validade no evento recente inspecionado. O arquivo não foi renovado e nenhum serviço foi reiniciado.

O vínculo geográfico dessa fonte foi posteriormente confirmado por César como Itaim, conforme a seção seguinte. A renovação do estado de serviço precisa preservar o escopo e as regras operacionais aprovadas; não marcar almoço/jantar automaticamente a partir da hora.

## Confirmação da unidade de origem

César respondeu “Do Itaim somente” para a origem do TATÁ Comandas desse caixa. Isso resolve o vínculo geográfico desta instalação: host CAIXA_MOOCA, fonte nativa 0001/01, unidade operacional ITAIM. O vínculo não deve ser reutilizado automaticamente em outro computador com os mesmos códigos.

`tata-source-binding.json` e `tata-source-preview.cjs` foram preparados em `tools/windows-local-lab/` e copiados para o diretório protegido do ensaio. A comparação por nome de host é uma proteção contra uso acidental, não autenticação do computador. A prévia limita o número de entradas examinadas e o tamanho dos arquivos, não consulta SQL e não altera o leitor. Seis cenários sintéticos validam o escopo e a minimização.

Em 2026-10-27T00:48:55.039Z, a janela de 20 arquivos examinada no host mostrou 20 correspondências de unidade/código e 20 bloqueios do produtor, sem arquivos inválidos ou ilegíveis. A amostra é por janela de diretório: não seleciona a revisão mais nova, não representa os pedidos atuais e não comprova completude. Códigos de bloqueio desconhecidos são agregados como OTHER_SOURCE_BLOCKER, sem revelar texto livre. O arquivo de estado de serviço continuava em 14/10, LUNCH. Publicação e modo de fonte continuam não definidos para uso operacional; GPS segue desligado. A confirmação da unidade não renova o estado de serviço nem remove o bloqueio de origem.

## Diagnóstico conectado ao ensaio em 26/10

A tela `/copiloto/` e a API `GET /api/copiloto/source` foram instaladas no piloto isolado. O console oferece o link “Copiloto: fonte de pedidos”. A tela usa a chave já existente do ensaio; gerente/líder podem consultar metadados, sem transformar essa chave compartilhada em identidade humana individual. Sem sessão responde 401, motoboy recebe 403 e escrita recebe 405. A consulta reutiliza a prévia limitada, com cache máximo de cinco segundos e nenhuma rotina em segundo plano. Não existe nova consulta SQL.

A interface distingue fonte bloqueada, indisponível, não configurada, sem evidência e amostra que exige revisão. Mostra a janela registrada e declara que a amostra não é um inventário atual. Nenhum identificador, item ou observação de pedido foi publicado. O status completo do Copiloto continua falso; o diagnóstico parcial é identificado separadamente.

Prova final no host em `2026-10-27T01:36:39.468Z` (26/10, 22h36 em São Paulo): sete verificações passaram, incluindo login pelo formulário, atualização e ausência de rolagem horizontal no Edge com larguras 390 e 1440. Os 20 arquivos examinados continuavam bloqueados. A janela explícita era `2026-10-14T11:00:00` a `2026-10-14T15:00:00`, serviço LUNCH. O leitor e seu estado não foram alterados. O teste local de Chromium não pôde rodar por ausência do executável; a verificação de navegador foi executada no Edge do host, em contexto novo e temporário.

O campo de procedência cita uma regra semanal do Itaim, mas seus horários completos não foram recuperados. Uma janela histórica isolada não define todos os dias. O setter instalado também omite `valid_from_local`, que o leitor atual exige; ele não deve ser usado sem correção. Próximo dado necessário: horários de almoço e jantar por dia, dias fechados e exceções aplicáveis. Nenhum turno foi renovado pelo relógio ou por suposição.

**Pendência posteriormente resolvida:** César reconfirmou os horários nesta conversa, e a regra semanal foi aplicada ao leitor com dois lotes saudáveis comprovados. A fonte vigente e a prova estão em `ITAIM_DELIVERY_HOURS_2026-10-26.md`. Não repetir a pergunta pelos horários. O arquivo legado de 14/10 foi preservado como histórico; a política semanal é a autoridade de turno do watcher atualizado. Publicação de pedidos, identidade humana e GPS continuam separados desta correção.

Trata-se de atualização de componentes do ensaio sobre o núcleo `be5a3e3`, não de release integral. Os onze arquivos transferidos tiveram hashes conferidos e os arquivos anteriores foram preservados em `backup-copiloto-source-20261026`, no diretório protegido do ensaio. Somente o processo conhecido do piloto foi reiniciado. O PostgreSQL, a plataforma interna, o leitor, as permissões de rede e o GPS não sofreram alteração. A prova e os hashes estão em `evidencias/mooca-local-2026-10-26/copiloto-source-status-proof.json`. A navegação pela URL pública autenticada da nova tela ainda não foi revalidada por César.
