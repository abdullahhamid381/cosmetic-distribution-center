const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
const patterns = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064,
  0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00d, 0x10c, 0x04c, 0x01c,
  0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016,
  0x181, 0x0c1, 0x1c0, 0x091, 0x190, 0x0d0, 0x085, 0x184, 0x0c4,
  0x0a8, 0x0a2, 0x08a, 0x02a,
];
const startStop = 0x094;

export function invoiceBarcode(invoiceNumber: string, invoiceId: number) {
  const number = invoiceNumber.toUpperCase();
  const value = number.length > 0 && number.length <= 30 && [...number].every(character => alphabet.includes(character))
    ? number
    : `ID-${invoiceId}`;
  const symbols = [startStop, ...[...value].map(character => patterns[alphabet.indexOf(character)]), startStop];
  const bars = [];
  // Code 39 uses a quiet zone of at least ten narrow modules on both sides.
  let x = 10;
  for (const symbol of symbols) {
    for (let element = 0; element < 9; element++) {
      const width = symbol & (1 << (8 - element)) ? 3 : 1;
      if (element % 2 === 0) bars.push({x,width});
      x += width;
    }
    x += 1;
  }
  const width = x + 9;

  return {value,bars,width};
}
