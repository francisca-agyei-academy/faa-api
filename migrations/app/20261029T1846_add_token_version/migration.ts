#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b5c6cc21347fc8aec47b1e6a506b13345fac97b3a4135a59a5e1ad51687d98a5/contract';
import startContract from '../../snapshots/b5c6cc21347fc8aec47b1e6a506b13345fac97b3a4135a59a5e1ad51687d98a5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d28be38f9aeaba93ea787a2c2d83b93baeb62593446e065560a35da0418fed39/contract';
import endContract from '../../snapshots/d28be38f9aeaba93ea787a2c2d83b93baeb62593446e065560a35da0418fed39/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('tokenVersion', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
