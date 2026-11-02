# DeliveryOS — plano de preservação e convergência antes da homologação
**Data:** 2026-11-02. **Escopo:** ITAIM, V1 Entregas + Copiloto. **Situação:** AUDITORIA / HOLD; sem merge, deploy, GPS real, SQL operacional, caixa, impressão ou gasto novo.

## 1. Por que este plano existe
A candidata atual contém código de produto e amplas provas de laboratório, mas foi construída numa árvore diferente de \`main\`. Histórias de PRs incluem pesquisas e versões divergentes; importar tudo indistintamente criaria regressão. A pergunta não é "quantos commits temos?", mas "qual obrigação crítica já foi resolvida, por qual versão e com qual prova?".

### Fontes e HEADs congelados
- Produto: \`docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md\`; precede \`CLAUDE.md\` e qualquer checkpoint técnico.
- Continuidade operacional: issue #103, TATÁ Comandas paralela na #102.
- VÉRTICE 2.2: método em \`cesarspichencoff-cmyk/vertice-runtime.\` / \`vertice-active\` / \`VERTICE_ENTRY.md\`. Não copiar nomes privados do método para o produto.
- Candidata V1: \`f915161a6d71d2292d957845df382fc3c1623a9e\` (CI principal #41390278990 SUCCESS).
- GPS Android isolado: PR #128, \`3158d6a9386582b556b0b48302576c0dfe39aadf\` (CI #41389970043 SUCCESS, 32 testes direcionados).
- Interface Entregas: PR #129, \`dbc7482a73377251d4482c9dca0b34f82cae7762\` (CI #41384849539 SUCCESS).
- \`main\`: \`48288aed24ef2afbafe251fa406a257bb6bb5300\`. Não equivale à candidata atual.
- Auditoria: PR #132, CI #41392168935 SUCCESS, arquivo detalhado no artefato \`deliveryos-work-preservation-audit\`.

### Resultado da varredura
- 2.069 arquivos versionados; 490.867 linhas de texto inspecionadas/hasheadas na candidata, sem mismatch/ausência na árvore fixada.
- 118 PRs lidas pela API; 97 HEADs não são ancestrais da candidata; zero PRs com ref desconhecida na execução.
- \`main\` tem 17 arquivos inexistentes na candidata, incluindo testes/scripts \`cesar-os-ci\` e \`tools/verificar_truth_v132.js\`. Mesmo blob SHA não aparece em outro caminho na candidata: **preservar como capacidade não consolidada e rever antes de promover**.
- Os dois PRs GPS/Entregas não colidem entre si nas modificações funcionais, mas ambas as branches partem do candidato **antes** de \`f915161a\`. Integração tem de preservar o novo gate R5-D2.
- \`PROJECT_STATE.json\` da candidata ainda aponta \`active_ref=claude/deliveryos-v1-trip-identity-20261031\`, uma referência histórica. Não usar esse valor isolado para decidir a branch do release sem reconciliar com a issue #103 e os HEADs atuais.

**Limite importante:** hash de cada linha prova cobertura de leitura automática, não que cada linha foi semanticamente aprovada. PR fora da ancestralidade não prova funcionalidade perdida, e green CI não é produção.

## 2. Matriz de destino: nenhum trabalho desaparece por acidente
Todo ativo relevante deve terminar com UMA disposição explícita e rastreável:
- **INTEGRAR:** necessário para fechar a V1, contrato compatível, segurança avaliada, tests CI no SHA combinado.
- **JÁ INTEGRADO:** ancestralidade ou paridade de código provada; não reaplicar nem reimplementar.
- **SUBSTITUÍDO COM PROVA:** preservar motivo/hashes/testes e apontar implementação vencedora; não restaurar versão antiga.
- **PRESERVAR ISOLADO:** experimentos, Comandas, Q-026 exploratório, ferramentas opcionais e documentação histórica sem promoção automática.
- **BLOQUEADO:** segurança, identidade, privilégio, PII, GPS, fonte sem vínculo, incompatibilidade ou regressão.
- **INDETERMINADO:** não há prova para resolver a categoria; não chamar de concluído.

Para cada item material registrar: PR/commit origem; arquivo/contrato; problema; estado da candidata; impacto de excluí-lo; teste mínimo de preservação; decisão; novo SHA; efeito operacional; gate. Não duplicar checklist para o mesmo objeto; usar issue #103 + artefato versionado.

## 3. Alertas já identificados que NÃO podem ser apagados
1. **Permissões de recibo:** PR #125 concede SELECT/INSERT ao papel piloto multiunidade, mas a candidata com PR #126 impede acesso enquanto não existir segregação/RLS defensável. Não escolher patch antigo por ser mais curto; preservar testes, contrato e motivo do veto.
2. **CI R5-D2:** a correção \`f915161a\` distingue \`spooler:false\` de coletor vivo. A integração #128/#129 não pode reverter esse arquivo para HEAD antigo.
3. **GPS:** manter publicação somente após insert Room de sessão vigente, rejeição de mock antes de armazenamento/envio, \`current\` só após posição confirmada; suportar GMS e fallback nativo; ainda precisa provas físicas.
4. **Main-only:** investigar 17 arquivos com propósito próprio; conservar o histórico da \`main\` e não ativar automaticamente workflows antigos de arquivo público.
5. **Produto:** a Home é Copiloto principal; \`/copiloto\` diagnóstico Shadow não substitui a Home. Entregas é módulo operacional. Preservar hierarquia visual V2/V3.3, acessibilidade e versão do motor Academia.
6. **Verdades de origem:** pedido Neemo/Teknisa, viagem Trip, motoboy, GPS, pronto, retorno e iFood são fatos diferentes; join só por identidade/autoridade comprovada. Nunca confundir contagem do Gestor com pedido individual.
7. **Host:** \`CAIXA_MOOCA\` é o nome remoto do computador do caixa Itaim. Tablet/PC acompanham e não simulam GPS. Só Android do motoboy realiza captura autorizada.
8. **Escopo:** motoboy próprio tem Trip; entregador externo tem Handoff. iFood LIVE e Radar Toqan são auxiliares/opcionais e NÃO bloqueiam a V1. TATÁ Comandas evolui em paralelo, reaproveitando o contrato existente sem criar segundo leitor.
9. **Proteção de operação:** não instalar, imprimir, modificar ACL/rede, reconfigurar Edge, emitir tokens produtivos, rodar SQL ou capturar GPS real apenas porque o CI está verde.

## 4. Ordem mínima de conclusão — valor por risco retirado
**Gate A — preservar antes de integrar.** Revisar PRs não ancestrais que tocam GPS, Entregas, identidade, API, segurança, recibos, Copiloto, UX e infra. Registrar classificação material. Pesquisa Q-026 e artefatos térmicos mantidos em trilhas separadas. Prova: nenhum arquivo/capacidade crítica foi descartado por omissão; relatório rastreável por SHA.

**Gate B — uma árvore de release.** Criar **uma única candidata de integração isolada** em cima de \`f915161a\`, transportar apenas mudanças necessárias de #128/#129, preservar #126 e correção R5-D2. Conferir diffs, arquivos, tipos, interfaces e ausência de regressão. Não levar PRs experimentais como branches inteiras. Prova: commit único de integração, CI completo verde e rollback Git claro.

**Gate C — fluxo lógico e segurança.** Executar provas integradas de autenticação humana, identidade delegada do aparelho, unidade ITAIM, papel restrito, source provenance, recibos, idempotência, evento append-only, 401/403/503, outbox Room/offline/online, isolamento de ator por request, histórico Copiloto do mesmo PostgreSQL, limitação por tempo e rastreabilidade de estado. PostgreSQL descartável, dois clientes quando material; não rodar migrations produtivas.

**Gate D — dispositivo e uso real sob autorização específica.** Testar Android físico com e sem Play Services; permissões fine/coarse/negadas, localização desligada, app em segundo plano/tela bloqueada, bateria, troca/STOP/restart de viagem, fake GPS, perda de rede e reenvio. Caixa e tablet exibem **os mesmos fatos** e não fazem coleta GPS. Uma viagem própria e um Handoff externo sem associação fabricada. Critérios de aceite explícitos de César.

**Gate E — liberação limitada.** Só depois: ambiente de campo com credenciais e HTTPS comprovados, backup/restore, rollback ensaiado, observabilidade, falha fechada, e autorização humana de deploy/instalação. Sem gasto novo. Se requisitos mínimos não estiverem provados, continuar piloto isolado com estados honestos.

## 5. Regra anti-retrabalho de agentes
Uma nova PR só nasce se fechar um bloqueio material que NÃO esteja resolvido por candidato existente. Antes de alterar código: \`fonte atual -> contraexemplo -> dif mínimo -> teste que falhava -> novo teste green -> regressão -> prova do HEAD\`. Duas tentativas sem ganho real pedem mudança de rota, não mais documentação. Priorizar **fatia vertical verificável** sobre novas pesquisas amplas.

## 6. Definição da fronteira de conclusão
- \`CODE_READY\`: código integrado, contratos corretos, testes locais;
- \`CI_PASS\`: CI de HEAD exato e matriz anti-regressão verdes;
- \`LAB_PROVEN\`: HTTP/PG/Android instrumentados e UX de navegador integrados;
- \`FIELD_PROVEN\`: GPS real/viagem real/caixa/tablet com rastreabilidade;
- \`HUMAN_ACCEPTED\`: César aprova resultado e efeito;
- \`RELEASED\`: deploy/instalação autorizados, monitorados e reversíveis.

A auditoria nesta PR não libera Gate B ou posteriores. Manter DRAFT/HOLD até decisão humana próxima à fronteira de efeito.
