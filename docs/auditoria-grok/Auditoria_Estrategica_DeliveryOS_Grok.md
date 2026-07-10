# Auditoria Estratégica — DeliveryOS (Red Team Grok)

> **Papel:** Red Team estratégico, operacional e arquitetural. Não implementa. Não corrige código.
> **Branch:** `audit/preloja-grok` · **HEAD auditado:** `a441bc7e9ed209ca965be549dbbd0cd787867bd5`
> **main no momento da auditoria:** mesmo hash (branch nasceu da main estável, 0 commits à frente/atrás).
> **Data:** 10/07/2026 · Working tree limpo no início · Nenhum PDF/imagem rastreado.
> **Escopo:** leitura independente de `CLAUDE.md`, `docs/`, `src/`, `app-v1/`, `tools/`, contratos e propostas pré-loja.
> **Fora de escopo:** alterar produção, instalar dependências, merge, implementação.

---

## 0. Estado verificado (fatos de repositório)

| Verificação | Resultado |
|---|---|
| `git branch --show-current` | `audit/preloja-grok` |
| Working tree | limpo |
| `git rev-parse HEAD` | `a441bc7e9ed209ca965be549dbbd0cd787867bd5` |
| `git rev-parse main` | `a441bc7e9ed209ca965be549dbbd0cd787867bd5` |
| merge-base HEAD main | idêntico a HEAD |
| PDFs/imagens rastreados | nenhum |
| Worktrees | `delviery-os` [main] · `deliveryos-fable` [feature/preloja-fable] · `deliveryos-grok` [audit/preloja-grok] — todos no mesmo commit |

### Testes executados nesta sessão (sem correção)

| Teste | Resultado | Nota |
|---|---|---|
| `node tools/teste_fonte_real.js` | **OK** | 16/16 itens casados; API resolver/step/buildFoco com CSV real |
| `node tools/verificar_integridade_cardapio.js` | **OK** | 199 itens, vocabulário 8 praças, seed sem drift |
| `npm run typecheck` / `build` / `demo` | **NÃO EXECUTÁVEL** | PowerShell bloqueia `npm.ps1`; `node_modules` ausente; missão proíbe instalar dependências |
| Autoteste 8 praças / auditoria divergência | **NÃO EXECUTÁVEL** | Dependem de `data/raw` (gitignorado) e/ou build TS |

**Confiança nos testes rodados:** alta para o que rodou. **Não** se deve tratar typecheck/build como “verdes” nesta sessão — apenas como não reprovados por ausência de ambiente.

---

## 1. O DeliveryOS resolve o problema operacional certo?

### O que sabemos com confiança

1. A dor central (“parar de produzir para se procurar”) está documentada e amparada em estudo de WhatsApp, replays e auditorias — não é slogan.
2. A tríade Calmo / Ambiente / Foco é coerente com operação sob pressão e com as Leis 2, 3 e 12.
3. O motor de tempo/estado sobre export iFood é real; o cardápio (199/8) casa 100% em janelas reais.
4. Composição real muda o retrato da operação de forma mensurável (12/12 janelas; intervalos sem sobreposição em métricas-chave).

### Onde a tese ainda é hipótese

1. **Que a equipe olhará e confiará** no slot único de atenção em pico real — ainda sem prova de uso (só shadow planejado).
2. **Que “fonte viva” Epson + Gestor iFood** entrega latência e cobertura suficientes — inspeção da loja **não executada** (`docs/Inspecao_Fontes_Reais_Loja_V0.md` §3–4: “não determinado”).
3. **Que o identificador gritado na bancada** (sequência Odhen) chegará ao motor a tempo — hoje a V1 usa ID curto iFood; a comanda “nasce” no papel/Odhen e some da tela após impressão.

### Veredito estratégico

O problema está **certo**. A solução cognitiva (proteger atenção, uma tensão, não dashboard) está **bem posicionada**. O risco não é “produto errado”; é **falsa confiança de pronta operacionalidade** enquanto a ponte dado vivo ↔ cérebro permanece proposta.

---

