import { pool } from './database';
import { afterAll, describe, expect, it } from '@jest/globals';

describe('Database connection', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('should connect to the noble database', async () => {
    const result = await pool.query(
      'SELECT current_database() AS database, current_user AS username'
    );

    expect(result.rows[0]).toEqual({
      database: 'noble',
      username: 'ajilore',
    });
  });
});