# Mapa de recuperação do produto operacional

> Checklist de execução, não interpretação nova. Cada linha aponta para a fonte original.
> Índice canônico: `DELIVERYOS_CANONICAL_SOURCE_INDEX.md` · Contrato: `CONTRATO_CONSCIENCIA_COPILOTO.md`
> Criado em 2026-08-01, sobre HEAD `b3fc4c1`. **Nenhuma linha de código foi alterada.**

## Estado desta fase

`DELIVERYOS_OPERATIONAL_PRODUCT_RECOVERY_CHECKPOINT` — matriz e contrato concluídos;
home, sinais e Figma **não iniciados** por limite de contexto, conforme §6 da missão
(*"conclua a home e os contratos, registre o checkpoint e não improvise"*).

---

## 1. Nomenclatura — resolvida por dado

Verificada no `data/cardapio_knowledge_seed.json` e em `src/perfil-delivery/motor.js`.

| Praça no código | Rótulo atual no motor | Nome canônico (César, 2026-08-01) | Ambiente | Itens |
|---|---|---|---|---|
| `combinados` | Combinados | Combinados | **Sushi** (subárea) | 20 |
| `duplas` | Duplas | Duplas | **Sushi** (subárea) | 64 |
| `enrolados` | Enrolados | Enrolados | **Sushi** (subárea) | 16 |
| `enrolados_quentes` | Enrolados Quentes | **Sushi Quentes** | **Sushi** (subárea) | 11 |
| `cozinha_quentes` | **"Quentes"** ⚠ | **Cozinha / Quentes da Cozinha** | **Cozinha** | 31 |
| `sobremesa` | Sobremesa | Sobremesa | Conferência (apoio) | 9 |
| `bar_bebidas` | Bar | Bar | Conferência (apoio) | 36 |
| `montagem_outros` | Montagem | Montagem | Conferência (apoio) | 5 |

**Prova de que `enrolados_quentes` = "Sushi Quentes":** os 11 itens da praça são
`Ceviche · Hot Roll · Hot Roll Tatá · Hot Roll com Shimeji · Tartar de Salmão · Temaki Ebiten ·
Temaki de Salmão Skin · Tuna Shisô Tartar · Uramaki Ebiten · Uramaki Ebiten Especial ·
Uramaki de Salmão Skin` — cobrem **item por item** a lista do César (hot roll, skin, Tuna Shiso,
tartar de salmão, ceviche, ebiten, Hot Tatá). O nome é de **fluxo/praça**, não de temperatura:
tartar e ceviche são frios e pertencem ao grupo.

**⚠ Defeito de rótulo confirmado:** `DISPLAY.cozinha_quentes = "Quentes"` exibe a **Cozinha** com o
nome que o César usa para **Sushi Quentes**. Implementar ambientes sem corrigir isso mostraria a
área errada. Correção registrada, **não aplicada** (`motor.js` é núcleo; ver ação R1).

**Pendência conhecida, não bloqueante:** "yakisoba", citado pelo César como Cozinha, **não existe no
seed** (lacuna E2, já registrada). Não invalida o mapa.

---

## 2. Matriz de recuperação

| Elemento original | Fonte | Implementação existente | Ação necessária | Arquivo ou superfície |
|---|---|---|---|---|
| **Home operacional** | protótipo (porta 5178) · Manifesto §10 | rota inicial = `/entregas`, lista de viagens | **criar** home de estado; Entregas deixa de ser home | `src/product/ui/app.js`, `surfaces/` |
| **Calmo** | `Modelo` §2 | ausente | criar: pulso + atenções práticas; nunca tela vazia | nova superfície |
| **Ambiente** | `Modelo` §3 · `Mapa_Ambientes` | ausente | criar: até 2 rótulos + cor por área; sem bloco de ação | nova superfície |
| **Foco** | `Modelo` §4 | ausente | criar: 1 por vez, 4 linhas + sussurro | nova superfície |
| **Pulso** | `Modelo` §2 | ausente | criar: "N em andamento", reativo ao ritmo | componente novo |
| **6 ambientes** | `Mapa_Ambientes` §1 | ausente | criar: Caixa · Sushi · Cozinha · Conferência · Motoboy (+Sushi Quentes dentro de Sushi) | nova superfície |
| **Subáreas de Sushi** | §1 desta matriz + confirmação César | ausente | Combinados, Duplas, Enrolados, Sushi Quentes **visíveis dentro** de Sushi | componente de ambiente |
| **22 sinais** | `Mapa_Sinais_Operacionais` | 0 implementados | classificar por fonte e implementar só os sustentados | ver §3 |
| **Orientação do Copiloto** | `Camada_Decisao` | shadow sobre saúde de fonte | reposicionar **dentro do Foco**; contrato antes de conectar | `CONTRATO_CONSCIENCIA_COPILOTO.md` |
| **Boqueta** | `Mapa_Ambientes` §1 · `Auditoria_Praca_Comanda` | sem tela | criar visão de montagem; bloqueada por comanda (PB8) | superfície futura |
| **Caixa** | `Mapa_Ambientes` §1 | sem tela, sem dado | ambiente com estado `sem medição automática` — **nunca verde** | ambiente |
| **Atendimento** | domínio adiado | item de menu "CRM" | manter fora até escopo fechado (C7) | navegação |
| **Gerente** | Manifesto | 0 menções nos artefatos novos | é o usuário da home | home |
| **Pedidos** | motor `sits` | projeção de viagens | pedido volta a ser unidade da home | view model novo |
| **Itens** | seed 199 | ausente do produto | usados por praça e por sinal | view model |
| **Sacolas** | `Logica_Embalagens` §11 | heurística 47–61% | só afirmar **com motivo**; nunca a heurística sozinha | sinal S14 |
| **Atrasos** | S1/S3/S4 | dimensão numérica | voltam a ser sinal com ação | sinais |
| **Reclamações** | S19 | ausente | depende de fonte SAC — manter declarado | sinal bloqueado |
| **Congestionamento** | S5 · motor `load>BASELINE` | ausente | sinal de ambiente | sinal |
| **Pausas** | S15/S17 | ausente | sinal de foco | sinal |
| **Memória Operacional** | `Modelo` §8 | inexistente | **não implementar**; medir sinal antes (dívida 5) | — |
| **Resolução** | `Modelo` §7 | parcial no motor | formalizar motivo do fechamento | motor (futuro) |
| **Evolução** | — | item de menu | **sem origem documental**; decidir se existe (C7) | navegação |
| **Telas técnicas da Un. 6** | Unidade 6 | 4 rotas na navegação principal | **reposicionar** como aprofundamento/auditoria; não descartar | `app.js`, navegação |

