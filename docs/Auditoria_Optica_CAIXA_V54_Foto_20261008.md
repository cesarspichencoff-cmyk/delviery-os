# Auditoria óptica da amostra física — CAIXA (V5.4, 08/10/2026)

**Origem:** fotografia da folha de teste fornecida diretamente pelo responsável na conversa. A imagem original NÃO foi publicada no GitHub por conter ambiente e pessoa. Referência ao evento já arquivado: job 233, Windows Event 307, SHA-256 `8f6b02ea56f2daf6261fa6a5ce45d533ea68fa3e83d4344ad4fd860254dc1249`, impressora CAIXA, TM-T20X.

## Inspeção efetiva (somente o que a foto sustenta)

- **Papel efetivamente visível:** SIM — título `CALIBRACAO EPSON 80MM / TESTE - NAO E PEDIDO`, dois produtos de ensaio, observação, linha de acentos, contraste de FONT A/B e `999` final à direita. O papel e o conteúdo conferem visualmente com a folha cujo job 233 foi registrado.
- **Nomes sem truncamento aparente:** SIM — `3 HOT ROLL TATA` e `12 URAMAKI EBITEN` inteiros.
- **Leitura da sequência:** `999` grande, no canto direito, reconhecível.
- **Acentuação:** aparecem caracteres esperados na linha `AÇÃO PÃO É Ç SHISÔ`; a foto não substitui exame do papel para eventual falha de ponto isolado.
- **Áreas de contraste visual:** tinta percebida como cinza e relativamente fina; a foto está em iluminação escura/irregular, com papel curvado, sombras e perspectiva. **Não é prova de densidade térmica insuficiente, cabeça suja ou papel inadequado.**
- **Proporção dos títulos:** quantidade e nomes com altura dupla e largura nativa A, exibindo letras muito altas/estreitas. O espaço horizontal sobrando permite explorar amplitude dupla SOMENTE em linhas curtas, sem truncar.
- **Fonte B:** visivelmente menor e mais delicada na linha longa de demonstração; em iluminação escura deve ser exceção operacional e ter teste de leitura presencial.
- **Observações:** legíveis na foto, mas pouco destacadas para situações urgentes (SEM, ALERGIA etc.); a variação negrito/normal merece teste lado a lado antes de mudar regra.
- **Margens:** texto parece dentro da área útil, sem conteúdo cortado à esquerda ou à direita. Dobra, curvatura e enquadramento impedem medir margem em milímetros.
- **Área em branco abaixo do `999`:** existe na foto, mas não há medição que atribua o comprimento ao driver/comandos, avanço físico manual ou papel puxado/cortado depois. Não alterar alimentação por inferência.
- **Teste da luz ambiente:** fotografia mostra fundo escuro, mas não há medida de iluminância nem leitura confirmada por cada operador. Qualidade por setor permanece UNKNOWN.

## Decisão de design

O resultado é uma primeira prova física útil da fonte Epson e da codificação, **não aceitação 10/10**. Para qualidade master, priorizar reconhecimento instantâneo do produto e de observações críticas, contraste de traços, ausência de truncamento e legibilidade na luz da operação.

### Proposta reversível V5.4 — SEM IMPRESSÃO

Arquivo `tools/gerar_comparativo_legibilidade_caixa_v54.js`:
- mesmo nome/quantidade com **A: altura dupla/largura normal**, para referência da foto atual;
- **B: altura e largura duplas** apenas nos dois títulos curtos `3 HOT ROLL TATA` e `12 URAMAKI EBITEN` (cabem em 576 dots nominais), para comparação de proporção e impacto visual;
- observação `OBS: SEM PIMENTA E SEM SAL` em negrito e normal, lado a lado em sequência;
- linha de acentos e FONT B longa para inspecionar sob iluminação do caixa;
- texto claro `TESTE B - NAO E PEDIDO` e sequência `998` para distinguir a amostra da anterior, `999`;
- **sem corte, gaveta, spooler, mudança de densidade ou alteração da aplicação ativa**.

O gerador só cria `.escpos`, `.txt`, `.svg` geométrico e manifesto em diretório temporário. O SVG não é bitmap fiel da Epson e não aprova qualidade física.

**A impressão do comparativo não está autorizada automaticamente.** A determinação anterior foi evitar uma segunda impressão sem aprovação. Se César permitir outra amostra, executar um único teste reversível EXCLUSIVAMENTE na fila `CAIXA`, com bytes auditados, SHA e prova do Windows; jamais em Cozinha, Sushi, Delivery ou Bar.

## Limites de prova

- RAW_WINPRINT_JOB_233: PROVEN em evento Windows.
- PHYSICAL_SHEET_IN_USER_PHOTO: PROVEN_VISUAL_SAMPLE_NARROW.
- CONTENT_VISIBLE_AND_NO_OBVIOUS_OVERFLOW: OBSERVADO.
- ACCENT_PHYSICAL_PIXEL_ACCURACY: PARCIAL/SEM MICROSCOPIA.
- PRINT_DENSITY_OPTIMAL: UNKNOWN.
- PRINTHEAD/PAPER_CAUSE: UNKNOWN.
- FONTE_A_B_LOWER_LIGHT_HUMAN_ACCEPTANCE: UNKNOWN.
- ALL_SECTORS_PROVEN: NÃO.
- DEPLOYED/ACTIVATED/PRODUCTION_CHANGED: NÃO.

**Próximo passo:** validar digitalmente o comparativo, registrar QA e pedir autorização expressa para imprimir apenas a nova folha comparativa na CAIXA; só após foto comparar. Não alterar driver/densidade nem imprimir em outras filas.
