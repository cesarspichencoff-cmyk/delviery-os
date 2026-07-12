# Plano de Mineração — T0B (método, não execução)

> **T0A só define o método.** Não iniciar mineração em volume sem `AUTORIZO T0B` do César.
> Objetivo: extrair temas, hipóteses e **padrões candidatos** com evidência mínima e revisão humana.
> **Não** declarar padrões definitivos na T0A; na T0B, candidatos exigem validação.

---

## 1. Pré-requisitos para começar a T0B

| # | Pré-requisito | Status T0A |
|---|---|---|
| 1 | Visão Mestra V1 congelada | Feito |
| 2 | Inventário + lacunas | Feito |
| 3 | Política de privacidade | Feito |
| 4 | Taxonomia V0 | Feito |
| 5 | Fontes P0 em `../deliveryos-private-sources/` | **Pendente César** |
| 6 | Autorização explícita T0B | **Pendente** |

Sem o item 5, a T0B pode apenas: (a) minerar **docs Git** e estudos já versionados; (b) listar o que falta.

---

## 2. Ordem das fontes (camadas)

### Camada A — Sem bruto privado (pode começar só com Git)

1. `SRC-DOC-WHATSAPP-STUDY` (índice de temas)  
2. `SRC-DOC-CORE` (Leis, Constituição, Manifesto)  
3. `SRC-DOC-EMBALAGENS`  
4. `SRC-DOC-SINAIS` + contratos cognitivos  
5. `SRC-DOC-AUDITORIAS` / relatórios (métricas)  
6. `SRC-SEED-CARDAPIO` (só consultas pontuais)

### Camada B — Brutos (só com private-sources)

7. `SRC-EXT-WHATSAPP-RAW` — **amostragem controlada** (nunca 171k de uma vez)  
8. `SRC-EXT-DADOS-CLAUDE-ZIP` / raw iFood  
9. `SRC-EXT-BLOCO3-PDF`  
10. Mídia / RH se existirem  

**Regra:** esgotar aprendizado da Camada A antes de reabrir chats brutos.

---

## 3. Amostragem inicial (WhatsApp, quando disponível)

| Passo | Ação |
|---|---|
| B1 | Inventariar 13 arquivos: nome, bytes, hash, período (sem ler conteúdo) |
| B2 | Amostra **estratificada por ano** (2023, 2024, 2025, 2026-parcial) |
| B3 | Dentro do ano: 1 conversa hub (ex. liderança) + 1 operacional + 1 grupo |
| B4 | Por conversa: janelas de **2 semanas** em pico e em vale |
| B5 | Parar a expansão quando novos trechos **não** gerarem categorias novas (saturação) |

**Não** processar as 13 conversas lineares do início ao fim na primeira semana.

---

## 4. Processamento por período

- Unidade de análise: **semana operacional** ou **mês**, nunca “mensagem isolada = padrão”.  
- Registrar `periodo_inicio` / `periodo_fim` em cada ficha de candidato.  
- Cruzar com Bloco 3 / iFood **no mesmo período** quando existir (atraso, cancelamento).  

---

## 5. Duplicidade

| Situação | Tratamento |
|---|---|
| Mesma decisão em 3 chats no mesmo dia | Uma evidência primária + refs secundárias |
| Encaminhamento de mensagem idêntica (kit 25/09/2023) | Marcar como **broadcast** / regra formalizada |
| Estudo WhatsApp vs bruto | Estudo = índice; bruto confirma ou corrige |

Chave de dedup de evidência sugerida: `source_id + data + categoria + resumo_hash`.

---

## 6. Anonimização (obrigatória ao registrar)

Ver `Politica_Privacidade_Evidencia_V1.md`.

- Saída da mineração = fichas com **papel**, não nome.  
- Log de trabalho do minerador fica **fora do Git**.  
- Commits T0B só com agregados e resumos anonimizados.

---

## 7. Critérios para chamar algo de **padrão candidato**

Todos os itens:

