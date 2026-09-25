# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory contains guidelines for frontend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | To fill |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | To fill |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | To fill |
| [State Management](./state-management.md) | Local state, global state, server state | To fill |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, lobby overlays, **Develop→Check→Milestone** hard cadence | Active |
| [Type Safety](./type-safety.md) | Type patterns, validation | To fill |
| [Camera Centering](./camera-centering.md) | Open-world centering iron rule (Player @ 0,0 / WorldBridge) | Active |
| [Mobile Controls](./mobile-controls.md) | Left move pad / right attack pad + hold-to-fire | Active |
| [CMS Contract](./cms-contract.md) | ConfigPack SSOT + admin publish / client fail-soft remote | Active |
| [Tile Dungeon](./tile-dungeon.md) | DungeonLayout grid, hazards, flow-field steering, character rigs | Active |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

---

## Pre-Development Checklist

- [ ] Read [Camera Centering](./camera-centering.md) if touching camera / player / world motion
- [ ] Read [Mobile Controls](./mobile-controls.md) if touching joystick / attack pad
- [ ] Read [Quality Guidelines](./quality-guidelines.md) — especially BlockInput overlays + Develop→Check→Milestone
- [ ] Read [CMS Contract](./cms-contract.md) if touching ConfigStore / BuiltinPack / admin / remote pack
- [ ] Read [Tile Dungeon](./tile-dungeon.md) if touching map generation, collision, enemy chase AI, or character art
- [ ] After the slice: check, then edit `progress-plan.md` / `prd.md` before stopping

**Language**: All documentation should be written in **English**.
