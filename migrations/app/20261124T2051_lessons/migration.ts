#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5079eb1fea6769f054eb103e48b78d39eab703e25b020b973e09e75b3716b761/contract';
import startContract from '../../snapshots/5079eb1fea6769f054eb103e48b78d39eab703e25b020b973e09e75b3716b761/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f20ec9d4399cd7923778fe03f78b71bbdee74d7248ae602074d68722e4a631fa/contract';
import endContract from '../../snapshots/f20ec9d4399cd7923778fe03f78b71bbdee74d7248ae602074d68722e4a631fa/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Lesson',
        columns: [
          col('body', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('id', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('moduleId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('order', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Lesson',
        constraint: 'Lesson_moduleId_order_key',
        columns: ['moduleId', 'order'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Lesson',
        index: 'Lesson_moduleId_idx_04fe188b',
        columns: ['moduleId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Lesson',
        foreignKey: {
          name: 'Lesson_moduleId_fkey',
          columns: ['moduleId'],
          references: { schema: 'public', table: 'Module', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'Lesson' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
