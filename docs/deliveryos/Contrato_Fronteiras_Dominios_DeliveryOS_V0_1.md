# Contrato de Fronteiras entre Domínios — DeliveryOS V0.1

> Quem é dono · quem consulta · quem sugere · quem altera · quem **nunca** altera.  
> Calmo / Ambiente / Foco: **somente Operação Viva (núcleo)**.

Legenda: **Own** proprietário · **V** consulta · **S** sugere · **E** altera · **N** nunca altera · **—** N/A

---

## 1. Matriz de ownership por classe de dado

| Dado / objeto | Operação Viva | Entregas | Suprimentos | Caixa/Atend. (futuro) | TATÁ Evolução |
|---|---|---|---|---|---|
| Pedido / item / praça / produção | **Own E** | V (ref) | V (volume) | V futuro | N (só anon futuro) |
| Freshness / confiança / dedupe / replay | **Own E** | N | N | N | N |
| Calmo | **Own E** | N | N | N | N |
| Ambiente | **Own E** | S (fatos) | S (sinais) | S futuro | N |
| Foco | **Own E** | N | N | N | N |
| Delivery / Trip / Rider / Assignment | V | **Own E** | — | V futuro | N |
| PrintedArtifact / correlação | V/S | **Own E** | — | — | N |
| Handoff marketplace | V | **Own E** | — | V futuro | N |
| GPS sessão de viagem | N | **Own E** | N | N | N |
| Contagem embalagens / kits material | V futuro | V (consumo) | **Own E** | V caixa-ligado | N |
| Pagamento / voucher / estorno | — | N | N | **Own** futuro | N (tipos sem $) |
| Reclamação / ciclo SAC | V leve | N | N | **Own** futuro | formação |
| Competência / Passaporte | N | N | N | N | **Own E** |
| Protocolo formativo | N | V consulta | — | — | **Own E** |

---

## 2. Fluxo de fatos entre domínios

```text
Entregas ──fatos de capacidade/rota/handoff──► Operação Viva ──decide──► Ambiente/Foco
Suprimentos ──risco de falta (futuro)───────► Operação Viva
Operação Viva ──pedido pronto / id pedido───► Entregas
Operação Viva ──volume expedido (futuro)───► Suprimentos
Caixa/Atend. ──(futuro)────────────────────► sob contrato
TATÁ Evolução ◄──evidência anon (contrato)── Operação/Entregas (futuro, humano)
```

**Nunca:** Entregas/Suprimentos/Evolução → escrever Foco ou Calmo.

---

## 3. Regras de fronteira

| # | Regra |
|---|---|
| F-01 | Um objeto tem **um** owner de escrita. |
| F-02 | Consulta cross-domínio é por **contrato**, não por banco compartilhado implícito. |
| F-03 | Sugestão ≠ decisão (Ambiente pode ser influenciado; Foco só núcleo). |
| F-04 | Dado incerto de Entregas entra como fato com **confiança/desconhecido**, não como certeza. |
| F-05 | TATÁ Evolução não altera runtime. |
| F-06 | Caixa/Atendimento não modelado aqui — não contaminar Entregas com $ nesta missão. |
| F-07 | Suprimentos não expande para estoque do restaurante inteiro. |

---

## 4. O que cada domínio **nunca** faz

| Domínio | Nunca |
|---|---|
| Operação Viva | Executar rota GPS do motoboy; contar hashis |
| Entregas | Redefinir produção; criar Foco; fundir pedidos silenciosamente |
| Suprimentos | Gerir TATÁ House / salão / compras gerais |
| Caixa futuro | (escopo aberto — não definir agora) |
| Evolução | Punir; promover auto; escrever live |

---

*Fronteiras V0.1 · uma consciência · várias soberanias de dado.*
