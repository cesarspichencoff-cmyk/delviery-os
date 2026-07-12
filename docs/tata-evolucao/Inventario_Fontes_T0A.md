# Inventário de Fontes — T0A (TATÁ Evolução)

> Inventário da fundação para mineração futura (T0B). **Nenhum arquivo bruto foi movido ou
> copiado para o Git nesta missão.** Ambiente: worktree `deliveryos-tata-evolucao`, branch
> `research/tata-evolucao-grok`, HEAD base `a441bc7`.
>
> Confiança de “localizado”: **no repositório versionado** vs **apenas documentado** vs
> **ausente neste ambiente**.

---

## 1. Resumo executivo

| Categoria | Qtd (aprox.) | No Git? | Prioridade T0B |
|---|---:|---|---|
| Documentação DeliveryOS (`docs/*.md`) | 49 | Sim (texto) | Alta (síntese cultural/operacional) |
| Cardápio / conhecimento (seed) | 2 + CSV exemplo | Sim (sem PII de cliente) | Alta (regras de produto) |
| Código motor / tools / app-v1 | ~30+ arquivos | Sim | Média (sinais e vocabulário; não é memória humana) |
| Relatórios iFood brutos (xlsx/html) | lotes documentados | **Não** (gitignorado / Downloads) | Alta se recuperáveis |
| WhatsApp (13 conversas) | ~155k–171k msgs | **Não** (fora do repo) | **Máxima** se recuperáveis |
| PDFs Bloco 3 qualidade | 8 PDFs | **Não** | Alta |
| Fotos/kit/comandas | esparsas | **Não** | Média |
| RH formal / treinamentos oficiais | 0 localizados aqui | — | Lacuna |
| Manuais de onboarding Delivery | 0 localizados aqui | — | Lacuna |

**Fontes mais valiosas para cultura e formação (se acessíveis):** WhatsApp + estudo já sintetizado;
Leis/Constituição/Manifesto; embalagens; mapas de sinais; relatórios de qualidade/avaliações;
cardápio seed.

---

## 2. Fontes **no repositório** (inspecionadas)

### SRC-DOC-CORE — Documentos fundadores DeliveryOS

| Campo | Valor |
|---|---|
| **source_id** | SRC-DOC-CORE |
| **Descrição** | Constituição, Leis Fundamentais, Manifesto de Produto e Design |
| **Localização** | `docs/Constituicao.md`, `docs/Leis_Fundamentais.md`, `docs/Manifesto_Produto_Design.md` |
| **Formato** | Markdown |
| **Período** | Jul/2026 (elaboração) |
| **Tamanho** | ~7–10 KB cada |
| **Volume** | 3 docs |
| **Área** | cultura / produto / ética operacional |
| **PII** | Baixa (sem clientes; nomes de princípios) |
| **Confiabilidade** | Alta (canônico do DeliveryOS) |
| **Duplicidade** | Baixa |
| **Utilidade T0B** | Muito alta — base de “o que é inegociável” |
| **Prioridade T0B** | P0 |
| **Restrições** | Não reescrever sem César; TATÁ Evolução **referencia**, não duplica em silêncio |
| **Método de leitura** | Leitura integral humana; tags de valor/lei → taxonomia |

### SRC-DOC-WHATSAPP-STUDY — Estudo das conversas WhatsApp

| Campo | Valor |
|---|---|
| **source_id** | SRC-DOC-WHATSAPP-STUDY |
| **Descrição** | Síntese de 4 anos de WhatsApp operacional (achados F1–Fn, metodologia) |
| **Localização** | `docs/Estudo_Conversas_WhatsApp.md` |
| **Formato** | Markdown |
| **Período** | Cobre 2020–2026 (estudo) |
| **Tamanho** | ~10 KB (síntese; **não** o bruto) |
| **Volume** | 1 doc; cita 13 conversas e contagem divergente 155k vs 171k msgs |
| **Área** | cultura, liderança, erros, pausa, custódia, kit |
| **PII** | **Média no estudo** (nomes de equipe citados como evidência); bruto original tem nomes |
| **Confiabilidade** | Alta nos padrões qualitativos; contagem de msgs com divergência aberta |
| **Duplicidade** | Sobreposição temática com red teams e mapa de sinais |
| **Utilidade T0B** | **Máxima como índice**; não substitui reabertura controlada do bruto |
| **Prioridade T0B** | P0 (ler estudo inteiro antes de reabrir chats) |
| **Restrições** | Não copiar trechos com nomes desnecessários para novos docs; preferir source_id + resumo |
| **Método** | Mapeamento estudo → taxonomia; lista de temas candidatos (já parcialmente extraídos) |

