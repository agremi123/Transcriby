/**
 * Prompts the user to share a browser tab (with audio) and returns streams for transcription.
 */
export async function captureTabAudioStream() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Tab capture is not supported in this browser.');
  }

  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });

  displayStream.getVideoTracks().forEach((track) => track.stop());

  const audioTracks = displayStream.getAudioTracks();
  if (!audioTracks.length) {
    displayStream.getTracks().forEach((track) => track.stop());
    throw new Error('No tab audio. Choose a tab and enable “Share tab audio”.');
  }

  return {
    displayStream,
    stream: new MediaStream(audioTracks),
  };
}

export function releaseTabCapture(capture) {
  if (!capture) return;
  capture.displayStream?.getTracks().forEach((track) => track.stop());
  capture.stream?.getTracks().forEach((track) => track.stop());
}
