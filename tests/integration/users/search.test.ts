import { describe, expect, it } from 'vitest';
import { TestHttpClient } from '../../support/clients/http-client';
import type { ApiErrorResponse, PublicUser } from '../../support/contracts/auth-contract';
import { buildRegisterUserInput } from '../../support/factories/user-factory';
import { createRegisteredUser } from '../../support/fixtures/registered-user';

describe('GET /api/users', () => {
  it('searches names and emails case-insensitively, excludes the actor and sorts by name', async () => {
    const actor = await createRegisteredUser(
      buildRegisterUserInput({
        name: 'Relay Owner',
        email: 'owner@relay.test'
      })
    );
    const bob = await createRegisteredUser(
      buildRegisterUserInput({
        name: 'Bob Relay',
        email: 'bob@example.com'
      })
    );
    const alice = await createRegisteredUser(
      buildRegisterUserInput({
        name: 'Alice Other',
        email: 'alice@relay.test'
      })
    );
    await createRegisteredUser(
      buildRegisterUserInput({
        name: 'Charlie Other',
        email: 'charlie@example.com'
      })
    );

    const response = await actor.client.request<PublicUser[]>(
      '/api/users?' + new URLSearchParams({ query: '  RELAY  ' }),
      { accessToken: actor.auth.accessToken }
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([alice.auth.user, bob.auth.user]);
    expect(response.body).not.toContainEqual(actor.auth.user);
    expect(response.body.every(user => !('passwordHash' in user))).toBe(true);
  });

  it('applies the requested result limit after sorting', async () => {
    const actor = await createRegisteredUser();
    const charlie = await createRegisteredUser(buildRegisterUserInput({ name: 'Charlie Search' }));
    const alice = await createRegisteredUser(buildRegisterUserInput({ name: 'Alice Search' }));
    const bob = await createRegisteredUser(buildRegisterUserInput({ name: 'Bob Search' }));

    const response = await actor.client.request<PublicUser[]>(
      '/api/users?' + new URLSearchParams({ limit: '2' }),
      { accessToken: actor.auth.accessToken }
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([alice.auth.user, bob.auth.user]);
    expect(response.body).not.toContainEqual(charlie.auth.user);
  });

  it('treats SQL wildcard characters as literal search text', async () => {
    const actor = await createRegisteredUser();
    const literalMatch = await createRegisteredUser(
      buildRegisterUserInput({ name: 'Percent%User' })
    );
    await createRegisteredUser(buildRegisterUserInput({ name: 'PercentXUser' }));

    const response = await actor.client.request<PublicUser[]>(
      '/api/users?' + new URLSearchParams({ query: '%' }),
      { accessToken: actor.auth.accessToken }
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([literalMatch.auth.user]);
  });

  it.each([
    {
      name: 'a non-positive limit',
      query: new URLSearchParams({ limit: '0' }),
      field: 'query.limit'
    },
    {
      name: 'a limit above 50',
      query: new URLSearchParams({ limit: '51' }),
      field: 'query.limit'
    },
    {
      name: 'a query longer than 190 characters',
      query: new URLSearchParams({ query: 'a'.repeat(191) }),
      field: 'query.query'
    }
  ])('rejects $name', async ({ query, field }) => {
    const actor = await createRegisteredUser();
    const response = await actor.client.request<ApiErrorResponse>('/api/users?' + query, {
      accessToken: actor.auth.accessToken
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })])
    );
  });

  it('pages through the directory with limit and offset without gaps', async () => {
    const actor = await createRegisteredUser(buildRegisterUserInput({ name: 'Directory Actor' }));

    for (let index = 0; index < 7; index += 1) {
      await createRegisteredUser(
        buildRegisterUserInput({ name: `Directory Member ${String(index + 1).padStart(2, '0')}` })
      );
    }

    const firstPage = await actor.client.request<PublicUser[]>(
      '/api/users?query=Directory+Member&limit=3&offset=0',
      { accessToken: actor.auth.accessToken }
    );
    const secondPage = await actor.client.request<PublicUser[]>(
      '/api/users?query=Directory+Member&limit=3&offset=3',
      { accessToken: actor.auth.accessToken }
    );
    const thirdPage = await actor.client.request<PublicUser[]>(
      '/api/users?query=Directory+Member&limit=3&offset=6',
      { accessToken: actor.auth.accessToken }
    );

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.map(user => user.name)).toEqual([
      'Directory Member 01',
      'Directory Member 02',
      'Directory Member 03'
    ]);
    expect(secondPage.body.map(user => user.name)).toEqual([
      'Directory Member 04',
      'Directory Member 05',
      'Directory Member 06'
    ]);
    expect(thirdPage.body.map(user => user.name)).toEqual(['Directory Member 07']);
  });

  it('requires authentication', async () => {
    const response = await new TestHttpClient().request<ApiErrorResponse>('/api/users');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
