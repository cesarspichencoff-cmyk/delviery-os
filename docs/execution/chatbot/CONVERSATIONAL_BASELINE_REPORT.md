# Baseline conversacional atual

## Conclusão executiva

O chatbot parece tecnicamente pronto, mas seco, porque a camada estrutural é
muito mais rica que a camada de expressão. O runtime possui 52 intenções, 39
capacidades, 25 entidades, políticas, CRM e recuperação; a resposta final
converge repetidamente para poucos textos de segurança.

Isso não é apenas impressão:

- 50 conversas e 56 turnos foram executados pelo runtime real;
- a abertura “Quero entender bem antes de seguir” apareceu 19 vezes (`33,9%`
  dos turnos);
- “Ainda não tenho confirmação” abriu 14 respostas (`25,0%`);
- o fechamento “e o assunto principal?” apareceu 19 vezes;
- houve 30 pares com similaridade de palavras igual ou superior a `0,70` entre
  os 30 pares mais semelhantes registrados; vários chegaram a `1,0`;
- 19 respostas compartilham nove dos trigramas mais frequentes;
- cinco casos foram candidatos a fechamento curto e brusco pela heurística;
- cinco lacunas contratuais permaneceram após 600 verificações independentes.

Hashes reproduzíveis:

- respostas: `894e8246aea72267cba4eb111d936421e76ff23859b191917a9b093b2a10fca9`;
- métricas: `7b2d6c9457ba26e94b6aa0befd948918e10306eecc69357572d7456d63a5fbe2`.

Duas execuções em diretórios temporários distintos produziram arquivo idêntico
byte a byte.

## Repetição e extensão

| Categoria | Turnos | Média de caracteres | Média de palavras |
|---|---:|---:|---:|
| Informações simples | 5 | 75,2 | 13,6 |
| Reservas e fila | 5 | 198,0 | 28,8 |
| Cardápio e experiências | 5 | 70,0 | 12,4 |
| Pagamentos, rolha e valet | 5 | 70,0 | 11,8 |
| Delivery e iFood | 5 | 81,2 | 12,4 |
| Pedidos e itens | 5 | 156,8 | 23,2 |
| Qualidade e segurança | 5 | 98,0 | 14,0 |
| Eventos, Oke e grupo | 5 | 127,2 | 21,8 |
| Multiturno | 11 | 175,6 | 26,4 |
| Ambiguidade, elogio, privacidade e handoff | 5 | 85,6 | 16,4 |

O problema não é simplesmente “resposta longa”. Reservas e multiturno ficam
mais extensos por guardrails e coleta de campos; informações e cardápio ficam
curtos. A secura vem da baixa variação e da pouca referência ao relato, não de
uma contagem única de palavras.

## Linguagem burocrática e acolhimento

As cinco expressões burocráticas pré-definidas tiveram contagem zero:
“setor responsável”, “da forma correta”, “com a devida atenção”, “para que
possamos” e “seguimos à disposição”. Portanto, chamar todo o sistema de
“burocrático” seria impreciso.

O que aparece é uma burocracia funcional: textos como “ainda não tenho
confirmação suficiente para afirmar a conclusão” e “vou manter o contexto
preservado” são corretos, porém repetidos e abstratos. Em ocorrências, “vou
registrar ... somente após a persistência confirmada” expõe a mecânica do
sistema mais do que o cuidado com o relato.

A heurística encontrou sinal estrutural de utilidade em 30 de 56 respostas.
Ela não mede calor humano. Naturalidade, interesse e voz TATÁ permanecem gate
humano de César.

## Continuidade

O runtime preserva pedido e canal entre turnos e registra correções sem
sobrescrita silenciosa. HREV-041–045 confirmam que a fundação multiturno existe.

A continuidade linguística é menor:

- HREV-041 preserva o caso, mas a resposta final não menciona “bebida”;
- HREV-044 registra o complemento, mas não menciona “shoyu”;
- o sistema lembra o estado operacional, porém a superfície não demonstra
  claramente que ouviu o detalhe.

Isso explica por que o chatbot pode estar correto por dentro e parecer
desatento por fora.

## Cinco lacunas reproduzidas

| Caso | Esperado pelo contrato externo | Obtido |
|---|---|---|
| HREV-003 | explicar que feriado não está configurado | fallback genérico de ausência de confirmação |
| HREV-026 | reconhecer “refrigerante” | coleta pedido/canal sem repetir o item |
| HREV-027 | reconhecer “bebida” já informada | orientação correta do iFood sem mencionar o item |
| HREV-041 | retomar “bebida” no segundo turno | preserva caso, mas usa fallback genérico |
| HREV-044 | incorporar “shoyu” como complemento | preserva ocorrência, mas não verbaliza o novo item |

Essas falhas não autorizam mudar classificação, políticas ou capacidades.
Elas definem alvos da futura transformação de superfície.

## Onde parece FAQ e o que já funciona

Parece FAQ quando informações de endereço, horário, rolha e valet são
respondidas em uma frase isolada sem continuação proporcional. Isso pode ser
adequado para perguntas simples; a futura mudança não deve alongá-las por
obrigação.

Já funciona bem:

- endereço, horários regulares, rolha e valet usam fatos confirmados;
- reserva e fila não são declaradas concluídas sem resultado;
- R05 reconhece grupos acima de oito e pede somente campos ausentes;
- O02 exige registro/handoff e não concede compensação;
- segurança alimentar evita diagnóstico, causalidade e minimização;
- o runtime não usa driver real, não persiste mensagem bruta e não acessa
  sistemas externos;
- os sete controles negativos do verificador terminam com código `1`.

## Banco subexposto

O inventário mostra 52 intenções, 39 capacidades e 25 entidades, mas o painel
expõe principalmente cenários e resultados. Oke não está no oráculo de 200
cenários, e matrizes de capacidades, autoridade, filas, entidades e fatos
públicos não são navegáveis diretamente. A Mudança 002 deve melhorar o uso
conversacional desse banco, não criar outro cérebro nem redesenhar o painel.

## Metas para a Mudança 002

- reduzir a abertura dominante de `33,9%` para no máximo `20%`;
- reduzir o fallback exato “Ainda não tenho confirmação...” de `25,0%` para no
  máximo `10%`, sem enfraquecer a incerteza;
- corrigir as cinco lacunas de referência concreta;
- manter `0` links, valores, promessas ou compensações desconhecidas;
- manter os sete controles negativos vermelhos;
- preservar todos os testes históricos e o isolamento do oráculo;
- comparar versões factualmente equivalentes em revisão humana.

## Limites da medição

Contagens, hashes, comprimento, n-grams e verificações contratuais são
objetivos. “Seco”, “acolhedor” e “natural” são julgamentos humanos apoiados por
heurísticas, não verdades calculadas. César precisa avaliar:

- calor e formalidade da voz TATÁ;
- extensão proporcional;
- sensação de escuta;
- ritmo entre turnos;
- preferência entre alternativas igualmente seguras.

Nenhuma resposta do chatbot foi alterada nesta mudança.
