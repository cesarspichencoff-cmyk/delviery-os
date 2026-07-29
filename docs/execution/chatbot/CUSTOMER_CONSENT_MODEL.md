# Modelo de consentimento

Consentimento é histórico próprio, separado de cadastro, pedido e atendimento.

Campos: finalidade, canal, estado, fonte, evidência, data, expiração e
responsável. Estados:

`unknown`, `allowed`, `blocked`, `withdrawn`, `expired`.

Regras:

- pedido ou reserva não significa marketing permitido;
- dado importado não autoriza contato;
- `blocked` e `withdrawn` prevalecem até nova autorização explícita;
- atendimento operacional continua possível sem marketing;
- contato iniciado pela empresa permanece bloqueado no modo custo zero;
- exportação, anonimização e exclusão futuras devem gerar auditoria.

Campanhas e WhatsApp real permanecem desligados.
