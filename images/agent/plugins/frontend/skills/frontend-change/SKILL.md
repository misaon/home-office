---
name: frontend-change
description: Load in a work session when the task changes what a user sees or does in a browser or a graphical interface. How to build the change accessibly, keep it fast and visually stable, follow the repository's own components and tokens, and prove it in the browser before reporting.
---

# Changing the frontend

1. Find the pattern before inventing one: the components, tokens and conventions the repository
   already uses for the same kind of element, and the i18n mechanism every visible string goes
   through. Then load the skills this pack carries for the work in front of you: `frontend-design`
   when you shape new UI or its visual direction, `vercel-react-best-practices` and
   `vercel-composition-patterns` for React, `vue-patterns` for Vue and Nuxt,
   `make-interfaces-feel-better` for spacing, radii, motion and interaction states, and
   `web-interface-guidelines` as the checklist before you report; `modern-web-platform` from the
   work pack names the syntax and platform features to reach for.
2. Accessibility to WCAG 2.2: every control reachable and operable with the keyboard alone, with a
   visible focus and a sensible order; real labels and alt text; sufficient contrast; targets at
   least 24 by 24 pixels; no meaning carried by colour alone; async results announced to assistive
   technology; no focus traps.
3. Stability and speed: reserve space for images and late content so nothing shifts; keep
   interactions off the main thread's critical path so the response to input stays under 200 ms;
   lazy-load what is below the fold; size images. In React, derive state instead of syncing it with
   effects, use effects only for external systems, and pass `ref` as a plain prop.
4. Cover the states the criteria imply and the ones they forget: empty, loading, error, long text,
   narrow viewport, right-to-left where the app supports it.
5. Prove it: with browser tools, walk each criterion in the browser (browser-check skill), read the
   console, do one keyboard-only pass and keep a screenshot as evidence; without them, run the
   component tests and say so.
6. Report: what changed, the screenshots by path, how each criterion was verified, and the viewport
   you checked.
