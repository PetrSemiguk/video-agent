/** Duration from actual RIFF PCM WAV bytes; no manifest-duration shortcut. */
export const pcmWavInfo = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  const text = (offset: number, count: number) =>
    String.fromCharCode(...new Uint8Array(buffer, offset, count));
  if (buffer.byteLength < 12 || text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE")
    throw new Error("Episode audio must be a RIFF PCM WAV");
  const limit = view.getUint32(4, true) + 8;
  if (limit > buffer.byteLength) throw new Error("Truncated WAV RIFF payload");
  let sampleRate = 0,
    blockAlign = 0,
    channels = 0,
    dataBytes = 0;
  for (let offset = 12; offset + 8 <= limit; ) {
    const kind = text(offset, 4),
      bytes = view.getUint32(offset + 4, true),
      start = offset + 8;
    if (start + bytes > limit) throw new Error("Truncated WAV chunk");
    if (kind === "fmt ") {
      if (
        bytes < 16 ||
        view.getUint16(start, true) !== 1 ||
        view.getUint16(start + 14, true) !== 16
      )
        throw new Error("Episode requires PCM16 narration");
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      blockAlign = view.getUint16(start + 12, true);
      if (
        !channels ||
        !sampleRate ||
        blockAlign !== channels * 2 ||
        view.getUint32(start + 8, true) !== sampleRate * blockAlign
      )
        throw new Error("Invalid WAV format rates");
    }
    if (kind === "data") dataBytes += bytes;
    offset = start + bytes + (bytes % 2);
  }
  if (!sampleRate || channels !== 1 || !dataBytes || dataBytes % blockAlign)
    throw new Error("Expected nonempty mono PCM16 WAV");
  return {
    sampleRate,
    samples: dataBytes / blockAlign,
    duration: dataBytes / blockAlign / sampleRate,
  };
};
