# Decisão de Integração de Períodos iFood — L2A.1

> Examinar packs Claude (16 xlsx) vs L3 maio–jun: ampliar período **somente** se seguro.

---

## 1. Decisão

### **NÃO INTEGRAR** os arquivos Claude ao denominador L2A.1 / base de exposição da L2B imediata.

**Período de exposição aprovado:**  
`2026-05-27` → `2026-06-25` · fonte **L3 pedidos maio–jun** · **8.305** pedidos únicos.

---

## 2. Critérios de segurança (checklist)

| Critério | L3 | Logistica (Claude) | Relatórios mensais out–mar |
|---|---|---|---|
| ID operacional confiável (UUID) | **Sim** | **Sim** (`ID COMPLETO DO PEDIDO`) | **Sim** nos Relatorio * de pedidos |
| Schema compatível (pedido + datetime) | **Sim** | **Sim** (série logística) | **Sim** (nível pedido) |
| Período conhecido | **Sim** | Parcial (parse ISO `YYYY-MM-DD HH:MM:SS`; amostra ~abr/2026+) | **Sim** (out/25–mar/26) |
| Dedup comprovada por UUID | **Sim** (0 dups internos) | 24.905 IDs únicos | ~7,1k–7,9k/mês |
| Sobreposição resolvida | — | **8.279** IDs em comum com L3 (quase todo o L3) | **0** overlap com L3 (meses diferentes) |
| Sem double-count se unir cru | OK sozinho | **Risco alto** se somar L3+Logistica sem union | OK se só anexar meses fora de mai–jun |

---

## 3. Achados por família de arquivo

### 3.1 Logistica.xlsx

- ~24.905 linhas / UUIDs únicos.  
- Sobreposição com L3: **8.279 / 8.305** → Logistica **já contém** quase todo o pack L3.  
- Ampliar período via Logistica é **tecnicamente viável no futuro** com `UNION` por UUID e tag de `source` + recorte de datas.  
- **Não executado** em L2A.1 porque: (a) validação completa de período min/max e buraco da hora 17 na série longa não foi fechada neste ciclo; (b) evitar double-count prematuro; (c) L3 já é consistente para cruzamento exploratório de 30 dias.

### 3.2 Relatorios mensais (Out/25–Mar/26)

- UUID presente; **zero** overlap com L3 (janelas disjuntas).  
- Úteis para **expansão histórica futura** após harmonizar schema de turnos/horas e política after-23.  
- **Não fundidos** agora: fora do escopo de fechar o denominador da L2B restrita ao recorte alinhável ao WA reclassificado prioritário.

### 3.3 Outros (Cardápio, Vendas resumo, Qualidade agregada, Negociações)

- Não são base de exposição pedido×hora.  
- Negociações: outro grão (reclamação/valor) — lote futuro.

---

## 4. Regras de deduplicação (mantidas)

**Chave:** `ID COMPLETO DO PEDIDO` (UUID) + origem + intervalo de datas.

**Proibido** deduplicar por:

- nome de cliente;  
- valor total;  
- proximidade temporal.

---

## 5. Caminho futuro (não L2B imediata)

```text
1) Parse full Logistica → period_start/end, hour histogram, after_23
2) UNION DISTINCT order_id com tag source ∈ {L3, logistica, relatorio_YYYYMM}
3) Recomputar exposure_windows
4) Revalidar hora 17 e after_23 na série longa
5) Só então usar denominador ampliado
```

---

## 6. Conclusão

| Pergunta | Resposta |
|---|---|
| Integrar Claude agora? | **Não** |
| Motivo principal | Evitar double-count; fechar QA temporal na série longa ainda pendente |
| Exposição aprovada | L3 30 dias, 8.305 UUID |
| Ampliação futura | Possível via UUID (Logistica + mensais), com pipeline de union |

---

*Decisão L2A.1 · denominador estável e conservador para L2B restrita.*
