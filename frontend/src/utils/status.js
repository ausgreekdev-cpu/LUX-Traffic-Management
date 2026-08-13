export const PERMIT_BADGES = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  under_review: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  expired: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  completed: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
};

export const TMP_BADGES = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  completed: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
};

export const FEE_BADGES = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  refunded: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  waived: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
};

const DEFAULT_BADGE = 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

export function badgeFor(map, status) {
  return map[status] || DEFAULT_BADGE;
}
