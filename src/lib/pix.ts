/**
 * Gera o payload para um QR Code PIX estático.
 * Segue o padrão EMV® QRCPS-MPM (BR Code).
 * @see https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf
 */

/**
 * Calcula o CRC16-CCITT para o payload PIX.
 * @param data O payload a ser calculado.
 * @returns A string do checksum CRC16 com 4 caracteres.
 */
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ('0000' + (crc & 0xffff).toString(16).toUpperCase()).slice(-4);
}

/**
 * Formata um campo do payload PIX (ID, Tamanho, Valor).
 * @param id O ID do campo.
 * @param value O valor do campo.
 * @returns A string formatada.
 */
const formatValue = (id: string, value: string): string => {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
};

const onlyDigits = (value: string): string => {
  return (value || '').replace(/\D/g, '');
};

export const isValidPixKey = (key: string): boolean => {
  const raw = (key || '').trim();
  if (!raw) return false;

  const lower = raw.toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return true;

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
  ) {
    return true;
  }

  const digits = onlyDigits(raw);
  if (digits.length === 11 || digits.length === 14) return true;

  if (raw.startsWith('+')) {
    const phoneDigits = onlyDigits(raw.slice(1));
    return phoneDigits.length >= 10 && phoneDigits.length <= 15;
  }

  if (digits.length === 10 || digits.length === 11) return true;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return true;

  return false;
};

const normalizePixKeyForPayload = (key: string): string => {
  const raw = (key || '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return lower;

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
  ) {
    return raw.toLowerCase();
  }

  const digits = onlyDigits(raw);
  if (digits.length === 11 || digits.length === 14) return digits;

  if (raw.startsWith('+')) {
    const phoneDigits = onlyDigits(raw.slice(1));
    return phoneDigits ? `+${phoneDigits}` : '';
  }

  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return `+${digits}`;

  return raw;
};

/**
 * Gera a string completa do payload PIX "Copia e Cola".
 * @param key Chave PIX (CPF, CNPJ, Email, Telefone ou Chave Aleatória).
 * @param merchantName Nome do recebedor (loja).
 * @param merchantCity Cidade do recebedor.
 * @param txid ID da transação (deve ser único, alfanumérico).
 * @param amount Valor da transação.
 * @returns O payload PIX completo.
 */
export const generatePixPayload = (
  key: string,
  merchantName: string,
  merchantCity: string,
  txid: string,
  amount: number
): string => {
  const safeAmount = Number(amount);
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) return '';

  const normalizedKey = normalizePixKeyForPayload(key);
  if (!normalizedKey || !isValidPixKey(normalizedKey)) return '';

  // Normaliza e trunca os campos para estarem de acordo com as regras do PIX.
  const normalizedMerchantName = merchantName
    .substring(0, 25)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const normalizedMerchantCity = merchantCity
    .substring(0, 15)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (!normalizedMerchantName || !normalizedMerchantCity) return '';

  const normalizedTxid = txid.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || '***';

  const payload = [
    formatValue('00', '01'), // Payload Format Indicator
    formatValue(
      '26', // Merchant Account Information
      formatValue('00', 'br.gov.bcb.pix') + formatValue('01', normalizedKey)
    ),
    formatValue('52', '0000'), // Merchant Category Code
    formatValue('53', '986'), // Transaction Currency (BRL)
    formatValue('54', safeAmount.toFixed(2)), // Transaction Amount
    formatValue('58', 'BR'), // Country Code
    formatValue('59', normalizedMerchantName), // Merchant Name
    formatValue('60', normalizedMerchantCity), // Merchant City
    formatValue('62', formatValue('05', normalizedTxid)), // Additional Data Field (txid)
  ].join('');

  const payloadWithCrcPrefix = `${payload}6304`;
  const crc = crc16(payloadWithCrcPrefix);

  return `${payloadWithCrcPrefix}${crc}`;
};
