import { TestHttpClient } from '../clients/http-client';
import type { AuthResponse } from '../contracts/auth-contract';
import { buildRegisterUserInput, type RegisterUserInput } from '../factories/user-factory';

export interface RegisteredUserFixture {
  client: TestHttpClient;
  input: RegisterUserInput;
  auth: AuthResponse;
}

export async function createRegisteredUser(
  input = buildRegisterUserInput(),
  client = new TestHttpClient()
): Promise<RegisteredUserFixture> {
  const response = await client.request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    json: input
  });

  if (response.status !== 201) {
    throw new Error('Could not create registered user fixture: HTTP ' + response.status);
  }

  return {
    client,
    input,
    auth: response.body
  };
}
