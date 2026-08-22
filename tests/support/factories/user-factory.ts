export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}

let sequence = 0;

export function buildRegisterUserInput(
  overrides: Partial<RegisterUserInput> = {}
): RegisterUserInput {
  sequence += 1;
  const password = overrides.password ?? 'RelayTest123!';

  return {
    name: 'Test User ' + sequence,
    email: 'test-user-' + sequence + '@example.com',
    password,
    passwordConfirmation: overrides.passwordConfirmation ?? password,
    ...overrides
  };
}
