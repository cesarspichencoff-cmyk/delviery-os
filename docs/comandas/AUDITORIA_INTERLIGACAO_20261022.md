# TATÁ Comanda — Auditoria de Interligação e Contrato de Consolidação
**Checkpoint:** 22/10/2026 · Revisão documental apenas · `DRAFT/HOLD` · sem autorização operacional

> Esta é a matriz de continuidade/integração da entrega TATÁ Comanda (produto próprio, **hospedado** no repo `delviery-os`). Não substitui os arquivos de implementação, o contrato de produto original ou as provas de CI/loja. **Código testado não é serviço instalado. Simulação não é recibo de impressão. Fonte autodeclarada não é autoridade independente.**

## 1. Fonte de verdade e alcance auditado

- **Linha-alvo:** [PR #107](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/107), ref `fix/comandas-figma-box-count-guard-20261013`, HEAD de partida `2fc3d3077f07191957a33722d70d32ba6eb51fa0`. Mantida OPEN/DRAFT/HOLD, sem merge.
- **Prova do HEAD de partida:** [Actions #39864374220](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/39864374220): dois jobs concluídos com sucesso, 103/103 passos Linux e 87/87 Windows. V8.67: 44 cenários dirigidos + 120 permutações + 512 mutações, com iFood/GP e condições de reconnect **sintéticos**, sem SQL, CAS durável ou impressora operacional.
- **Inventário lido:** 184/184 patches de arquivos alterados na #107 (153 sob `tools/`); 34/34 patches da #104; comentários da issue #102 e PR #107; requisitos #35/#100/#102; contratos e código de fronteira V2/V6.8/V8.57–V8.62; PR #50 da Academia e motor em duas refs. Isso é cobertura de revisão material, **não** auditoria formal linha a linha de todos os arquivos, dos 494 commits ou dos estados locais não enviados ao GitHub.
- **Host:** identificador remoto `CAIXA_MOOCA` = **mesmo computador físico do caixa Itaim**, confirmado diretamente por César em 22/10. Não são duas lojas/caixas a homologar. `CDFILIAL/CDLOJA`, impressora, arquivos e estado atual exigem prova técnica separada.
- **Offline no momento da conferência:** CAIXA_MOOCA (~47h sem comunicação) e Foxxy (~26h). Leitura histórica real não comprova estado presente. Nenhuma inspeção remota nova executada nesta auditoria.

## 2. Arquitetura de produto — UM fluxo de identidade, sem supermonólito

| Dono | Contrato e saída | Limite obrigatório |
| --- | --- | --- |
| iFood/Gestor/GP + Teknisa/Retail | Provas **independentes** de origem, revisão e recibos de emissão, quando acessíveis | ID curto não é UUID autenticado; processo vivo/aceite do spooler não é papel |
| Watcher Windows / Reader | Um par evento/decisão da **mesma revisão**, com chave `CDFILIAL\|CDLOJA\|NRVENDAREST\|NRCOMANDA`, hashes, quantidades e observações completas | `ready` do legado e snapshot autorreferido não provam SQL, turno ou autorização |
| Consumidor V2 **candidato V7.14** | Decisão gerada dos bytes de entrada e regras efetivamente consumidas, motor por SHA canônico pré-execução | `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs`: candidato pinado, **NÃO INSTALADO** |
| V6.8 `stableReaderShadowPairV68.ts` | Paridade, identidade, bloqueios e proveniência independente (delivery/produção/plano/produtos/notas) | Event+decision ou envelope reconstituído por si só nunca equivalem a fonte independente |
| TATÁ Academia | Regras humanas e catálogo, motor canônico de caixas/sacolas/kits; `currentPackagingBridgeV63.ts` e contrato de embalagem V1 | Não reescrever motor; não permitir FACT parcial ou classificação inventada; mudança de pin é uma decisão revisada |
| Produção/Conferência | `operationalTicketsV45`, `operationalTicketEscposV46`, Figma mestre V4.4/V4.3 e adaptador Epson candidato V7.52 | Dois tickets de produção + conferência conforme praças e revisão; SVG/ESC-POS aprovados **offline** não são impressão aceita |
| Sequência TATÁ | 3 dígitos únicos por loja/dia, vínculo persistido ao pedido nativo | `shadow_candidate`/fixture `001` não são reserva; no write sem autorização |
| Idempotência/GP/spooler | Planejamento V7.54, journal V7.55, testemunha V7.57–V7.60; uma identidade por via | Simulador nunca concede `authorize_print`; sem CAS operacional e prova de emissor/recibo não há liberação |
| DeliveryOS | Receber **evento minimizado e somente leitura** para análise operacional | Não substituir o Reader nem tornar a plataforma inteira pré-requisito da comanda |
| TATÁ OS | Correlacionar identidade/fatos físicos quando existirem | Custódia fiscal, sanitária e estoque têm autorização própria; não bloqueiam primeira fatia |
| Humano + Epson | Aceite óptico e operacional do piloto autorizado; plano de retorno | Nada de instalação, spooler, impressora, fiscal/SEFAZ, cutover ou merge sem autorização específica |

A **primeira fatia vertical** deve usar um pedido recente autêntico e a mesma revisão em todos os componentes, gerando três saídas **virtuais**, com zero efeitos físicos. Não duplicar coletor, reconciliador, motor de caixas ou renderer.

## 3. Encadeamento canônico de verificação

`origem iFood + origem Teknisa → watcher Reader → consumidor V2 → conferência V6.8 (mesma revisão + fontes independentes) → motor Academia pinado + catálogo/crosswalk vigente → projeção Produção/Sushi/Conferência → bytes ESC/POS e golden Figma → proposta idempotente por via → decisão humana de piloto → Epson + inspeção de papel → ativação gradual`.

**Cada seta exige identidade/prova de transformação.** Nunca deixar um teste auxiliar (V8.55/V8.56/V8.57/V8.60, CI V7.20, uma prévia ou um recibo de spooler) substituir a cadeia efetiva.

## 4. Correções que já existem — preservar, não reabrir por relatório antigo

| Erro/histórico | Regra protegida / implementação | Estado real |
| --- | --- | --- |
| `order_key` antigo de 3 partes | Exigir **4 componentes** conforme watcher do Windows. Regressões V7.27 e V8.57 | Corrigido em revisão, não inferir instalado |
| `0`/quantidade inválida convertida em `1` | V7.18/V6.8 rejeitam, não geram embalagem parcial | Corrigido em revisão |
| Figma `physical_box_count=0/null` virou caixa fictícia | Guard e goldens estáveis | Corrigido em revisão |
| SHA igual antes/depois autenticava motor falso | V7.14 exige SHA canônico **antes** de executar os bytes lidos, sem segunda leitura mutável | Corrigido em revisão |
| `LUNCH/DINNER` supostamente selecionava impressora 00009/00003 ou 00006/00004 | Código real `ImpressaoPedido.php`/ `BUSCA_IMPRESSORAS` mostrou destinos A/B distintos, não decisão por turno: destino dual ambíguo é HOLD | Hipótese desconfirmada, NÃO reintroduzir rota antiga |
| Prévia simplificada colocava `A DEFINIR` mesmo sem chamar motor | V8.56/V8.57 + V8.61 chamam `presentMotorPackaging` quando há fonte autenticada; motor ausente gera `NOT_EVALUATED` com campos nulos, **não** inventa fatos | Regressões atuais verificadas em código; ainda não é fluxo real |
| Nota geral sumia/era considerada pagamento automaticamente | V8.57 sinaliza revisão pendente; V8.59 confere multiconjunto e origem das notas | Bloqueio conservador em revisão; classificação operacional independente ainda não provada |
| Choque `event_id` entre dois/três pedidos ou sequência TATÁ repetida | V8.67 põe **todos os envolvidos** em HOLD e não reabre reserva `UNKNOWN` | Somente algoritmo/testes **sintéticos** |
| Assinatura, comentário GitHub ou hash autodeclarado viravam aprovação humana | Declaração de autoridade separada do mesmo token/chat; chave de laboratório não autentica operador real | Proteções testadas, custódia/operador operacional ainda UNKNOWN |
| Parecia que CAIXA_MOOCA e Itaim eram dois equipamentos | Correção humana: um único computador; diferenciar identidade física de `CDFILIAL/CDLOJA` e impressora | Documento da issue #102 retificado |

**A DEFINIR** só pode ser apresentado para caixa/sacola/kit se o motor foi de fato executado e retornou aquele campo inconclusivo; não usar ausência de injeção do motor para preencher o pedido real com placeholder. Nome, quantidade, notas, iFood e sequência nunca são substituíveis por “A DEFINIR”.

## 5. Dívida de convergência entre revisões

1. **PR #104** (`375fed7b9f93366c1453cf5870e0d92901e8f187`) e **#107** divergiram; a comparação de commits mostrou 57 do lado #104 não contidos na #107. O executor `tools/gerar_vias_reader_v730_shadow.js` (blob `5ce8d7d...`) não está no HEAD #107, mas #107 já possui runner V7.20, sidecar preflight V7.31 e projeções V8.57/V8.59. Exigir **comparison of observable functionality**, não cópia automática.
2. Ainda exclusivos da #104, conforme conferência de existência no HEAD #107: `src/production/itaimReaderServiceReviewV735.ts`, `runtime/shadow/itaim-reader-binding-candidate-v735.json`, `tools/verificar_v730_windows_ci.js` e `tools/piloto_fisico_tres_vias_caixa_v740.ps1`. A V7.35 é um contrato de **revisão** de vínculo host/unidade/turno; a V7.40 de piloto ficou limitada a 13/10/2026 e **não deve ser reativada como script atual**. Nenhum desses arquivos justifica merge indiscriminado.
3. **PR #38 e #99** fornecem a linhagem do V7.14, V6.3, V6.8 e validação de quantidade. `thermal-consumer-release-hold.v1.json` no HEAD #107 ainda documenta `branch=feat/thermal-v63-packaging-bridge-shadow-20261010`, `pr=38`, embora pin do consumidor V7.14 corresponda ao blob atual `8e75fea85437d063c2f6ee2df09ee33962d42ce6`. **Metadados históricos ≠ identidade da PR vigente.** Não sobrescrever metadados sem revisar os consumidores que os leem.
4. **Academia PR #50:** HEAD consultado `a53369bf5db54b06712806c7df53f22140ba6de0`, novo motor Git blob `cc573bf9a10c71011a6a1403ad7d2ba1725df66f` versus motor antigo **fixado** `3167c309f02a0ad5a84fb43043b8866e3bee873c`. O novo contém Kids sozinho = 750/M/Kit Kids; Tataki é Dupla somente com classificação comprovada; itens/quantidades malformados e desconhecidos bloqueiam FACT parcial. **Na leitura, ambos os workflows associados ao HEAD novo terminaram `failure`, sem logs detalhados recuperados. NÃO repinar nem instalar** antes de diagnosticar CI e comparar os contratos com o consumidor exato. A fonte histórica instalada também não foi inspecionada agora.
5. **PR #97** é documentação de divergência de versões da Academia; não é motor adicional para executar.
6. **TATÁ OS PR #22** é outra missão; compartilhar identidades/contratos quando justificado, sem exigir seu merge nem copiar autoridade de custódia para impressão.
7. Outros caminhos históricos que não passaram por revisão nesta rodada permanecem **UNKNOWN**, não automaticamente obsoletos.

## 6. O que o CI prova e o que NÃO prova

- #107: 184 patches revistos por inventário; fluxo Windows CI descartável V2→V6.8→duas vias Produção + uma Conferência, checks de semântica, ESC/POS, quantidade e fontes; V8.67 44+120+512 por runner aprovado no HEAD de partida.
- **Não provado**: identidade externa/UUID de um pedido vivo, autenticidade independente SQL e GP, recorte atual de catálogo no caixa, autorização humana de turno, `V2` instalado, vínculo TATÁ persistido hoje, CAS durável e seguro no host, decisão de emissor único, três vias em Epson real e aceite humano.
- **Papel anterior** é evidência válida e limitada: houve calibração e amostras fictícias Epson; V7.41 mostrou contraste/granulação insuficientes; GDI e RAW não comprovaram solução da textura. Figma masters são preservados, paridade óptica final não existe.
- **Falhas anteriores** de workflow não devem ser apagadas da história; classificação correta é por SHA/rodada. O último CI de #107 aprovado não torna a Academia #50 aprovada.
- Para impressão sem ACK, **exactly-once físico não é alegação defensável** com spooler assíncrono: reserva durável antes do envio, no-automatic-retry no incerto e reconciliação humana específica.

## 7. Matriz de aceitação e autoridade

| Portão | Requisitos de prova | Estado em 22/10 |
| --- | --- | --- |
| G0 Código, motor e catálogo | SHA/blob pinado, head e workflow corrente; atualizações da Academia com diff e regressão | #107 CI aprovado sobre fonte antiga; nova Academy PR50 falhou CI |
| G1 Par evento/decisão | Mesmos 4 IDs, fingerprint/snapshot, notas e quantidades | OFFLINE_TEST_PASS; pedido vivo não provado |
| G2 Fontes independentes | iFood/GP/Teknisa e Reader com origem/revisão autêntica | UNKNOWN |
| G3 Crosswalk | Cada código nativo corresponde à única versão vigente do produto | Histórico 463 códigos, atual UNKNOWN |
| G4 Motor/embalagem | Fonte exata → grupos físicos, sacola, kits; UNKNOWN explícito | Testes positivos históricos/sintéticos; atual UNKNOWN |
| G5 Sequência TATÁ | Vínculo atômico persistido em loja+dia, zero colisões | UNKNOWN |
| G6 Três vias virtuais | Cozinha/Sushi/Conferência de um pedido; notas, alergênicos, fontes/ESC-POS | OFFLINE_TEST_PASS; fato vivo UNKNOWN |
| G7 Não duplicação | Emissor independente GP/Retail, fila legada, reserva durável, falha/restart e reconciliação | SIMULATION_PASS; operacional UNKNOWN |
| G8 Epson em papel | Autorização específica, ambiente único Itaim/CAIXA_MOOCA, foto legível/aceite das três vias | Parcial histórico, NÃO aprovado final |
| G9 Ativação e rollback | Runbook, backup validado, serviço/ACL/proteção operação atual e aceite César | NÃO AUTORIZADO / UNKNOWN |

**Não criar ciclo de autorização:** testes puramente offline e estratégias de HOLD de G7 podem preceder o G8; a prova de origem/recibo **físico** exige piloto autorizado e é completada durante/apos G8, antes do cutover. Jamais alegar zero duplicidade com base só no simulador.

## 8. Plano de consolidação mais curto, sem acessar o caixa

### Revisão agora — não exige operação física
- [ ] Reconciliar a **falha atual** dos workflows da Academia PR #50; explicar causa antes de promover candidato; manter motor fixado até pin formal.
- [ ] Comparar a PR #104 **por funcionalidade** com V7.20/V7.31/V8.57/V8.59, especialmente executor V7.30 e vínculo V7.35; marcar explícito KEEP / SUPERSEDED / BLOCKED / INTEGRATE em cada caminho. Não copiar o script físico V7.40 vencido.
- [ ] Montar/adaptar **um** runner de integração em revisão que force par V2→V6.8→Academia→três vias sem canal alternativo, com prova negativa de notas, estado de turno, quantidade, dois destinos de impressora sem regra comprovada e motor defasado; reaproveitar código existente. **Não executar serviço de loja**.
- [ ] Preparar manifesto versionado de compatibilidade com identificadores exatos de motor, catálogo, V2, V6.8 e artefatos visuais; diferenciar fonte antiga intencionalmente pinada de fonte mais recente candidata. Não transformar validação em nova regra de embalagem.
- [ ] Inspecionar consumidores de `thermal-consumer-release-hold.v1.json` antes de corrigir referência documental PR38; não mudar seu `status=DRAFT_HOLD_NOT_INSTALLED`.

### Quando o ÚNICO host voltar — somente leitura, com autorização já prevista
- [ ] Executar V8.59 na CAIXA_MOOCA (caixa Itaim) sem `CiFixtureRoot`; capturar apenas códigos de bloqueio e contagens, sem PII no GitHub.
- [ ] Cruza **um mesmo pedido recente** iFood/Gestor/GP ↔ Teknisa ↔ Reader com fonte independente, estado e sequência; não inventar UUID a partir do código curto.
- [ ] Executar exatamente a revisão reconciliada pelo runner SHADOW sem spooler, com motor/crosswalk vigentes. Corrigir somente divergência observada.
- [ ] Antes de imprimir, resolver GP/Retail, origem do trabalho, fila e efeito ambíguo; preparar pacote de piloto limitado, rollback, operador e aprovação de César.
- [ ] Só depois do piloto Epson autorizado, observar papel e decidir ativação por fase com proteção do fluxo atual.

## 9. Regras anti-regressão / aprendizado operacional

- **Não traduzir nome de host em duas máquinas**; o nome remoto `CAIXA_MOOCA` é o caixa do Itaim. Verificar IDs lógicos separadamente.
- **Não inferir impressora por horário** a partir dos dois códigos Teknisa; a origem/semântica de `NRSEQIMPRPROD/2` exige evidência.
- **Não imprimir sem resolução de observação geral**; “pagamento” não é rótulo universal.
- **Não criar embalagem genérica por ausência de motor**; os placeholders não são substitutos do cálculo aprovado.
- **Não misturar regra de produto com autorização operacional:** César decide produto, mas uma chave de CI/autor do GitHub não atesta por si uma aprovação para efeito físico.
- **Não retornar à rota já fracassada**: mais centenas de cenários iFood/GP simulados sem prova independente não encerram o bloqueio de produção.
- **Não declarar conclusão pela quantidade de commits ou jobs verdes.** Exigir prova na fronteira certa: bytes → processo → fonte real → impressão → aceite humano.
- **Não descartar trabalho divergente sem inventário e comparação**; #104 permanece fonte de recuperação até classificação formal.

## 10. Limites e continuidade

Esta revisão atualiza o conhecimento **sem tocar no host**. Ainda faltam auditoria funcional integral das implementações isoladas, diagnóstico da falha recente na Academia, ensaio do único runner com dados reais e aprovação física. Não declarar completude, segurança absoluta, tempo de entrega, `WORLD_PROVEN` ou `10/10`.

**Foco único:** entregar a TATÁ Comanda com pedido verdadeiro → Windows verdadeiro → três vias corretas → Epson legível → ativação segura, aproveitando tudo que foi comprovado e evitando reintroduzir erros já corrigidos.

**Estado de efeitos:** `DRAFT/HOLD/NO_MERGE/NO_DEPLOY/NO_INSTALL/NO_PRINT/NO_SPOOLER_WRITE/NO_SEQUENCE_WRITE/NO_SQL_WRITE/NO_SEFAZ/NO_CUTOVER`.
