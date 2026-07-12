# Mapa Mestre dos Domínios — DeliveryOS V0.1

> Plataforma única da operação de delivery. Domínios internos com fronteiras claras.  
> **Não** é coleção de sistemas isolados. **Não** implementa código nem visual.  
> TATÁ Evolução = produto **separado**.  
> Motor central soberano: **Calmo · Ambiente · Foco**. Nenhum domínio cria Foco diretamente.

---

## 1. Visão da plataforma

```text
┌─────────────────────────────────────────────────────────────┐
│                     DeliveryOS (plataforma)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Operação Viva│  │   Entregas   │  │ Suprimentos do   │  │
│  │   (núcleo)   │  │  (próprio +  │  │ Delivery (futuro)│  │
│  │              │  │ marketplace) │  │                  │  │
│  └──────▲───────┘  └──────▲───────┘  └────────▲─────────┘  │
│         │  fatos           │  fatos            │  sinais   │
│         └──────────────────┴───────────────────┘           │
│                    Motor: Calmo / Ambiente / Foco            │
└─────────────────────────────────────────────────────────────┘
         │
         │  (separado — não domínio interno)
         ▼
   TATÁ Evolução (cultura e formação)
```

**Caixa e Atendimento:** domínio futuro — só registrado, não aprofundado.

---

## 2. Domínios

### 2.1 Operação Viva (núcleo atual)

| Campo | Conteúdo |
|---|---|
| **Missão** | Observar e organizar a realidade operacional do turno para decisão consciente |
| **Pergunta** | O que precisa da sua atenção **agora**? |
| **Usuários** | Equipe de produção/expedição, LE, César, sistema |
| **Objetos** | Pedidos, itens, praças, ambientes, fatos, desconhecidos, decisão, replay |
| **Fonte de verdade** | Runtime live: eventos, freshness, confiança, dedupe |
| **Estados** | Estado da operação; Calmo; Ambiente; Foco (soberanos do núcleo) |
| **Decisões** | Prioridade operacional, contenção, o que entra no Foco |
| **Eventos produzidos** | Fatos de pedido/produção/conferência; estado cognitivo |
| **Eventos consumidos** | Sinais de canais, impressões correlacionadas, **fatos de Entregas e Suprimentos** |
| **Dados proibidos** | Ranking de pessoas; julgamento de personalidade; disciplina automática |
| **Dependências** | Fontes vivas (iFood etc.), seed/cardápio, contratos de motor |
| **Limites** | Não executa rota física; não conta estoque de embalagem |
| **Riscos** | Foco contaminado por dado incerto; over-alert |
| **Calmo/Ambiente/Foco** | **Único dono** da decisão cognitiva |
| **Pertence** | Pedidos, produção, conferência, pressão, memória operacional |
| **Não pertence** | Viagem do motoboy; contagem semanal de sacolas; formação de pessoas |

### 2.2 Entregas (domínio interno)

| Campo | Conteúdo |
|---|---|
| **Missão** | Executar a entrega física após o pedido estar pronto (própria + handoff marketplace) |
| **Pergunta** | Quem leva, quando sai, onde está, o que já foi entregue e o que ainda é da loja? |
| **Usuários** | Motoboys, quem expede, LE, Operação Viva (consulta) |
| **Objetos** | Delivery, Trip, Rider, Assignment, Handoff, PrintedArtifact, GPS session… |
| **Fonte de verdade** | Estados de entrega, viagem, presença/disponibilidade, handoff, correlação de impressões |
| **Estados** | Ver fundação Entregas (Trip, Rider, Delivery, Handoff) |
| **Decisões** | Formar viagem; atribuir; confirmar coleta/saída; handoff; marcar ocorrência (com regras) |
| **Eventos produzidos** | Disponibilidade, em rota, retorno, handoff, capacidade própria, filas de saída |
| **Eventos consumidos** | Pedido pronto (Operação Viva); impressões; sinais de marketplace |
| **Dados proibidos** | Rastreamento permanente; ranking de velocidade; PII além do necessário à entrega |
| **Dependências** | Pedido pronto; artefatos impressos; (futuro) Nimo/Tecnisa/iFood |
| **Limites** | Não redefine produção; não cria Foco; não gerencia cardápio |
| **Riscos** | Duplicidade por reimpressão; GPS vigilância; fusão errada de pedidos |
| **Calmo/Ambiente/Foco** | **Fornece fatos** ao Ambiente; **nunca** cria Foco |
| **Pertence** | A/B fluxos próprios e marketplace; QR/código; rota; handoff |
| **Não pertence** | Montagem de kit; SAC; estoque de embalagens (só consome sinal futuro) |

