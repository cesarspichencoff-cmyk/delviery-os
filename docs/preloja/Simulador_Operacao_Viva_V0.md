# Simulador de Operação Viva — V0 (Fase 3A)

> Fase 3A do programa Plataforma Pré-Loja. Branch `feature/preloja-fable`, base `b4baf12`.
> **Motor determinístico do simulador sintético** — infraestrutura técnica apenas.
> Esta fase NÃO inclui: campanha de 30 dias, pico massivo, métricas de negócio,
> dashboard, gráficos, interface, embalagens, dados históricos reais (tudo isso é 3B+).
>
> **Sintético prova resiliência do encanamento; sintético NÃO prova qualidade
> operacional do motor** (regra da Fase 1, repetida aqui de propósito).

---

## 1. O que o simulador é

Um executor determinístico que alimenta o núcleo de fonte viva (`src/live`,
**intocado** nesta fase) pela API pública (`criarNucleo`/`receber`/`snapshot`/
`reconstruirDoLog`), com eventos 100% sintéticos, tempo simulado e resultado
reproduzível por seed. Independente de interface, Epson, iFood real e Windows.

```
tools/live/simulator/
  relogio.js          tempo simulado: início definido, avanço manual, nunca Date.now()
  aleatorio.js        PRNG mulberry32 com seed (número ou texto via FNV-1a)
  identificadores.js  SIM-EVENT-/SIM-IFOOD-/SIM-INTERNO-/SIM-JOB- + allowlist de textos
  eventos.js          construtores de eventos VÁLIDOS no envelope do Contrato §2-§4
  cenarios.js         catálogo mínimo (12 cenários) — passos {em_ms, evento}
  executor.js         valida fuso/seed, runtime em temp do SO, injeta, reinicia, limpa
  relatorio.js        relatório compacto + hash canônico de determinismo
tests/live/simulator/ node:test (25 testes)
```

## 2. Contrato de determinismo

Mesma (seed, cenário, configuração) ⇒ mesma ordem, mesmos eventos, mesmos
timestamps, mesmo snapshot final, mesmo relatório, **mesmo `hash_resultado`**.
Seed diferente pode produzir outra execução válida (composição sintética varia).

O hash canônico (chaves ordenadas recursivamente, SHA-256) **exclui por
contrato**: caminho temporário (`runtime_root`), duração real
(`duracao_execucao_ms`) e o próprio `hash_resultado`. Nenhum campo do material
de hash deriva do relógio real da máquina — todo carimbo vem do relógio
simulado. Provado por teste: duas execuções em diretórios temporários
diferentes produzem o mesmo hash.

## 3. Configuração explícita da loja simulada

`storeTimeZone` é **obrigatório** em toda execução e validado como IANA;
ausente ⇒ erro `store_time_zone_obrigatorio`; inválido ⇒ erro
`store_time_zone_invalido`. `America/Sao_Paulo` é **exemplo de teste** — outros
fusos são aceitos (testado com `Asia/Tokyo`); nenhum fuso é constante escondida.
`seed` também é obrigatória (`seed_obrigatoria`).

## 4. Política de PII do simulador

- Identificadores exclusivamente artificiais (`SIM-*`), sequenciais.
- Campos livres (`observacao`) só aceitam textos da **allowlist sintética**.
- Nunca gerado: nome, telefone, e-mail, CPF, endereço, cookie, token, senha,
  nem texto semelhante a dado pessoal.
- Testes varrem cada evento de cada cenário com a varredura recursiva do
  núcleo (`acharCampoProibido`) e varrem os ARQUIVOS do runtime de cada
  cenário confirmando que nenhum nome de campo proibido chegou ao disco.

## 5. Catálogo de cenários (Fase 3A — mínimos de arquitetura)

| Cenário | Prova |
|---|---|
| `fluxo_normal` | matched, fontes atualizadas, gate aberto, coluna final `pronto` |
| `status_antes_comanda` | ordem invertida consolida |
| `comanda_antes_status` | ordem normal consolida |
| `evento_duplicado` | log aceito com UMA linha (contagem real de arquivo) |
| `reimpressao` | vias=2, nunca segundo pedido |
| `cancelamento` | cancelado com histórico íntegro |
| `identificador_em_conflict` | colisão de curto ⇒ 3 registros conflict, nada apto |
| `fonte_atrasada` | status envelhece a `atrasada`; gate bloqueia (padrão) |
| `fonte_vencida` | status `vencida`; gate `fonte_de_status_vencida_ou_desconectada` |
| `desconexao_reconexao` | desconexão declarada + reconexão por evidência; reproduzível |
| `evento_invalido_quarentena` | quarentena não interrompe o fluxo |
| `reinicio_e_replay` | replay no meio da operação; estado reconstruído igual; operação continua |

## 6. Relatório técnico compacto

`scenario_id · seed · store_time_zone · inicio/fim simulados · eventos_gerados ·
eventos_aceitos · duplicados · observacoes_repetidas · quarentena{total,
por_motivo} · linhas_log_aceito · pedidos{matched, partial, unmatched,
conflict, cancelados} · freshness_por_fonte · gate_staleness · replay ·
snapshot_hash · hash_resultado` (+ voláteis fora do hash: `duracao_execucao_ms`,
`runtime_root`). Sem dados brutos desnecessários.

## 7. Critério de replay e ACHADO registrado (last_trusted_at)

A comparação pós-reinício usa a **projeção reconstruível** do snapshot
(Contrato do Núcleo §17): ignora `reconstruido_em`, `recepcao` (escopo de
sessão) e `last_trusted_at`/`ultima_atualizacao_confiavel`. Todo o resto —
pedidos, correlação, qualidade, quarentena, `ultimo_evento_em`, freshness —
precisa ser idêntico byte a byte (e é, provado por hash).

**Achado da Fase 3A (registrado, núcleo intocado):** `last_trusted_at` é
CONSERVADOR pós-reinício — o núcleo o calcula na chegada com o relógio
corrente, então um processo renascido não herda a confiança da sessão anterior
e só volta a confiar com evidência fresca. É comportamento seguro (nunca
inventa confiança), mas se a reconstrução HISTÓRICA de `last_trusted_at`
(derivável do `received_at` persistido) for desejada no futuro, é mudança de
`src/live` que exige autorização própria. Fica como observação para a Fase 3B/5.

## 8. F2-07 e F2-08 — riscos acompanhados (não corrigidos aqui)

- **F2-07** (crescimento sem teto do índice de dedup em sessão longa): não
  exercitado na 3A; a **Fase 3B deve incluir cenário de volume** para medir.
- **F2-08** (comanda com `itens: []` aceita como parcial não-apta): não
  exercitado na 3A; a **Fase 3B deve incluir cenário específico** para medir.

## 9. Como executar

```
node --test tests/live/*.test.js tests/live/simulator/*.test.js
```

O comando canônico do núcleo (`node --test tests/live/*.test.js`) continua
válido e cobre os 92 testes das Fases 2/2.1; o padrão adicional cobre os 25 do
simulador. Sem dependências novas; `node:test` nativo; runtime só em diretórios
temporários do SO (limpo ao final; `manterRuntime: true` preserva para inspeção).