## 2. Arquitetura: simples ou sofisticada demais?

### O que é simples e correto

- Camada 0: log append-only + fold (Red Team histórico já enxugou).
- Seam único de itens (`FONTE_ITENS` / `makeFonteItensFromRows`).
- Superfície V1 como **leitura** de `MOTOR.step` + `DECISAO.decidir` com `active` (gate documentado e presente em `app-v1/app.js:344`).
- Política de dados: bruto/gerado fora do Git.

### Onde a sofisticação já existe no papel, não no chão

| Camada | Estado real no código | Estado no papel |
|---|---|---|
| Motor + Decisão (correção de escopo) | **Implementada** (`decisao.js` filtra com `opts.active`) | Relatório pós-correção: troca proibida 82→0 |
| Interface V1 (replay) | **Implementada** | Contrato cognitivo V1 |
| Capturador local | **Não existe** | Arquitetura + auditoria fonte viva |
| Parser de comanda | **Não existe** | Spec V1 |
| Lógica de embalagens real | **Não no motor** (heurística combo/≥8 itens) | Doc V0 completo do César |
| Mapa de Ambientes 6 áreas | **Parcial** (clima; rótulos; colisão Quentes/Cozinha) | Proposta + risco de nome |

### Veredito

A **arquitetura cognitiva** está no ponto certo de complexidade para provar o núcleo. A **arquitetura de fonte viva** é a peça mais arriscada: duas fontes, casamento assíncrono, Windows spool, DOM de terceiro — **ainda não é arquitetura validada**, é desenho plausível. Risco de sofisticar o capturador antes de provar o Modelo A/B/C do DOM e o `DataType` do spool.

**Lei 8 aplica:** se o Fable implementar automação de clique, virtualização, OCR e serviço Windows no mesmo PR, falhou o red team.

---

## 3. Epson + Gestor iFood: melhor caminho?

### Argumento a favor (com evidência)

- César confirmou: Odhen/Teknisa **não** acompanha pós-impressão; Gestor iFood **é** a fonte de status ao vivo.
- Epson TM-T20X na **fila normal do Windows** (relato) → opções 1/2 da auditoria sobem de prioridade.
- Comanda **única** (sem comanda por praça) simplifica o parser.
- Separação espelha Motor A (tempo) × Motor B (itens) já no `motor.js`.

### Argumento contra / riscos

1. **Nenhuma das duas fontes foi lida por código nesta máquina** — só foto + relato + sintaxe PowerShell em impressoras genéricas.
2. Job de spool pode ser **RAW binário** da Epson → texto ilegível sem decodificação → opção 1/2 vira beco sem saída.
3. DOM do Gestor pode ser **Modelo C (virtualização)** → leitura passiva insuficiente; automação aumenta risco de clique perigoso (Lei 6/7).
4. Casamento só por **código curto iFood** — colisões e pedidos Animo/WhatsApp sem o mesmo campo.
5. Cancelamento **só** no Gestor; reimpressão e “não foi” à caneta quebram a ilusão de verdade completa da comanda.

### Veredito

**Melhor hipótese atual**, não melhor fato. Aceitável como **plano de inspeção e Fase Sombra de captura**. Inaceitável como **garantia de operação real**. Alternativas (API oficial iFood, banco Odhen, export contínuo) permanecem superiores se existirem — e a API oficial ainda está em pedido/negociação.

---

## 4. Achados (formato obrigatório)

