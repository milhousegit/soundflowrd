

# Desktop Layout Redesign — YouTube Music Style

## Overview
Redesign the desktop layout to match a YouTube Music-inspired interface: horizontal top navigation bar, left sidebar player with canvas/lyrics, and no bottom player bar on desktop.

## Current vs New Layout

```text
CURRENT:
┌──────────┬─────────────────────────────┐
│ Sidebar  │         Content             │
│ (nav)    │                             │
│          │                             │
├──────────┴─────────────────────────────┤
│           Bottom Player Bar            │
└────────────────────────────────────────┘

NEW:
┌────────────────────────────────────────────┐
│ Home  Feed  Libreria  │ 🔍 Search │ 🔔 ⚙ 👤│  ← TopBar
├──────────┬─────────────────────────────────┤
│  Player  │                                 │
│  Sidebar │         Content (Outlet)        │
│ (canvas) │                                 │
│ (cover)  │                                 │
│ (info)   │                                 │
│ (controls│                                 │
│ (lyrics) │                                 │
└──────────┴─────────────────────────────────┘
```

## Changes

### 1. Create `DesktopTopBar` component
- Left: nav links — Home, Feed, Libreria (styled as tabs/pills)
- Center: search input bar (navigates to /app/search with query)
- Right: NotificationsDropdown, Settings icon (link to /app/settings), Profile avatar (link to /app/profile)
- Hidden on mobile (`hidden md:flex`)

### 2. Create `DesktopPlayerSidebar` component
- Fixed left sidebar, ~350px wide, full height below top bar
- Shows only when a track is playing (otherwise content takes full width)
- Contains (top to bottom):
  - Canvas video background (if available) or album cover
  - Track title, artist, album (clickable)
  - Audio source badge
  - Progress bar with timestamps
  - Playback controls (shuffle, prev, play/pause, next, favorite)
  - Secondary actions (queue, lyrics, debug, download)
  - Volume slider
  - Inline lyrics card (scrollable)
- Hidden on mobile (`hidden md:flex`)

### 3. Modify `Layout.tsx`
- Remove `<Sidebar />` (the old vertical nav sidebar)
- Add `<DesktopTopBar />` above content
- Add `<DesktopPlayerSidebar />` to the left of content area
- Remove bottom padding for desktop player bar

### 4. Modify `Player.tsx`
- Remove the desktop bottom bar section (lines 552-658, the `hidden md:block` fixed bottom bar)
- Keep mobile expanded view and mini player unchanged
- Keep all modals (debug, queue, lyrics, track actions)

### 5. Remove `Sidebar.tsx` usage
- Only used in Layout, will be replaced by TopBar
- Keep the file but remove its import from Layout

### 6. Responsive behavior
- Mobile: unchanged (bottom nav + mini player + expanded player)
- Desktop: top bar nav + left player sidebar + no bottom bar

## Technical Details
- `DesktopTopBar`: new file `src/components/DesktopTopBar.tsx`
- `DesktopPlayerSidebar`: new file `src/components/DesktopPlayerSidebar.tsx`
- Player context hooks remain the same, just rendered in new location
- Canvas background rendered inside the sidebar with contained positioning (not fixed/fullscreen)
- Search bar in top bar: on input, navigate to `/app/search?q=...` or just focus the search page

