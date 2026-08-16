const HARD_CAP = 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

export function parsePagination(req) {
  const hasPage = req.query.page !== undefined && req.query.page !== '';
  const hasLimit = req.query.limit !== undefined && req.query.limit !== '';
  if (!hasPage && !hasLimit) return null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit };
}

// Returns { data, total, page, limit, pages } when ?page/&limit are supplied,
// otherwise returns the full array capped at HARD_CAP rows for safety.
export function paginateResponse(req, rows) {
  const opts = parsePagination(req);
  if (!opts) return rows.slice(0, HARD_CAP);
  const total = rows.length;
  const offset = (opts.page - 1) * opts.limit;
  const data = rows.slice(offset, offset + opts.limit);
  return { data, total, page: opts.page, limit: opts.limit, pages: Math.ceil(total / opts.limit) };
}