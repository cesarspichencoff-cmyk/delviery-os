# Lab · Operação Viva V4

Aplicação **experimental e isolada**. Não é a home, não é produto, e não roda em operação.

```bash
npm run ui:lab
```

Abre em **http://127.0.0.1:5291/lab/operacao-viva-v4/**

Para ir direto a uma cena: `?cena=<id>` — por exemplo
`http://127.0.0.1:5291/lab/operacao-viva-v4/?cena=sushi-quentes-isolado`

---

## O que ele é

Uma rota que responde, numa leitura só: como está a operação · o que merece atenção · de onde veio a
informação · o que está ausente · o que é fato e o que é inferência · qual ação é recomendada e por
quê · e **como validar a leitura**.

As dezoito cenas são **FIXTURE**. O que é real nelas: o cardápio (199 itens, 8 praças), o mapa
praça→ambiente, os baselines calibrados em 30 dias reais e as REGRAS dos sinais. O que é fixture: os
pedidos, os tempos, as cargas e os estados de fonte.

## Por que ele mora em `labs/`

Os gates R5 congelam por `git diff` de caminho. Um arquivo **novo** commitado dentro de
`src/product/ui/` ou `src/product/viewmodels/` passa a aparecer nesse diff e derruba o **PF4**
(`run-r5d1-event-lineage-tests.ts`, baseline `73f2f0b`).

O César autorizou `apps/deliveryos-experience-lab/`, com `labs/operacao-viva-v4/` como segunda opção
caso o repositório não usasse `apps/`. Ele não usa — a raiz tem `android`, `app-v1`, `config`, `data`,
`demo`, `deploy`, `docs`, `prototipos`, `src`, `tests`, `tools`. Segunda opção aplicada.

O Lab **reutiliza o produto por importação** e não altera nenhum caminho protegido:
`sinaisDe()` · `homeVM()` · `areas.ts` · `estados.ts` · `motor.js` (baselines) · o cardápio.
**Nenhum motor novo.**

## Estrutura

```
dominio/     estado-fonte.ts        os 8 estados + tradução total do canônico
             unidade-operacional.ts SUSHI_QUENTES experimental + regra de consolidação
             leitura-v4.ts          envelope da leitura
             modo-v4.ts             a trava do Calmo — só rebaixa, nunca promove
             vm-v4.ts               a view model
fixtures/    base.ts · cenarios.ts  as 18 cenas
validacao/   contrato.js            registro, vereditos, os 7 estados
             repositorio.js         ValidationRepository (interface) + memória
             indexeddb.js           persistência local do navegador
             resumo-turno.js        resumo puro
             schema.js              importação hostil e guarda de PII
servidor/    servidor.ts            GET/HEAD apenas; 405 + Allow no resto
ui/          index.html · lab.js · lab.css
testes/      run-lab-v4-tests.ts    46 guardas + 8 mutações
             run-lab-v4-browser.ts  28 testes em 3 viewports + capturas
evidencias/  capturas por cena e viewport
```

## Comandos

```bash
npm run typecheck:lab:v4     # tsconfig próprio; o raiz não é alterado
npm run test:lab:v4          # 46 guardas, 8 mutações, 0 cegas
npm run test:lab:v4:browser  # 28 testes, 3 viewports, 12 capturas
npm run test:lab             # os três, em ordem
```

## O Modo de Validação

Local ao navegador, em **IndexedDB**. D38 e B7 continuam de pé: o servidor recusa qualquer método que
não seja GET ou HEAD, com **405** e `Allow: GET, HEAD`, antes de olhar o caminho. Não existe rota de
escrita para desativar depois — não existe rota de escrita.

> Validação experimental salva somente neste navegador. Não está sincronizada e não identifica o
> usuário.

Ator: `LOCAL_ANONYMOUS_VALIDATOR` — **não é identidade autenticada**. Sem PII: nome, telefone,
endereço, credencial e payload bruto são recusados na entrada **e** na saída.

## Limites declarados

- nenhuma cena representa a operação em momento nenhum;
- Sushi Quentes como unidade própria é **projeção experimental**; `areas.ts`, D45 e D46 seguem
  canônicos e a migração **não ocorreu** (ver `docs/product/PROPOSTA_EVOLUCAO_SUSHI_QUENTES.md`);
- a validação **não** é multiusuário, **não** é autenticada, **não** sincroniza e **não** é
  persistência operacional;
- **a rota do Caixa é inalcançável fora de fixture**: nenhuma fonte mede a fila da Caixa, então
  `capacidade_do_caixa` não pode ser comprovada por medição;
- confiança é sempre **não estimada** — nenhuma política a apura neste caminho, e o Lab não inventa;
- os dois motores do Copiloto continuam **desconectados** (D43);
- **o Lab aguarda revisão humana do César.**

A promoção do Lab para a home oficial é **missão separada**, depois de aprovação humana, replay e nova
auditoria de linhagem.
