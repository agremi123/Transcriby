/** Site-wide guard — only one audio source may play at a time. */
const stoppers = new Set();
let playbackGeneration = 0;

export function registerSiteAudioStop(stop) {
  stoppers.add(stop);
  return () => {
    stoppers.delete(stop);
  };
}

export function stopAllSiteAudio() {
  playbackGeneration += 1;
  for (const stop of stoppers) {
    try {
      stop();
    } catch {
      // ignore stop errors
    }
  }
  return playbackGeneration;
}

/** Stop everything else and return a session token for this playback. */
export function beginSiteAudioPlayback() {
  return stopAllSiteAudio();
}

export function isSiteAudioPlaybackCurrent(session) {
  return session === playbackGeneration;
}

export function getSiteAudioPlaybackGeneration() {
  return playbackGeneration;
}
