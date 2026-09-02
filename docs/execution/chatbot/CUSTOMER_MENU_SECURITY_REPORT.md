# Relatório de segurança Customer + Menu

## Privacidade

- nenhum arquivo de cliente real foi importado;
- fixtures, IDs, telefones e e-mails de teste são sintéticos;
- telefone/e-mail são tokenizados antes da identidade persistível;
- auditoria redige chaves e valores com aparência de PII;
- o painel não exibe identidade bruta;
- o DOCX original permanece fora do Git.

## Autoridade

- modelo local não acessa SQL;
- fato novo vira candidato;
- merge e importação exigem revisão humana;
- consentimento não é inferido;
- Writer não altera candidatos;
- alergênicos desconhecidos fecham a recomendação.

## Rede e custo

O painel usa CSP `connect-src 'self'`, bind local e dados sintéticos. Não há
WhatsApp, iFood, Neemo ou Tagme autenticado, API paga, trial ou forma de
pagamento. `FINANCIAL_MODE=ZERO_EXTERNAL_COST` e custo máximo R$ 0,00
permanecem válidos.
