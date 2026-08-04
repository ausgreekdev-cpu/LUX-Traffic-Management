export const PERMIT_BADGES = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-purple-100 text-purple-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-50 text-green-600',
  cancelled: 'bg-gray-100 text-gray-500'
};

export const TMP_BADGES = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-green-50 text-green-600',
  cancelled: 'bg-gray-100 text-gray-500'
};

export const FEE_BADGES = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  refunded: 'bg-blue-100 text-blue-700',
  waived: 'bg-gray-100 text-gray-600'
};

const DEFAULT_BADGE = 'bg-gray-100 text-gray-600';

export function badgeFor(map, status) {
  return map[status] || DEFAULT_BADGE;
}

export function statusLabel(status) {
  return (status || '').replace(/_/g, ' ');
}