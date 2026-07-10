# Registro de Decisões Contestadas

> Decisões do DeliveryOS **ainda sem consenso ou sem evidência suficiente** para fechar.
> Formato obrigatório por entrada. Red Team Grok · 10/07/2026 · HEAD `a441bc7`.
> Não são “opiniões bloqueadoras”: cada uma aponta **experimento** que resolve a dúvida.

---

## DC-01 — Combinar Epson (spool) + Gestor iFood (DOM) como path principal de fonte viva

| Campo | Conteúdo |
|---|---|
| **Decisão** | Path principal de captura live = fila de impressão Windows (itens/sequência) + leitura passiva do Gestor (status/cancel) |
| **Posição atual** | Documentada como recomendação em `Auditoria_Fonte_Viva_Loja_V1.md` e `Arquitetura_Sincronizacao_Local_V1.md`; **não implementada**; inspeção real **não executada** |
| **Argumento a favor** | Espelha o chão: Odhen some pós-print; Gestor é quem acompanha ciclo; Epson na fila normal; comanda única simplifica parser; não toca cabo nem POS |
| **Argumento contra** | Spool pode ser RAW ilegível; DOM pode ser virtualizado; sync por ID curto é frágil; complexidade de sistema distribuído sem contrato de fornecedor; API oficial seria superior se existisse |
| **Evidência existente** | Relato César; fotos de comanda/Gestor; sintaxe PowerShell em impressoras genéricas; separação A/B no motor |
| **Evidência ausente** | DataType real da Epson; tempo de vida do job; Modelo A/B/C do DOM; taxa de miss em pico; colisões de ID no dia vivo |
| **Risco de decidir errado** | Meses de capturador inútil; ou risco de click/scroll se o path errado for forçado |
| **Experimento que resolve** | Executar `Inspecao_Fontes_Reais_Loja_V0` Parte 1+3 no caixa; registrar números; 1 dia S1 sombra com kill switch |

---

## DC-02 — Casamento exclusivamente pelo código curto do iFood

| Campo | Conteúdo |
|---|---|
| **Decisão** | Unir fontes pelo campo IFOOD/curto |
| **Posição atual** | Assumido na arquitetura; auditoria de comanda mostra colisão rara na janela e reuso entre meses |
| **Argumento a favor** | Único campo confirmado nas duas fontes; operação do Gestor já o exibe |
| **Argumento contra** | Não é identidade global; Animo/WhatsApp; curto pode coincidir visualmente com sequência sem garantia semântica |
| **Evidência existente** | 1 colisão/238 (01/07); 0/116 (23/06); campo presente nas fotos de comanda |
| **Evidência ausente** | Distribuição de colisões em 30+ dias live; comportamento multi-canal no Odhen |
| **Risco de decidir errado** | Merge silencioso = pior classe de bug operacional |
| **Experimento** | Script offline em exports: colisões por dia; fixture de conflito no consolidator com assert de não-merge |

---

## DC-03 — Sequência Odhen vs ID curto iFood como identificador gritável

| Campo | Conteúdo |
|---|---|
| **Decisão** | (Implícita na V1) preferir curto iFood na UI; chão usa sequência da comanda |
| **Posição atual** | V1: curto quando não ambíguo; comanda digital ausente nos exports |
| **Argumento a favor do curto** | Já nos dados históricos; Gestor alinha |
| **Argumento a favor da sequência** | É o que a equipe grita; cabe na comanda física |
| **Evidência existente** | Relato César; auditoria praça/comanda |
| **Evidência ausente** | Taxa de igualdade sequencia==curto em N comandas; preferência da equipe em teste A/B de grito |
| **Risco** | UI grita número que ninguém usa → tela ignorada |
| **Experimento** | Em T: anotar 20 gritos reais vs o que a UI mostrou; se divergir, display_id = sequência quando capturada |

---

## DC-04 — Heurística de 2ª sacola do motor vs lógica de embalagens V0

| Campo | Conteúdo |
|---|---|
| **Decisão** | Motor mantém `segundaSacola = combo \|\| ≥8 itens`; doc V0 descreve quente/frio/volume/bebidas |
| **Posição atual** | Heurística em produção cognitiva; embalagens **não** codificadas; doc diz não automatizar sem matriz |
| **Argumento a favor de manter heurística** | Já gera sinal de conferência; 100% casamento de itens; mudança exige validação pesada |
| **Argumento a favor de V0** | É a regra real do César; heurística erra em quente+frio pequeno e em combo que cabe em 1 |
| **Evidência existente** | Código motor; doc embalagens; 47–61% pedidos com 2ª sacola na heurística |
| **Evidência ausente** | Matriz item→caixa validada; amostra papel×heurística |
| **Risco** | Foco de conferência errado (Lei 12) se exposto como fato |
| **Experimento** | 50 pedidos: classificação humana de sacolas vs motor vs regras V0; só então proposta de mudança |

---

## DC-05 — Mapa de Ambientes com 6 áreas (inclui Caixa e Conferência como estação)

