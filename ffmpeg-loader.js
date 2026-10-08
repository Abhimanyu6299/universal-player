let ffmpegInstance=null;
let loadingPromise=null;

export async function getFFmpeg(
  onProgress=()=>{}
){

  if(ffmpegInstance){

    ffmpegInstance.progressCallback=
      onProgress;

    return ffmpegInstance;
  }

  if(loadingPromise)
    return loadingPromise;

  loadingPromise=(async()=>{

    const {FFmpeg}=await import(
      "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm"
    );

    const {
      fetchFile,
      toBlobURL
    }=await import(
      "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm"
    );

    const ffmpeg=new FFmpeg();

    const state={
      ffmpeg,
      fetchFile,
      progressCallback:onProgress
    };

    ffmpeg.on(
      "progress",
      ({progress})=>{

        state.progressCallback(
          Math.max(
            0,
            Math.min(
              100,
              progress*100
            )
          )
        );
      }
    );

    const base=
      "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

    const coreURL=
      await toBlobURL(
        `${base}/ffmpeg-core.js`,
        "text/javascript"
      );

    const wasmURL=
      await toBlobURL(
        `${base}/ffmpeg-core.wasm`,
        "application/wasm"
      );

    await ffmpeg.load({
      coreURL,
      wasmURL
    });

    ffmpegInstance=state;

    return state;

  })();

  try{

    return await loadingPromise;

  }catch(error){

    loadingPromise=null;

    throw error;
  }
}

/* --------------------------------------------------
   LOCAL MEDIA -> MP4
-------------------------------------------------- */

export async function transcodeToMp4(
  file,
  onProgress=()=>{},
  shouldCancel=()=>false
){

  const {
    ffmpeg,
    fetchFile,
    progressCallback
  }=await getFFmpeg(onProgress);

  progressCallback=onProgress;

  const id=
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;

  const input=
    `input_${id}`;

  const output=
    `output_${id}.mp4`;

  try{

    if(shouldCancel())
      throw new DOMException(
        "Cancelled",
        "AbortError"
      );

    const data=
      await fetchFile(file);

    await ffmpeg.writeFile(
      input,
      data
    );

    if(shouldCancel())
      throw new DOMException(
        "Cancelled",
        "AbortError"
      );

    await ffmpeg.exec([

      "-hide_banner",

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

    if(shouldCancel())
      throw new DOMException(
        "Cancelled",
        "AbortError"
      );

    const result=
      await ffmpeg.readFile(output);

    return new Blob(
      [result.buffer],
      {
        type:"video/mp4"
      }
    );

  }finally{

    try{
      await ffmpeg.deleteFile(input);
    }catch{}

    try{
      await ffmpeg.deleteFile(output);
    }catch{}
  }
}

/* --------------------------------------------------
   EXTRACT MULTIPLE AUDIO TRACKS
-------------------------------------------------- */

export async function extractAudioTracks(
  file,
  onProgress=()=>{}
){

  const {
    ffmpeg,
    fetchFile
  }=await getFFmpeg(onProgress);

  const id=
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;

  const input=
    `audio_input_${id}`;

  const logLines=[];

  const logHandler=({message})=>{
    logLines.push(message);
  };

  ffmpeg.on(
    "log",
    logHandler
  );

  try{

    const data=
      await fetchFile(file);

    await ffmpeg.writeFile(
      input,
      data
    );

    /*
      Ask FFmpeg to inspect streams.
    */

    try{

      await ffmpeg.exec([
        "-hide_banner",
        "-i",
        input
      ]);

    }catch{}

    const text=
      logLines.join("\n");

    const tracks=[];

    /*
      Detect audio streams.
    */

    const regex=
      /Stream #0:(\d+)(?:\(([^)]+)\))?.*?: Audio:/gi;

    let match;

    while(
      (match=regex.exec(text))
    ){

      const streamIndex=
        Number(match[1]);

      const language=
        match[2]||"";

      if(
        !tracks.some(
          t=>t.streamIndex===streamIndex
        )
      ){

        tracks.push({
          streamIndex,
          language,
          label:
            language||
            `Audio ${tracks.length+1}`
        });
      }
    }

    if(!tracks.length){

      throw new Error(
        "No separate audio streams detected."
      );
    }

    const outputs=[];

    for(
      let i=0;
      i<tracks.length;
      i++
    ){

      const track=
        tracks[i];

      const output=
        `audio_${id}_${i}.m4a`;

      await ffmpeg.exec([

        "-hide_banner",

        "-i",
        input,

        "-map",
        `0:${track.streamIndex}`,

        "-vn",

        "-c:a",
        "aac",

        "-b:a",
        "192k",

        "-movflags",
        "+faststart",

        output

      ]);

      const audioData=
        await ffmpeg.readFile(
          output
        );

      outputs.push({

        ...track,

        blob:new Blob(
          [audioData.buffer],
          {
            type:"audio/mp4"
          }
        )

      });

      try{
        await ffmpeg.deleteFile(
          output
        );
      }catch{}

      onProgress(
        ((i+1)/tracks.length)*100
      );
    }

    return outputs;

  }finally{

    ffmpeg.off(
      "log",
      logHandler
    );

    try{
      await ffmpeg.deleteFile(
        input
      );
    }catch{}
  }
}
