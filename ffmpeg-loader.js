let ffmpegInstance = null;
let loadingPromise = null;

export async function getFFmpeg(onProgress = () => {}) {
  if (ffmpegInstance) return ffmpegInstance;

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const { FFmpeg } =
      await import(
        "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm"
      );

    const { fetchFile, toBlobURL } =
      await import(
        "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm"
      );

    const ffmpeg = new FFmpeg();

    ffmpeg.on("progress", ({ progress }) => {
      onProgress(
        Math.max(0, Math.min(100, progress * 100))
      );
    });

    const base =
      "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";

    const coreURL =
      await toBlobURL(
        `${base}/ffmpeg-core.js`,
        "text/javascript"
      );

    const wasmURL =
      await toBlobURL(
        `${base}/ffmpeg-core.wasm`,
        "application/wasm"
      );

    await ffmpeg.load({
      coreURL,
      wasmURL
    });

    ffmpegInstance = {
      ffmpeg,
      fetchFile
    };

    return ffmpegInstance;
  })();

  try {
    return await loadingPromise;
  } catch (e) {
    loadingPromise = null;
    throw e;
  }
}

export async function transcodeToMp4(
  file,
  onProgress = () => {},
  signal
) {
  if (signal?.aborted) {
    throw new DOMException("Cancelled", "AbortError");
  }

  const { ffmpeg, fetchFile } =
    await getFFmpeg(onProgress);

  const id =
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;

  const input = `input_${id}`;
  const output = `output_${id}.mp4`;

  try {
    const data = await fetchFile(file);

    await ffmpeg.writeFile(input, data);

    if (signal?.aborted) {
      throw new DOMException("Cancelled", "AbortError");
    }

    await ffmpeg.exec([
      "-i", input,

      "-map", "0:v:0?",
      "-map", "0:a:0?",

      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",

      "-c:a", "aac",
      "-b:a", "160k",

      "-movflags", "+faststart",

      output
    ]);

    if (signal?.aborted) {
      throw new DOMException("Cancelled", "AbortError");
    }

    const result =
      await ffmpeg.readFile(output);

    return new Blob(
      [result],
      { type: "video/mp4" }
    );

  } finally {
    try {
      await ffmpeg.deleteFile(input);
    } catch {}

    try {
      await ffmpeg.deleteFile(output);
    } catch {}
  }
}
