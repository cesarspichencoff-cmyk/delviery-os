# Gate — Análise de Arquivos Reais de Entregas V0.1

> Checklist para quando César enviar amostras.  
> **Não** inventar conteúdo dos arquivos agora.  
> **Não** commitar PII no Git.

---

## 1. Tipos de arquivo esperados

| Tipo | Uso |
|---|---|
| Comandas Nimo | Sinais de canal/pedido próprio |
| Comandas Tecnisa/integração | Origem técnica de impressão |
| Etiquetas pequenas de sacola | Match com comanda |
| Reimpressões / 2ª via | Anti-duplicidade |
| Export sistema atual motoboys | Trip, saída, retorno |
| Registros de saída / retorno | Estados |
| Exemplos multi-pedido por viagem | TripStops |

---

## 2. O que extrair (quando chegar)

| Categoria | Campos / padrões |
|---|---|
| IDs | pedido, comanda, viagem, motoboy (pseudo) |
| Tempo | impressão, saída, entrega, retorno |
| Layout | blocos, ordem de linhas, ruído de OCR |
| Canal | strings iFood/Nimo/Tecnisa/próprio |
| Endereço | estrutura, complemento |
| Itens / valor | se presentes |
| Reimpressão | marcas “2ª”, “reimp”, cópia |
| Dados repetidos | o que aparece em N artefatos |
| Dados ausentes | o que o modelo precisa e o arquivo não tem |
| Privacidade | telefone, nome completo, CPF — **redigir** em docs Git |
| Qualidade correlação | quais sinais bastam para confirmed_match |

---

## 3. Critérios de privacidade na análise

- Trabalhar em cópia privada (fora do Git) quando houver PII.  
- Em docs públicos: só padrões agregados e campos **anonimizados**.  
- Não colar comanda completa com dados de cliente.

---

## 4. Saídas esperadas da próxima missão (não esta)

1. Mapa de campos reais → objetos V0.1.  
2. Ajuste de níveis de confiança com evidência.  
3. Lista de gaps do modelo.  
4. Decisões César se layout forçar mudança de regra.

---

## 5. Go para análise

| Pronto quando | Status agora |
|---|---|
| Modelo conceitual Entregas V0.1 | **Sim** (esta missão) |
| Arquivos reais recebidos | **Pendente César** |
| Ambiente privado para PII | A preparar |

---

## 6. Veredito deste gate

**Fundação pronta para receber e analisar arquivos reais** (missão futura).  
Análise **não** iniciada sem arquivos.

---

*Gate arquivos reais Entregas V0.1.*
