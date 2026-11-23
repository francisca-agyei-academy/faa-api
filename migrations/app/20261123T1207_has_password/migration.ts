#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/07dae2b9ae99d2ddd9579bdd88d0885c6f28a307e2ae6dc5eb863b08de4765c0/contract';
import endContract from '../../snapshots/07dae2b9ae99d2ddd9579bdd88d0885c6f28a307e2ae6dc5eb863b08de4765c0/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/13e6a309f2cdd08a9e75d290ba3f7ee6ba6cf2b9c6aca39d0c984cd4d75366e4/contract';
import startContract from '../../snapshots/13e6a309f2cdd08a9e75d290ba3f7ee6ba6cf2b9c6aca39d0c984cd4d75366e4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('hasPassword', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
