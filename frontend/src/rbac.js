/**
 * rbac.js — Single source of truth for role-based access control.
 *
 * Role hierarchy (additive):  viewer < operator < admin
 *
 * Usage:
 *   import { can, ROLES } from '../rbac'
 *   if (can(user, 'upload_files')) { ... }
 */

export const ROLES = ['viewer', 'operator', 'admin']

/**
 * Returns true if the user's role meets or exceeds the minimum role
 * required for the given permission.
 */
const PERMISSIONS = {
  // ── Read (viewer+) ───────────────────────────────────────────────
  view_dashboard:      'viewer',
  view_files:          'viewer',
  view_filesystem:     'viewer',
  view_kb:             'viewer',
  view_tools:          'viewer',
  view_agents:         'viewer',
  view_settings:       'viewer',
  view_models:         'viewer',
  kb_search:           'viewer',
  kb_rag_query:        'viewer',

  // ── Write (operator+) ────────────────────────────────────────────
  upload_files:        'operator',
  delete_files:        'operator',
  ingest_kb:           'operator',
  delete_kb_source:    'operator',
  clear_kb:            'operator',
  save_kb_config:      'operator',
  run_task:            'operator',
  chat_send:           'operator',
  web_search:          'operator',
  filesystem_write:    'operator',
  approve_spawn:       'operator',

  // ── Admin only ───────────────────────────────────────────────────
  manage_users:        'admin',
  create_agent:        'admin',
  delete_agent:        'admin',
  edit_settings:       'admin',
  change_model:        'admin',
  self_improve:        'admin',
}

const ROLE_RANK = { viewer: 0, operator: 1, admin: 2 }

/**
 * @param {object|null} user  — user object from useAuth() (has .role string)
 * @param {string}      perm  — permission key from PERMISSIONS above
 * @returns {boolean}
 */
export function can(user, perm) {
  if (!user) return false
  const required = PERMISSIONS[perm]
  if (!required) return false
  return (ROLE_RANK[user.role] ?? -1) >= (ROLE_RANK[required] ?? 99)
}

/**
 * Convenience: returns true when user role is exactly admin.
 */
export const isAdmin    = (user) => user?.role === 'admin'
export const isOperator = (user) => (ROLE_RANK[user?.role] ?? -1) >= 1
export const isViewer   = (user) => !!user
