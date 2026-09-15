import { registerSW } from 'virtual:pwa-register';

/** How often to look for a new deploy while the app stays open. */
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;
const RELOAD_FLAG = 'hti.reloadedAt';

/** Reload at most once per minute, so a genuinely broken build can't loop forever. */
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    // sessionStorage unavailable; reload anyway
  }
  window.location.reload();
}

/**
 * Keeps the installed app current. The service worker auto-updates and reloads the page once the
 * new version has taken over; we also check for updates whenever the app comes back to the
 * foreground, since an iPhone home-screen app can sit in the background for days.
 */
export function setupPwa() {
  // A deploy replaces the old build's files, so a page still running old code can fail to load a
  // lazy chunk (e.g. the receipt scanner). Reloading picks up the current version.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnce();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => undefined);
      setInterval(check, UPDATE_CHECK_INTERVAL);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}
