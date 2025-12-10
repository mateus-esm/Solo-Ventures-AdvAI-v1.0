import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Unregister all old service workers and clear caches, then re-register
if ('serviceWorker' in navigator) {
  // First, unregister all existing service workers
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const unregisterPromises = registrations.map(registration => {
      console.info('[Main] Unregistering old SW:', registration.scope);
      return registration.unregister();
    });
    
    return Promise.all(unregisterPromises);
  }).then(() => {
    // Clear all caches
    if ('caches' in window) {
      return caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.info('[Main] Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      });
    }
  }).then(() => {
    // Re-register service worker
    return navigator.serviceWorker.register('/sw.js');
  }).then((registration) => {
    console.info('[Main] New SW registered:', registration.scope);
    
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            window.location.reload();
          }
        });
      }
    });
  }).catch((error) => {
    console.error('[Main] SW error:', error);
  });
}

createRoot(document.getElementById("root")!).render(<App />);