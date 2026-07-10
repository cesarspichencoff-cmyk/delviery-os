# Crítica Adversarial — Arquitetura da Fonte Viva

> Ataque sistemático à combinação **Epson (fila Windows) + Gestor iFood (DOM)** e ao casamento por código curto.
> Base documental: `Auditoria_Fonte_Viva_Loja_V1.md`, `Arquitetura_Sincronizacao_Local_V1.md`, `Parser_Comanda_Tecnisa_V1.md`, `Inspecao_Fontes_Reais_Loja_V0.md`, `Politica_Dados.md`.
> HEAD: `a441bc7`. Diagnóstico apenas.

---

## 1. Tese atacada

> “Duas fontes espelham Motor A/B: Gestor dá tempo/status/cancel; spool da Epson dá itens/sequência; casamos pelo código iFood; capturador read-only; motor intocado.”

**Veredito preliminar do ataque:** a tese é **coerente com o relato operacional** e **não está provada tecnicamente**. É a melhor hipótese documentada — e também um **sistema distribuído mini** com todos os bugs clássicos (ordem, identidade, partial failure, clock, security).

---

## 2. Ataques por superfície

### 2.1 Casamento por código curto do iFood

| Campo | Conteúdo |
|---|---|
| **ID** | FV-01 |
| **Gravidade** | Alta |
| **Ataque** | Código curto não é identidade global; colide no tempo; pode coincidir visualmente com sequência Odhen sem ser a mesma semântica |
| **Evidência** | 1 colisão/238 na janela 01/07; reuso entre meses; parser §6: sequencia vs ifood “não confirmado sempre iguais” |
| **Cenário** | Dois pedidos “0724” no mesmo dia em turnos longos; merge silencioso |
| **Impacto** | Itens do A com status do B |
| **Validar** | Histograma de colisões por dia em 30 dias de export |
| **Recomendação** | Chave composta: `ifood_curto + dia_operacional + canal`; estado `conflito`; UI desambigua com sequência interna quando existir |
| **Bloqueia Sombra?** | Se merge silencioso sim |
| **Bloqueia real?** | Sim |
| **Depende inspeção?** | Parcial |
| **Confiança** | Alta |

### 2.2 Colisão de identificadores (curto × pedido_interno × UUID × gritável)

| Campo | Conteúdo |
|---|---|
| **ID** | FV-02 |
| **Gravidade** | Alta |
| **Ataque** | Quatro identidades sem mapa canônico versionado no capturador |
| **Evidência** | Motor usa UUID; V1 prefere curto; chão usa sequência Odhen; Gestor mostra curto |
| **Impacto** | Foco correto no log, grito errado na cozinha |
| **Recomendação** | Contrato de evento lista **todos** os IDs observados e o `display_id` escolhido com regra |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Sim se display errado |
| **Confiança** | Alta |

### 2.3 Reimpressões

| Campo | Conteúdo |
|---|---|
| **ID** | FV-03 |
| **Gravidade** | Alta |
| **Ataque** | Sem número de via no papel (incerto), dedup frágil; reimpressão após alteração parcial piora |
| **Evidência** | César: reimpressão rara mas existe; parser §7 |
| **Recomendação** | Dedup por `pedido_interno`; se itens diferirem, versão nova com flag `reimpressao_divergente` |
| **Bloqueia Sombra?** | Não com testes |
| **Bloqueia real?** | Sim sem dedup |
| **Confiança** | Alta |

### 2.4 Eventos fora de ordem

| Campo | Conteúdo |
|---|---|
| **ID** | FV-04 |
| **Gravidade** | Alta |
| **Ataque** | Status “pronto” chega antes do parse da comanda; cancel chega antes do print processado; relógio Gestor ≠ Windows |
| **Evidência** | Arquitetura §4 half-match; R-19 relógio |
| **Recomendação** | Event sourcing local com `observed_at` e `source_ts` separados; regras de precedência escritas |
| **Bloqueia Sombra?** | Não se logar ordem bruta |
| **Bloqueia real?** | Sim se last-write-wins ingênuo |
| **Confiança** | Alta |

### 2.5 Cancelamentos

| Campo | Conteúdo |
|---|---|
| **ID** | FV-05 |
| **Gravidade** | Alta |
| **Ataque** | Inferir cancel da comanda (proibido) ou ignorar cancel do Gestor |
| **Evidência** | César + docs |
| **Recomendação** | Única fonte de cancel = Gestor (ou export); comanda nunca cancela |
| **Bloqueia real?** | Sim |
| **Confiança** | Alta |

### 2.6 Alterações depois da impressão

