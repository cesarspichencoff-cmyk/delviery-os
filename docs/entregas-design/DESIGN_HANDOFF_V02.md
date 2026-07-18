# Design Handoff — Entregas V0.2 (identidade DeliveryOS)

| Campo | Valor |
|---|---|
| Protótipo | `prototipos/entregas-v01/` (reconstrução visual V0.2) |
| Base | `VISUAL_IDENTITY_RESET.md` + contratos 2A |
| Commit message | `feat(entregas): alinha protótipo à identidade DeliveryOS` |

---

## 1. O que foi descartado

- Sidebar de filas / chips de status  
- Pilha de cards brancos com sombra SaaS  
- Stage-pills 10× iguais  
- Ledes e insights didáticos no produto  
- Painel de detalhe administrativo separado  
- Meta-texto (“não é grade de cards…”)  
- Topbar de console de gestão  

**Não descartado:** contratos Trip/Delivery, 20 cenários, volumes, tentativas, E01–E10, offline, fechamento real.

---

## 2. Nova direção

**“Entregas é uma trajetória viva dentro do organismo DeliveryOS.”**

- Campo creme/papel (`#F5F3ED` família app-v1)  
- Viagens = **fios** (SVG path + nós), não caixas  
- Uma viagem em **Foco** se aproxima no mesmo palco  
- Periféricas finas e legíveis  
- Pílula verde de ação (comando visual DeliveryOS)  
- Demo isolada no topo (como replay V1)  

---

## 3. Desktop — Campo de viagens

- Lista espacial de trajetórias  
- Foco expande fio + fatos + ação no contexto  
- Bloqueio = gap/âmbar no fio antes da saída  
- Retorno = variante de curva + indício de direção  
- Fechamento = linha completa ou ponta aberta se pendente  

---

## 4. Mobile — Próximo Passo

- Sem “card formulário”  
- Minifio + display tipográfico + pílula  
- Conexão discreta  
- Copy de bloqueio conforme reset  

---

## 5. Cenários

20 preservados (demo select), revalidados nos críticos: multi-viagem, volumes, rota, não atende, offline, conflito, retorno, fechamento, reenvio.

---

## 6. Como executar

```bash
cd prototipos/entregas-v01
# abrir index.html
# ou: python -m http.server 5190
```

---

## 7. Limitações

- Fios são caminhos SVG estilizados (não GIS)  
- Multi-viagem densa ainda ilustrativa  
- Sem persistência  
- Não é produção  

---

## 8. Gates (pós-reconstrução)

| Gate | Status alvo V0.2 |
|---|---|
| Sem menu lateral de filas | Sim |
| Sem cards de viagem | Sim (fios) |
| Sem fileira de 10 chips | Sim |
| Foco na superfície | Sim |
| Sem texto conceitual no produto | Sim |
| Mobile não-formulário | Sim |
| Mapa não domina | Sim |
| Contexto no Foco | Periféricas visíveis |
