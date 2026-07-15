function crc16ccitt(payload: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc = crc << 1;
      }
    }
  }

  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function formatField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

export function generatePixPayload(
  pixKey: string,
  merchantName: string,
  merchantCity: string,
  amount: number,
  txId: string = '***'
): string {
  
  const formattedAmount = amount.toFixed(2);
  
  const payloadFormat = formatField('00', '01');
  
  const gui = formatField('00', 'br.gov.bcb.pix');
  const key = formatField('01', pixKey);
  const merchantAccount = formatField('26', `${gui}${key}`);
  const mcc = formatField('52', '0000');
  const currency = formatField('53', '986');
  const transactionAmount = formatField('54', formattedAmount);
  const countryCode = formatField('58', 'BR');
  const name = formatField('59', merchantName);  
  const city = formatField('60', merchantCity);
  const referenceLabel = formatField('05', txId);
  const additionalData = formatField('62', referenceLabel);

  let payload = `${payloadFormat}${merchantAccount}${mcc}${currency}${transactionAmount}${countryCode}${name}${city}${additionalData}6304`;
  
  const crc = crc16ccitt(payload);
  
  return `${payload}${crc}`;
}