| Campo | Conteúdo |
|---|---|
| **ID** | FV-06 |
| **Gravidade** | Alta |
| **Ataque** | Rasura; troca de item no iFood após print; “não foi” |
| **Evidência** | Limitação permanente declarada |
| **Recomendação** | Epistemologia na UI: impresso ≠ final; nunca “conferido pelo sistema” |
| **Bloqueia real?** | Sim se mentir |
| **Confiança** | Alta |

### 2.7 Ausência de histórico no Odhen/Teknisa

| Campo | Conteúdo |
|---|---|
| **ID** | FV-07 |
| **Gravidade** | Crítica (para plano B banco) |
| **Ataque** | Pedido some da tela; se não há histórico em disco, **única** chance é o instante do print |
| **Evidência** | César: some após impressão; banco “acredito que sim” = hipótese |
| **Impacto** | Miss de 1s = buraco permanente no Motor B |
| **Recomendação** | Não desenhar recover “consulta Odhen depois”; buffer agressivo no instante do job; S1 mede miss rate |
| **Bloqueia Sombra itens?** | Se só spool e miss alto: sim |
| **Bloqueia real?** | Sim |
| **Depende inspeção?** | Sim (existência de histórico) |
| **Confiança** | Alta no risco; média na existência de DB |

### 2.8 Captura da fila de impressão

| Campo | Conteúdo |
|---|---|
| **ID** | FV-08 |
| **Gravidade** | Crítica |
| **Ataque** | Job efêmero; RAW; permissões; side-effects se “manter documentos”; multi-impressora |
| **Evidência** | Inspeção só sintaxe em PDF printer; Epson real não medida |
| **Recomendação** | Gate: DataType + duração + zero impacto **antes** de parser |
| **Bloqueia S1/T?** | Sim para path spool |
| **Confiança** | Alta |

### 2.9 Virtualização do Gestor iFood

| Campo | Conteúdo |
|---|---|
| **ID** | FV-09 |
| **Gravidade** | Crítica (Motor A) |
| **Ataque** | Modelo C: cartões saem do DOM → cobertura <100% sem scroll/API |
| **Evidência** | Roteiro inspeção §3; resultado “não determinado” |
| **Recomendação** | Classificar A/B/C/D; se C, isolar máquina e estudar opções sem click de ação; não fingir A |
| **Bloqueia S1 status?** | Sim até classificar |
| **Confiança** | Alta |

### 2.10 Necessidade de rolagem

| Campo | Conteúdo |
|---|---|
| **ID** | FV-10 |
| **Gravidade** | Alta |
| **Ataque** | Scroll simulado rouba foco / compete com sessão; segundo monitor ≠ isolamento (`Inspecao` §5) |
| **Recomendação** | Preferir Modelo A; se B, sessão Windows separada ou mini-PC; nunca sessão da equipe |
| **Bloqueia real?** | Sim se scroll na sessão operacional |
| **Confiança** | Alta |

### 2.11 Privacidade e dados pessoais

| Campo | Conteúdo |
|---|---|
| **ID** | FV-11 |
| **Gravidade** | Alta |
| **Ataque** | Comanda tem consumidor, tel, endereço completo; Gestor tem nome; JSONL live vira mini-dossier |
| **Evidência** | Parser campos; Politica_Dados foca Git, não runtime local |
| **Recomendação** | Minimização: motor não precisa endereço/tel; não persistir; não servir na LAN; retenção curta |
| **Bloqueia Sombra?** | Não se minimizado |
| **Bloqueia real?** | Sim se LAN aberta com PII |
| **Confiança** | Alta |

### 2.12 Cookies e sessão

| Campo | Conteúdo |
|---|---|
| **ID** | FV-12 |
| **Gravidade** | Alta |
| **Ataque** | Perfil de navegador do capturador carrega cookie de sessão iFood; backup/sync do perfil vaza; repo nunca deve receber |
| **Evidência** | Arquitetura pede perfil dedicado; missão proíbe senha/cookie no repo |
| **Recomendação** | Checklist: zero secrets no Git; perfil fora do tree; rotação se vazamento |
| **Bloqueia real?** | Sim se secrets commitados |
| **Confiança** | Alta |

### 2.13 Logs

| Campo | Conteúdo |
|---|---|
| **ID** | FV-13 |
| **Gravidade** | Média-Alta |
| **Ataque** | Log “de diagnóstico” copia comanda inteira → PII em disco para sempre |
| **Recomendação** | Log estruturado com IDs e hashes; corpo de comanda só em raw rotativo com purge |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Política de retenção necessária |
| **Confiança** | Alta |

### 2.14 Serviço local / Task Scheduler

| Campo | Conteúdo |
|---|---|
| **ID** | FV-14 |
| **Gravidade** | Média |
| **Ataque** | Serviço sobe sem Gestor aberto; reinicia em loop; duas instâncias |
| **Recomendação** | Single-instance lock; estados tray; não ir a Windows Service antes de Task estável |
| **Bloqueia Sombra?** | Não |
| **Bloqueia real?** | Parcial |
| **Confiança** | Média |

