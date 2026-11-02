# TATÁ Comandas — decisões humanas mínimas sem repetir o que foi confirmado

**Atualização:** 01/11/2026. **Escopo:** Itaim. **Estado:** REVIEW ONLY / PR #127 DRAFT / HOLD.
**Finalidade:** separar captura técnica, regras humanas históricas e aprovação de efeito físico. Nenhuma linha deste documento é licença de impressão.

## Resposta operacional

**Nenhuma nova aprovação de César é necessária para continuar os testes e a análise passiva.**
A pergunta humana será feita **após** existir catálogo atual verificável e somente para diferença realmente aberta, não para repetir a confirmação de 14/10.

## Evidência já disponível — preservar, não exigir novamente

- Leitura local de `shadow-v2/product-identity-cache-v1.json`, captura interna de **05/10/2026**, hash SHA-256 `37e92fc87ea1d141cbaca32216564ac22ee469e6c3dde478f10d8e0351daf4f3`: 554 linhas, 14/14 códigos de interesse com uma correspondência cada, 14 IDs distintos e 14 nomes normalizados coincidentes. **Não inclui estado ativo**, nem atesta que o registro é atual.
- Arquivo local `human-validations-cesar-20261014.review.json`, hash `7fdf9513d6979c28e640045f861d64513d7e563c20307fa6e70a6f13f7ac072d`: 10 registros de produto, 15 de sacola, 13 de kit, 4 de ambiente físico; todos com `print_authorized=false`. As oito correspondências nominais com os 14 códigos são históricas e requerem reconciliação com catálogo/regras vigentes.
- Não pedir novamente regra para Carpaccio, Missoshiro, Tuna Shisso Tartar, Salmão/Atum 1 Pessoa, Coca-Cola 350ml, Mochi Individual, Tartar de Atum Spicy ou TATÁ Chocolate apenas porque a conversa mudou. Os limites e condições das regras constam em `REGRAS_HUMANAS_HISTORICAS_20261014_REVISITADAS_20261031.md`.
- Decisões operacionais existentes para Kids sozinho (caixa 750, sacola M e Kit Kids) e Tataki condicionado à classificação comprovada devem ser preservadas; **não extrapolar para outras composições**.
- Não criar seleção de impressora somente por hora, nem imprimir tudo em todos os destinos. Quando o novo fluxo for de fato implantado, o objetivo é não duplicar os pedidos legados em papel; isso exige validação específica antes da mudança.

## Próximo portão técnico — sem intervenção humana agora

1. Captura **atual, legítima, da unidade Itaim**, com `CDPRODUTO`, código canônico, nome, ativo/inativo e versão/data; não extrair de pastas com ACL negada, não modificar ACL e não fabricar `active=true` a partir do cache antigo.
2. Confrontar os 14 itens com a captura de 05/10; separar invariantes, diferenças e ausências. Só depois vincular classificação e praça à revisão exata do Reader.
3. Cruzar a versão pinada do motor de embalagem/Academia com decisões de caixas, sacolas e kits; construir replays offline positivos/negativos, sem inferir aprovação.
4. Revalidar origem de primeira expedição, controle de duplicidade, sequência persistida e rotas efetivas antes de qualquer piloto físico.

## O que depende de validação humana, mas NÃO antes do portão técnico

**Seis produtos sem correspondência exata em qualquer uma das seções do arquivo de validação de 14/10** (produtos, sacolas, kits, físico ou pendências):