### G-E-01 — Inspeção da loja ainda não gera evidência

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-01 |
| **Gravidade** | Crítica (para fonte viva / live) |
| **Evidência** | `docs/Inspecao_Fontes_Reais_Loja_V0.md` §1–4: ambiente de dev; Gestor e Epson reais **não** inspecionados; classificação Modelo A/B/C/D = “não determinado” |
| **Arquivo** | `docs/Inspecao_Fontes_Reais_Loja_V0.md`, `docs/Auditoria_Fonte_Viva_Loja_V1.md` §6.8 |
| **Cenário real** | Fable implementa capturador; no primeiro pedido o job some em <1s em RAW; ou só 12 de 20 cartões no DOM |
| **Impacto** | Semanas de código sobre premissa falsa; risco de culpa à “arquitetura” em vez de “hipótese não testada” |
| **Reproduzir/validar** | Executar roteiros Parte 1 e Parte 3 **no PC do caixa** e registrar números |
| **Recomendação** | Gate: zero capturador de produção antes do formulário de inspeção preenchido |
| **Bloqueia Fase Sombra?** | **Live shadow: sim.** Shadow sobre janela/export: **não** |
| **Bloqueia operação real?** | Sim |
| **Depende da inspeção da loja?** | Sim |
| **Confiança** | Alta |

### G-E-02 — Duas fontes + casamento por ID curto é ponto único de falha lógica

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-02 |
| **Gravidade** | Alta |
| **Evidência** | Arquitetura: casamento por código iFood; auditoria de comanda: 1 colisão em 238 na janela 01/07; entre meses ~34% de reuso (memória de projeto em auditorias); Animo/WhatsApp volume menor mas real |
| **Arquivo** | `docs/Arquitetura_Sincronizacao_Local_V1.md` §1–4; `docs/Auditoria_Praca_Comanda_Atencoes_V1.md` §2; `docs/Parser_Comanda_Tecnisa_V1.md` §6 |
| **Cenário real** | Dois pedidos com mesmo curto no dia; ou pedido impresso sem campo IFOOD legível; ou status no Gestor sem comanda ainda |
| **Impacto** | Pedido fantasma, pedido colado errado, foco no ID errado gritado na cozinha |
| **Reproduzir/validar** | Contar colisões de curto por dia em exports; simular half-match no consolidator |
| **Recomendação** | Contrato de evento: estados `parcial_itens`, `parcial_status`, `casado`, `conflito_id`; nunca promover half-match a verdade completa |
| **Bloqueia Fase Sombra?** | Não se sombra registra parcialidade; **sim** se sombra assume casamento 100% |
| **Bloqueia operação real?** | Sim se UI gritar ID sem desambiguação |
| **Depende da inspeção da loja?** | Parcial (formato do campo IFOOD no spool) |
| **Confiança** | Alta |

### G-E-03 — Heurística de sacola diverge da lógica real de embalagens

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-03 |
| **Gravidade** | Alta (se “duas sacolas” for exibido como fato) |
| **Evidência** | `motor.js:78-80`: `segundaSacola = ancora \|\| grande (≥8)`; `Logica_Embalagens` §11: quente×frio, volume, bebidas grandes; auditoria: 47–61% dos pedidos com 2ª sacola pela heurística |
| **Arquivo** | `src/perfil-delivery/motor.js`, `docs/Logica_Embalagens_DeliveryOS_V0.md` §11–12 |
| **Cenário real** | Pedido quente+frio de 4 itens → 2 sacolas reais, 1 na heurística; ou combo → 2 na heurística e 1 na bancada se couber |
| **Impacto** | Foco de conferência no pedido errado; “lobo” (Lei 12) ou silêncio perigoso |
| **Reproduzir/validar** | Amostrar 30 comandas reais: rule real vs `segundaSacola` |
| **Recomendação** | Em V1 live: ou não automatizar embalagem, ou rotular como hipótese; **não** promover lógica V0 sem matriz + validação César |
| **Bloqueia Fase Sombra?** | Não (se confiança marcada) |
| **Bloqueia operação real?** | Sim para qualquer “atenção leve duas sacolas” como fato |
| **Depende da inspeção da loja?** | Não (já documentado) |
| **Confiança** | Alta |

