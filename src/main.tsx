import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Lock screen orientation to portrait on mobile
if ('screen' in window && 'orientation' in window.screen) {
  const orientation = window.screen.orientation as any;
  if (typeof orientation?.lock === 'function') {
    orientation.lock('portrait').catch(() => {
      // Orientation lock not supported or requires fullscreen/PWA
      console.log('Screen orientation lock not available');
    });
  }
}

// Keep audio playing when screen is off - request wake lock if available
let wakeLock: WakeLockSentinel | null = null;

const requestWakeLock = async () => {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock acquired');
      
      wakeLock.addEventListener('release', () => {
        console.log('Wake lock released');
      });
    } catch (err) {
      console.log('Wake lock request failed:', err);
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
