#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/de83de302c4a83caedf5bcc34f823c385fbe8ce3fd8771d385bfc1a7a94f20e8/contract';
import endContract from '../../snapshots/de83de302c4a83caedf5bcc34f823c385fbe8ce3fd8771d385bfc1a7a94f20e8/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f20ec9d4399cd7923778fe03f78b71bbdee74d7248ae602074d68722e4a631fa/contract';
import startContract from '../../snapshots/f20ec9d4399cd7923778fe03f78b71bbdee74d7248ae602074d68722e4a631fa/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'LessonProgress',
        columns: [
          col('completedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('lessonId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
          col('userId', 'character(24)', {
            notNull: true,
            codecRef: { codecId: 'sql/char@1', typeParams: { length: 24 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'LessonProgress',
        constraint: 'LessonProgress_userId_lessonId_key',
        columns: ['userId', 'lessonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LessonProgress',
        index: 'LessonProgress_lessonId_idx_e358970d',
        columns: ['lessonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LessonProgress',
        index: 'LessonProgress_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'LessonProgress',
        foreignKey: {
          name: 'LessonProgress_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'LessonProgress',
        foreignKey: {
          name: 'LessonProgress_lessonId_fkey',
          columns: ['lessonId'],
          references: { schema: 'public', table: 'Lesson', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.enableRowLevelSecurity({ schema: 'public', table: 'LessonProgress' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