### G-E-04 — Correção manual à caneta é limitação permanente não modelada na UI

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-04 |
| **Gravidade** | Alta |
| **Evidência** | César: “não foi” só no papel, não no iFood; parser doc §2 |
| **Arquivo** | `docs/Parser_Comanda_Tecnisa_V1.md` §2, `docs/Auditoria_Fonte_Viva_Loja_V1.md` §7.2 |
| **Cenário real** | Sistema confere item que foi riscado; sacola sai errada com “conferência OK” mental do operador que confiou na tela |
| **Impacto** | Falsa precisão; pior que silêncio |
| **Reproduzir/validar** | Contar, num turno, quantas comandas têm rasura |
| **Recomendação** | Superfície: nunca afirmar “itens finais”; no máximo “itens impressos”; sombra registra flag `pode_ter_correcao_manual=unknown` |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Sim se UI apresentar lista de itens como verdade final |
| **Depende da inspeção da loja?** | Não |
| **Confiança** | Alta |

### G-E-05 — Colisão de vocabulário Quentes × Cozinha

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-05 |
| **Gravidade** | Alta (Mapa de Ambientes / copy) |
| **Evidência** | `DISPLAY.cozinha_quentes = "Quentes"`; César: Quentes ≠ Cozinha; `Mapa_Ambientes_V1.md` §2 |
| **Arquivo** | `src/perfil-delivery/motor.js:25-28`, `docs/Mapa_Ambientes_V1.md` |
| **Cenário real** | “Priorize Quentes” manda equipe para hot rolls quando o gargalo é prato de cozinha (ou o inverso) |
| **Impacto** | Destrói confiança em uma sexta (Lei 12) |
| **Reproduzir/validar** | Perguntas §13 do Mapa de Ambientes ao César |
| **Recomendação** | Bloquear implementação de mapa 6 áreas e de renomeação de DISPLAY sem validação; Fable não “conserta” display por conta própria |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Sim para mapa de ambientes e copy de praça se mal rotulada |
| **Depende da inspeção da loja?** | Depende de validação César (áudio/operacional), não de spool |
| **Confiança** | Alta |

### G-E-06 — Documento Estado Atual desatualizado vs repositório

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-06 |
| **Gravidade** | Média (risco de decisão errada por contexto) |
| **Evidência** | `Estado_Atual_DeliveryOS.md` fala em HEAD `d8f227f`, correção “aguardando autorização”, “não commitados”; repositório em `a441bc7` com `decisao.js` já filtrando `opts.active` e relatório pós-correção presente |
| **Arquivo** | `docs/Estado_Atual_DeliveryOS.md` vs `src/perfil-delivery/decisao.js`, `docs/Relatorio_Pos_Correcao_Motor_Decisao.md` |
| **Cenário real** | Agente ou humano “reimplementa” correção já feita; ou trata divergência 30,8% como aberta |
| **Impacto** | Retrabalho; desconfiança no corpus documental |
| **Reproduzir/validar** | Diff de datas/commits no topo dos docs vs `git log` |
| **Recomendação** | Atualizar Estado Atual em missão própria (fora deste red team de docs adversarial) |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Não |
| **Depende da inspeção da loja?** | Não |
| **Confiança** | Alta |

### G-E-07 — Ambiente / pressão sem piso temporal próprio

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-07 |
| **Gravidade** | Média |
| **Evidência** | Red Team consciência + Estado Atual §8; commits recentes de pressão por ambiente no Calmo |
| **Arquivo** | `docs/RedTeam_Modelo_Operacional_Consciencia.md` (referência), `app-v1/` |
| **Cenário real** | Rótulos amarelos piscando a cada minuto; equipe aprende a ignorar (Lei 12) |
| **Impacto** | Poluição de atenção sem ser Foco |
| **Reproduzir/validar** | Replay 01/07 contando flips de `ambList` por minuto |
| **Recomendação** | Qualquer sinal novo de “pressão” no Calmo precisa debounce e raridade; checklist Fable |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Parcial (se a equipe ignora a tela, o produto morre) |
| **Depende da inspeção da loja?** | Não |
| **Confiança** | Média |

