# DESIGN_SYSTEM — Visual Parity Contract

This document freezes the design system of the Greenwood School ERP as it existed before the
standalone migration. **Any refactor must produce pixel-equivalent output against this document.**
Source of truth in code: `src/styles.css` (Tailwind CSS v4 CSS-first config — there is no
`tailwind.config.ts`) and `components.json` (shadcn/ui, `new-york` style, slate base,
css-variables mode, lucide icons).

## Typography

| Token                    | Value                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `--font-sans` (body)     | `"Figtree", ui-sans-serif, system-ui, sans-serif` — weights 400/500/600/700, self-hosted via `@fontsource/figtree`      |
| `--font-display` (h1–h4) | `"Outfit", "Figtree", ui-sans-serif, system-ui, sans-serif` — weights 500/600/700, self-hosted via `@fontsource/outfit` |
| Headings                 | `h1–h4 { font-family: var(--font-display); letter-spacing: -0.01em; }`                                                  |
| Body features            | `font-feature-settings: "cv11", "ss01"`                                                                                 |

No font CDN is used — fonts ship in the bundle (this must stay true post-migration).

## Radius scale

Base `--radius: 0.625rem`; derived: `sm = radius − 4px`, `md = radius − 2px`, `lg = radius`,
`xl = +4px`, `2xl = +8px`, `3xl = +12px`, `4xl = +16px`.

## Shadows

No custom shadow tokens — components use stock Tailwind `shadow-sm` (buttons, cards, popovers)
and `shadow-md/lg` on overlays, per shadcn `new-york` defaults.

## Color palette — light mode (`:root`, all oklch)

| Token                      | Value                        |     | Token                       | Value                       |
| -------------------------- | ---------------------------- | --- | --------------------------- | --------------------------- |
| `--background`             | `oklch(0.977 0.005 270)`     |     | `--foreground`              | `oklch(0.19 0.03 265)`      |
| `--card` / `--popover`     | `oklch(1 0 0)`               |     | `--card/popover-foreground` | `oklch(0.19 0.03 265)`      |
| `--primary`                | `oklch(0.5 0.22 275)`        |     | `--primary-foreground`      | `oklch(0.99 0.005 270)`     |
| `--secondary` / `--muted`  | `oklch(0.965 0.01 270)`      |     | `--secondary-foreground`    | `oklch(0.25 0.06 275)`      |
| `--muted-foreground`       | `oklch(0.5 0.03 265)`        |     | `--accent`                  | `oklch(0.94 0.03 275)`      |
| `--accent-foreground`      | `oklch(0.35 0.15 275)`       |     | `--destructive`             | `oklch(0.577 0.245 27.325)` |
| `--destructive-foreground` | `oklch(0.984 0.003 247.858)` |     | `--border` / `--input`      | `oklch(0.92 0.01 270)`      |
| `--ring`                   | `oklch(0.5 0.22 275)`        |     |                             |                             |

Charts: `--chart-1 oklch(0.646 0.222 41.116)`, `--chart-2 oklch(0.6 0.118 184.704)`,
`--chart-3 oklch(0.398 0.07 227.392)`, `--chart-4 oklch(0.828 0.189 84.429)`,
`--chart-5 oklch(0.769 0.188 70.08)`.

Sidebar: `--sidebar oklch(1 0 0)`, `--sidebar-foreground oklch(0.35 0.03 265)`,
`--sidebar-primary oklch(0.5 0.22 275)`, `--sidebar-primary-foreground oklch(0.99 0.005 270)`,
`--sidebar-accent oklch(0.94 0.05 275)`, `--sidebar-accent-foreground oklch(0.4 0.2 275)`,
`--sidebar-border oklch(0.93 0.01 270)`, `--sidebar-ring oklch(0.5 0.22 275)`.

Dashboard stat-card tokens (custom, beyond stock shadcn):
`--stat-sky oklch(0.86 0.09 240)` / fg `oklch(0.32 0.13 250)`;
`--stat-indigo oklch(0.38 0.19 275)` / fg `oklch(0.97 0.02 270)`;
`--stat-violet oklch(0.68 0.19 295)` / fg `oklch(0.99 0.005 270)`;
`--stat-coral oklch(0.72 0.19 25)` / fg `oklch(0.99 0.005 270)`.

## Color palette — dark mode (`.dark`)

| Token                  | Value                        |     | Token                                  | Value                        |
| ---------------------- | ---------------------------- | --- | -------------------------------------- | ---------------------------- |
| `--background`         | `oklch(0.129 0.042 264.695)` |     | `--foreground`                         | `oklch(0.984 0.003 247.858)` |
| `--card` / `--popover` | `oklch(0.208 0.042 265.755)` |     | `--primary`                            | `oklch(0.929 0.013 255.508)` |
| `--primary-foreground` | `oklch(0.208 0.042 265.755)` |     | `--secondary` / `--muted` / `--accent` | `oklch(0.279 0.041 260.031)` |
| `--muted-foreground`   | `oklch(0.704 0.04 256.788)`  |     | `--destructive`                        | `oklch(0.704 0.191 22.216)`  |
| `--border`             | `oklch(1 0 0 / 10%)`         |     | `--input`                              | `oklch(1 0 0 / 15%)`         |
| `--ring`               | `oklch(0.551 0.027 264.364)` |     |                                        |                              |

Dark charts: `--chart-1 oklch(0.488 0.243 264.376)`, `--chart-2 oklch(0.696 0.17 162.48)`,
`--chart-3 oklch(0.769 0.188 70.08)`, `--chart-4 oklch(0.627 0.265 303.9)`,
`--chart-5 oklch(0.645 0.246 16.439)`.
Dark sidebar: `--sidebar oklch(0.208 0.042 265.755)`, `--sidebar-primary oklch(0.488 0.243 264.376)`,
accent `oklch(0.279 0.041 260.031)`, border `oklch(1 0 0 / 10%)`, ring `oklch(0.551 0.027 264.364)`.
(Stat tokens are not overridden in dark mode.)

## shadcn/ui components in use (46, vendored in `src/components/ui/`)

accordion, alert-dialog, alert, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card,
carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu,
form, hover-card, input-otp, input, label, menubar, navigation-menu, pagination, popover,
progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton,
slider, sonner, switch, table, tabs, textarea, toggle-group, toggle, tooltip.

Customizations: stock `new-york` output; the only app-specific styling is the semantic-token
usage above (sidebar-* and stat-* tokens) plus layout classes in `src/components/app-shell.tsx`
(64px header, 256px desktop sidebar / 288px mobile Sheet, ≥44px touch targets).

## Layout behavior contract

- Desktop (≥1024px): fixed left sidebar (`w-64`), sticky 64px header, scrollable main with
  `p-4 sm:p-6 lg:p-8`.
- Mobile/tablet (<1024px): sidebar collapses into a left `Sheet` drawer (`w-72`) opened by a
  hamburger in the header; drawer auto-closes on route change.
- Page headers: `PageHeader` grid — title truncates, action wraps below at `sm`.

## Baseline screenshots

Captured against the pre-migration UI (files under `docs/screenshots/baseline/`):
`auth-1440.png`, `auth-768.png`, `auth-375.png`. Authenticated pages (Admin Dashboard, class
detail, mobile sidebar) require a network path to the Supabase backend, which this migration
environment's network policy blocks — capture them with `bun run dev` on a machine with backend
access before/after any visual-affecting change (see MIGRATION_LOG Phase 8).
