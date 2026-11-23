#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/07dae2b9ae99d2ddd9579bdd88d0885c6f28a307e2ae6dc5eb863b08de4765c0/contract';
import startContract from '../../snapshots/07dae2b9ae99d2ddd9579bdd88d0885c6f28a307e2ae6dc5eb863b08de4765c0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5079eb1fea6769f054eb103e48b78d39eab703e25b020b973e09e75b3716b761/contract';
import endContract from '../../snapshots/5079eb1fea6769f054eb103e48b78d39eab703e25b020b973e09e75b3716b761/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Purchase',
        column: col('endedNoticeSentAt', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Purchase',
        column: col('reminderSentAt', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
