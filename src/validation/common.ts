import { z } from 'zod';

const positiveIntegerMessage = 'Must be a positive integer';

export const positiveIntegerSchema = z
  .union(
    [
      z.number({ error: positiveIntegerMessage }),
      z
        .string({ error: positiveIntegerMessage })
        .trim()
        .regex(/^[1-9]\d*$/, positiveIntegerMessage)
    ],
    { error: positiveIntegerMessage }
  )
  .transform(value => Number(value))
  .pipe(
    z
      .number()
      .int(positiveIntegerMessage)
      .positive(positiveIntegerMessage)
      .max(4294967295, positiveIntegerMessage)
  );

export function requiredStringSchema(maxLength: number) {
  return z
    .string({ error: 'Must be a string' })
    .trim()
    .min(1, 'Must not be empty')
    .max(maxLength, `Must contain at most ${maxLength} characters`);
}
