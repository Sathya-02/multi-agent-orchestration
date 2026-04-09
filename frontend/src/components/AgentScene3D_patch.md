# AgentScene3D.jsx — Executive-Lab Patch Notes

Apply these targeted changes to `AgentScene3D.jsx`. No structural Three.js changes needed.

## 1. Built-in Agent Colours

Update `getAgentMaterial()` hex values to match `App.css` tokens:

| Agent       | Hex       | Token        |
|-------------|-----------|-------------|
| coordinator | `0x7dd3fc` | `--coord`   |
| researcher  | `0xfb923c` | `--res`     |
| analyst     | `0x2dd4bf` | `--anal`    |
| writer      | `0xfde68a` | `--writ`    |

## 2. Custom Agent Desk Placement

- Place custom-agent desks in a ring **outside** the central table at radius `~4.5` (built-ins sit at `~3.0`).
- Scale desk mesh to `0.85×` so they read as peripheral.
- Set emissive colour = `agent.color` (from registry) at intensity `0.18` — subtle glow without competing with built-ins.

## 3. Floor Material (Executive Lab)

```js
new THREE.MeshStandardMaterial({
  color: 0x0a0e17,
  roughness: 0.08,
  metalness: 0.82,
})
```

## 4. Ceiling Lights

- Reduce grid light intensity from `1.0` → `0.7`.
- Add one soft warm fill: `color 0xfff4e0`, intensity `0.15` to separate floor from ceiling zone.

## 5. HUD Label Colours

When rendering the floating `NOW ACTIVE` HUD canvas, set `fillStyle` to the agent's resolved colour:

```js
const BUILTIN_HUD_COLORS = {
  coordinator: '#7dd3fc',
  researcher:  '#fb923c',
  analyst:     '#2dd4bf',
  writer:      '#fde68a',
};
ctx.fillStyle = BUILTIN_HUD_COLORS[agentId] || agent.color || '#00c8d4';
```

## 6. Holographic Table Border

Add a thin emissive plane ring around the table surface:

```js
new THREE.MeshStandardMaterial({
  color: 0x00c8d4,
  emissive: 0x00c8d4,
  emissiveIntensity: 0.35,
  transparent: true,
  opacity: 0.5,
})
```
