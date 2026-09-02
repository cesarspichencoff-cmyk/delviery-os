'use strict';

function detectSensitiveInput(message) {
  const text = String(message ?? '');
  const compactDigits = text.replace(/\D/g, '');
  const detected = [];
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) detected.push('email');
  if (compactDigits.length >= 10 && compactDigits.length <= 13) detected.push('phone_or_document');
  if (/\b(rua|avenida|alameda|travessa|cep)\b/i.test(text)) detected.push('address');
  if (/\b(cpf|documento|cookie|token|senha)\b/i.test(text)) detected.push('sensitive_field');
  return Object.freeze({ detected: detected.length > 0, detected_types: [...new Set(detected)] });
}

function sanitizeMessageForClassification(message) {
  return String(message ?? '')
    .slice(0, 2000)
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, ' dado_email ')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, ' dado_numerico ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

module.exports = { detectSensitiveInput, sanitizeMessageForClassification };