1. **Frequência:** aparece em ≥ **3** períodos distintos **ou** ≥ **5** evidências independentes.  
2. **Impacto:** afeta cliente, erro, atraso, segurança ou dependência de liderança.  
3. **Clareza:** descrevível em uma frase operacional.  
4. **Revisão humana:** lido por César ou delegado antes de virar conteúdo.  
5. **Não é anedota única** de um dia ruim.

Abaixo disso → **hipótese** ou **tema candidato** apenas.

### Nível mínimo de evidência por tipo futuro

| Tipo | Mínimo |
|---|---|
| Tema candidato | 2 evidências ou 1 estudo sintético forte |
| Padrão candidato | critério §7 completo |
| Padrão definitivo (conteúdo Academia) | padrão candidato + aprovação César + tipo de evidência ≥ comportamento quando aplicável |

---

## 8. Fontes contraditórias

1. Registrar **ambas** as leituras.  
2. Preferir **ato observado** (export iFood, PDF) a relato se conflitarem em fato mensurável.  
3. Preferir **regra escrita recente** a informal antiga, se datas claras.  
4. Se irreconciliável → `confianca: baixa` + pergunta ao César.  
5. **Nunca** escolher o lado que “soa melhor para o curso”.

---

## 9. Revisão humana

| Papel | Função |
|---|---|
| Grok / minerador | Propõe fichas, não fecha cultura |
| ChatGPT | Consolida arquitetura de trilhas quando houver massa |
| César | Aprova padrões, conteúdos, mudanças de regra |
| Liderança de loja (se convidada) | Valida se “ainda é assim no chão” |

---

## 10. Formato de registro — padrão candidato

```text
pattern_id: PAT-XXXX
titulo: (sem nomes de pessoas)
descricao:
evidencias: [ {source_id, periodo, categoria, resumo_anonimizado, confianca} ]
frequencia: (contagem / períodos)
periodo_coberto:
areas: [taxonomia]
impacto: cliente|equipe|custo|tempo|reputacao
confianca_padrao: alta|media|baixa
hipotese_causa:
acao_possivel: conteudo|procedimento|comunicacao|sistema|nenhuma_ainda
validacao_humana: pendente|aprovado|rejeitado
tipo_evidencia_predominante: conhecimento|simulacao|comportamento|consistencia
```

---

## 11. Formato de caso anonimizado

```text
case_id: CASE-XXXX
o_que_aconteceu:
o_que_foi_feito:
resultado:
precisa_ensinar_ou_alterar: sim|nao|talvez
taxonomia_primaria:
taxonomia_secundaria: []
source_refs: []
aprovacao: rascunho|revisado|oficial
```

---

## 12. Critério de parada (saturação)

Parar de expandir amostra de uma fonte quando, em **duas janelas consecutivas**:

- zero novos códigos de taxonomia de 1º nível; e  
- < 10% de padrões candidatos novos em relação à janela anterior; e  
- revisão humana confirma “já vimos isso”.

Documentar a parada com data e fonte — evita mineração infinita.

---

## 13. Entregáveis esperados da T0B (quando autorizada)

1. Catálogo de **temas e padrões candidatos** (não cursos).  
2. Lista de **competências** esboçadas por função.  
3. **10–30 casos** anonimizados prioritários.  
4. Lacunas de conteúdo (o que a equipe pergunta e não está escrito).  
5. Insumos para Sprint Visual e T1 (Cultura e Atendimento).  
6. Atualização do inventário se novas fontes aparecerem.

**Fora da T0B:** app, telas, cursos completos, Passaporte implementado, ranking.

---

## 14. Riscos da mineração

| Risco | Mitigação |
|---|---|
| PII no Git | Política V1 + checklist de commit |
| Caça a pessoas | Proibição explícita; papéis |
| Falsa precisão de % | Baseline separado; sem meta prematura |
| Enviesar pelo WhatsApp (gestão > chão) | Cruzar iFood/PDF; declarar viés de canal |
| Contagem 155k vs 171k | Recontar com método versionado antes de citar % |

---

*Método pronto · execução só com AUTORIZO T0B.*
