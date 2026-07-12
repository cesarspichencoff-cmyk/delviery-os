# Registro de Lacunas de Fontes — V0

> Tudo que a T0A **não** conseguiu localizar, abrir ou validar neste ambiente.
> Cada item pede **decisão ou ação do César** (ou delegado) antes ou durante a T0B.

---

## 1. Lacunas bloqueantes para mineração profunda (P0)

| ID | Lacuna | Impacto | Decisão / ação pedida |
|---|---|---|---|
| L-01 | **13 conversas WhatsApp brutas** não localizadas no worktree nem em `../deliveryos-private-sources/` | Sem memória operacional bruta de 4 anos; T0B fica limitada a sínteses | Disponibilizar zips em private-sources; confirmar integridade |
| L-02 | **Contagem de mensagens divergente** (171.448 vs 155.333) no estudo | Risco de % enviesado se reusar números antigos | Autorizar recontagem com método versionado na T0B |
| L-03 | **`Dados Claude.zip` / exports iFood** não localizados | Sem série de pedidos/logística para baseline M1/M6 | Copiar para private-sources/ifood/ |
| L-04 | **Bloco 3 PDFs** (8 meses qualidade) não localizados | Sem agregados 2023–2024 de cancelamento/estrelas | Copiar para private-sources/qualidade/ |
| L-05 | **`data/raw/` vazio** neste clone (só gitkeep) | Ingest/replay não rodáveis aqui; ok para T0A docs | Opcional para T0A; necessário se T0B quiser cruzar motor |

---

## 2. Lacunas importantes (P1)

| ID | Lacuna | Impacto | Decisão / ação |
|---|---|---|---|
| L-06 | **Imagens de erros no WhatsApp** (“imagem ocultada”) não recuperáveis do export texto | Erros visuais de sacola/comanda sub-representados | Buscar backups de mídia; senão declarar viés permanente |
| L-07 | **Manuais / treinamentos antigos / onboarding** não encontrados | Academia pode reinventar o que já existiu em papel | César: existe material? onde? |
| L-08 | **Arquivos de RH** (datas de função, cargos) não encontrados | M5 (tempo até autonomia) fraco | Autorizar fonte mínima de datas por papel (sem dados sensíveis excessivos) |
| L-09 | **Backup confirmado** dos brutos fora de Downloads | Risco de perda total da memória | Decidir bucket/Drive/NAS (já apontado em Auditoria Nível 2) |
| L-10 | **Vídeo da loja** citado em auditoria fonte viva não processado | Pode conter fluxo de comanda | Fornecer frames se relevante à formação de caixa |

---

## 3. Lacunas de escopo / produto (P2 — decisão cultural)

| ID | Lacuna | Impacto | Decisão pedida |
|---|---|---|---|
| L-11 | Lista oficial dos **5 erros prioritários** do Delivery | Baseline M1 sem âncora | César lista os 5 |
| L-12 | **Limites de compensação** por escrito para conteúdo de atendimento | Risco de ensinar fora da política | Confirmar doc ou gravar áudio → texto aprovado |
| L-13 | Definição de **marcos de autonomia por cargo** (Júnior/Pleno/Sênior/Caixa/SAC) | Passaporte e M5 | Workshop curto com liderança |
| L-14 | Quem é **revisor humano** padrão dos casos (além de César) | Gargalo na captura | Nomear backup |
| L-15 | Pendências §15 **embalagens** (Fish Katsu, Yakisoba, etc.) | Conteúdo de montagem incompleto | Respostas César (já pedidas no DeliveryOS) |

---

## 4. Lacunas metodológicas abertas

| ID | Lacuna | Nota |
|---|---|---|
| L-16 | Viés de canal: WhatsApp = gestão/staffing; chão = voz/rádio sub-representado | Declarar em todo relatório T0B |
| L-17 | Estudo WhatsApp já cita **nomes** de equipe | Novos docs Evolução devem preferir papéis; não re-exportar tabelas nominais |
| L-18 | Fonte contínua iFood ainda em negociação | Não depender dela para T0; usar exports |

---

## 5. O que **não** é lacuna (já coberto no Git)

- Visão de produto DeliveryOS (Constituição, Leis, Manifesto)  
- Síntese cultural forte no `Estudo_Conversas_WhatsApp.md`  
- Cardápio 199 itens versionado  
- Regras de embalagens documentadas  
- Inventários e auditorias técnicas  
- Política de dados do repositório  

---

## 6. Checklist para destravar T0B “completa”

- [ ] L-01 WhatsApp em private-sources  
- [ ] L-03 iFood pack  
- [ ] L-04 Bloco 3  
- [ ] L-09 backup  
- [ ] L-11 cinco erros prioritários  
- [ ] AUTORIZO T0B  

**T0B parcial (só Camada A — docs Git)** pode ser autorizada sem L-01…L-04, com escopo explícito “sem bruto”.

---

## 7. Confirmações desta T0A

| Confirmação | Status |
|---|---|
| Fontes privadas commitadas | **Não** (0) |
| `../deliveryos-private-sources` criado com dados | **Não** (diretório nem existia na inspeção) |
| Branches main / fable / audit alteradas | **Não** |
| Padrões definitivos declarados | **Não** — só temas candidatos no inventário |

---

*Lacunas honestas · base para decisão do César.*
