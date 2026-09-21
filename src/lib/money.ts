/** Parse user-entered GBP directly into integer pence. No float conversion. */
export function parsePounds(value: string): bigint {
  const clean = value.trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(clean)) throw new Error('Enter a non-negative GBP amount with at most two decimal places (no commas).');
  const [whole, fraction = ''] = clean.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function poundsInput(pence: bigint): string {
  const absolute = pence < 0n ? -pence : pence;
  return `${pence < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
export function formatGBP(pence: bigint): string {
  const absolute = pence < 0n ? -pence : pence;
  return `${pence < 0n ? '−' : ''}£${(absolute / 100n).toLocaleString('en-GB')}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
