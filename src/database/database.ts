import {Pool, types} from 'pg';

types.setTypeParser(1082, (value) => value);

export const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'ajilore',
    database: 'noble',
    password: process.env.DB_PASSWORD,
});

pool.on('connect', () => {
    console.log('Connected to the database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
})