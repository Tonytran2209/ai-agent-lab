# Desktop UI baseline verification — 2026-10-29

Applies the supplied DESIGN.md v1.1 implementation specification to Agent Lab. These are proposed design tokens, not measurements of OpenAI software. Agent Lab name, flask mark, feedback workflow, request controls, API contracts and operational permissions remain unchanged.

## Implementation

- Semantic light/dark tokens in `src/design-system.css`, mapped across existing components in `src/styles.css`.
- Browser-local Light / Dark / System choice, including OS media-query changes; no server preference or project permission is written.
- 256px navigation, 52px desktop header, system type, readable metadata, neutral panels, consistent controls and focused content widths.
- Existing feedback form, inbox/detail, notifications, library, memory, connection and all settings reuse the current components. No new conversation workflow or dependency.
- Mobile navigation has focus containment, Escape, return focus, inert background and resize cleanup. Notification drawer retains its focus behavior and now makes both main/sidebar inert. Task tabs support arrows/Home/End and roving tabindex. Search has an accessible label. IME composition cannot invoke the existing submit shortcut.

## Validation

`npm ci` and `npm run check`: **385 tests passed**, schema checks and production build passed. `git diff --check` passed.

Visual checks used the in-app Chromium browser on macOS, device pixel ratio 1, isolated localhost SQLite data with three explicitly synthetic preview requests. No production feedback or project settings were submitted while testing.

| CSS viewport | Theme / representative screen | Result |
| --- | --- | --- |
| 1440 × 900 | Light inbox, connection; desktop navigation | No document overflow; clear primary/secondary actions |
| 1280 × 800 | Dark project settings | No document overflow; readable rows and disabled recovery controls |
| 1024 × 768 | Dark library | No document overflow; metadata and document reader retain local scrolling |
| 390 × 844 | Dark inbox/detail; light settings | No document overflow; navigation drawer, wrapping actions and touch controls |
| 720 × 450 | System project settings | No document overflow; narrow-window reflow |

Also inspected memory, settings subnavigation, long Vietnamese request titles, empty selection, disabled submit/recovery controls, task journal, project picker and notifications. Verified mobile Tab/Shift+Tab loops, Escape/return focus, arrow-key task tabs, and that changing appearance preserves an in-progress feedback draft. System resolved to dark consistently with the observed OS preference; explicit light and dark selections worked.

Computed foreground/background contrast sampled rendered enabled text on light desktop inbox: 43 text nodes, minimum **5.70:1**, none below 4.5:1. The corresponding dark mobile inbox sample had no text below 4.5:1. Disabled controls excluded. Muted tokens are slightly adjusted from the guide to retain contrast on selected/soft surfaces. This is a sampled check, not an exhaustive accessibility certification.

Screenshots are saved with the task output artifacts as `lab-design-1440-light.png`, `lab-design-1280-dark-settings.png`, `lab-design-1024-dark-library.png`, `lab-design-390-dark-inbox.png`, and `lab-design-390-light-settings.png`.

## Limits

No target screenshot was supplied for this redesign; earlier screenshots describe the old settings UI. No pixel-perfect claim. Native VoiceOver, real Safari/iOS/Android, and OS theme switching were not exercised. The in-app browser did not expose an effective native 200% zoom command; 720px reflow was checked separately and is not claimed as real zoom validation. Reduced motion has a global CSS override; the OS reduced-motion preference was not changed during testing. No CI/deploy/provider action or live request was triggered to test presentation.