### G-E-08 — Servidor local na rede da loja sem modelo de ameaça

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-08 |
| **Gravidade** | Alta (segurança/privacidade se exposto) |
| **Evidência** | Arquitetura prevê `servir_v1` + poll na LAN; comanda contém nome, telefone proxy, endereço; política proíbe PII no Git mas não define binding 127.0.0.1 vs 0.0.0.0 |
| **Arquivo** | `docs/Arquitetura_Sincronizacao_Local_V1.md` §8, `docs/Politica_Dados.md`, `tools/servir_v1.js` |
| **Cenário real** | Guest Wi-Fi ou vizinho de rede lê JSONL com pedidos do dia |
| **Impacto** | LGPD / confiança da loja / incidente desproporcional ao benefício do piloto |
| **Reproduzir/validar** | Revisar bind address e autenticação no servidor local futuro |
| **Recomendação** | Default: localhost ou rede com auth; **nunca** PII desnecessária no snapshot da V1; feature flag |
| **Bloqueia Fase Sombra?** | Não se só arquivo local no caixa |
| **Bloqueia operação real?** | Sim se exposto sem controle |
| **Depende da inspeção da loja?** | Topologia de rede da loja |
| **Confiança** | Média-alta |

### G-E-09 — Falsa precisão da interface sobre dado histórico

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-09 |
| **Gravidade** | Média |
| **Evidência** | V1 roda janela real com `fonteReal: true`; multi-praça 70–87% mal explicado (auditoria praça); baseline provisório no motor |
| **Arquivo** | `app-v1/app.js`, `docs/Auditoria_Praca_Comanda_Atencoes_V1.md`, `motor.js` BASELINE |
| **Cenário real** | Demo impressiona; operação real tem latência, rasura, half-match — percepção “o sistema errou” |
| **Impacto** | Expectativa > capacidade |
| **Reproduzir/validar** | Demo com banner “replay · composição real · não ao vivo” |
| **Recomendação** | Superfície e relatórios sempre rotulam modo: replay / sombra / live |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Indiretamente (adoção) |
| **Depende da inspeção da loja?** | Não |
| **Confiança** | Alta |

### G-E-10 — Dependência de node_modules / ambiente de build não portável nesta máquina

| Campo | Conteúdo |
|---|---|
| **ID** | G-E-10 |
| **Gravidade** | Baixa-Média (engenharia) |
| **Evidência** | `node_modules` ausente; npm.ps1 bloqueado por ExecutionPolicy; typecheck não rodou |
| **Arquivo** | `package.json`, esta sessão |
| **Cenário real** | Clone novo “não roda” sem `npm install`; contradiz parcialmente a promessa de portabilidade |
| **Impacto** | Atrito de continuidade; não é bug de produto |
| **Reproduzir/validar** | Clone limpo + política de execução Windows |
| **Recomendação** | Documentar `npm.cmd` / policy no Procedimento de Continuidade; Fable não depende disto para capturador se for JS puro |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Não |
| **Depende da inspeção da loja?** | Não |
| **Confiança** | Alta |

---

## 5. Onde o produto pode atrapalhar a equipe

1. **Chamar atenção demais** — Ambiente + pressões no Calmo + Foco sem raridade real.
2. **Chamar atenção no lugar errado** — G-E-03, G-E-05, multi-praça sem explicação.
3. **ID impossível de gritar** — UUID interno vs curto iFood vs sequência Odhen.
4. **Segundo navegador / mini-PC** competindo por foco do Windows (mesmo “sem clique”).
5. **Silêncio perigoso** — capturador morto mas UI em Calmo “saudável” (Lei 3: calmo ≠ quebrado — precisa de pulso de **saúde da fonte** separado do pulso operacional).

---

## 6. Silêncio perigoso vs gritaria

| Modo de falha | Sintoma | Mitigação mínima |
|---|---|---|
| Fonte desconectada | Calmo falso | Estado explícito `fonte: erro/offline` fora do modelo cognitivo |
| Dado antigo (stale clock / poll parado) | Ações sobre ontem | Timestamp de última observação + age alert |
| Half-match | Pedido sem itens ou sem status | Não inventar; não focar |
| Reimpressão | Contagem dupla de carga | Dedup por `pedido_interno`+hash |
| Cancelamento só no Gestor | Itens ainda “em produção” | Evento cancel prevalece sobre comanda |

---