### SRC-DOC-INVENTARIO-DADOS — Inventário de dados primários DeliveryOS

| Campo | Valor |
|---|---|
| **source_id** | SRC-DOC-INVENTARIO-DADOS |
| **Descrição** | Lotes brutos recebidos (iFood HTML/xlsx), hashes, classificação |
| **Localização** | `docs/Inventario_Dados_Primarios.md` |
| **Formato** | Markdown |
| **Período** | Lotes 2026 (ex.: 01/07, Abr–Jun) |
| **Tamanho** | ~19 KB |
| **Área** | qualidade, composição, avaliações |
| **PII** | Baixa nos exports descritos (sem nome/tel/endereço nos pedidos) |
| **Confiabilidade** | Alta como inventário |
| **Utilidade T0B** | Alta para baseline de qualidade e erros de pedido |
| **Prioridade T0B** | P1 |
| **Restrições** | Brutos não estão no Git |
| **Método** | Usar como catálogo; localizar arquivos em private-sources ou raw local |

### SRC-DOC-AUDITORIAS — Auditorias e relatórios operacionais

| Campo | Valor |
|---|---|
| **source_id** | SRC-DOC-AUDITORIAS |
| **Descrição** | Auditorias de dados, nível 2, fonte viva, praça/comanda, replays 12 janelas, divergência motor×decisão, etc. |
| **Localização** | `docs/Auditoria_*.md`, `docs/Relatorio_*.md`, `docs/Medicao_*.md` |
| **Formato** | Markdown |
| **Período** | 2026 (análises) sobre dados 2023–2026 |
| **Volume** | ~25+ docs (~0,5 MB texto) |
| **Área** | operação, praça, embalagem, qualidade |
| **PII** | Baixa–média (referências a Downloads, nomes de arquivos) |
| **Confiabilidade** | Alta técnica |
| **Utilidade T0B** | Média–alta (sinais de erro, viés sintético, 2ª sacola, alergias contadas) |
| **Prioridade T0B** | P1 |
| **Método** | Extração de **métricas e hipóteses**, não de pessoas |

### SRC-DOC-EMBALAGENS — Lógica de embalagens V0

| Campo | Valor |
|---|---|
| **source_id** | SRC-DOC-EMBALAGENS |
| **Descrição** | Regras de caixa/sacola/quente-frio do César |
| **Localização** | `docs/Logica_Embalagens_DeliveryOS_V0.md` |
| **Formato** | Markdown |
| **Tamanho** | ~17 KB |
| **Área** | embalagem, caixa, conferência |
| **PII** | Nenhuma |
| **Confiabilidade** | Alta (validada com César; pendências §15 abertas) |
| **Utilidade T0B** | Alta para conteúdo de formação de montagem/caixa |
| **Prioridade T0B** | P0 |
| **Método** | Transformar regras em competências e cenários (T1+), após validação de pendências |

### SRC-DOC-SINAIS — Mapa de sinais e modelo de consciência

| Campo | Valor |
|---|---|
| **source_id** | SRC-DOC-SINAIS |
| **Descrição** | Sinais operacionais, modelo consciência, contratos cognitivos |
| **Localização** | `docs/Mapa_Sinais_Operacionais.md`, `docs/Modelo_Operacional_Consciencia_DeliveryOS.md`, contratos V1 |
| **Formato** | Markdown |
| **Área** | atenção, decisão, liderança de turno |
| **PII** | Nenhuma |
| **Utilidade T0B** | Alta para “o que a operação precisa ver” e formação de liderança |
| **Prioridade T0B** | P1 |

### SRC-DOC-POLITICA-DADOS — Política de dados do repo

| Campo | Valor |
|---|---|
| **source_id** | SRC-DOC-POLITICA-DADOS |
| **Descrição** | O que entra/não entra no Git; raw vs gerado vs seed |
| **Localização** | `docs/Politica_Dados.md` |
| **Utilidade T0B** | Obrigatória (alinhamento com privacidade TATÁ Evolução) |
| **Prioridade T0B** | P0 (leitura de governança) |

### SRC-SEED-CARDAPIO — Cardápio conhecimento

