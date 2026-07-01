# Fonte Real de Itens — Plano de Integração e Prova

> Pergunta a responder: **"Qual é o jeito mais rápido e seguro de dar ao DeliveryOS os itens reais por pedido?"**
> O motor já pensa certo (8 praças, diagnósticos, atenção). O que falta é **enxergar a composição real**.
> Regra de arquitetura: qualquer fonte entra pelo **SEAM único** (`FONTE_ITENS`) — nenhuma regra de decisão muda.

---

## As três fontes, lado a lado

| Critério | 1 · API / Portal iFood | 2 · Spool da impressora | 3 · KDS / sistema de produção |
|---|---|---|---|
| **Que dado extraímos** | pedido completo: itens, qtd, opções/complementos, observação do cliente, valores, cliente, horários do fluxo iFood | texto da comanda impressa: itens, qtd, observação (o que a cozinha lê) | eventos de produção: item, praça, início, **pronto por praça** |
| **Item por pedido** | ✅ sim, estruturado (JSON) | ✅ sim (texto a parsear) | ✅ sim |
| **Quantidade** | ✅ sim | ✅ sim (parse "2x") | ✅ sim |
| **Observação** | ✅ sim (campo próprio) | ✅ sim (impressa na comanda) | 🟡 depende do sistema |
| **Complemento/opção** | ✅ sim (options estruturadas) | 🟡 sim, mas texto livre | 🟡 depende |
| **Horário de impressão** | 🟡 tem horário de confirmação (equivale ao "entrou em produção") | ✅ sim — exato (momento do print) | ✅ sim |
| **Pronto por praça** | ❌ não existe | ❌ não existe | ✅ **só o KDS dá isso** |
| **Dificuldade técnica** | média: credenciar app no portal do iFood (developer.ifood.com.br), OAuth, polling de eventos + GET do detalhe | média/alta: interceptar o spool no PC do caixa (Windows), parsear ESC/POS/texto — frágil a mudança de layout | alta: a TATÁ **não tem KDS hoje** → seria construir módulo novo (vetado nesta etapa) |
| **Risco** | baixo: API oficial, estável, documentada; risco = burocracia de credenciamento | médio: layout de comanda muda e quebra parser; roda numa máquina da loja | alto agora (é produto novo); baixo depois |
| **Velocidade para testar** | dias (credenciar + 1 script de polling) | 1-2 dias se tivermos acesso ao PC do caixa | semanas/meses |
| **Qualidade do dado** | **alta** — estruturado, canônico, com observação e complemento | média — texto, precisa casar nome contra o seed | altíssima (produção real por praça) |
| **Impacto no DeliveryOS** | motor de praça vira **REAL**: carga por praça, item dominante, âncora, 2ª sacola, bebida/sobremesa/kit, observação | idem, com bônus do horário exato de produção | destrava o que nada mais destrava: **fechável real**, pronto-por-praça, tempo real de bancada |
| **Encaixe no FONTE_ITENS** | script Node → JSON por pedido → `makeFonteItensFromJson(data, SEED)` | parser → linhas CSV → `makeFonteItensFromCsv(txt, SEED)` | eventos → mesmas linhas + eventos de pronto (futuro: novo tipo de Transição no núcleo) |

### Exemplo do formato esperado de cada uma

**1 · iFood API** (detalhe do pedido, simplificado):
```json
{ "id": "abc-123", "createdAt": "2026-06-12T20:12:00Z",
  "items": [
    { "name": "Combinado Especial Sushi 2 pessoas", "quantity": 1,
      "observations": "sem cebolinha",
      "options": [ { "name": "Wasabi extra", "quantity": 1 } ] },
    { "name": "Coca-Cola Lata 350ml", "quantity": 2 } ] }
```
→ transforma-se 1:1 nas linhas do formato ponte (abaixo).

**2 · Spool da impressora** (texto cru da comanda):
```
PEDIDO #A5  22:05
1x COMBINADO TRADICIONAL SUSHI 2 PESSOAS
   OBS: SEM CEBOLINHA, CAPRICHAR NO WASABI
2x URAMAKI DE SALMAO
1x SORVETE DE CHOCOLATE
```
→ parser simples (regex `^(\d+)x (.+)$` + linhas `OBS:`) → CSV ponte.

**3 · KDS** (evento):
```json
{ "pedido_id": "A5", "item": "Uramaki de Salmão", "praca": "enrolados",
  "evento": "pronto", "ts": "2026-06-12T22:19:40Z" }
```

---

## Recomendação (ordem de ataque)

**Passo 0 — HOJE, sem integração nenhuma: o modo ponte.**
Exportar/copiar os itens de **uma noite real** no formato CSV/JSON ([Formato_Importacao_Itens_Reais.md](Formato_Importacao_Itens_Reais.md)) e alimentar o motor via `makeFonteItensFromCsv`. **Já está implementado e provado** (`tools/teste_fonte_real.js`: 16/16 itens reais casados contra o seed, 5 pedidos, todos os diagnósticos nasceram — inclusive observação especial). Isso valida praça real, item dominante, fechável, 2 sacolas, bebida/sobremesa/kit, combinado segurando, conferência reforçada — **antes de qualquer credenciamento**.

**Passo 1 — API iFood (a integração recomendada).**
É a única fonte **estruturada e oficial**, com item + quantidade + observação + complemento por pedido, e a operação da TATÁ é iFood-first. O caminho: criar app no portal do desenvolvedor iFood → escopo de pedidos da loja → um script Node que faz polling de eventos e busca o detalhe de cada pedido → grava JSON por noite → `makeFonteItensFromJson`. Sem tela nova, sem módulo novo — é um coletor que alimenta o mesmo seam. *(Ponto a verificar no credenciamento: se a conta da TATÁ consegue acesso direto ou via integradora.)*

**Passo 2 — Spool da impressora = plano B.**
Só se o credenciamento da API travar. Vantagem única: horário exato de impressão (= "entrou em produção"). Custo: parser frágil + depender do PC do caixa.

**Passo 3 — KDS = o destino, não o começo.**
Pronto-por-praça é o dado que nem API nem impressora dão — e é o que torna "fechável" um fato em vez de inferência. Mas a TATÁ não tem KDS; construir um agora violaria o "não criar módulo novo". A tese do DeliveryOS aponta o caminho: quando a tela de produção do DeliveryOS existir, **ela mesma vira o KDS** — e o pronto-por-praça nasce como subproduto do trabalho, não como preenchimento. Fica para depois que a composição real estiver validada.

**Resposta curta ao critério:** *o jeito mais rápido e seguro é o modo ponte agora (uma noite em CSV → motor), com a API iFood como primeira integração definitiva — impressora como plano B, KDS como destino.*

---

## O que muda no código quando a fonte real entrar

```js
// hoje (sintético):
const FONTE_ITENS = MOTOR.makeFonteSintetica(SEED);
// amanhã (real) — a ÚNICA linha que muda:
const FONTE_ITENS = MOTOR.makeFonteItensFromJson(noite, SEED);   // ou FromCsv
```
`resolver`, `step`, `buildFoco`, gerente de atenção: **intocados**. O Auto Teste re-roda igual e os números de praça deixam de ser ilustrativos.

## Guarda-corpos desta etapa (o que NÃO fazer)

- ❌ tuning / calibrar baseline (Duplas, Quentes, Combinados) antes de composição real;
- ❌ redesenho de tela; ❌ módulo novo (KDS incluso);
- ✅ saída travada crônica → **ambiente**, não foco repetitivo (foco continua raro: só quando vale alguém agir agora).
