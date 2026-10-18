try { await import('./refresh-property-observations.mjs'); } catch { console.error('Refresh failed; review restricted configuration and provider availability.'); process.exitCode=1; }
