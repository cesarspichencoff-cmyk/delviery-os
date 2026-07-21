# Mapa de fontes da tela do iFood — inventário real (Sprint 2, Fase 1)

> Antes de escrever uma linha de coletor, esta fase varreu o repositório e os
> worktrees irmãos (mesmo `.git` compartilhado) atrás de qualquer automação,
> DOM salvo, parser ou sessão relacionada ao iFood. Isto é o que existe —
> nada foi inventado para preencher lacuna.

## 1. O que existe

### 1.1 Exports em lote do painel administrativo (offline, não é a tela ao vivo)

Confirmado em `docs/Inventario_Dados_Primarios.md:20`: a origem provável de
todos os HTMLs conhecidos é o **painel administrativo** do iFood
(FRN 53069, TATA SUSHI), baixado manualmente — não uma sessão ao vivo com DOM
navegável.

| Fonte | Formato | O que tem | O que NÃO tem |
|---|---|---|---|
| `relatorio_pedidos_com_itens_*.html` | HTML, array `ALL_ROWS` ou cards `order-card` | ID, data/hora do pedido, status, valor, itens+qtd+observação | pronto, saída, aceite próprio |
| Relatório "Pedidos" (XLSX, referenciado por `src/ingest/ifoodRelatorio.ts` e `src/ingest/parserRelatorioIfood.js`) | planilha, colunas fixas em PT-BR | **duração** até pronto (`TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)`) e até entrega, tempo de espera do motoboy, atraso vs. prometido, motivo de cancelamento | itens/composição; carimbo **absoluto** (é sempre `hora_do_pedido + duração`, reconstruído — nunca observado por si) |

**Achado relevante:** a segunda fonte prova que o iFood **sabe e registra**
quando o botão "pronto" foi acionado — só não expõe isso na exportação de
composição, e não expõe em tempo real. Isso é evidência a favor de que a tela
ao vivo do portal provavelmente mostra esse mesmo evento — mas ninguém neste
repositório observou a tela ao vivo para confirmar. É hipótese, não fato.

### 1.2 Proposta arquitetural própria, não implementada

`docs/descoberta-conferencia/PROPOSTA_A_COLETOR_IFOOD_SEM_API.md` (rascunho
não commitado, sessão anterior) já esboça a ordem de preferência de leitura —
DOM > dados estruturados já baixados pela página > snapshot > visual > OCR — e
as proibições (não reexecutar endpoint fora da sessão, não burlar auth/CAPTCHA).
Esta missão adota o mesmo desenho porque ele já estava certo; não é recompilado
por acaso, é reaproveitado deliberadamente.

### 1.3 O que NÃO existe — verificado, não presumido

Busca em todos os worktrees irmãos (`grep -rl "playwright|puppeteer|selenium|chrome-remote-interface|CDP"` fora de `node_modules`) e por nome de arquivo (`*ifood*`):

- **Nenhum script de automação de navegador** (Playwright/Puppeteer/Selenium/CDP)
  aponta para o iFood em nenhum lugar do patrimônio;
- **Nenhum DOM ou HTML da tela de gestão de pedidos ao vivo** foi encontrado —
  só os relatórios exportados (§1.1);
- **Nenhum arquivo de sessão, cookie, token ou perfil de navegador** existe no
  repositório (verificado: não há `.auth/`, `storageState.json`, `*.session`);
- `playwright` aparece como devDependency em **`deliveryos-entregas-v1/package.json`**
  — mas para os smoke tests da própria interface Entregas
  (`tests/live/interface-v33-smoke.test.js`), não para o iFood, e esse worktree
  está fora de escopo por instrução explícita ("não integrar ENTREGAS");
- capturas de tela com "ifood" no nome em `deliveryos-entregas-v1/docs/entregas/ux/`
  são mockups da **própria interface do Entregas** para o handoff com o motoboy
  (`EXPEDICAO_IFOOD_RECONSTRUCAO.md`), não capturas do portal do iFood — não
  ajudam a mapear a tela real e não foram usadas.

**Conclusão da fase:** não existe hoje, em nenhum lugar do patrimônio, uma
observação real da tela de gestão de pedidos do iFood. Este Sprint 2 parte de
zero nesse ponto — o que será construído é código capaz de observar, não um
mapa de seletores já validado contra a tela real.

## 2. Estados observáveis — hipótese, não confirmação

Sem uma sessão ao vivo disponível neste ambiente, os estados abaixo são
**hipótese de produto**, construída a partir de (a) o vocabulário que o
próprio export usa (`STATUS FINAL DO PEDIDO`, `PEDIDO ACEITO PELA LOJA`), (b)
o vocabulário público conhecido do setor de portais de parceiro de delivery, e
(c) os nomes de evento já badge-parseados pelo adaptador histórico do Sprint 1
(`badge badge-X` → `CONCLUDED`/`DECLINED`/`CANCELLED`). Nada aqui foi visto na
tela ao vivo.

| Estado hipotético | Confiança | Origem da hipótese |
|---|---|---|
| pedido novo / recebido | média | export tem `DATA E HORA DO PEDIDO`; toda plataforma do setor mostra isto |
| aceito pela loja | alta | campo `PEDIDO ACEITO PELA LOJA` existe no export |
| em preparo | baixa | inferido, nenhuma fonte confirma o rótulo exato |
| pronto (botão pronto) | média | export prova que o evento **existe e é registrado**; rótulo/tela não confirmados |
| aguardando retirada | baixa | inferido |
| retirado / a caminho | baixa | export reconstrói via subtração de durações — nunca observado direto |
| entregue / concluído | alta | `STATUS FINAL DO PEDIDO` contém `CONCLUDED` |
| cancelado / recusado | alta | badges `DECLINED`/`CANCELLED` já parseados no Sprint 1 |

Esta tabela é o ponto de partida do adaptador (§ `LIVE_OBSERVER_V1.md`), e cada
linha carrega a confiança certa: nada aqui vira `alta` só porque seria
conveniente.

## 3. Seletores candidatos

**Nenhum.** Não existe DOM real para extrair seletor. Qualquer seletor escrito
antes de ver a tela seria invenção travestida de especificação — exatamente o
tipo de falsificação que este projeto proíbe. O adaptador implementado nesta
missão (`ifood-live-browser.js`) usa um **contrato de extração pluggável**:
os seletores reais entram como configuração no primeiro uso supervisionado
contra a sessão real (Fase 14 — Modo de Mapeamento), nunca chutados agora.

## 4. Limitações desta fase

- Todo o conteúdo de §2 é hipótese; nenhuma linha foi confirmada contra a tela
  real do iFood.
- Não há como saber, sem sessão ao vivo, se o portal expõe "saiu para
  entrega" como evento próprio ou só como resultado de mudança de aba/filtro.
- O Modo de Mapeamento (Fase 14) existe exatamente para resolver isto na
  primeira sessão supervisionada — ele produz a assinatura estrutural real que
  falta aqui.

## 5. Dados que não existem em nenhuma tela

Nem no export, nem hipoteticamente na tela ao vivo, o iFood expõe: nome do
cliente vinculado ao pedido operacional (fora de proteção da própria
plataforma), telefone, endereço completo, CPF — o portal do parceiro já
tarja a maior parte disso por política própria da plataforma. Isso simplifica
a garantia de privacidade do coletor: o que a plataforma já esconde, o
coletor não precisa se esforçar para não capturar.
