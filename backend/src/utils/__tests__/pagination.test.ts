import { describe, expect, it } from 'vitest';
import { buildPaginationMeta, parsePagination } from '../pagination';

describe('parsePagination', () => {
  it('defaults to page 1, limit 50 when no query params given', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it('parses string query values', () => {
    expect(parsePagination({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10, skip: 10 });
  });

  it('clamps limit above MAX_LIMIT down to 100', () => {
    expect(parsePagination({ limit: '500' })).toMatchObject({ limit: 100 });
  });

  it('clamps page/limit of 0 or negative up to 1/default', () => {
    expect(parsePagination({ page: '0', limit: '-5' })).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it('falls back to defaults for non-numeric input', () => {
    expect(parsePagination({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it('computes skip from page and limit', () => {
    expect(parsePagination({ page: '3', limit: '20' })).toEqual({ page: 3, limit: 20, skip: 40 });
  });
});

describe('buildPaginationMeta', () => {
  it('computes totalPages from totalCount and limit', () => {
    expect(buildPaginationMeta(101, 1, 50)).toEqual({
      page: 1,
      limit: 50,
      totalCount: 101,
      totalPages: 3,
    });
  });

  it('reports totalPages: 1 for an empty result set, not 0', () => {
    expect(buildPaginationMeta(0, 1, 50)).toEqual({
      page: 1,
      limit: 50,
      totalCount: 0,
      totalPages: 1,
    });
  });
});