| Campo | Valor |
|---|---|
| **source_id** | SRC-SEED-CARDAPIO |
| **Descrição** | 199 itens, 8 praças, temperatura, sinais |
| **Localização** | `data/cardapio_knowledge_seed.json` (~306 KB), `data/cardapio_fonte.txt` (~24 KB) |
| **Formato** | JSON / texto |
| **Período** | Cadastro set-once 2026 |
| **Volume** | 199 itens (contagem de `"id"` no seed) |
| **Área** | cardápio, produção, praças |
| **PII** | Nenhuma |
| **Confiabilidade** | Alta (100% casamento em janelas reais documentado) |
| **Utilidade T0B** | Alta para trilha de cardápio e erros de item |
| **Prioridade T0B** | P1 |
| **Método** | Diff/consulta por categoria; **não** carregar em docs longos |

### SRC-CSV-EXEMPLO — Noite exemplo

| Campo | Valor |
|---|---|
| **source_id** | SRC-CSV-EXEMPLO |
| **Descrição** | CSV sintético/real de demo de itens |
| **Localização** | `data/exemplo_noite_real.csv` (587 bytes) |
| **Utilidade T0B** | Baixa (fixture) |
| **Prioridade T0B** | P3 |

### SRC-CODE-MOTOR — Código perfil delivery e tools

| Campo | Valor |
|---|---|
| **source_id** | SRC-CODE-MOTOR |
| **Descrição** | `src/perfil-delivery/motor.js`, `decisao.js`, tools de replay/autoteste |
| **Localização** | `src/`, `tools/`, `app-v1/` |
| **Formato** | JS/TS |
| **Área** | sinais de praça, conferência, saída |
| **PII** | Nenhuma no código |
| **Utilidade T0B** | Média — vocabulário de situações (não substitui cultura humana) |
| **Prioridade T0B** | P2 |
| **Restrições** | **Não alterar** nesta branch de pesquisa cultural |

### SRC-DOC-FONTE-VIVA — Auditoria loja / comanda / iFood Gestor

| Campo | Valor |
|---|---|
| **source_id** | SRC-DOC-FONTE-VIVA |
| **Descrição** | Como a loja imprime, acompanha status, limitações de rasura |
| **Localização** | `docs/Auditoria_Fonte_Viva_Loja_V1.md`, `docs/Parser_Comanda_Tecnisa_V1.md`, inspeção V0 |
| **Utilidade T0B** | Média (contexto de caixa/conferência) |
| **Prioridade T0B** | P2 |

### SRC-CLAUDE-MD — Contrato de trabalho DeliveryOS

| Campo | Valor |
|---|---|
| **source_id** | SRC-CLAUDE-MD |
| **Descrição** | Como agentes devem trabalhar no DeliveryOS |
| **Localização** | `CLAUDE.md`, `README.md`, `ARQUITETURA.md` |
| **Utilidade T0B** | Baixa para conteúdo de equipe; alta para **não** misturar missões |
| **Prioridade T0B** | P3 |

---

## 3. Fontes **documentadas mas não localizadas neste ambiente**

> Estes itens **existem na narrativa do projeto** e em auditorias, mas **não** foram abertos nem
> encontrados no worktree (pastas raw vazias; `../deliveryos-private-sources` inexistente;
> Downloads não listou os pacotes neste ambiente de inspeção).

### SRC-EXT-WHATSAPP-RAW — 13 conversas WhatsApp

| Campo | Valor |
|---|---|
| **source_id** | SRC-EXT-WHATSAPP-RAW |
| **Descrição** | Exports `_chat.txt` (iOS), 13 conversas, ~4 anos |
| **Localização esperada** | Historicamente `Projeto tata/Bloco 2` / Downloads; **não no Git** |
| **Formato** | ZIP / TXT |
| **Período** | 2020-04 → 2026-06 (por estudo) |
| **Volume** | 13 arquivos; **155.333 ou 171.448** msgs (divergência 9% aberta) |
| **Área** | quase todas |
| **PII** | **Alta** (nomes de equipe, possível contexto sensível) |
| **Confiabilidade** | Alta se arquivos originais intactos |
| **Duplicidade** | Alta (mesmas decisões em vários chats) |
| **Utilidade T0B** | **Máxima** |
| **Prioridade T0B** | **P0** — **bloqueia mineração profunda** se ausente |
| **Restrições** | Só em `../deliveryos-private-sources/`; nunca commit; amostragem + anonimização |
| **Método** | Ver `Plano_Mineracao_T0B.md`; inventário por arquivo antes de abrir tudo |
| **Status T0A** | **NÃO LOCALIZADO** neste ambiente |

### SRC-EXT-BLOCO3-PDF — PDFs qualidade 2023–2024