| Campo | Conteúdo |
|---|---|
| **Decisão** | Proposta de mapa Verde/Amarelo/Vermelho até 6 ambientes |
| **Posição atual** | Doc `Mapa_Ambientes_V1.md`; implementação parcial de clima; **sem** validação César do mapa praça→ambiente |
| **Argumento a favor** | Vocabulário da operação (César); clima multi-área pode superar 2 rótulos |
| **Argumento contra** | Caixa e Conferência-como-fila **não mensuráveis** com fonte atual; risco de verde falso; colisão Quentes/Cozinha; escorrega para dashboard |
| **Evidência existente** | Proposta + riscos documentados; loads de praça existem |
| **Evidência ausente** | Respostas §13 do mapa; sinal digital de caixa; fila de conferência |
| **Risco** | Mentira por omissão (Lei 5); perda de confiança |
| **Experimento** | Áudio César §13; se Caixa/Conferência sem sinal, mapa só com 4 áreas honestas ou omitir as cegas |

---

## DC-06 — Rótulo DISPLAY `cozinha_quentes` = "Quentes"

| Campo | Conteúdo |
|---|---|
| **Decisão** | Nome de UI do motor para praça de pratos de cozinha |
| **Posição atual** | Código atual; conflito explícito com vocabulário César (Quentes ≈ hot/enrolados quentes) |
| **Argumento a favor de manter** | Mudar display sem validação quebra consistência de docs/testes de copy |
| **Argumento a favor de renomear** | Operador lê “Quentes” e vai à bancada errada |
| **Evidência** | `motor.js` DISPLAY; `Mapa_Ambientes` §2 |
| **Evidência ausente** | Confirmação formal de 5 itens por ambiente |
| **Risco** | Destruição de confiança em um pico |
| **Experimento** | Lista de 5+5 itens do César; depois PR **só** de DISPLAY/copy, sem lógica |

---

## DC-07 — Fase Sombra live antes de API oficial iFood

| Campo | Conteúdo |
|---|---|
| **Decisão** | Seguir com capturador local enquanto fonte contínua oficial está em pedido/negociação |
| **Posição atual** | Mensagem/checklist de fonte contínua existem; path local é plano B/pragmático |
| **Argumento a favor do local** | Não esperar política externa; Lei 11 observar cedo; n=1 loja controlável |
| **Argumento contra** | Fragilidade DOM; ToS iFood; custo de manutenção de seletores; API mataria metade do capturador |
| **Evidência** | Plano V1 admite sombra em export; auditoria fonte viva |
| **Evidência ausente** | Resposta iFood ao pedido; ToS review formal |
| **Risco** | Investir no adaptador errado (mitigável se JSONL canônico for o ativo) |
| **Experimento** | Isolar **contrato JSONL** do adaptador; se API chegar, trocar só o adaptador (Lei 10) |

---

## DC-08 — Leitura passiva DOM vs scroll vs network sniffing

| Campo | Conteúdo |
|---|---|
| **Decisão** | Preferir DOM em repouso (A); scroll se B; network (C) “não perseguir agora” |
| **Posição atual** | Recomendação documental; modelo real desconhecido |
| **Argumento a favor de A** | Menor risco de interação |
| **Argumento a favor de network** | Dados estruturados; sem virtualização visual |
| **Argumento contra network** | Fronteira com sessão autenticada; ToS; tentação de reauth |
| **Evidência ausente** | Classificação A/B/C/D da página real |
| **Risco** | Escolher B/C cedo demais → click risk ou compliance risk |
| **Experimento** | Só a inspeção §6.8 / Parte 1; decidir **depois** dos números |

---

## DC-09 — Isolamento: mesma máquina vs mini-PC

| Campo | Conteúdo |
|---|---|
| **Decisão** | Piloto: perfil dedicado no PC do caixa; robusto: mini-PC |
| **Posição atual** | Níveis 1–3 em `Inspecao` §5; segundo monitor **não** é isolamento |
| **Argumento a favor do PC único** | Custo zero; volume de uma loja |
| **Argumento a favor do mini-PC** | Isola crash/CPU/foco de automação |
| **Evidência ausente** | Medida de CPU/impacto em sexta no PC real |
| **Risco** | Atrapalhar caixa no pico (produto “culpado” mesmo se UI estiver certa) |
| **Experimento** | T em segunda no Nível 1; se CPU ou foco Windows degradar, escalar Nível 3 antes de P |

---

## DC-10 — Expor UI na LAN (tablet/monitor) no piloto

| Campo | Conteúdo |
|---|---|
| **Decisão** | Servidor local multi-dispositivo como no `servir_v1` |
| **Posição atual** | Arquitetura §8; segurança de bind/auth não fechada |
| **Argumento a favor** | Superfícies reais (boqueta, conferência) |
| **Argumento contra** | PII na rede; guest Wi-Fi; superfície de ataque desproporcional ao piloto |
| **Evidência ausente** | Topologia de rede da loja; necessidade real de multi-tela no dia 1 |
| **Risco** | Incidente de privacidade mata o projeto politicamente |
| **Experimento** | P0: só localhost no caixa; P1: LAN com token + snapshot sem endereço/tel |

---

## DC-11 — Tratar correção à caneta como limitação permanente vs tentar capturar