### Ações nomeadas

- **R1** — corrigir `DISPLAY.cozinha_quentes` de `"Quentes"` para `"Cozinha"` e
  `enrolados_quentes` de `"Enrolados Quentes"` para `"Sushi Quentes"`. Núcleo: exige gate próprio.
- **R2** — criar a home de estado (Calmo/Ambiente/Foco) sobre o Design System atual.
- **R3** — reposicionar as 4 telas da Unidade 6 para "aprofundamento".
- **R4** — implementar os sinais classificados como sustentados (§3).
- **R5** — conectar o motor à home **somente após** o contrato ser testado.

---

## 3. Classificação dos 22 sinais

Critério: fonte de dado disponível hoje neste repositório.

| Classe | Sinais | Observação |
|---|---|---|
| **Dado real já disponível** | S1 pronto sem sair · S2 saída lenta · S3 saiu sem entregar · S4 produção travada · S22 ritmo acima do normal | só iFood; já provados no backtest |
| **Derivável com regra comprovada** | S5 praça sobrecarregada · S6 surto de zona · S7 pedido que trava a fila · S8 pedido simples · S12 **só quentes** · S18 item com pico | exigem o cardápio, que existe (199 itens / 8 praças) |
| **Derivável, mas com regra ainda fraca** | S14 **duas sacolas** | heurística cobre 47–61%; só exibir **com motivo** (PB3) |
| **Dependente de fonte inexistente** | S9 prontos → bancada · S11 quem fechou · S13 pedido fechável · S15 item pausado · S16 item indisponível · S17 risco de ruptura · S20 observação/alergia · S21 bebida-sobremesa-kit | exigem KDS/impressora, pausa do iFood ou ficha técnica |
| **Bloqueado por fonte externa** | S19 faltou item / cliente reclama | exige SAC/review |
| **Função-mãe, sempre disponível** | S10 custódia ("cadê o pedido") | 🟢 responde sempre; não é alerta |

**11 sinais são implementáveis hoje.** Nenhum deles está implementado.

### "Só quentes" — definição operacional canônica

Confirmada pelo César (2026-08-01) e coerente com a fonte original:

> **"Só quentes" significa que o pedido vem de lugares que não precisam passar pela área do Sushi.**
> Consequência: o pedido **pode ser montado na bancada do caixa**; a equipe entende que não há
> dependência da praça Sushi; o sinal serve para **roteamento e simplificação da montagem**.
> Não é etiqueta de temperatura. **Não significa prioridade automática**, salvo regra canônica.

Isso reinterpreta S12 (`Mapa_Sinais_Operacionais`), que o descrevia como "fechável" — a fonte
original dizia *"só pratos quentes, sem itens frios pendentes → verificar se já dá pra fechar"*.
A confirmação do César **especifica o destino** (bancada do caixa) e a causa (não depende do Sushi).
**Compatível, não contraditório.** A redação operacional a preservar é a do César.

---

## 4. Reposicionamento da Unidade 6

| Superfície | Hoje | Depois |
|---|---|---|
| Design System, tokens, 22 estados, componentes, motion, testes | base da Unidade 6 | **preservados integralmente** — base da home nova |
| Entregas | home automática | área de **aprofundamento** |
| Operação Viva (9 dimensões) | rota principal | **camada de detalhe técnico** |
| Conference Brain | rota principal | **inspeção e auditoria** |
| Copiloto Shadow | rota principal | **inspeção do ciclo da recomendação** |
| Capa do Figma | mede "629 testes verdes" | **substituir** por valor operacional |

**Nenhuma tela é descartada.** Nenhuma continua como jornada principal.

---

## 5. O que esta fase NÃO fez

- Não criou a home (R2).
- Não implementou nenhum sinal (R4).
- Não conectou os dois motores (R5) — proibido por D43 até o contrato ser testado.
- Não corrigiu os rótulos do motor (R1).
- Não tocou no Figma.
- Não alterou nenhuma linha de código funcional.

Motivo: limite de contexto da sessão. A missão §6 determina que, nesse caso, se conclua os
contratos e se registre o checkpoint — foi o que foi feito.