**Fluxos A e B** detalhados em `Fundacao_Dominio_Entregas_V0_1.md`.

### 2.3 Suprimentos do Delivery (futuro — demarcado)

| Campo | Conteúdo |
|---|---|
| **Missão** | Garantir materiais de delivery/caixa ligados à expedição sem faltar |
| **Pergunta** | Há embalagem/kit/lacre suficientes para o volume? |
| **Usuários** | Quem conta, LE, Operação (sinais de risco) |
| **Objetos** | Snapshots, consumo esperado, divergência, cobertura (futuro) |
| **Fonte de verdade** | Contagem física + regras de uso por pedido (quando existirem) |
| **Estados** | (não aprofundar) |
| **Decisões** | Investigar divergência; repor (processo humano) |
| **Eventos produzidos** | Risco de falta; cobertura baixa (futuro → Ambiente) |
| **Eventos consumidos** | Pedidos expedidos (volume) |
| **Limites** | **Só** delivery/caixa operacional — **não** salão, cozinha geral, House, compras gerais |
| **Calmo/Ambiente/Foco** | Sinais para Ambiente; sem Foco direto |
| **Nesta missão** | Só fronteira — sem entidades/máquinas |

### 2.4 Caixa e Atendimento (futuro — adiado)

| Campo | Conteúdo |
|---|---|
| **Status** | Domínio futuro · escopo **não fechado** · **não** entra na V1 atual desta fundação |
| **Possível futuro** | Pagamentos, vouchers, convênios, descontos, estornos, cancelamentos, SAC, reclamação, recuperação, fechamento |
| **Nesta missão** | **Não aprofundar** |

### 2.5 TATÁ Evolução (produto separado)

| Campo | Conteúdo |
|---|---|
| **Missão** | Cultura, formação, competência, autonomia |
| **Pergunta** | Qual é o seu próximo passo para evoluir? |
| **Relação** | Consome evidências **anonimizadas** sob contrato; **não** é domínio interno do DeliveryOS |
| **Proibido** | Escrever Calmo/Ambiente/Foco; decidir RH |

---

## 3. Princípios transversais

1. Uma plataforma, domínios com soberania de dados.  
2. Operação Viva = consciência; Entregas/Suprimentos = execução e capacidade logística/material.  
3. Desconhecido permanece desconhecido.  
4. Replay e dedupe no núcleo; Entregas respeita idempotência.  
5. Integração controlada por contratos de fronteira.  

---

## 4. Documentos do pacote

| Doc | Conteúdo |
|---|---|
| `Contrato_Fronteiras_Dominios_DeliveryOS_V0_1.md` | Matriz de ownership |
| `Fundacao_Dominio_Entregas_V0_1.md` | Objetos e visão |
| `Modelo_Comandas_Correlacao_Entregas_V0_1.md` | Multi-impressão |
| `Modelo_Viagens_Motoboys_GPS_V0_1.md` | Trip, rider, GPS |
| `Modelo_Expedicao_Marketplace_V0_1.md` | Handoff iFood |
| `Fluxos_Estados_Entregas_V0_1.md` | 20 fluxos |
| `Riscos_Privacidade_RedTeam_Entregas_V0_1.md` | Riscos + desconhecidos |
| `Gate_Analise_Arquivos_Reais_Entregas_V0_1.md` | Checklist arquivos |
| `Registro_Dominios_Futuros_V0_1.md` | Suprimentos + Caixa |

---

*Mapa mestre V0.1 · plataforma · não monólito de apps.*
