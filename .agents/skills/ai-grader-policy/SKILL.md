---
name: ai-grader-policy
description: Enforce AI Exam Grader architecture policies, tech stack, feature-based structure, and desktop-first UX standards for Next.js App Router project.
---

# AI Exam Grader Architecture & Policy

Reference for implementing features in the AI Exam Grader project. All implementation MUST adhere to these guidelines.

## 1. Technology Stack Compliance

- **Framework**: Use Next.js 15+ (App Router).
- **Styling**: Use Tailwind CSS v4 with `clsx` and `tailwind-merge`. Follow design tokens in `globals.css` (`--primary`, `--cta`, etc.).
- **State Management**:
  - Prefer **Server State** (RSC, Server Actions) for data fetching/mutation.
  - Use `useState`/`useReducer` for local UI state.
  - Use `Zustand` ONLY for complex global state if absolutely necessary.
- **PDF**: Use `react-pdf` for rendering.

## 2. Directory Structure (Feature-Based)

Do not dump everything in `components/`. Use Feature-Sliced approach:

```
/
├── app/                    # Routing & Layouts
│   ├── (routes)/           # Group routes logically
│   │   ├── editor/         # Editor workspace
│   │   └── dashboard/      # Dashboard (Future)
├── components/             # SHARED Atomic Components ONLY (Button, Card, Input)
├── features/               # BUSINESS LOGIC & Domain Components
│   ├── grader/             # Grading Logic
│   │   ├── components/     # UI specific to grader
│   │   ├── hooks/          # Hooks specific to grader
│   └── upload/             # Upload Logic
├── lib/                    # Utilities
└── types/                  # Global Types
```

## 3. Implementation Rules

### 3.1. Server vs Client
- **Default to Server Component**: Write as `async function Component() {}` by default.
- **'use client'**: Add only when using Hooks, Event Listeners, or Browser-only APIs.
- **Optimization**: Push Client Components down to the leaf nodes.

### 3.2. Coding Standards
- **Naming**:
  - Files: `kebab-case.tsx`
  - Components: `PascalCase`
- **Type Safety**: strict TypeScript. No `any`. Use Zod for validation.
- **Imports**: Use absolute imports `@/...`.

### 3.3. Stage 1 Strategy (Standalone)
- **No Backend**: Mock logical operations in client memory or simplified Server Actions.
- **State**: Use browser memory/contexts to hold session data.

## 4. UI/UX Guidelines
- **Desktop First**: Optimize for widescreen layout.
- **Feedback**: Mandatory Loading UI or Toast on async actions.
- **Accessibility**: `aria-label` and `alt` are required.
- **Theme**: Use defined Primary (`#0891B2`) and CTA (`#22C55E`) colors.
