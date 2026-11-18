# Termo de localização: recomendações de retenção e de texto

> **Isto é uma recomendação técnica, não um parecer jurídico.** Os números abaixo são uma
> proposta para o César levar à revisão jurídica. Quem decide é o César, depois dessa revisão.
> Nada aqui preenche a minuta (`termo-localizacao-minuta.json` segue com `approved: false` e
> `[[PENDENTE]]` nos dois prazos), e nada aqui vale como política em vigor.
> Data da pesquisa: 2026-11-15.

## 1. Recomendação em uma linha

| Dado | Prazo recomendado | Ao vencer | Faixa defensável |
|---|---|---|---|
| (b) **Ponto detalhado de GPS** (trilha da viagem) | **30 dias** | apagar | 15 a 30 dias; acima de 90 só com justificativa escrita |
| (a) **Evento operacional** (saída, chegada, retorno, ocorrência, sem trilha) | **365 dias** | apagar, ou anonimizar (sem `rider_id`/`device_id`) para estatística | 6 a 12 meses; mais que isso só com decisão jurídica (ver §3.3) |

Exceção para os dois: viagem com **ocorrência aberta ou contestada** fica guardada até a
contestação acabar, com registro de quem segurou e por quê. Isso também é decisão jurídica.

Os dois números são os que o próprio código já usa como forma em `TERM_ITAIM_V1`
(`src/entregas/consent/term.ts`: 365 e 30). Este documento dá a eles a justificativa que faltava.
Não são política só por estarem lá.

## 2. Trava que vem antes de qualquer número

**Hoje nada apaga ponto de GPS.** O ponto entra como `gps_batch_received` em
`platform.event_log`, que é append-only contra `UPDATE` e `DELETE` (migration 0001) e contra
`TRUNCATE` (migration 0004, `docs/etapa-4-8/APPEND-ONLY.md`). Uma busca em `src/` não encontrou
rotina de expurgo de GPS. A única retenção que existe no código é a da Intelligence Spine
(`src/platform/runtime/intelligence-retention.ts`, Q-015), que não toca no event log.

A minuta diz: "Depois disso, são apagados." **Se o termo for aprovado assim, ele mente.**
Antes de aprovar, o César precisa escolher um destes caminhos:

1. implementar a eliminação (por exemplo, guardar a trilha fora do log append-only, ou
   particionar e descartar por prazo). Isso mexe na invariante do event log e é decisão do César;
2. ou mudar o texto para o que o sistema realmente faz, e levar isso à revisão jurídica.

Recomendo registrar isso como pergunta nova em `docs/execution/PERGUNTAS.jsonl`, com
`default_behavior: PAUSE`. Este documento não cria a pergunta.

Também entram na conta:

- **No celular**, os pontos ficam guardados até subirem. A retenção local não apaga o que
  não subiu (fail-preserve). Depois de revogar o aparelho, os pontos locais continuam lá
  (`FIELD-GATE-ANDROID.md` §3, item 21). O termo deveria dizer o que acontece com eles.
- **A prova do aceite** (`term-acks.jsonl`, append-only) deveria durar pelo menos tanto quanto o
  dado mais longo que ela justifica. Se a base legal for consentimento, quem tem que provar o
  aceite é a empresa: "cabe ao controlador o ônus da prova" (LGPD, art. 8º, §2º).
- **Uma retenção só para os dois tipos de dado.** `retention.after_expiry` é um campo só. Para
  apagar o ponto e anonimizar o evento, a estrutura precisa mudar. Isso é mudança de código,
  fora deste documento.

## 3. Justificativa

### 3.1 O que a lei pede

A Lei 13.709/2018 (LGPD), texto do Planalto:

- **Finalidade e necessidade** (art. 6º, I e III): tratar só para fins "legítimos, específicos,
  explícitos e informados ao titular", e limitar o tratamento "ao mínimo necessário".
- **Fim do tratamento** (art. 15, I): o tratamento acaba quando se verifica que "a finalidade
  foi alcançada" ou que o dado deixou de ser necessário.
- **Eliminação** (art. 16): os dados "serão eliminados após o término de seu tratamento". As
  exceções são fechadas, e a primeira é cumprir obrigação legal ou regulatória.
- **Defesa em processo** (art. 7º, VI): o exercício regular de direitos em processo é base
  legal. É por ela que uma trilha contestada pode ficar guardada além do prazo.
- **Registro e segurança** (arts. 37 e 46).

### 3.2 Ponto detalhado: 30 dias

- **A finalidade dura pouco.** O ponto serve para acompanhar a viagem enquanto ela acontece,
  ajudar numa ocorrência e conferir chegada e retorno. Uma viagem de delivery dura minutos.
  Passado esse uso, sobra o que a lei chama de dado que deixou de ser necessário (art. 15, I).
- **30 dias cobrem o que aparece depois da viagem**: reclamação de cliente, conferência do
  caixa e do fechamento do mês, sinistro com a moto. Passado isso, o evento operacional (§3.3)
  responde o que a operação precisa, sem a trilha.
- **A ANPD já usou prazo curto como proteção.** No exemplo das câmeras de shopping do guia de
  legítimo interesse, entre as medidas recomendadas está "um prazo mais curto de armazenamento"
  (ANPD, *Guia Orientativo – Legítimo Interesse*, fev. 2024).
- **O trabalhador está em posição mais fraca.** No exemplo do software que monitora empregados,
  a ANPD diz que eles estão "em posição de maior vulnerabilidade em face de seu empregador" e
  conclui que o tratamento não poderia ser feito. A trilha de GPS é o dado mais sensível do
  sistema. Guardar pouco é a salvaguarda mais barata.
- **Celular pessoal.** Na homologação, os aparelhos são dos motoboys. É mais um motivo para
  guardar pouco: o aparelho é da vida pessoal dele.

