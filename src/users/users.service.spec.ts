
import { describe, expect, it, jest } from '@jest/globals';
import { Pool } from 'pg';
import { ConflictException } from '@nestjs/common';

jest.mock('@nestjs/common', () => ({
  ConflictException: class ConflictException extends Error {},
  Inject: () => () => undefined,
  Injectable: () => (target: Function) => target,
}));

import { UsersService } from './users.service';

describe('UsersService', () => {
  const createService = () => {
    const query = jest.fn(
      async (_sql: string, _values?: unknown[]) => ({ rows: [] as any[] }),
    );

    const pool = { query } as unknown as Pool;

    return {
      service: new UsersService(pool),
      query,
    };
  };

  it('should create a user and return public details only', async () => {
    const { service, query } = createService();

    const user = {
      id: 'user-123',
      email: 'newmember@example.com',
      full_name: 'New Member',
      created_at: new Date(),
    };

    query.mockResolvedValueOnce({
      rows: [user],
    });

    const result = await service.create({
      email: 'NewMember@Example.com',
      full_name: 'New Member',
      password: 'SecurePass123!',
    });

    expect(result).toEqual({
      message: 'User account created successfully',
      user,
    });

    expect(query).toHaveBeenCalledTimes(1);

    const [sql, values] = query.mock.calls[0];

    expect(sql).toContain('crypt($3, gen_salt');
    expect(values).toEqual([
      'NewMember@Example.com',
      'New Member',
      'SecurePass123!',
    ]);

    expect(result.user).not.toHaveProperty('password_hash');
  });

  it('should reject duplicate email addresses', async () => {
    const { service, query } = createService();

    query.mockRejectedValueOnce({
      code: '23505',
    });

    await expect(
      service.create({
        email: 'newmember@example.com',
        full_name: 'Another Member',
        password: 'AnotherPass123!',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should rethrow unexpected database errors', async () => {
    const { service, query } = createService();

    query.mockRejectedValueOnce(
      new Error('Database connection failed'),
    );

    await expect(
      service.create({
        email: 'another@example.com',
        full_name: 'Another Member',
        password: 'AnotherPass123!',
      }),
    ).rejects.toThrow('Database connection failed');
  });
});
