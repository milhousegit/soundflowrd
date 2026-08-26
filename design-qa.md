# Design QA — YouTube visual background

Reference: `Screenshot 2026-08-26 alle 15.44.56.png`

## Checks

- The YouTube IFrame is no longer rendered as a floating `240×200` card.
- When a YouTube track is active, the iframe is limited to the player: full-screen only in the expanded mobile player, or inside the desktop player column.
- The existing SoundFlow controls, progress bar, metadata, navigation and lyrics remain in the foreground.
- Stronger black translucent, blurred contrast layers fade smoothly above and below the player video.
- YouTube player metadata, time labels, lyrics labels and playback icons use white foreground contrast.
- The source badge keeps its slot during track changes and shows an animated skeleton until the next source is resolved.
- The expanded mobile player keeps an opaque black base during visual-source transitions, preventing the underlying app page from flashing through.
- The canvas has priority over the YouTube visual background; YouTube is shown only when no canvas is available.
- The YouTube iframe remains in the DOM and is not visually hidden with an off-screen trick while active; it is only moved off-screen when no video is loaded.
- `npm run build` passes.
- `npx tsc --noEmit -p tsconfig.app.json` passes.
- `git diff --check` passes.

Final result: passed