### 3.3 Evento operacional: 365 dias

- O evento diz **que** algo aconteceu (saiu, chegou, voltou, ocorrência), não **por onde**.
  Comparar a operação com o mesmo mês do ano anterior e auditar o histórico são finalidades
  legítimas que pedem cerca de um ano.
- **Horizonte trabalhista: decisão jurídica.** O art. 11 da CLT fixa prescrição de cinco anos,
  até dois anos depois do fim do contrato. Notícias sobre a SDI-2 do TST (por exemplo, ROT
  23218-21.2023.5.04.0000, de maio de 2024, e ROT 23369-84.2023.5.04.0000, de setembro de 2025)
  relatam que geolocalização tem sido aceita como prova de jornada, mas com limites: só o horário
  em discussão, sob sigilo e como prova de apoio. Não li os acórdãos, só notícias e textos de
  escritórios. **Se** o jurídico quiser guardar por mais tempo para defesa, a recomendação
  técnica é estender **só o evento operacional**, nunca a trilha. Guardar a trilha por cinco anos
  "para o caso de processo" é exatamente a banalização que esses textos criticam.
- O texto-base do código (`BODY_V1`) promete que a localização não gera ranking nem punição
  automática. Isso conversa com a legítima expectativa e deveria entrar no termo publicado, se o
  César aprovar. Hoje essa frase não está na minuta.

### 3.4 Base legal: o termo diz "aceite", a lei pode pedir outra coisa

A escolha da base legal é do jurídico. Dois fatos técnicos para essa conversa:

- Entre empregado e empregador, consentimento livre é frágil. É a mesma vulnerabilidade que a
  ANPD aponta no exemplo acima. A base pode acabar sendo execução de contrato (art. 7º, V) ou
  legítimo interesse (art. 7º, IX, com teste de balanceamento documentado, art. 10 e art. 37).
- **Se a base for consentimento**, ele "pode ser revogado a qualquer momento" (art. 8º, §5º). Hoje
  o aplicativo **não tem botão de retirar o aceite**: o registro é idempotente, a primeira
  resposta vale, e a recusa também não se desfaz pelo app (`device-api.ts`,
  `handleTermAcknowledgeFromSession`). A retirada só acontece fora do sistema
  (`CONSENTIMENTO_GPS_PROCEDIMENTO.md` §4). Com essa base, é uma lacuna a fechar.

## 4. Revisão da minuta contra o código (r2, 2026-11-15)

| O texto dizia, ou deixava de dizer | O código faz | Mudança |
|---|---|---|
| "começa quando a viagem sai" | liga só quando o domínio põe a viagem **deste** motoboy em `em_rota`/`retornando`. O clique não basta (`capture-rule.js`) | "quando o sistema confirma a saída (tocar no botão não basta)" |
| não falava do aceite | precisa de aceite do servidor para este motoboy, **este aparelho** e este hash | "Sem o seu aceite deste termo neste celular… nada é coletado" |
| registrava "posição e horários" | grava também precisão, velocidade, direção, altitude, provedor e se o ponto foi feito offline (`device-ingest.ts`, payload) | entram no texto (transparência, art. 6º, VI). Ficaram de fora o provedor e o relógio interno do aparelho (`elapsed_realtime_ns`), que são técnicos. O jurídico decide se precisam constar |
| não falava do relógio | o servidor julga o horário do aparelho; adiantado vira `suspect`, e o frescor usa a hora do servidor (`RELOGIO.md`) | parágrafo novo |
| "localização falsa é recusada" | `is_mock` num lote real é recusado; ponto fora da janela da viagem dele neste aparelho também | as duas recusas no texto |
| não falava de offline | a fila fica no celular e sobe depois | uma frase |
| não dizia como parar | permissão negada desliga (`sem_permissao`; o `CaptureGate` do Kotlin é a última palavra) | "desligando a permissão…" |
| não dizia que existe aviso | notificação fixa `TripNotification.TEXT` | uma frase |
| "são apagados" | **nada apaga** (§2) | texto mantido como intenção; trava registrada no `_aviso` |

Mantidos: `approved: false` e todos os `[[PENDENTE]]`. O teste continua 5/5.

## 5. Fontes

- Lei 13.709/2018 (LGPD), texto compilado do Planalto:
  <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm>. Arts. 6º, 7º, 8º,
  10, 15, 16, 18, 37 e 46.
- ANPD, *Guia Orientativo – Hipóteses legais de tratamento de dados pessoais: Legítimo
  Interesse*, fev. 2024: <https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/guia_legitimo_interesse.pdf>.
  Exemplos das câmeras de shopping e do monitoramento de empregados; teste de balanceamento.
- CLT, art. 11 (redação da Lei 13.467/2017). Conferido em fontes secundárias, não no Planalto.
  Por exemplo, o material do TRT-2:
  <https://ww2.trt2.jus.br/fileadmin/ejud/1.eventos/galeria_e_materiais/2019/Ciclo_de_Palestras_Atualizacao_da_Reforma_Trabalhista/20190611_Prescricao_a_nova_sistematica_Antero_Arantes_Martins.pdf>.
- Geolocalização como prova de jornada no TST (notícias, não acórdãos):
  <https://www.conjur.com.br/?p=790745>,
  <https://economicnewsbrasil.com.br/2024/05/17/tst-valida-verificacao-de-horas-extras-por-meio-de-geolocalizacao/>,
  <https://convergenciadigital.com.br/?p=30738>.

**Não consultado e que vale ler na revisão jurídica:** acordo ou convenção coletiva da
categoria (motoboys e restaurantes de São Paulo) e o Guia da ANPD sobre agentes de tratamento e
encarregado.