| Produto | Código | Motivos históricos | Tipo de validação necessária após identidade vigente |
| --- | --- | ---: | --- |
| Shimeji e Shitake | `9.10.00.050.00` | 7 | Confirmar praça/classificação e recipiente/caixa em composição exata |
| Ceviche | `9.10.05.070.00` | 4 | Confirmar classificação, praça e embalagem; nome no motor não é aprovação |
| Água Mineral c/Gás | `8.00.00.010.00` | 3 | Confirmar comportamento de separação/rota e necessidade de kit/canudo, sem analogia com refrigerante |
| Tartar de Salmão | `9.10.05.050.00` | 2 | Confirmar se recebe regra própria; não herdar automaticamente a de Tartar de Atum |
| Salmão/Atum 2 Pessoas | `9.15.00.070.00` | 2 | Confirmar caixa(s), composição e kit(s) específicos; não duplicar a regra de 1 pessoa |
| Cookie Pistache | `8.20.11.002.00` | 2 | Confirmar quem separa/entrega e se precisa destino de comanda; rota ausente no snapshot de 30/09. Não copiar Cookie Três Chocolates |

**Outras ambiguidades humanas já marcadas como abertas em 14/10:**
- Quantidade/escopo de canudo para bebidas (por item ou pedido; cerveja não presumida).
- Kits em composição Kids + refrigerante — não presumir Kit Sobremesa.
- Combinados executivos com várias caixas — quantidade e distribuição física por unidade/composição.
- Tartares em caixa 650 selada — não extrapolar para mistura de diferentes itens ou quantidade maior que três.
- Rota de Cookie Três Chocolates — distinta do Cookie Pistache.
- Aceite físico de vinculação de pedido/embalagens/rotas, somente após evidências técnicas.

**Proposta de abordagem humana futura:** exibir por produto o item e composição reais *sem dados pessoais*, a regra arquivada quando existir, a diferença detectada e uma pergunta objetiva. A aprovação deve ficar vinculada à versão atual do catálogo e à revisão testada, nunca somente à memória.

## Aprovação de alto impacto, separada e futura

Merge, deploy, instalação, mudança de serviço ou spooler, troca de rota, reserva de sequência e **primeiro teste físico de impressão** exigem autorização específica após os gates técnicos. Não há autorização implícita em “pode continuar”. Não contatar a Teknisa em nenhuma hipótese sem uma nova instrução direta de César.

## Prova e estado

