# Speech Bubbles

Speech bubbles display text above entities using a Canvas2D overlay in screen-space. They're pixel-perfect regardless of zoom level and support both streaming (typewriter) and non-streaming (instant) text display.

## Binding property

Speech bubbles are driven by the `speech` binding property (type `string`). When a signal arrives that matches a binding with `speech` as the target property, the bound entity displays a speech bubble.

The `speech` property is available in the radial binding menu alongside other entity properties.

## Streaming vs. non-streaming

| Signal type | Method | Behavior |
|---|---|---|
| `text_delta`, `thinking` | `appendSpeechText()` | Typewriter effect at 30 characters/second — text appears progressively |
| All other types | `setSpeechText()` | Full text replacement — entire message appears instantly |

### Stream boundary detection

During streaming, if more than **3 seconds** pass between consecutive `text_delta`/`thinking` signals, the system treats the next signal as a **new message** — it clears the buffer and starts fresh instead of appending.

## Lifecycle

Each speech bubble goes through four phases:

```
typing → visible → fading → removed
```

1. **typing** — text is being received (streaming only). The bubble grows as characters arrive.
2. **visible** — all text received, bubble stays visible for the configured retention delay.
3. **fading** — 400ms fade-out animation (opacity 1→0).
4. **removed** — bubble is cleaned up and freed.

Non-streaming messages skip the `typing` phase and go directly to `visible`.

## Per-entity configuration

Each entity can have a `SpeechBubbleConfig` that controls the visual appearance. Configuration is set in the Inspector panel under the **"Speech Bubble"** section (visible for actors only).

| Property | Default | Description |
|---|---|---|
| `bgColor` | sajou surface color | Background color of the bubble |
| `borderColor` | sajou border color | Border color |
| `textColor` | sajou text color | Text color |
| `opacity` | `0.95` | Bubble opacity |
| `retentionMs` | `5000` | How long the bubble stays visible after text is complete (ms) |
| `maxChars` | `200` | Maximum characters — text is truncated with "..." beyond this |
| `fontSize` | `12` | Font size in pixels |
| `maxWidth` | `220` | Maximum bubble width in pixels |
| `tailPosition` | `"bottom"` | Tail pointer direction: `bottom`, `left`, or `right` |

### Inspector controls

The Speech Bubble section in the Inspector provides:
- Color pickers for background, border, and text colors
- Sliders for opacity, retention, max chars, font size, max width
- Dropdown for tail position
- "Reset to defaults" button

## Rendering

The Canvas2D overlay renders bubbles in screen-space coordinates. Each bubble is positioned above its entity, offset by a fixed amount. The renderer handles:

- Text wrapping within `maxWidth`
- Tail pointer drawn toward the entity
- Drop shadow for depth
- Fade-out opacity animation

Because the overlay is in screen-space, bubbles maintain consistent size and readability regardless of camera zoom.

## Key files

| File | Role |
|---|---|
| `run-mode/speech-bubble-state.ts` | State management + tick (lifecycle, timing, streaming) |
| `canvas/speech-bubble-renderer.ts` | Canvas2D rendering |
| `run-mode/run-mode-bindings.ts` | Speech binding case (routes to append/set) |
