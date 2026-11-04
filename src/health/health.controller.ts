import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Controller('health')
export class HealthController {
  constructor(
    @Inject('PG_POOL')
    private readonly pool: Pool,
  ) {}

  @Get('database')
  async checkDatabase() {
    const result = await this.pool.query(
      'SELECT current_database() AS database, current_user AS username',
    );

    return {
      status: 'ok',
      database: result.rows[0].database,
      username: result.rows[0].username,
    };
  }
}