- GitHub Actions do HEAD `c8b883178f490db192bf459f07e1927c3afa9264`: Linux 140/140 e Windows 128/128, ambos SUCCESS (workflow #41265250145).
- **Proven:** leitura e integridade de fontes históricas e regressões sintéticas/offline.
- **Unknown/HOLD:** catálogo atual, situação ativa, homologação por linha, rota efetiva, sequência real, primeira expedição e impressão física.

## Atualização prioritária — esclarecimento direto recebido em 01/11/2026

**Esta atualização prevalece sobre a seção anterior que identificava seis perguntas humanas futuras como pendentes.** César respondeu às seis regras; **não pedir confirmação novamente** apenas porque não há catálogo atual.

| Código | Produto | Regra humana explícita | Referencial e limite |
| --- | --- | --- | --- |
| `9.10.00.050.00` | Shimeji e Shitake | Cozinha; entrada quente; **650 selada** | Mesma configuração do Shimeji. Não presumir quantidade de caixas/kits sem prova de referência |
| `9.10.05.070.00` | Ceviche | Praça **Sushi Quentes**; **item frio**; 650 selada | Mesmo tratamento do Tuna Shiso; praça e temperatura são campos diferentes |
| `9.10.05.050.00` | Tartar de Salmão | Praça **Sushi Quentes**; **item frio**; 650 selada | Mesmo tratamento do Tuna Shiso; não herdar outras variantes ou quantidades |
| `8.00.00.010.00` | Água Mineral com Gás | Sai do bar | Mesma configuração do refrigerante; regras de canudo ainda não foram especificadas |
| `9.15.00.070.00` | Salmão/Atum 2 Pessoas | Praça dos **Combinados** | Mesmo tratamento do Salmão para 2 Pessoas; não inventar caixas, kits ou sacolas a partir do nome |
| `8.20.11.002.00` | Cookie Pistache | **Somente comanda de conferência; nenhuma nova via de produção** | Diretriz para o novo fluxo, sem desativar ou alterar automaticamente a impressão nativa/legada |

**Artefato preservado:** `data/comandas_cesar_clarificacoes_20261101_review_only.json`. A fonte é confirmação humana operacional atual para os seis casos **exatos**, mas não é captura de catálogo ativo nem prova da praça física, não autoriza modificar rota ou printer. O módulo `tools/comandas_cesar_clarificacoes_20261101_review_only.cjs` exige correspondência exata entre código e nome antes de registrar um candidato e mantém `print_authorized=false`; nove grupos de testes estão encadeados à regressão Linux/Windows.

**Diferença técnica que ainda importa:** localizar uma captura atual autorizada com `CDPRODUTO`, código, nome, status ativo, versão e unidade, e verificar no motor vigente as referências Shimeji, Tuna Shiso, Refrigerante e Salmão para 2 Pessoas. Só então integrar as regras à classificação operacional em sandbox. Mesmo concluído isso, primeira impressão física, supressão de via legada e sequência TATÁ permanecem **bloqueadas até autorização distinta**. Não confundir “Cookie Pistache não tem nova via de produção” com autorização para modificar a configuração de impressoras existentes.

**Decisão:** as seis validações de classificação de César estão **CAPTURED**, a integração está **CODE_CANDIDATE_ONLY**, a aplicação operacional está **HOLD**. Não contatar a Teknisa.


## Reconciliação das rotas históricas — leitura passiva de 01/11

A pasta autorizada de piloto no CAIXA_MOOCA contém `shadow-v2/routing.json`, **capturado em 30/09/2026** (463 produtos, hash SHA-256 `7084771026ca54f10069f02e0babcaa00f9c7666484cbaf80ec1ecdcdcaa165d`). As chaves de `products` são **códigos canônicos**, não `CDPRODUTO`; consultar esse objeto pelo ID nativo daria ausência falsa. Não converter ausência histórica em falta real atual.

Recalculei os conjuntos de destinos por código no computador, sem publicar os identificadores de impressora:
- Shimeji e Shitake (`9.10.00.050.00`) e Shimeji (`9.10.00.010.00`): mesmo conjunto de **um** destino;
- Ceviche (`9.10.05.070.00`) e Tuna Shisso Tartar (`9.10.05.060.00`): mesmo conjunto de **um** destino;
- Tartar de Salmão (`9.10.05.050.00`) e Tuna Shisso Tartar: mesmo conjunto de **um** destino;
- Água com Gás (`8.00.00.010.00`) e Coca-Cola 350ml (`8.00.05.000.00`): mesmo conjunto de **um** destino;
- Salmão/Atum 2 Pessoas (`9.15.00.070.00`) e Combinado Salmão 2 Pessoas (`9.15.00.076.00`): mesmo conjunto de **dois** destinos.

No conjunto dos 14 códigos historicamente pendentes: **13 tinham destinos** (10 de um destino e três de dois); apenas Cookie Pistache (`8.20.11.002.00`) estava ausente. César já determinou que esse cookie **não cria nova via de produção**, somente conferência. A ausência no mapa histórico não comprova que ele tenha a conferência configurada no ambiente atual.

O resultado minimizado foi preservado em `data/comandas_historical_routing_reference_20260930_review_only.json`, com testes executados na CI por `tools/verificar_comandas_historical_route_reference_20260930_offline.cjs`.

**Efeito na rota de finalização:** as cinco equivalências de destino de 30/09 coincidem com a intenção humana de 01/11. Falta verificar **mapa vigente**, integração ativa com o Reader, controle de duplicidade em relação ao iFood legado, sequência persistida e o primeiro despacho físico. Não há autorização para trocar destinos ou imprimir; `current_routing_proven=false`, `print_authorized=false`. O motor histórico categoriza 650 selada com temperatura padrão fria; isso não revoga a decisão humana de Shimeji e Shitake como entrada **quente** na 650 selada. Tipo de recipiente e temperatura do alimento devem permanecer independentes.
