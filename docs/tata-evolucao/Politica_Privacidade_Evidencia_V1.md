# Política de Privacidade e Evidência — TATÁ Evolução V1

> Governança de fontes, evidências e o que **nunca** entra no Git ou em documentos
> versionados. Alinha-se a `docs/Politica_Dados.md` (DeliveryOS) e às leis do produto
> (atenção humana, não vigilância, não mentira).

---

## 1. Princípios

1. **Memória do trabalho, não dossiê de pessoas.**  
2. **Dado incompleto é aceitável; dado falso ou exposto é veneno.**  
3. **Bruto privado fora do Git.**  
4. **Evidência por referência**, não por colar conversa inteira.  
5. **Nenhuma mineração vira julgamento automático de funcionário.**  
6. **César aprova** o que vira regra, conteúdo oficial ou mudança de sistema.

---

## 2. Onde vivem as fontes

| Tipo | Local | Git? |
|---|---|---|
| Documentos canônicos TATÁ Evolução | `docs/tata-evolucao/` | **Sim** |
| Docs DeliveryOS já versionados | `docs/` | **Sim** (já existentes) |
| Seeds sem PII (cardápio) | `data/*.json`, `*.txt`, CSV exemplo | **Sim** (já) |
| Brutos iFood, WhatsApp, PDFs, mídia | **`../deliveryos-private-sources/`** (sugerido) ou `data/raw/` local gitignorado | **Não** |
| Logs derivados / JSONL | `data/*.jsonl`, `generated/` | **Não** |
| Pacotes de revisão | fora do repo (ex. `deliveryos-review-packets`) | **Não** |

### Layout sugerido (fora do repositório)

```text
../deliveryos-private-sources/
  whatsapp/          # 13 conversas, zips originais
  ifood/             # Dados Claude.zip, xlsx, html
  qualidade/         # Bloco 3 PDFs
  midia/             # fotos kit, anexos
  rh/                # se/quando autorizado
  README-LOCAL.txt   # só instruções, sem dados
```

**Não mover** fontes privadas para dentro do clone versionado.  
**Não** commitar dumps, exports ou “amostras com nomes”.

---

## 3. O que **nunca** copiar para documentos Git

- conversas completas;
- nomes de pessoas **quando não forem necessários** ao aprendizado (preferir papel: “caixa”, “liderança”);
- telefones, endereços, CPF, e-mail de cliente ou equipe;
- dados de pagamento, senhas, tokens, cookies;
- fotos de comanda com dados de cliente;
- rankings ou comparações nominais de desempenho.

---

## 4. Formato de referência de evidência (obrigatório na T0B+)

Quando um padrão, caso ou hipótese citar fonte:

| Campo | Obrigatório | Exemplo |
|---|---|---|
| `source_id` | Sim | `SRC-EXT-WHATSAPP-RAW` |
| `periodo` | Sim | `2024-03` ou `2023-09-25` |
| `categoria` | Sim | taxonomia (ex. `erro.item_faltante`) |
| `resumo_anonimizado` | Sim | “Liderança pergunta quem fechou sacola; resposta por câmera.” |
| `ref_local` | Se bruto | caminho **local** + nome arquivo (não commitado) |
| `hash` | Recomendado | hash do arquivo bruto local |
| `confianca` | Sim | alta / média / baixa |
| `tipo_evidencia` | Sim | conhecimento / simulação / comportamento / consistência |

**Proibido:** colar mensagem completa com nome de remetente em docs públicos do Git.

---

## 5. O que a mineração **nunca** faz

| Proibido | Por quê |
|---|---|
| Diagnosticar personalidade | Não é ciência operacional; vira estigma |
| Inferir intenção íntima | Especulação |
| Criar ranking individual | Vigilância / punição (Lei 4 DeliveryOS) |
| Avaliar funcionários automaticamente | Passaporte só com reconhecimento humano |
| Recomendar punições | Fora do escopo do sistema |
| Preencher perfis reais de pessoas | Privacidade |
| Transformar mensagem isolada em padrão | Precisa frequência + revisão humana |

---

## 6. Regras de anonimização (T0B)

1. Substituir nomes por **papéis** quando o aprendizado for sobre processo.  
2. Manter nome **só** se César autorizar caso histórico sensível e o doc for **privado** (fora do Git).  
3. Agregar contagens (“N menções de pausa em 2025”) em vez de listas de mensagens.  
4. Imagens de erro: se só placeholder no export, registrar **lacuna**, não inventar conteúdo.  
5. Cliente: nunca reidentificar; usar só sinais agregados (estrelas, motivos de cancelamento).

---

## 7. Relação com o DeliveryOS

- DeliveryOS **não** é ferramenta de RH.  
- TATÁ Evolução **não** usa o slot de Foco do turno para cobrar treinamento.  
- Dados de operação (iFood) podem alimentar **baseline** e casos **após** aprovação.  
- Sinais do motor (praça, conferência) podem virar **conteúdo de formação**, não score de pessoa.

---

## 8. Checklist antes de qualquer commit nesta trilha

- [ ] Nenhum arquivo de `deliveryos-private-sources` staged  
- [ ] Nenhum `.xlsx` / `_chat.txt` / PDF de qualidade no diff  
- [ ] Nenhum telefone/CPF/endereço em markdown novo  
- [ ] Evidências só com `source_id` + resumo anonimizado  
- [ ] Branch é `research/tata-evolucao-grok` (não main/fable/audit)

---

## 9. Versão

| Campo | Valor |
|---|---|
| Versão | V1 |
| Status | Vigente na T0A |
| Próxima revisão | Após T0B (se novos tipos de fonte) |