## 7. Priorização consolidada

### Bloqueadores de Fase Sombra **live** (captura)

- G-E-01 inspeção loja (spool + DOM)
- Contrato de eventos parciais (G-E-02) sem fingir casamento completo
- Health da fonte (não confundir com Calmo operacional)

### Bloqueadores de Fase Sombra **cognitiva** (export/replay)

- Nenhum crítico de código: correção Motor×Decisão e app-v1 já alinhados
- Precisa: dados de janela / raw disponíveis localmente; modo rotulado

### Bloqueadores de teste na loja

- Roteiros de inspeção executados com números
- Critério de parada se impressão atrasar (já no plano da auditoria fonte viva)
- Isolamento de sessão (Nível 1 mínimo se Modelo A)

### Bloqueadores de operação real

- G-E-01, G-E-02, G-E-04 (UI), G-E-05 (se mapa/copy), G-E-08 (rede), embalagens se expostas como fato (G-E-03)
- Prova de não interferência na impressão em sexta/domingo
- Rollback e pause do capturador em um gesto

### Dívidas importantes (não bloqueiam se rotuladas)

- Atualizar Estado Atual (G-E-06)
- Debounce de Ambiente (G-E-07)
- Assimetria `firedAt` (doc legado)
- Memória Operacional / Resolução (proibidas cedo)

### Polimento

- Copy E1–E5 do contrato cognitivo
- Multi-praça “depende de A, B, C”
- `prototipos/parados-agora` legado sem `active` (não usar como demo)

---

## 8. O que o Fable pode fazer agora vs não

### Pode (com gates)

- Contrato de eventos + schema de fila local (JSONL) **sem** ligar na loja
- Simulador de spool/DOM com fixtures sintéticas rotuladas
- Feature flags: `shadow_only`, `no_click`, `bind_localhost`
- Dedup / consolidação / half-match em testes unitários
- Logging sem PII
- Revisar commits contra `Checklist_Adversarial_Revisao_Fable.md`

### Não pode antes da loja

- Declarar “fonte viva validada”
- Automação de clique no Gestor
- Interceptar porta da impressora
- Gravar cookies/senhas
- Expor servidor na LAN com endereço de cliente
- Implementar embalagens V0 como fato
- Renomear praças/mapa sem César
- Tratar silêncio de captura como Calmo operacional

---

## 9. Resposta direta às perguntas estratégicas

| Pergunta | Resposta |
|---|---|
| Resolve o problema certo? | **Sim** — atenção e investigação, não ERP |
| Arquitetura simples demais / demais? | **Cérebro: adequada. Fonte viva: ainda desenho — risco de overbuild** |
| Epson + Gestor é o melhor? | **Melhor hipótese operacional confirmada por relato; não melhor prova técnica** |
| Hipóteses restantes? | DOM model, spool legível, latência, colisão ID, Animo, banco Odhen, utilidade em pico |
| Falsa confiança? | Docs/estado desatualizado; demo replay; “duas fontes” como se já existissem |
| Atrapalhar equipe? | Copy errada, gritaria de ambiente, segundo processo no caixa |
| Silêncio perigoso? | Calmo sem health de fonte; cancel/rasura invisíveis |
| Atenção demais? | Pressão no Calmo + Ambiente sem debounce |
| UI mais precisa que o dado? | Itens impressos ≠ sacola final; sacola heurística; multi-praça |

---

## 10. Índice da biblioteca adversarial desta pasta

1. Este arquivo — visão estratégica e achados G-E-*
2. `Red_Team_Operacao_Real_Loja.md` — cenários de turno e falha
3. `Cenarios_Extremos_PreLoja.md` — tabela extrema + gates
4. `Critica_Arquitetura_Fonte_Viva.md` — ataque à combinação de fontes
5. `Checklist_Adversarial_Revisao_Fable.md` — revisão de PRs/commits
6. `Registro_Decisoes_Contestadas.md` — decisões sem consenso/evidência

---

*Red Team Grok · sem implementação · patrimônio para sobreviver ao fim deste acesso.*
