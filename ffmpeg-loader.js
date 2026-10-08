let instance = null;
let loading = null;
let progressHandler = () => {};

export async function getFFmpeg(onProgress = () => {}) {

  progressHandler = onProgress;

  if (instance) return instance;

  if (loading) return loading;

  loading = (async () => {

    const { FFmpeg } = await import(
      "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm"
    );

    const { fetchFile, toBlobURL } = await import(
      "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm"
    );

    const ffmpeg = new FFmpeg();

    ffmpeg.on("progress", ({ progress }) => {

      progressHandler(
        Math.max(
          0,
          Math.min(100, progress * 100)
        )
      );

    });

    const base =
      "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

    await ffmpeg.load({

      coreURL: await toBlobURL(
        `${base}/ffmpeg-core.js`,
        "text/javascript"
      ),

      wasmURL: await toBlobURL(
        `${base}/ffmpeg-core.wasm`,
        "application/wasm"
      )

    });

    instance = {
      ffmpeg,
      fetchFile
    };

    return instance;

  })();

  try {

    return await loading;

  } catch (e) {

    loading = null;

    throw e;

  }

}


export async function transcodeToMp4(
  file,
  onProgress = () => {}
) {

  const {
    ffmpeg,
    fetchFile
  } = await getFFmpeg(onProgress);

  const id =
    `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const input =
    `input_${id}`;

  const output =
    `output_${id}.mp4`;

  try {

    await ffmpeg.writeFile(
      input,
      await fetchFile(file)
    );

    await ffmpeg.exec([

      "-i",
      input,

      "-map",
      "0:v:0?",

      "-map",
      "0:a:0?",

      "-c:v",
      "libx264",

      "-preset",
      "veryfast",

      "-crf",
      "23",

      "-pix_fmt",
      "yuv420p",

      "-c:a",
      "aac",

      "-b:a",
      "160k",

      "-movflags",
      "+faststart",

      output

    ]);

    const data =
      await ffmpeg.readFile(output);

    return new Blob(
      [data.buffer],
      {
        type:"video/mp4"
      }
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


export async function extractAudioTracks(
  fileOrUrl,
  onProgress = () => {},
  onLog = () => {}
) {

  const {
    ffmpeg,
    fetchFile
  } = await getFFmpeg(onProgress);

  const id =
    `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const input =
    `input_${id}`;

  const logs = [];

  const logFn = ({ message }) => {

    logs.push(message);

    onLog(message);

  };

  ffmpeg.on("log", logFn);

  try {

    const data =
      await fetchFile(fileOrUrl);

    await ffmpeg.writeFile(
      input,
      data
    );

    try {

      await ffmpeg.exec([
        "-hide_banner",
        "-i",
        input
      ]);

    } catch {}

    const joined =
      logs.join("\n");

    const tracks = [];

    const re =
      /Stream #0:(\d+)(?:\(([^)]+)\))?(?:\[[^\]]+\])?:\s*Audio:/gi;

    let m;

    while ((m = re.exec(joined))) {

      const streamIndex =
        Number(m[1]);

      const language =
        m[2] || "";

      if (
        !tracks.some(
          t =>
            t.streamIndex === streamIndex
        )
      ) {

        tracks.push({

          streamIndex,

          language,

          label:
            language ||
            `Audio ${tracks.length + 1}`

        });

      }

    }

    if (!tracks.length) {

      throw new Error(
        "No separate audio streams detected."
      );

    }

    const outputs = [];

    for (
      let i = 0;
      i < tracks.length;
      i++
    ) {

      const out =
        `audio_${id}_${i}.m4a`;

      await ffmpeg.exec([

        "-i",
        input,

        "-map",
        `0:${tracks[i].streamIndex}`,

        "-vn",

        "-c:a",
        "aac",

        "-b:a",
        "192k",

        "-movflags",
        "+faststart",

        out

      ]);

      const audioData =
        await ffmpeg.readFile(out);

      outputs.push({

        ...tracks[i],

        blob:
          new Blob(
            [audioData.buffer],
            {
              type:"audio/mp4"
            }
          )

      });

      try {
        await ffmpeg.deleteFile(out);
      } catch {}

    }

    return outputs;

  } finally {

    ffmpeg.off("log", logFn);

    try {
      await ffmpeg.deleteFile(input);
    } catch {}

  }

}
