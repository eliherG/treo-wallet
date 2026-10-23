/** DOF Circular 12/2018: weight sequence 3,7,1 on first 17 digits. */
export function isValidClabe(value: string): boolean {
  if (!/^[0-9]{18}$/.test(value)) return false;
  let sum = 0;
  const weights = [3, 7, 1] as const;
  for (let index = 0; index < 17; index++) {
    sum += ((value.charCodeAt(index) - 48) * weights[index % 3]!) % 10;
  }
  return value[17] === String((10 - sum % 10) % 10);
}
