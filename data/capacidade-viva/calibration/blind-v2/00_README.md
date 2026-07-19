# Blind-v2 — segundo holdout cego independente

Independente do blind-v1 (excluído por token/case_id — ver TRAINING_EXCLUSION.json).

1. Enviar **somente** `CASOS_CEGOS_CESAR.md` ao César.
2. Não abrir `GABARITO_MOTOR_CONGELADO.json` nem `MANIFESTO_CONGELAMENTO.json` na sessão de avaliação.
3. Após respostas, gravar em `ROTULOS_HUMANOS_CEGOS.json` e rodar:
   `node tools/comparar_blind_v2.js`
4. Não recalibrar antes da comparação. Não criar blind-v3 sem decisão do César.