| Campo | Conteúdo |
|---|---|
| **Decisão** | V1 declara limitação; não tenta OCR de rasura |
| **Posição atual** | Confirmado: não está no iFood; só papel |
| **Argumento a favor da limitação** | Honesto (Lei 5); OCR frágil; não há fonte digital |
| **Argumento contra** | Operação real diverge do sistema nos pedidos mais “especiais” |
| **Evidência** | Foto com “não foi”; relato César |
| **Evidência ausente** | Frequência de rasura por turno |
| **Risco** | Se frequente e UI confiante, erro de sacola |
| **Experimento** | Contagem 1 semana: % comandas com rasura; se >X%, copy ainda mais cautelosa / não listar itens em Foco |

---

## DC-12 — Baseline e floors provisórios em uso “como se calibrados”

| Campo | Conteúdo |
|---|---|
| **Decisão** | Usar BASELINE/TEMPO_PRACA/FLOORS provisórios para o motor rodar |
| **Posição atual** | Código rotula provisório; docs proíbem tuning agora |
| **Argumento a favor** | Sem números o motor não elege foco; ok para sombra cognitiva |
| **Argumento contra** | Em live, baseline de “noite de lab” vira gritaria ou silêncio |
| **Evidência** | Comentários no motor; proibição de tuning no Estado Atual / Plano |
| **Evidência ausente** | Calibração com composição real multi-dia **autorizada** |
| **Risco** | Lei 12 se thresholds errados no piloto |
| **Experimento** | Sombra: medir distribuição de sevs sem mudar thresholds; só então missão de calibração |

---

## DC-13 — Pressão / sinais de fluxo no Calmo

| Campo | Conteúdo |
|---|---|
| **Decisão** | Commits recentes adicionam pressão por ambiente / sinais de fluxo no Calmo V1 |
| **Posição atual** | Em main/`a441bc7` (histórico: `479bebd` etc.); tensão com “Calmo quase não fala” |
| **Argumento a favor** | Calmo morto não distingue saúde de quebra; clima leve ajuda |
| **Argumento contra** | Ambiente disfarçado no Calmo; pisca; polui; Lei 2/3/12 |
| **Evidência** | Código app-v1 + commits; Red Team consciência sobre debounce de ambiente |
| **Evidência ausente** | Contagem de flips; teste com César se ajuda ou irrita |
| **Risco** | Ignorar a tela cedo |
| **Experimento** | Replay: taxa de elementos de atenção em `mode=calmo`; se alta, reverter para pulso puro em missão de UX |

---

## DC-14 — Sombra cognitiva (export) basta para “V1” vs exigir live

| Campo | Conteúdo |
|---|---|
| **Decisão** | Plano V1: modo sombra e relatório de turno sobre export pós-turno são válidos |
| **Posição atual** | Plano de entrega §0; track pré-loja é paralelo |
| **Argumento a favor do export** | Prova o núcleo sem arriscar impressão |
| **Argumento a favor do live** | Valor real é durante o turno, não no pós |
| **Evidência** | Motor×Decisão já medido em 12 janelas; live não existe |
| **Risco** | Declarar V1 “pronta para loja” só com export = falsa confiança |
| **Experimento** | Separar releases: **V1 cognitiva** (export) vs **V1 viva** (captura); nunca o mesmo selo |

---

## DC-15 — Atualização do documento Estado Atual vs “repositório vence”

| Campo | Conteúdo |
|---|---|
| **Decisão** | Processo: se doc diverge, repo vence e doc deve atualizar |
| **Posição atual** | `Estado_Atual` desatualizado (HEAD antigo, correção “pendente”) enquanto código já tem filtro `active` |
| **Argumento a favor de atualizar já** | Reduz reimplementação e confusão entre agentes (Fable/Grok/Claude) |
| **Argumento a favor de esperar** | Missão red team não mexe em docs de estado executivo sem autorização ampla |
| **Evidência** | Diff conceitual Estado Atual vs `decisao.js` / commits |
| **Risco** | Trabalho duplicado; decisões sobre divergência 30,8% já morta |
| **Experimento** | Missão curta só de sincronizar Estado Atual com `git log` e gates reais |

---

## Índice rápido — o que mais ameaça o próximo passo

| ID | Se não resolver, o que quebra |
|---|---|
| DC-01 + DC-08 | S1 captura |
| DC-02 | Integridade do casamento |
| DC-03 | Adoção (grito) |
| DC-04 + DC-05 + DC-06 | Confiança se UI expandir |
| DC-10 | Privacidade do piloto multi-tela |
| DC-14 | Expectativa de produto |

---

## Como o Fable deve usar este registro

1. **Não “decidir” sozinho** itens DC-01, DC-05, DC-06, DC-10, DC-14.
2. Pode **implementar experimentos e flags** que deixem a decisão reversível.
3. Todo PR que assume uma DC deve citar o ID e o estado: `assumido | experimentando | bloqueado`.
4. Fechamento de DC exige evidência no repo (relatório com números) + aprovação César quando operacional.

---

*Fim do registro · biblioteca adversarial em `docs/auditoria-grok/`.*
