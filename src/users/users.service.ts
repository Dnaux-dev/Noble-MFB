
import {
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Pool } from 'pg';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  async create(dto: CreateUserDto) {
    try {
      const result = await this.pool.query(
        `
        INSERT INTO users (email, full_name, password_hash)
        VALUES (
          LOWER(TRIM($1)),
          TRIM($2),
          crypt($3, gen_salt('bf'))
        )
        RETURNING id, email, full_name, created_at
        `,
        [dto.email, dto.full_name, dto.password],
      );

      return {
        message: 'User account created successfully',
        user: result.rows[0],
      };
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }

      throw error;
    }
  }
}
