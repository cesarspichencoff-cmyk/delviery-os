# TATÁ Comandas — fila objetiva de homologação dos 14 códigos (Itaim)

**Data de preparação:** 29/10/2026. **PR #127 — DRAFT / REVIEW ONLY / HOLD.** Esta matriz é um instrumento de decisão humana e conferência de evidências; **não é catálogo homologado**, não altera a Academia, a Teknisa ou impressoras.

## Por que esta matriz existe

A cadeia Reader V2 → classificação por código exato foi validada offline no commit `ac8ed6ac4058`, mas ainda **não autentica a classificação vigente dos produtos**. O teste técnico passou e corretamente mantém `classification_approved=false`, `packaging_approved=false` e `print_authorized=false`. Um nome coincidente, uma regra nominal da Academia ou uma rota antiga de impressora não substituem a ligação comprovada `CDPRODUTO ↔ código canônico ↔ classificação vigente ↔ motor pinado`.

A lista a seguir é derivada **exatamente** do conjunto histórico de 200 decisões de 26/10 (pode haver revisões repetidas). As 82 ocorrências de motivo **não são 82 pedidos**. Os nomes são rótulos observados, não identidade oficial; os códigos de rota se referem exclusivamente ao snapshot de **30/09**, não à configuração física atual. Ordenação: maior frequência histórica primeiro, **não** risco clínico, faturamento ou urgência universal.

## Quadro de revisão — sem classificação presumida

| Ordem | Código canônico | Rótulo observado no Reader | Motivos históricos | Rota histórica 30/09 | Classificação vigente comprovada |
| ---: | --- | --- | ---: | --- | --- |
| 1 | `9.10.05.000.00` | CARPACCIO DE SALMAO | 20 | `00009` + `00003` | **PENDENTE** |
| 2 | `9.75.00.020.00` | MISSOSHIRO | 12 | `00002` | **PENDENTE** |
| 3 | `9.10.05.060.00` | TUNA SHISSO TARTAR | 9 | `00006` | **PENDENTE** |
| 4 | `9.15.00.060.00` | SALMAO/ATUM 1 PESSOA | 7 | `00009` + `00003` | **PENDENTE** |
| 5 | `9.10.00.050.00` | SHIMEJI E SHITAKE | 7 | `00002` | **PENDENTE** |
| 6 | `8.00.05.000.00` | COCA COLA 350ML - UN | 4 | `00007` | **PENDENTE** |
| 7 | `8.20.00.061.00` | MOCHI INDIVIDUAL | 4 | `00002` | **PENDENTE** |
| 8 | `9.10.05.040.00` | TARTAR DE ATUM SPICY | 4 | `00006` | **PENDENTE** |
| 9 | `9.10.05.070.00` | CEVICHE | 4 | `00006` | **PENDENTE** |
| 10 | `8.00.00.010.00` | AGUA MINERAL C/GAS - UN | 3 | `00007` | **PENDENTE** |
| 11 | `9.10.05.050.00` | TARTAR DE SALMAO | 2 | `00006` | **PENDENTE** |
| 12 | `9.15.00.070.00` | SALMAO/ATUM 2 PESSOAS | 2 | `00009` + `00003` | **PENDENTE** |
| 13 | `9.99.00.007.00` | TATA CHOCOLATE | 2 | `00002` | **PENDENTE** |
| 14 | `8.20.11.002.00` | COOKIE PISTACHE | 2 | **AUSENTE** | **PENDENTE** |

**Conciliação mecânica:** 14 códigos; 82 ocorrências de motivo; 13 com rota configurada em snapshot antigo; 1 sem rota (`8.20.11.002.00`, Cookie Pistache). O Carpaccio apresenta dois destinos históricos (`00003` + `00009`), **não uma autorização de duplicar impressão**.

## Pacote mínimo de prova por produto

Para transformar uma linha de **PENDENTE** em homologação verdadeira, reunir na **mesma versão e unidade**:

1. **Origem nativa atual:** código exato `CDPRODUTO`, código canônico, nome oficial, unidade, status ativo, revisão/data da exportação e vínculo determinístico entre os dois códigos; manter nomes/IDs privados fora do GitHub quando apropriado.
2. **Regras atuais aprovadas:** família, subfamília quando relevante, praça produtiva, `review_required`, condições de embalagem e exceções; documentar quem aprovou e qual documento vigente usou, sem deduzir regra pela grafia do nome.
3. **Academia fixada:** versão exata do motor e da fonte de catálogo, confronto de código e entrada real de montagem (incluindo alergênicos, Kids/Tataki, itens frios/quentes e kits quando aplicável). A PR #50 da Academia segue DRAFT e **não** é automaticamente o motor vigente.
4. **Roteamento presente:** destino da praça pela janela operacional e configuração efetiva, incluindo exceções de almoço/jantar e backup; a rota histórica de setembro não prova isso.
5. **Reprodução controlada:** caso positivo, item duplicado, quantidade alterada, observação, cancelamento e troca de revisão no mesmo pedido; divergências geram HOLD para todas as vias dependentes, sem papel real.

Um **registro de aprovação humana isolado** não equivale à captura de evidência atual. A decisão final exige fonte + versão + correspondência exata + teste, mantendo separados quem fornece a regra e quem atesta sua aplicação. Evitar transferir dados pessoais, números reais de pedidos ou segredos ao repositório.

## Ordem de execução que evita retrabalho

