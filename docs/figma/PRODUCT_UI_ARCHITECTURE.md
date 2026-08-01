# Arquitetura do Product System

> Unidade 6 · 2026-08-01 · branch `feature/deliveryos-hybrid-platform-foundation-v1`
> Figma: `DeliveryOS — Product System` (`IMWH8ZKMF5ra3QJYiR6vGa`), página `00 — Overview & Architecture`.

## 1. O que existe hoje, e onde

| Camada | Lugar | Natureza |
|---|---|---|
| Tokens de design | `docs/figma/DESIGN_TOKENS.json` → `src/product/ui/tokens/product-tokens.css` + `src/entregas/ui/shared/tokens.css` | fonte única, verificada por teste |
| View models | `src/product/viewmodels/` | TypeScript, **somente leitura** |
| Componentes | `src/product/ui/components/` | HTML/CSS/JS sem framework |
| Superfícies | `src/product/ui/surfaces/` | uma por módulo implementado |
| App Shell | `src/product/ui/index.html` + `app.js` + `shell/shell.css` | navegação, unidade, contexto |
| Servidor de apresentação | `tools/product_system_server.ts` | **GET/HEAD apenas** |
| Fixture de demonstração | `src/product/demo/seed-demonstracao.ts` | dados de exercício, lógica real |

**Não há framework frontend neste repositório.** Não existe React, Vue, Vite ou bundler — `package.json`
tem `pg`, `typescript`, `playwright` e `xlsx`. A Unidade 6 **estendeu** o frontend existente
(HTML/CSS/JS servido por Node, o mesmo padrão de `src/entregas/ui/`) em vez de criar um segundo.

## 2. Navegação: o trabalho, não a árvore de pastas

Três grupos, definidos em `src/product/viewmodels/modulos.ts`:

- **Agora** — o que está acontecendo na rua e no balcão: Entregas, Operação Viva.
- **Entendimento** — o que o sistema observou e concluiu: Conference Brain, Copiloto.
- **A casa** — como a operação se sustenta: CRM e Conversa, Caixa, Suprimentos, Evolução,
  Treinamento, Seleção e RH, Gestão.

Onze módulos. **Quatro implementados**, sete `planejado`. Módulo planejado tem lugar, ícone,
descrição, estado e visão conceitual — e **nenhuma tela de dado**. A superfície de módulo futuro
não tem métrica, tabela nem cartão de valor, e isso é afirmado por teste
(`navegacao: modulo futuro nao tem tela de dado`).

## 3. Direção de dependência

```
                    ┌──────────────────────────────┐
   objeto simples   │  src/product/viewmodels/     │   objeto simples
   ──────────────▶  │  (TS, read-only)             │  ◀──────────────
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  src/product/ui/  (HTML/JS)  │
                    └──────────────────────────────┘
```

- `conference-vm.ts` **não importa nada** do Conference Brain: declara o contrato de entrada e
  recebe um objeto simples, do mesmo jeito que o Brain recebe um objeto simples da Operação Viva
  e o Copiloto recebe um objeto simples do Brain. A apresentação entra como **terceiro espelho**
  da simetria provada nas Unidades 4 e 5 (D33), não como exceção.
- `operacao-viva-vm.ts` e `copiloto-vm.ts` importam **apenas tipos** (apagados em runtime), para
  que o compilador detecte deriva de contrato.
- Nenhum componente visual importa `demo/`. Verificado por teste.

## 4. O Product System não toca o runtime crítico

`src/platform/bin/critical.ts` e `async-runtime.ts` não conhecem `src/product/`, não importam a
fixture e não importam o servidor de apresentação — afirmado pelo teste
`fixture: a demonstracao nao entra em runtime de producao`.

O servidor de apresentação **recusa qualquer método que não seja GET ou HEAD**, antes de olhar o
caminho. Não existe rota de escrita para desativar depois: não existe rota de escrita. A mutação
adversarial M4 confirmou que remover essa trava derruba dois testes.

## 5. Estados semânticos

22 espécies em seis eixos que **não compartilham campo** — ver `DESIGN_SYSTEM.md` §3 e a seção
`01.3` do Figma. A regra que atravessa tudo: **cor é o último canal, nunca o único**.

## 6. Verdade operacional preservada

Ver `docs/execution/STATE.json` para a origem de cada afirmação. A interface preserva, sem exceção:

| Verdade | Onde a interface a torna visível |
|---|---|
| Viagem não é pedido | `rotulo_identidade: "Viagem"`; teste proíbe `trip_id` em campo de pedido |
| `order_id` não propagado | Conference Brain mostra **0 observações de pedido** ao lado do controle positivo que mostra **1** |
| Copiloto recomenda sobre FONTE | `escopo: "fonte"`, `pedido_ref` sempre ausente com motivo escrito |
| Nada executa | zero botões na tela do Copiloto; `requires_human`; frase de sombra em cada cartão |
| Ausência não é zero | `Campo<T>` não tem `valor` quando `observado === false` |
| `partial` não é saudável | selo próprio, glifo próprio, padrão de borda próprio |
| `stale` não é atual | idem, e separado de `indisponivel` (nunca observado ≠ observado e envelhecido) |

## 7. O que esta arquitetura ainda não resolve

- **Não há multi-unidade real.** `UNIDADES` tem uma entrada de demonstração; trocar de unidade
  preserva contexto mas não muda fonte de dados, porque não há segunda fonte.
- **Não há histórico.** Nem a projeção nem a ponte devolvem série temporal; as duas superfícies
  declaram isso como `integracao_pendente`.
- **Não há busca nem filtro funcionais.** O shell tem o lugar previsto; a implementação exigiria
  volume de dados que não existe. Não foi desenhado um controle que não faz nada.
- **Não há permissão.** Não existe autenticação nesta superfície, e por isso não existe ação.
