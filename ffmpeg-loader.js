import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm";
import {
  fetchFile,
  toBlobURL
} from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm";

let ffmpeg = null;
let loading = null;

export async function getFFmpeg(onProgress = () => {}) {
  if (ffmpeg) return ffmpeg;

  if (loading) return loading;

  loading = (async () => {
    ffmpeg = new FFmpeg();

    ffmpeg.on("progress", ({ progress }) => {
      onProgress(Math.round(progress * 100));
    });

    ffmpeg.on("log", ({ message }) => {
      console.log("[FFmpeg]", message);
    });

    const baseURL =
      "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";

    await ffmpeg.load({
      coreURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        "text/javascript"
      ),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      )
    });

    return ffmpeg;
  })();

  return loading;
}

export async function transcodeVideo(file, onProgress = () => {}) {
  const engine = await getFFmpeg(onProgress);

  const inputName = "input." + getExtension(file.name);
  const outputName = "output.mp4";

  await engine.writeFile(inputName, await fetchFile(file));

  await engine.exec([
    "-i",
    inputName,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputName
  ]);

  const data = await engine.readFile(outputName);

  await engine.deleteFile(inputName);
  await engine.deleteFile(outputName);

  return new Blob([data.buffer], {
    type: "video/mp4"
  });
}

function getExtension(name) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "bin";
}
