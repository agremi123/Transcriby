/**
 * AudioWorkletProcessor — runs on the audio rendering thread.
 * Converts Float32 microphone samples to Int16 PCM and posts the buffer
 * back to the main thread so it can be forwarded to Speechmatics.
 */
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0]; // Float32Array, one channel
    const int16 = new Int16Array(channelData.length);

    for (let i = 0; i < channelData.length; i++) {
      // Clamp to [-1, 1] then scale to Int16 range
      const s = Math.max(-1, Math.min(1, channelData[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Transfer the underlying ArrayBuffer to avoid copying
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
