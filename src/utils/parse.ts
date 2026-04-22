/** Parse a finite number in `[min, max]`. Returns undefined when input is empty. */
export function parseNumber(
  raw: string | undefined,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(
      `${label} must be a number in [${min}, ${max}], got: ${raw}`,
    );
  }
  return n;
}

/** Parse an integer in `[min, max]`. Returns undefined when input is empty. */
export function parseInteger(
  raw: string | undefined,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(
      `${label} must be an integer in [${min}, ${max}], got: ${raw}`,
    );
  }
  return n;
}

/** Parse an integer restricted to a fixed set. Returns undefined when input is empty. */
export function parseEnumInt(
  raw: string | undefined,
  label: string,
  allowed: readonly number[],
): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || !allowed.includes(n)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}, got: ${raw}`);
  }
  return n;
}
