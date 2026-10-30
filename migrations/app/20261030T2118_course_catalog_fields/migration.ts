#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/51b30226b252a492c1f60f8116e9ba3cb5038fbcb23c29a726e24536fdc683e2/contract';
import startContract from '../../snapshots/51b30226b252a492c1f60f8116e9ba3cb5038fbcb23c29a726e24536fdc683e2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d8671939913d3883b7cb407c36d0e45d28648a5519cf8122d437d7c4c382d083/contract';
import endContract from '../../snapshots/d8671939913d3883b7cb407c36d0e45d28648a5519cf8122d437d7c4c382d083/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('audience', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('enrollmentOpen', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('imageKey', 'text', {
          notNull: true,
          default: lit('graduate'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('includesSignatureBonus', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('includesToolkit', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('isFeatured', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('outcomeFrom', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('outcomeTo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('sortOrder', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('topics', 'text[]', {
          notNull: true,
          default: fn(sql`'{}'::text[]`),
          codecRef: { codecId: 'pg/text@1', many: true },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('track', 'text', {
          notNull: true,
          default: lit(''),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Module',
        column: col('topics', 'text[]', {
          notNull: true,
          default: fn(sql`'{}'::text[]`),
          codecRef: { codecId: 'pg/text@1', many: true },
        }),
      }),
      this.dropNotNull({ schema: 'public', table: 'Module', column: 'accessDays' }),
      this.dropNotNull({ schema: 'public', table: 'Module', column: 'price' }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Course',
        constraint: 'Course_topics_elem_not_null_1acb8bbc',
        expression: sql`array_position("topics", NULL) IS NULL`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Module',
        constraint: 'Module_topics_elem_not_null_1acb8bbc',
        expression: sql`array_position("topics", NULL) IS NULL`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'Course',
        index: 'Course_isPublished_sortOrder_idx_654fec3c',
        columns: ['isPublished', 'sortOrder'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
