# Available AI Agents & Skills

This project leverages a multi-agent AI system with specialized skills.

## Installed Skills

Skills are located in `.agents/skills/`.

*   **`ui-ux-pro-max`**: Comprehensive UI/UX design intelligence. Generates design systems, color palettes, and component guidelines.
*   **`frontend-design`**: Focuses on high-quality, non-generic aesthetic implementation.
*   **`nextjs-app-router-patterns`**: Best practices for Next.js 14+ App Router, Server Components, and Streaming.
*   **`ai-grader-policy`**: Custom architecture policy enforcement module for this project.

## Agent Guidelines

When working on this project, agents should:

1.  **Check Policy First**: Always refer to `ai-grader-policy` or `docs/architecture-policy.md` before architectural decisions.
2.  **Use Design System**: Follow colors and fonts defined in `ui-ux-guide.md` and `globals.css`.
3.  **Feature-First**: Place business logic in `features/` directory, not `components/`.
4.  **Check Lessons Learned**: 유사한 이슈를 만나면 `docs/lessons-learned/`를 먼저 확인하여 이미 해결된 문제를 반복하지 않는다.
