export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function parsePagination(query: { page?: unknown; limit?: unknown }): PaginationParams {
  const page = Math.max(1, parsePositiveInt(query.page) ?? 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parsePositiveInt(query.limit) ?? DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginationMeta(totalCount: number, page: number, limit: number): PaginationMeta {
  return { page, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) };
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
  }
  return undefined;
}
