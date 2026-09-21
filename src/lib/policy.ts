export type AppRole = 'CHEF' | 'SUPER_USER';
export function canManageUsers(role: AppRole) { return role === 'SUPER_USER'; }
export function canAccessAdmin(role: AppRole) { return role === 'SUPER_USER'; }
export function assertAdmin(role: AppRole) {
  if (!canAccessAdmin(role)) throw new Error('Super User access required.');
}
export const SESSION_SECONDS = 60 * 60 * 12;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_ATTEMPTS = 8;
