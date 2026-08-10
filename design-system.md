# Research Assistant — Design System

**Concept:** the product is a reading and annotating tool, not a chat app. No bubbles, no avatars, no rounded pill everything. Answers are typeset like a manuscript; citations are footnoted in a margin rail, not stacked as link chips.

---

## 1. Color

| Token | Hex | Use |
|---|---|---|
| `paper` | `#EDEEEA` | Base background — cool stone, not cream |
| `paper-raised` | `#F5F5F2` | Cards, input surface, hover surface |
| `ink` | `#1F2421` | Primary text |
| `ink-soft` | `#3A3F3A` | Secondary body text |
| `muted` | `#6E7268` | Labels, timestamps, placeholder text |
| `rule` | `#D8D6CE` | Hairline borders, dividers |
| `pine` | `#3B6E63` | Accent — links, focus ring, active nav, primary button |
| `pine-dim` | `#2C5049` | Pine hover/pressed state |
| `ochre` | `#B8902E` | Citations, highlight marks, source underline |
| `error` | `#A23B2E` | Errors only — desaturated brick, not stock red |

No gradients. No glassmorphism. Shadows are a single `0 1px 2px rgba(31,36,33,0.06)` at most, used only on the composer input, nowhere else.

### CSS variables

```css
:root {
  --paper: #EDEEEA;
  --paper-raised: #F5F5F2;
  --ink: #1F2421;
  --ink-soft: #3A3F3A;
  --muted: #6E7268;
  --rule: #D8D6CE;
  --pine: #3B6E63;
  --pine-dim: #2C5049;
  --ochre: #B8902E;
  --error: #A23B2E;

  --radius-sm: 3px;
  --radius-md: 4px;
  --shadow-input: 0 1px 2px rgba(31, 36, 33, 0.06);
}
```

Radius stays small and uniform (3–4px). No fully-rounded buttons or bubble corners — that's the fastest tell of a templated AI UI.

---

## 2. Type

| Role | Family | Notes |
|---|---|---|
| Reading / answers | **Newsreader** | Optical-size serif built for long text. Used at 17–19px for assistant answers, italic for asides |
| UI chrome | **Work Sans** | Nav, buttons, labels, composer placeholder |
| Data / citations | **IBM Plex Mono** | Source metadata, timestamps, token counts, code |

```css
--font-reading: 'Newsreader', Georgia, serif;
--font-ui: 'Work Sans', system-ui, sans-serif;
--font-mono: 'IBM Plex Mono', monospace;
```

Next.js (App Router) font setup:

```ts
// app/fonts.ts
import { Newsreader, Work_Sans, IBM_Plex_Mono } from 'next/font/google'

export const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-reading',
  style: ['normal', 'italic'],
})

export const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
})

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
})
```

Type scale (rem, 16px base):

| Use | Size | Line-height | Family |
|---|---|---|---|
| Answer body | 1.0625 | 1.65 | reading |
| Answer heading | 1.375 | 1.3 | reading, medium |
| UI label | 0.8125 | 1.4 | ui, uppercase, 0.03em tracking |
| Button | 0.875 | 1 | ui, medium |
| Citation/meta | 0.75 | 1.4 | mono |

---

## 3. Layout

Reading column constrained to **68ch max-width**, centered, with a thin left icon rail for nav (threads, new query, settings) and a right margin rail reserved for citation notes — the rail only renders content when a claim in view has a source; it's not a permanent empty panel.

```
┌────┬──────────────────────────────────┬────────┐
│    │                                  │        │
│ ⚟  │   Answer text, serif, 68ch,      │   ¹     │
│ +  │   generous line-height. Query    │ ────    │
│ ⚙  │   sits above in mono/ui type.    │ Source  │
│    │                                  │ note    │
└────┴──────────────────────────────────┴────────┘
  56px         flex-1, max-w-[68ch]        280px
```

Tailwind config additions:

```js
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#EDEEEA', raised: '#F5F5F2' },
        ink: { DEFAULT: '#1F2421', soft: '#3A3F3A' },
        muted: '#6E7268',
        rule: '#D8D6CE',
        pine: { DEFAULT: '#3B6E63', dim: '#2C5049' },
        ochre: '#B8902E',
        error: '#A23B2E',
      },
      fontFamily: {
        reading: ['var(--font-reading)'],
        ui: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
      },
      maxWidth: {
        reading: '68ch',
      },
      borderRadius: {
        sm: '3px',
        md: '4px',
      },
    },
  },
}
```

---

## 4. Signature element — the marginalia rail

This is the one place to spend visual budget. Citations are footnoted, not chip-stacked:

- Inline claim gets a small ochre superscript numeral, set in mono, baseline-aligned.
- A thin 1px `rule`-colored leader line connects the numeral to a note in the right rail at the same vertical position.
- The margin note itself: mono metadata line (source name, retrieved date) + one-line excerpt in `ink-soft`, no card/shadow — just a hairline top border.
- On viewports under ~900px, the rail collapses; tapping the numeral expands the note inline, pushing text down rather than opening a modal.

```jsx
// Citation.tsx — sketch
<sup className="font-mono text-ochre text-[0.7em] cursor-pointer">
  {index}
</sup>

// Margin note, positioned via a shared vertical registry (e.g. matched refs by id)
<div className="border-t border-rule pt-2 text-xs">
  <div className="font-mono text-muted mb-1">
    {sourceName} · {retrievedDate}
  </div>
  <div className="text-ink-soft font-ui leading-snug">
    {excerpt}
  </div>
</div>
```

---

## 5. Motion

Minimal, on purpose — excess motion is what makes AI UIs feel synthetic.

- New answer text: 120ms opacity + 4px translateY rise. No bounce, no stagger-per-word.
- Thinking/loading state: a single 1px underline beneath the query that pulses slowly (1.4s ease-in-out), not spinner dots or skeleton shimmer.
- Respect `prefers-reduced-motion`: disable both, show state changes instantly.

```css
@keyframes rise-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.answer-enter {
  animation: rise-in 120ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .answer-enter { animation: none; }
}
```

---

## 6. Component notes

- **Buttons:** rectangular, `radius-md`, `pine` fill for primary, hairline `rule` border for secondary. No gradients, no drop shadow.
- **Composer input:** `paper-raised` surface, hairline border, focus state is a 1.5px `pine` border — not a glow/box-shadow ring.
- **Empty states:** written as an invitation to act, not filler copy ("Ask something to start" not "No conversations yet!").
- **Errors:** stated plainly in the interface's voice — what happened, what to do — using `error`, never apologetic copy.

## 7. Anti-patterns to avoid

- Cream background + terracotta accent + high-contrast serif (the default AI-wrapper look)
- Near-black background + single neon accent
- Chat bubbles with avatars for a single-user reading tool
- Fully rounded pill buttons and cards
- Gradient text, glassmorphism, spinner dots, skeleton shimmer as default loading state
- Citations rendered as stacked chips/badges below the answer
