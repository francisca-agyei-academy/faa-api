#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a8685e053b5e7aa14942138d319283f3b85a45a8b41f686823d07b57c56faa3f/contract';
import endContract from '../../snapshots/a8685e053b5e7aa14942138d319283f3b85a45a8b41f686823d07b57c56faa3f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/faa9ff5d85b47ab41cf108f310d46f849c9b4cb7ac19b1d343b2bc05b94584ce/contract';
import startContract from '../../snapshots/faa9ff5d85b47ab41cf108f310d46f849c9b4cb7ac19b1d343b2bc05b94584ce/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Order',
        column: col('courseId', 'character(24)', {
          codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'Order',
        index: 'Order_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Order',
        foreignKey: {
          name: 'Order_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
