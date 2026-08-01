# Fontes reais de cardápio + Writer local final

## Resultado executivo

O Gemma 4 E4B está conectado ao endpoint real do painel exclusivamente como
Writer do `Approved Response Envelope`. O compositor determinístico continua
sendo o fallback fail-closed. As fontes reais de cardápio foram transformadas
em uma fila de curadoria humana, mas nenhum item ou harmonização extraído foi
aprovado automaticamente.

Consequência: a linguagem local está disponível; o catálogo real ainda não
pode substituir as sete fixtures sintéticas antes da decisão humana.

## Inventário dos artefatos locais

| Artefato | Esperado | Encontrado | Caminho configurável | SHA-256 | Utilizável |
|---|---|---|---|---|---|
| Pacote Mudança 005 | pacote de revisão externo | sim | `deliveryos-review-packets/chatbot-change-005-portable-ai-node/` | manifesto próprio | sim, evidência |
| `DeliveryOS-AINode-Windows.zip` | instalador portátil certificado | sim | pacote externo da Mudança 005 | `9ec05a9223e6b1b3ea76bb88d4c29d5a9280750b60b6a9a600841df4c88756c9` | sim, preservado |
| llama.cpp | b10172 CPU Windows x64 | instalado após inventário | `%LOCALAPPDATA%/DeliveryOS/homologation-writer/runtime/llama-b10172/` | `9a2c7b98925cc4cea59d9e6de1e4ea3cbb07c26245410d5da653bceef9ee6e62` | sim |
| Gemma 4 E4B | GGUF oficial QAT Q4_0 | instalado após inventário | `%LOCALAPPDATA%/DeliveryOS/homologation-writer/models/` | `676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee` | sim, Writer |
| Qwen3.5 4B | GGUF secundário fixado | não retido | nenhum arquivo local localizado | esperado `13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983` | não necessário |
| Manifests e proveniência | Mudanças 005 e 005B | sim | pacotes externos e `docs/execution/chatbot/` | hashes documentados | sim |

Somente as origens e revisões aprovadas foram usadas. O download ocorreu depois
da conclusão do inventário. Não houve API, nuvem, GPU alugada, trial faturável
ou gasto externo.

## Caminho do Writer

```text
mensagem no painel
→ Pattern Engine
→ ferramentas e fontes
→ plano e fatos aprovados
→ Approved Response Envelope
→ Gemma 4 E4B local
→ validação estrutural e semântica
→ resposta publicada
```

Falha de artefato, carga, tempo, JSON, pergunta, link, número, claim, canal ou
política retorna ao compositor determinístico com `writer_status` igual a
`deterministic_fallback` e código específico. A interface não recebe caminho
privado do computador, prompt interno nem raciocínio do modelo.

Configuração local:

- raiz opcional: `DELIVERYOS_HOMOLOGATION_WRITER_ROOT`;
- padrão externo ao Git: `%LOCALAPPDATA%/DeliveryOS/homologation-writer`;
- runtime: llama.cpp b10172, CPU, `127.0.0.1:4191`;
- modelo: Gemma 4 E4B, adapter `gemma4`, contexto 8.192;
- seed do Writer de homologação: `7443`;
- `FINANCIAL_MODE=ZERO_EXTERNAL_COST`;
- `MAX_EXTERNAL_SPEND_BRL=0.00`.

## Fontes reais e fila de curadoria

| Grupo | Quantidade | Estado inicial | Uso pelo bot |
|---|---:|---|---|
| itens da seed operacional | 199 | pendente | nenhum como fato comercial |
| harmonizações extraídas do DOCX | 86 | pendente | nenhuma |
| fontes públicas de salão | 1 página + 1 link curto | não importada | somente referência de fonte |
| delivery próprio | 1 página pública | não importada | somente referência de fonte |
| iFood | URL pública, conteúdo bloqueado | não importado | nenhum item ou preço |

A contagem 86 corrige a estimativa anterior de aproximadamente 70: o documento
reinicia a numeração em Entradas e Combinados antes da sequência 11–70.

Cada proposta mostra fonte, canal, unidade, informação extraída, divergências,
campos ausentes e ações humanas. As decisões são append-only. Aprovação de item
exige canal e unidade. Aprovação de harmonização exige também vínculos com prato
e bebida reais. Preço, disponibilidade, ingredientes, cream cheese, preparo,
alergênicos e contaminação cruzada permanecem desconhecidos quando não há
confirmação.

## Catálogo ativo

- sem item real aprovado: sete fixtures sintéticas, rotuladas e isoladas;
- com item real aprovado: catálogo real-only reconstruído pela revisão;
- canais `dining_room`, `ifood` e `own_delivery` nunca são fundidos;
- unidade participa da identidade;
- harmonização pendente ou conflitante nunca é usada;
- lista de compras não é prova de composição.

## Comparação humana simples

Quando o Gemma é aceito, o painel oferece:

- A: compositor determinístico;
- B: Gemma local;
- o mesmo hash do envelope aprovado para ambos.

A comparação avalia somente linguagem. Não escolhe modelo, não muda fatos e não
constitui novo bake-off.

## Homologação executada no painel real

Em `http://127.0.0.1:4179`, as 13 mensagens obrigatórias foram enviadas pela
interface, no mesmo contexto conversacional. Todas passaram pelo endpoint real,
pelo `deliveryos-approved-response-envelope-v1` e pelo Writer local:

| Verificação | Resultado observado |
|---|---|
| Writer | 13/13 respostas com `writer_status=gemma_local`, `response_path=gemma_local_writer` e sem fallback |
| Saudação | resposta natural, sem o fallback genérico anterior |
| Restaurante e cardápio | fatos confirmados preservados; link público de salão apresentado pela fonte institucional |
| Preferências sem canal | nenhuma opção real inventada; catálogo sintético identificado ou clarificação solicitada |
| Harmonização | nenhuma bebida foi sugerida sem opção e harmonização aprovadas |
| Alergia a camarão | restrição preventiva preservada, contaminação cruzada não garantida e confirmação humana solicitada |
| iFood e preço de salão | nenhum item, disponibilidade ou preço foi transportado entre canais sem evidência |
| Contaminação cruzada | nenhuma ausência de risco foi afirmada |
| Comparação A/B | A e B exibidos com o mesmo hash do envelope aprovado |
| Interface | fila de 199 itens + 86 harmonizações; zero erro ou warning no console |

Limite funcional observado: sem canal e sem item real aprovado, frases isoladas
como “mais leve” e “maçaricado” ainda recebem clarificação genérica do Pattern
Engine. Esta mudança não autoriza alterar o Pattern Engine; o comportamento
fica registrado para a próxima homologação conversacional, sem promover dado
extraído ou sintético a fato real.

## Limitações e próximo gate

- os 285 registros aguardam curadoria humana;
- nenhum preço, disponibilidade ou garantia de alergênico real foi aprovado;
- as fontes públicas ainda não foram importadas;
- iFood permanece sem conteúdo inspecionado;
- Writer e catálogo existem apenas no painel local de homologação;
- WhatsApp, hospedagem, produção e drivers reais continuam bloqueados.

O próximo passo seguro é César revisar itens e harmonizações no painel. Não se
deve conectar WhatsApp ou publicar catálogo real antes desse gate.