- **A. Preparar evidência atual do catálogo da unidade** em fonte somente leitura e registrar a revisão de origem. Sem isso, não construir aliases nem aprovar os 14 itens.
- **B. Revisar em lote os 14 códigos** com responsável da operação; começar pelas cinco primeiras linhas (55 das 82 ocorrências históricas), mas não ignorar itens de menor frequência. Cookie Pistache exige recuperar ou esclarecer rota ausente, nunca copiar de outro doce.
- **C. Adaptar a fonte de classificação de forma isolada**, sem repinar o motor existente nem converter `REVIEW_CANDIDATE_ONLY` diretamente em pronto para produção. Rodar Linux + Windows no HEAD exato e testes de negativa.
- **D. Só depois** conciliar resultados de caixas/sacolas/kits às duas produções e à conferência do caixa. Independência iFood e primeira via nativa Teknisa são portões **separados**.

## Provas, estado e fronteira

- **Fato:** arquivo arquivado `data/comandas_packaging_classification_gaps_20261026_v1.json` (Git blob `ddeaa88b3bc0197d9f2d94990bd249a2f2592bee`) e roteamento `data/odhen_product_routing_compact_v1.json` (Git blob `d7d4d25bcb882370a37cf748d2d79139b07159a0`), ambos no HEAD acima.
- **Fato:** relatório `docs/comandas/AUDITORIA_SHADOW_ACADEMIA_20261026_REVIEW_ONLY.md` contém os rótulos e ocorrências.
- **Resultado:** nenhum dos 14 está homologado **por esta evidência**; não concluir que faltam no sistema atual.
- **Desconhecido:** catálogo vigente da loja, equivalências homologadas CDPRODUTO, destinos atuais/backup, evento independente do primeiro despacho `DLV_IFO` e saída física.
- **Bloqueio de efeito:** sem merge, deploy, serviço, SQL de escrita, impressão, spooler, sequência TATÁ, mudança fiscal ou substituição de motor sem autorização específica.

## Decisão humana prevalente — 29/10/2026 — SEM CONTATO COM A TEKNISA

**Instrução direta de César:** “Não quero enviar nada para a teknisa já disse isso salva isso”.

- **É proibido enviar ou propor envio à Teknisa** de e-mails, rascunhos, tickets, mensagens, chamadas ou qualquer contato externo referente a este projeto. **Não voltar a perguntar por autorização para esse contato**, pois a opção foi rejeitada explicitamente.
- O rascunho anterior existente no Gmail permanece **NÃO ENVIADO**. Não abrir chamados nem contratar suporte; não executar ação junto ao fornecedor.
- A investigação deve prosseguir **somente com fontes locais/repositório, documentação já disponível, testes offline, leituras legitimamente autorizadas e validação interna pela equipe TATÁ**. Respeitar bloqueios de acesso e não contornar proteções.
- Se uma prova não puder ser obtida sem contato externo, registrar **UNKNOWN / HOLD** em vez de simular autorização ou usar inferências; propor alternativa interna. Contato só pode ser reconsiderado caso César **mude explicitamente essa decisão por iniciativa própria**.
- Continuam bloqueados merge, deploy, SQL de escrita, mudanças em impressoras/serviços, sequência e impressão sem autorização específica.

**Rota seguinte:** validar catálogos/códigos e observações atuais de forma interna; cruzar a versão pinada da Academia, realizar regressões isoladas e preservar o HOLD sobre a primeira impressão nativa até evidência autorizada.


## Implementação preparada — comparador interno de identidade (30/10/2026)

- **Código candidato:** `tools/comandas_packaging_classification_review_v1_offline.cjs`, função `compareCandidateCatalogCapture`. Sua regressão foi incorporada ao verificador já existente `tools/verificar_comandas_packaging_classification_review_v1_offline.cjs` executado no CI Linux/Windows.
- **Entrada 1:** lista histórica fixa dos 14 códigos, 82 ocorrências de motivo, 200 revisões não únicas.
- **Entrada 2:** captura interna **fornecida e autorizada por um leitor legítimo** da unidade `0001/01`, com campos `schema=tata.comandas.itaim-catalog-identity-capture.v1.review-only`, `source_kind=LOCAL_READ_ONLY_CAPTURE_CLAIM`, `source_ref`, `store_id`, `store_unit`, `captured_local_date`, `entries` contendo `CDPRODUTO`, `canonical_code`, `product_name`, `active`.
- **Saída:** somente código canônico e estado `EXACT_IDENTITY_CANDIDATE_ONLY`, `CODE_ABSENT_IN_SUPPLIED_CAPTURE`, `AMBIGUOUS_CODE_OR_NATIVE_PRODUCT_ID` ou `INACTIVE_IN_SUPPLIED_CAPTURE`; não exporta nomes ou IDs internos.
- **Restrições:** mesmo 14/14 correspondências **não atestam a origem/captura atual**, família, praça, regra da Academia, caixas, sacolas, kits, configuração física, sequência ou primeiro despacho. Campos `independent_capture_attested`, `current_catalog_freshness_proven`, `classification_approved`, `packaging_approved`, `ready_for_operations` e `print_authorized` permanecem falsos sempre.
- **Proteção:** unidade errada, alegação extra de aprovação, campos inválidos e conflitos entre códigos/IDs geram HOLD/ambiguidade, sem fallback por nome. Nenhum efeito em SQL, arquivos operacionais, impressora, spooler ou rede.

**Situação de acesso:** CAIXA_MOOCA foi visto online em 30/10 e serviço `TataComandaReader` em execução; acesso do conector às pastas internas `shadow`/`state` retornou `EPERM`. Não houve obtenção do catálogo atual. Respeitar a negação e **não procurar rotas alternativas para contornar a restrição**. A nova ferramenta é preparação para evidência futura legitimamente autorizada, não uma prova de loja já concluída.

**Contato externo:** permanece vedado conforme decisão humana acima.
