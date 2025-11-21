import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Service Worker registration and update handling
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      console.info('SW registered:', registration);
      
      // Check for updates immediately
      registration.update();
      
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              // Force reload to get fresh React instance
              window.location.reload();
            }
          });
        }
      });
    })
    .catch((error) => {
      console.error('SW registration failed:', error);
    });

  // Listen for cache update messages from SW
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CACHE_UPDATED') {
      console.info('Cache updated, reloading...');
      window.location.reload();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
