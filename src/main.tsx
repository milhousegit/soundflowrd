import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// NOTE: Orientation lock is now handled inside useIOSAudioSession hook
// during user gesture (tap) for better iOS PWA compatibility.
// The manifest.json "orientation": "portrait" provides the base intent.

// Keep audio playing when screen is off - request wake lock if available
let wakeLock: WakeLockSentinel | null = null;

const requestWakeLock = async () => {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[Main] Wake lock acquired');
      
      wakeLock.addEventListener('release', () => {
        console.log('[Main] Wake lock released');
      });
    } catch (err) {
      console.log('[Main] Wake lock request failed:', err);
    }
  }
};

// Request wake lock on page load and when page becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    requestWakeLock();
  }
});

// Initial wake lock request
requestWakeLock();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
