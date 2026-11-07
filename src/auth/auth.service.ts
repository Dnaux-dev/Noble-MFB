import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import type { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject('PG_POOL')
    private readonly pool: Pool,

    @Inject('JWT_SERVICE')
    private readonly jwtService: JwtService,
  ) { }

  async login(dto: LoginDto) {
    const result = await this.pool.query(
      `
      SELECT
        id,
        email,
        full_name
      FROM users
      WHERE LOWER(email) = LOWER(TRIM($1))
        AND password_hash = crypt($2, password_hash)
      `,
      [dto.email, dto.password],
    );

    const user = result.rows[0];

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const payload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      message: 'Login successful',
      access_token: accessToken,
      token_type: 'Bearer',
      user,
    };
  }

  async getProfile(userId: string) {
    const result = await this.pool.query(
      `
    SELECT
      id,
      email,
      full_name,
      created_at
    FROM users
    WHERE id = $1
    `,
      [userId],
    );

    const user = result.rows[0];

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    return {
      user,
    };
  }
}
