
import { describe, expect, it, jest } from '@jest/globals';
import {
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';

jest.mock('@nestjs/common', () => ({
  JwtService: class JwtService {},
  Injectable: () => (target: Function) => target,
  Inject: () => () => undefined,
  UnauthorizedException: class UnauthorizedException extends Error {},
}));

import { AuthService } from './auth.service';

describe('AuthService', () => {
  const createService = () => {
    const query = jest.fn(
      async (_sql: string, _values?: unknown[]) => ({
        rows: [] as any[],
      }),
    );

    const signAsync = jest.fn(
      async (_payload: object) => 'mock-jwt-token',
    );

    const pool = { query } as unknown as Pool;
    const jwtService = { signAsync } as unknown as JwtService;

    return {
      service: new AuthService(pool, jwtService),
      query,
      signAsync,
    };
  };

  it('should authenticate a user and return an access token', async () => {
    const { service, query, signAsync } = createService();

    const user = {
      id: 'user-123',
      email: 'ada@example.com',
      full_name: 'Ada',
    };

    query.mockResolvedValueOnce({
      rows: [user],
    });

    const result = await service.login({
      email: 'ada@example.com',
      password: 'Password123!',
    });

    expect(result).toEqual({
      message: 'Login successful',
      access_token: 'mock-jwt-token',
      token_type: 'Bearer',
      user,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(signAsync).toHaveBeenCalledWith({
      sub: 'user-123',
      email: 'ada@example.com',
    });

    expect(result.user).not.toHaveProperty('password_hash');
  });

  it('should reject invalid login credentials', async () => {
    const { service, query, signAsync } = createService();

    query.mockResolvedValueOnce({
      rows: [],
    });

    await expect(
      service.login({
        email: 'ada@example.com',
        password: 'WrongPassword123!',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(signAsync).not.toHaveBeenCalled();
  });

  it('should return the authenticated user profile', async () => {
    const { service, query } = createService();

    const user = {
      id: 'user-123',
      email: 'ada@example.com',
      full_name: 'Ada',
      created_at: new Date(),
    };

    query.mockResolvedValueOnce({
      rows: [user],
    });

    const result = await service.getProfile('user-123');

    expect(result).toEqual({ user });
    expect(query).toHaveBeenCalledTimes(1);

    const [sql, values] = query.mock.calls[0];

    expect(sql).toContain('WHERE id = $1');
    expect(values).toEqual(['user-123']);
    expect(result.user).not.toHaveProperty('password_hash');
  });

  it('should reject a profile request for a deleted user', async () => {
    const { service, query } = createService();

    query.mockResolvedValueOnce({
      rows: [],
    });

    await expect(
      service.getProfile('deleted-user'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