| Campo | Valor |
|---|---|
| **source_id** | SRC-EXT-BLOCO3-PDF |
| **Descrição** | 8 PDFs mensais agregados (cancelamentos, avaliações, turnos) |
| **Localização esperada** | Bloco 3 / Downloads |
| **Formato** | PDF com texto nativo (sem OCR) |
| **Período** | 2023–2024 (meses parciais) |
| **PII** | Baixa (agregados) |
| **Utilidade T0B** | Alta para baseline de qualidade |
| **Prioridade T0B** | P0 |
| **Status T0A** | **NÃO LOCALIZADO** |

### SRC-EXT-DADOS-CLAUDE-ZIP — Pacote 16 arquivos iFood

| Campo | Valor |
|---|---|
| **source_id** | SRC-EXT-DADOS-CLAUDE-ZIP |
| **Descrição** | `Dados Claude.zip` — pedidos, logística, cardápio, qualidade (auditoria estruturada) |
| **Localização esperada** | Downloads |
| **Formato** | xlsx/zip |
| **Período** | ~9 meses documentados (2026 e anteriores conforme auditorias) |
| **PII** | Baixa nos exports oficiais (sem cliente identificável) |
| **Utilidade T0B** | Alta (atraso, cancelamento, desfecho) |
| **Prioridade T0B** | P0 |
| **Status T0A** | **NÃO LOCALIZADO** (só inventário textual) |

### SRC-EXT-IFOOD-RAW-LOCAL — data/raw no disco

| Campo | Valor |
|---|---|
| **source_id** | SRC-EXT-IFOOD-RAW-LOCAL |
| **Descrição** | `data/raw/relatorio_pedidos_ifood.xlsx`, `incoming/ifood_2026-07-01/*` |
| **Localização** | gitignorado; neste worktree só `.gitkeep` |
| **Status T0A** | **PASTA VAZIA** (estrutura existe, dados ausentes) |

### SRC-EXT-JSONL-DERIVADOS — ifood_real.jsonl / janelas

| Campo | Valor |
|---|---|
| **source_id** | SRC-EXT-JSONL-DERIVADOS |
| **Descrição** | Logs derivados (Camada 0, janelas V1) |
| **Localização** | gitignorados (`data/*.jsonl`, `data/generated/`) |
| **Status T0A** | **NÃO PRESENTES** no worktree limpo |

### SRC-EXT-MIDIA — Fotos de comanda, kit, vídeo WhatsApp

| Campo | Valor |
|---|---|
| **source_id** | SRC-EXT-MIDIA |
| **Descrição** | Imagens de kit; fotos de erros no chat (“imagem ocultada”); vídeo loja |
| **Status T0A** | **NÃO LOCALIZADO**; erros em imagem no WhatsApp **não recuperáveis** do export texto |
| **Utilidade** | Média se recuperados; kit físico útil para embalagem |

### SRC-EXT-RH-TREINO — RH e treinamentos antigos

| Campo | Valor |
|---|---|
| **source_id** | SRC-EXT-RH-TREINO |
| **Descrição** | Manuais de onboarding, planilhas de RH, avaliações de desempenho |
| **Status T0A** | **NÃO LOCALIZADO** qualquer arquivo |
| **Prioridade** | P1 se César disponibilizar |

---

## 4. Contagem

| | |
|---|---|
| Fontes catalogadas (com source_id) | **18** |
| Presentes e legíveis no repo Git | **11** |
| Documentadas mas ausentes neste ambiente | **7** |
| Fontes privadas no Git após T0A | **0** |

---

## 5. Ordem recomendada de recuperação (César / privado)

1. WhatsApp Bloco 2 (13 zips) → `../deliveryos-private-sources/whatsapp/`  
2. Dados Claude.zip + raw iFood → `.../ifood/`  
3. Bloco 3 PDFs → `.../qualidade/`  
4. Qualquer manual RH/treino → `.../rh/`  
5. Confirmar backup fora de Downloads  

---

## 6. Temas candidatos (não são padrões definitivos)

Derivados do **estudo WhatsApp** e docs (hipóteses para T0B):

- Dependência do César como hub cognitivo  
- Custódia de estado (“quem fechou / cadê a comanda”)  
- Pausa/segurar como alavanca central  
- Erro por omissão (faltou item/kit)  
- Kit padronizado pós-2023  
- Motoboy / espera na loja  
- Comunicação de pausa tardia  
- Multi-praça e montagem  
- Embalagem quente×frio / 2ª sacola  
- Atraso e compensação  
- Escalonamento e silêncio de resposta  
- Fofoca vs fato (risco cultural — tratar com cuidado extremo)  

---

*Inventário T0A · sem mineração em volume · sem dados privados no Git.*
