/**
 * rbac.js — Single source of truth for role-based access control.
 *
 * Role hierarchy (additive):  viewer < operator < admin
 *
 * Dynamic overrides: admin can grant individual permissions to specific users
 * via the 'extra_permissions' array on the user object (set via User Management).
 *
 * Usage:
 *   import { can, ROLES } from '../rbac'
 *   if (can(user, 'upload_files')) { ... }
 */

export const ROLES = ['viewer', 'operator', 'admin']

export const PERMISSION_LABELS = {
  // viewer
  view_dashboard:    'View Dashboard',
  view_files:        'View Files',
  view_filesystem:   'View Filesystem',
  view_kb:           'View Knowledge Base',
  view_tools:        'View Tools',
  view_agents:       'View Agents',
  view_settings:     'View Settings',
  view_models:       'View Models',
  kb_search:         'KB Search',
  kb_rag_query:      'KB RAG Query',
  // operator
  upload_files:      'Upload Files',
  delete_files:      'Delete Files',
  ingest_kb:         'Ingest KB',
  delete_kb_source:  'Delete KB Source',
  clear_kb:          'Clear KB',
  save_kb_config:    'Save KB Config',
  run_task:          'Run Tasks',
  chat_send:         'Send Chat',
  web_search:        'Web Search',
  filesystem_write:  'Filesystem Write',
  approve_spawn:     'Approve Spawns',
  add_tool:          'Add Tool',
  edit_tool:         'Edit Tool / MD',
  delete_tool:       'Delete Tool',
  edit_agent:        'Edit Agent',
  edit_skills_md:    'Edit Skills MD',
  // admin
  manage_users:      'Manage Users',
  create_agent:      'Create Agent',
  delete_agent:      'Delete Agent',
  edit_settings:     'Edit Settings',
  change_model:      'Change Model',
  self_improve:      'Self-Improve',
  assign_roles:      'Assign Roles',
}

const PERMISSIONS = {
  // ── Read (viewer+) ───────────────────────────────────────────────
  view_dashboard:    'viewer',
  view_files:        'viewer',
  view_filesystem:   'viewer',
  view_kb:           'viewer',
  view_tools:        'viewer',
  view_agents:       'viewer',
  view_settings:     'viewer',
  view_models:       'viewer',
  kb_search:         'viewer',
  kb_rag_query:      'viewer',

  // ── Write (operator+) ────────────────────────────────────────────
  upload_files:      'operator',
  delete_files:      'operator',
  ingest_kb:         'operator',
  delete_kb_source:  'operator',
  clear_kb:          'operator',
  save_kb_config:    'operator',
  run_task:          'operator',
  chat_send:         'operator',
  web_search:        'operator',
  filesystem_write:  'operator',
  approve_spawn:     'operator',
  add_tool:          'operator',
  edit_tool:         'operator',
  delete_tool:       'operator',
  edit_agent:        'operator',
  edit_skills_md:    'operator',

  // ── Admin only ───────────────────────────────────────────────────
  manage_users:      'admin',
  create_agent:      'admin',
  delete_agent:      'admin',
  edit_settings:     'admin',
  change_model:      'admin',
  self_improve:      'admin',
  assign_roles:      'admin',
}

const ROLE_RANK = { viewer: 0, operator: 1, admin: 2 }

/**
 * Check permission. Respects role hierarchy AND individual extra_permissions
 * granted by admin (stored on user.extra_permissions array).
 */
export function can(user, perm) {
  if (!user) return false
  // Role-based check
  const required = PERMISSIONS[perm]
  if (required && (ROLE_RANK[user.role] ?? -1) >= (ROLE_RANK[required] ?? 99)) return true
  // Extra per-user permissions granted by admin
  if (Array.isArray(user.extra_permissions) && user.extra_permissions.includes(perm)) return true
  return false
}

export const isAdmin    = (user) => user?.role === 'admin'
export const isOperator = (user) => (ROLE_RANK[user?.role] ?? -1) >= 1
export const isViewer   = (user) => !!user

/** Group permissions by base role tier for the UI */
export const PERMISSION_GROUPS = [
  {
    label: 'Read (Viewer+)',
    perms: ['view_dashboard','view_files','view_filesystem','view_kb','view_tools','view_agents','view_settings','view_models','kb_search','kb_rag_query'],
  },
  {
    label: 'Write (Operator+)',
    perms: ['upload_files','delete_files','ingest_kb','delete_kb_source','clear_kb','save_kb_config','run_task','chat_send','web_search','filesystem_write','approve_spawn','add_tool','edit_tool','delete_tool','edit_agent','edit_skills_md'],
  },
  {
    label: 'Admin Only',
    perms: ['manage_users','create_agent','delete_agent','edit_settings','change_model','self_improve','assign_roles'],
  },
]
