
import { Global, Module } from '@nestjs/common';
import { pool } from './database';

@Global()
@Module({
  providers: [
    {
      provide: 'PG_POOL',
      useValue: pool,
    },
  ],
  exports: ['PG_POOL'],
})
export class DatabaseModule {}
