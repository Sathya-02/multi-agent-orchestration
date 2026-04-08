# UI, Logic, and Overlay Design

## UX direction
The interface should feel like a mission-control web app layered over a cinematic operations room. The README already defines a real-time 3D executive boardroom, animated communication arcs, an active-agent HUD, a table activity panel, and a live feed, so the UI design should formalize those pieces into a structured app shell rather than treating them as isolated widgets.

## App shell

### Global structure
- Header with product name, mode switcher, active model, connection state, and launch action.
- Left navigation for Dashboard, Job Studio, Agents, Tools, Knowledge Base, Filesystem, Settings, and Audit.
- Main workspace split into a scene/report area and a live operations column.
- Right inspector drawer for contextual details, editing, and approvals.

## Screen inventory

### Dashboard
Shows system stats, current model, provider health, recent jobs, pending approvals, and recent reports. The README mentions live RAM, CPU, disk, VRAM, session tokens, and active job statistics, which fit naturally here.

### Job Studio
Combines the query composer, file uploader, launch controls, live 3D boardroom, activity feed, and final report preview. This is the operational center for Research, Quick Query, and File Analysis modes.

### Agents Studio
Displays built-in and custom agents with state badges, role summaries, tool lists, and SKILLS.md editing access. New agents should appear first as cards and then be represented in the scene as desks or variants.

### Tools Studio
Shows custom and built-in tools with descriptions, tags, code editor entry points, compile status, and pending tool spawn approvals. The README notes that custom tool code is compiled at runtime and loaded into the next job.

### Knowledge Base
Provides file upload, text ingest, chunk/source browsing, KB config, and direct test-search results. The README explicitly describes a “Test Search” tab and source management workflows.

### Filesystem Control
Provides folder ACL setup, output directory selection, audit log review, and sample filesystem query prompts. The README documents persistent permissions for read, write, and edit and an audit log of all operations.

### Settings
Includes model switching, web-search provider config and testing, Telegram setup, self-improver settings, and global spawn toggle state.

## Interaction model

### Primary layout
The best desktop layout is a three-zone workspace:
1. Left sidebar for navigation and quick counts.
2. Center canvas for scene, forms, and report reader.
3. Right rail for selected object details and overlay drawers.
This supports the product's mixture of visual telemetry and admin-heavy workflows.

### Mobile and narrow widths
Below tablet width, the boardroom becomes a collapsible scene block, the activity feed stacks below it, and the inspector becomes a bottom sheet. Administrative tables should switch to stacked cards.

## UI state logic
A centralized frontend store should manage:
- `jobs`: current draft, running state, selected job, final reports, uploads.
- `events`: normalized WebSocket event log and derived runtime state.
- `agents`: built-in/custom definitions, activity state, selected entity, spawn requests.
- `tools`: registry, selected tool, compile state, pending approvals.
- `kb`: config, sources, ingest queue, search results.
- `filesystem`: ACL entries, audit entries, output folder.
- `settings`: model, providers, toggles, Telegram, self-improver.

## Overlay system

### Overlay principles
- Keep context visible; prefer anchored overlays and drawers over full-page transitions.
- Use modals only for approval, destructive actions, or required decisions.
- Tie overlay state directly to event state so the UI reflects live runtime changes without polling drift.

### Overlay catalog

#### 1. Active Agent HUD
A fixed HUD in the upper scene corner shows the currently active agent, role, color signature, phase, and elapsed time. The README already describes a floating “NOW ACTIVE” panel with a pulsing ring.

#### 2. Table Activity Overlay
An anchored floating panel above the holographic table lists seated agents, current phase, and the latest collaboration note. This extends the documented table activity panel into a durable collaboration summary.

#### 3. Agent Drawer
Selecting a desk, avatar, or agent card opens a side drawer with role, goal, tools, recent output, active/inactive status, and a shortcut to edit `SKILLS.md`. The repo explicitly supports editable markdown agent definitions.

#### 4. Event Inspector
Clicking an activity item opens structured detail showing raw message, interpreted meaning, timestamp, related tool/provider data, and links to the parent job or agent. This makes the feed useful for diagnosis rather than just display.

#### 5. Spawn Approval Modal
Pending agent and tool spawn requests should open a compact modal with the suggestion, rationale, deduplication checks, and approve/reject actions. The README says those requests are surfaced in the UI and require human approval.

#### 6. Report Preview Panel
On job completion, the UI should open a report preview panel with format badge, metadata, download action, and a copy/share tool. The README documents per-format report saving and download behavior.

#### 7. Provider Health Sheet
A slide-over panel from Settings should show provider-by-provider availability, latency, and configuration status. The README explicitly includes a provider testing capability.

## Visual system
The boardroom is described as white-toned with colored agent accents, glowing desks, pulsing monitors, and communication arcs. The overlay system should therefore use restrained neutral panels with subtle blur, high-contrast typography, and one accent color derived from the selected entity rather than a rainbow control surface.

## Component logic notes
- Every WebSocket event updates the global event log first, then derived slices.
- Scene animation state should be derived from the same active-agent and seated-agent data used by HUD overlays.
- Approval queues must remain visible from both the main managers and a global notification center.
- Report artifacts should be available from job history, completion overlays, and Telegram notification history where relevant.

## Implementation sketch
- React app shell with route-level sections or tabbed views.
- Shared event reducer for WebSocket payloads.
- Scene container component that consumes derived runtime state only.
- Reusable drawer, sheet, modal, and toast primitives for overlays.
- A markdown/code editor surface for `SKILLS.md` and `TOOL.md` editing.
This approach fits the repo's documented architecture and preserves a single coherent operational interface.