### 2.15 Servidor exposto na rede

| Campo | Conteúdo |
|---|---|
| **ID** | FV-15 |
| **Gravidade** | Crítica (se 0.0.0.0 + PII) |
| **Ataque** | `servir_v1` na LAN da loja; Wi-Fi guest; tablet sem auth |
| **Evidência** | Arquitetura §8 multi-dispositivo |
| **Recomendação** | Default localhost; auth token local; TLS opcional depois; campos mínimos no snapshot |
| **Bloqueia piloto multi-tela?** | Sim sem controle |
| **Confiança** | Média-alta |

---

## 3. Crítica à “melhor combinação”

### O que a combinação acerta

1. Respeita a verdade operacional: quem acompanha o ciclo é o Gestor, não o Odhen pós-print.
2. Evita interceptar cabo (opção 3 — corretamente condenada).
3. Não exige API oficial para o piloto (pragmatismo sob Lei 11: observar primeiro).
4. Reusa seam do motor (Lei 10: adaptador descartável).

### O que a combinação esconde

1. **Complexidade de sync** igual à de integração formal, sem contrato do fornecedor.
2. **Fragilidade a UI de terceiro** (iFood muda DOM → quebra silenciosa).
3. **Fragilidade a driver** (Epson/RAW).
4. **Janela temporal única** para itens se não houver histórico Odhen.
5. **Ilusão de completezza** (rasura, canais não-iFood, half-match).

### Alternativas (ranking adversarial)

| Alternativa | Prós | Contras | Quando preferir |
|---|---|---|---|
| API / fonte contínua iFood oficial | Estável, estruturada | Negociação; atraso político | Assim que existir |
| Export pós-turno só | Já funciona; zero risco impressão | Não é vivo | S0 e prova cognitiva |
| Banco Odhen se histórico existir | Itens sem corrida de spool | Licença; schema; some da tela | Após inspeção positiva |
| Abrir cada pedido no Gestor | Itens se spool falhar | Click risk; lento | Quase nunca |
| OCR do papel | Independente de spool | Erro; esforço; rasura | Nunca produção |

**Conclusão:** Epson+Gestor é **piloto de captura**, não **arquitetura eterna**. O Fable deve implementar o adaptador como **descartável** (Lei 10), com contratos estáveis no JSONL canônico — não vazar seletores CSS para o motor.

---

## 4. Requisitos de contrato que a arquitetura atual só esboça

O desenho atual descreve fluxo; o Red Team exige **contrato de evento** explícito (ver checklist Fable):

```text
event_id, observed_at, source, source_ts?,
ids{ ifood_curto?, pedido_interno?, sequencia?, uuid? },
kind: print_job | status_snapshot | cancel | heartbeat | error,
payload_min,
quality: complete | partial | suspect,
dedup_key
```

Sem isso, cada PR inventa um JSON diferente e o motor recebe lixo.

---

## 5. Diagrama de falhas (texto)

```
[Odhen print]──miss──► buraco Motor B (irrecuperável se sem DB)
       │
       ▼
  [spool RAW?]──sim──► parser cego
       │não
       ▼
  [itens+ids]──┐
               ├──casamento──► conflito curto? ──► NÃO merge
[Gestor DOM]─┘
       │
   virtualizado? ──► status incompleto
       │
   sessão morta? ──► silêncio (health!)
       │
   cancel ──► prevalece sobre itens
```

---

## 6. O que atacar no primeiro checkpoint do Fable

1. Existe path de click? → rejeitar.
2. Existe merge sem `conflito`? → rejeitar.
3. Health misturado com Calmo? → rejeitar.
4. PII no snapshot default? → rejeitar.
5. Testes de reimpressão/cancel/partial? → exigir.
6. “Validado na loja” sem números da inspeção? → rejeitar linguagem.

---

## 7. Resumo de gravidades

| ID | Tema | Gravidade | Bloqueia S1? | Bloqueia O? |
|---|---|---|---|---|
| FV-01 | Casamento curto | Alta | Se merge cego | Sim |
| FV-07 | Sem histórico Odhen | Crítica (B) | Path spool | Sim |
| FV-08 | Spool | Crítica | Path spool | Sim |
| FV-09 | Virtualização | Crítica (A) | Status | Sim |
| FV-11/15 | PII/rede | Alta/Crítica | Não | Sim |
| FV-12 | Cookies | Alta | Secrets no git | Sim |
| FV-05/06 | Cancel/rasura | Alta | Não | Sim |

---

*Arquitetura viva só deixa de ser hipótese com o formulário de inspeção preenchido e limiares medidos — não com mais markdown de desenho.*
