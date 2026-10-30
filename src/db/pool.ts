import pg from 'pg';

// bigint (kwoty w groszach) czytamy jako liczbę – kwoty tej firmy są daleko poniżej 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// Daty bez godziny zostają tekstem "RRRR-MM-DD" – bez przesunięć stref czasowych.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export type Db = pg.Pool;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 5 });
}
