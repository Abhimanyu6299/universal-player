import {
  FFmpeg
} from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm";

import {
  fetchFile,
  toBlobURL
} from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm";


let ffmpeg = null;

let loadingPromise = null;


/* ================= LOAD FFMPEG ================= */

export async function getFFmpeg(
  onProgress = () => {}
) {

  if (ffmpeg) {

    return ffmpeg;

  }


  if (loadingPromise) {

    return loadingPromise;

  }


  loadingPromise =
    (async () => {

      ffmpeg =
        new FFmpeg();


      ffmpeg.on(
        "progress",
        ({progress}) => {

          const percent =
            Math.max(
              0,
              Math.min(
                100,
                Math.round(
                  progress * 100
                )
              )
            );


          onProgress(
            percent
          );

        }
      );


      ffmpeg.on(
        "log",
        ({message}) => {

          console.log(
            "[FFmpeg]",
            message
          );

        }
      );


      const baseURL =
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";


      await ffmpeg.load({

        coreURL:
          await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript"
          ),

        wasmURL:
          await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm"
          )

      });


      return ffmpeg;

    })();


  try {

    return await loadingPromise;

  } catch(error) {

    ffmpeg =
      null;

    loadingPromise =
      null;

    throw error;

  }

}


/* ================= TRANSCODE VIDEO ================= */

export async function transcodeVideo(
  file,
  onProgress = () => {}
) {

  const engine =
    await getFFmpeg(
      onProgress
    );


  const extension =
    getExtension(
      file.name
    );


  const inputName =
    `input.${extension}`;


  const outputName =
    "output.mp4";


  try {

    await engine.writeFile(
      inputName,
      await fetchFile(file)
    );


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


    const data =
      await engine.readFile(
        outputName
      );


    return new Blob(
      [data.buffer],
      {
        type:"video/mp4"
      }
    );


  } finally {

    try {

      await engine.deleteFile(
        inputName
      );

    } catch {}


    try {

      await engine.deleteFile(
        outputName
      );

    } catch {}

  }

}


/* ================= EXTENSION ================= */

function getExtension(name) {

  const parts =
    String(name)
      .split(".");


  if (
    parts.length > 1
  ) {

    return parts
      .pop()
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        ""
      );

  }


  return "bin";

}
