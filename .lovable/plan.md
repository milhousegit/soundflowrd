

# Queue Logic Cleanup - Stable Desktop/Android Playback

## Problem Analysis

The queue has three interrelated bugs:

1. **Same song loops**: `next()` calls `playTrack(track, queue)` which re-calculates `queueIndex` using `findIndex`. If there are duplicate track IDs (common with Deezer results) or the index calculation is wrong, playback gets stuck.

2. **Random wrong tracks**: The prefetch system dispatches custom DOM events (`prefetch-played`, `prefetch-next-track`) that update state asynchronously. These can fire at the wrong time, causing the player to jump to unexpected tracks.

3. **Queue resets on every skip**: Every call to `next()` passes the full queue to `playTrack()`, which copies it and recalculates the index from scratch -- a fragile pattern that amplifies bugs 1 and 2.

## Solution

Split `playTrack` into two paths:
- **External call** (user clicks a track): sets a new queue + index + starts playback
- **Internal advancement** (`next`/`previous`): only updates `queueIndex` and starts playback for the track at that index, WITHOUT touching the queue

Remove the prefetch-based playback system entirely (the iOS-specific `handleEnded` shortcut that bypasses `next()`). Keep prefetching the URL, but always go through the normal `next()` flow.

## Technical Changes

### 1. `src/contexts/PlayerContext.tsx` -- Refactor `next()` and `previous()`

**`next()` -- stop passing queue to playTrack:**
```
// BEFORE (broken):
playTrack(nextTrack, currentQueue);

// AFTER (clean):
// Just update queueIndex in state, then call internal play
setState(prev => ({ ...prev, queueIndex: nextIndex }));
playTrackInternal(nextTrack);  // new function: plays without resetting queue
```

**Create `playTrackInternal(track)`:**
A simplified version of `playTrack` that:
- Sets `currentTrack`, `progress: 0`, `isPlaying: true`
- Starts the audio source resolution (Tidal/RD/offline)
- Does NOT modify `queue` or `queueIndex`

**`previous()` -- same fix:**
Use `playTrackInternal` instead of `playTrack(prevTrack, currentQueue)`.

### 2. Simplify `handleEnded` (audio 'ended' event)

**Remove prefetch shortcut entirely.** The current code tries to set `audio.src` directly from prefetched URL and dispatches a `prefetch-played` event -- this bypasses normal queue advancement and causes state mismatches.

New `handleEnded`:
```
const handleEnded = () => {
  // Save listening stats
  // ...existing stats code...

  // Simply advance to next track
  nextRef.current();
};
```

### 3. Remove prefetch event system

- Remove `window.dispatchEvent(new CustomEvent('prefetch-played', ...))` from `handleEnded`
- Remove `window.addEventListener('prefetch-played', ...)` listener
- Keep `prefetch-next-track` event for pre-resolving URLs, but use the prefetched URL inside `playTrackInternal` instead of in `handleEnded`
- The prefetched URL will be consumed in `playTrackInternal`: if `prefetchedNextUrlRef.current?.trackId === track.id`, use that URL directly instead of searching again

### 4. Remove iOS-specific workarounds from queue logic

- Remove `iosAudio.playPlaceholder()` call from `handleEnded` (iOS background optimization)
- Remove the aggressive prefetch trigger at 3-6 seconds into playback (line 538-542)
- Keep the simpler pre-sync system (line 2131+) that saves RD mappings for the next track -- this is useful for all platforms
- Remove `useIOSAudioSession` import and usage entirely (it only added complexity for iOS)

### 5. Fix `playTrack` index calculation

Add a `startIndex` parameter so callers can specify the exact index:
```
playTrack(track: Track, queue?: Track[], startIndex?: number)
// If startIndex provided, use it directly
// Otherwise fall back to findIndex (for external calls like clicking a track in a list)
```

This way `playQueueIndex` can pass the exact index and avoid `findIndex` issues with duplicate IDs.

## Files Modified

- `src/contexts/PlayerContext.tsx` -- All changes are in this single file

## What stays the same

- Shuffle logic (Fisher-Yates) -- works correctly
- Autoplay at end of queue (fetchSimilarTracks) -- works correctly
- RD/Tidal/offline source resolution -- untouched
- Media Session API handlers -- kept, just using updated refs
- Pre-sync RD mappings for next track -- kept (platform-agnostic optimization)
- Queue reorder, addToQueue, clearQueue -- unchanged

