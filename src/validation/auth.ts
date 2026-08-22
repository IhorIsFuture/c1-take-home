import { z } from 'zod';
import { requiredStringSchema } from './common';

const emailSchema = z
  .string({ error: 'Must be a string' })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Must be a valid email address' })
      .max(190, 'Must contain at most 190 characters')
  );

const passwordSchema = z
  .string({ error: 'Must be a string' })
  .min(8, 'Must contain at least 8 characters')
  .refine(password => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'Must contain at most 72 bytes'
  });

const loginPasswordSchema = z
  .string({ error: 'Must be a string' })
  .min(1, 'Must not be empty')
  .refine(password => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'Must contain at most 72 bytes'
  });

export const registerRequestSchema = z
  .object({
    body: z.object({
      name: requiredStringSchema(100),
      email: emailSchema,
      password: passwordSchema,
      passwordConfirmation: z.string({ error: 'Must be a string' })
    })
  })
  .refine(({ body }) => body.password === body.passwordConfirmation, {
    path: ['body', 'passwordConfirmation'],
    message: 'Passwords must match'
  });

export type RegisterRequest = z.output<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: loginPasswordSchema
  })
});

export type LoginRequest = z.output<typeof loginRequestSchema>;
