import {
  transcodeVideo,
  getFFmpeg
} from "./ffmpeg-loader.js";

const video = document.getElementById("video");

const fileInput = document.getElementById("fileInput");
const urlInput = document.getElementById("urlInput");
const playUrlBtn = document.getElementById("playUrlBtn");

const playBtn = document.getElementById("playBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");

const progress = document.getElementById("progress");
const currentTime = document.getElementById("currentTime");
const duration = document.getElementById("duration");

const volume = document.getElementById("volume");
const muteBtn = document.getElementById("muteBtn");

const speed = document.getElementById("speed");
const aspect = document.getElementById("aspect");

const rotateBtn = document.getElementById("rotateBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");

const audioTracks = document.getElementById("audioTracks");
const subtitleTracks = document.getElementById("subtitleTracks");
const subtitleInput = document.getElementById("subtitleInput");
const subtitleSize = document.getElementById("subtitleSize");

const dropZone = document.getElementById("dropZone");
const playlist = document.getElementById("playlist");

const status = document.getElementById("status");

const ffmpegBox = document.getElementById("ffmpegBox");
const ffmpegProgress = document.getElementById("ffmpegProgress");
const ffmpegText = document.getElementById("ffmpegText");

let queue = [];
let currentIndex = -1;
let currentURL = null;
let currentFile = null;
let rotation = 0;

let subtitleURL = null;
let subtitleTrack = null;


/* ================= STATUS ================= */

function setStatus(text) {
  status.textContent = text;
}


/* ================= SPEED ================= */

for (let i = 25; i <= 400; i++) {

  const value = i / 100;

  const option = document.createElement("option");

  option.value = value;
  option.textContent = value.toFixed(2) + "×";

  speed.appendChild(option);
}

speed.value = "1";

speed.onchange = () => {
  video.playbackRate = Number(speed.value);
};


/* ================= PLAY ================= */

playBtn.onclick = () => {

  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
};

video.addEventListener("play", () => {
  playBtn.textContent = "⏸";
});

video.addEventListener("pause", () => {
  playBtn.textContent = "▶";
});


/* ================= SEEK ================= */

backBtn.onclick = () => {
  video.currentTime = Math.max(
    0,
    video.currentTime - 10
  );
};

forwardBtn.onclick = () => {
  video.currentTime = Math.min(
    video.duration || Infinity,
    video.currentTime + 10
  );
};


/* ================= PROGRESS ================= */

video.addEventListener("timeupdate", () => {

  if (!video.duration) return;

  progress.value =
    (video.currentTime / video.duration) * 100;

  currentTime.textContent =
    formatTime(video.currentTime);
});

video.addEventListener("loadedmetadata", () => {

  duration.textContent =
    formatTime(video.duration);

  detectAudioTracks();
});

progress.oninput = () => {

  if (!video.duration) return;

  video.currentTime =
    progress.value / 100 * video.duration;
};


/* ================= VOLUME ================= */

volume.oninput = () => {
  video.volume = Number(volume.value);
};

muteBtn.onclick = () => {

  video.muted = !video.muted;

  muteBtn.textContent =
    video.muted ? "🔇" : "🔊";
};


/* ================= ASPECT ================= */

aspect.onchange = () => {
  video.style.objectFit = aspect.value;
};


/* ================= ROTATE ================= */

rotateBtn.onclick = () => {

  rotation = (rotation + 90) % 360;

  video.style.transform =
    `rotate(${rotation}deg)`;
};


/* ================= FULLSCREEN ================= */

fullscreenBtn.onclick = async () => {

  try {

    if (!document.fullscreenElement) {

      await document.documentElement
        .requestFullscreen();

    } else {

      await document.exitFullscreen();

    }

  } catch (e) {
    console.log(e);
  }
};


/* ================= FILE INPUT ================= */

fileInput.onchange = () => {

  const files = [...fileInput.files];

  if (!files.length) return;

  addFiles(files);
};


/* ================= DRAG DROP ================= */

["dragenter","dragover"].forEach(event => {

  dropZone.addEventListener(event, e => {

    e.preventDefault();

    dropZone.classList.add("active");

  });
});

["dragleave","drop"].forEach(event => {

  dropZone.addEventListener(event, e => {

    e.preventDefault();

    dropZone.classList.remove("active");

  });
});

dropZone.addEventListener("drop", e => {

  const files =
    [...e.dataTransfer.files];

  addFiles(files);
});


/* ================= ADD FILES ================= */

function addFiles(files) {

  files.forEach(file => {

    queue.push({
      name: file.name,
      file,
      url: null
    });

  });

  renderPlaylist();

  if (currentIndex === -1) {

    playIndex(0);

  }
}


/* ================= PLAY INDEX ================= */

async function playIndex(index) {

  if (
    index < 0 ||
    index >= queue.length
  ) {
    return;
  }

  currentIndex = index;

  const item = queue[index];

  currentFile = item.file;

  if (currentURL) {

    URL.revokeObjectURL(currentURL);

    currentURL = null;
  }

  if (item.url) {

    currentURL = item.url;

  } else {

    currentURL =
      URL.createObjectURL(item.file);

    item.url = currentURL;
  }

  video.src = currentURL;

  video.load();

  setStatus(
    "Loading: " + item.name
  );

  video.play().catch(() => {});

  renderPlaylist();
}


/* ================= NEXT / PREVIOUS ================= */

nextBtn.onclick = () => {

  if (!queue.length) return;

  let next =
    currentIndex + 1;

  if (next >= queue.length) {
    next = 0;
  }

  playIndex(next);
};

prevBtn.onclick = () => {

  if (!queue.length) return;

  let previous =
    currentIndex - 1;

  if (previous < 0) {
    previous = queue.length - 1;
  }

  playIndex(previous);
};


/* ================= AUTO NEXT ================= */

video.addEventListener("ended", () => {

  if (!queue.length) return;

  let next =
    currentIndex + 1;

  if (next < queue.length) {
    playIndex(next);
  }
});


/* ================= PLAYLIST UI ================= */

function renderPlaylist() {

  playlist.innerHTML = "";

  queue.forEach((item, index) => {

    const row =
      document.createElement("div");

    row.className = "item";

    if (index === currentIndex) {
      row.classList.add("active");
    }

    const name =
      document.createElement("span");

    name.className = "item-name";

    name.textContent =
      `${index + 1}. ${item.name}`;

    const play =
      document.createElement("button");

    play.textContent = "▶";

    play.onclick = () => {
      playIndex(index);
    };

    const remove =
      document.createElement("button");

    remove.textContent = "✕";

    remove.onclick = () => {

      queue.splice(index, 1);

      if (index === currentIndex) {

        currentIndex = -1;

        video.removeAttribute("src");

      } else if (index < currentIndex) {

        currentIndex--;

      }

      renderPlaylist();
    };

    row.appendChild(name);
    row.appendChild(play);
    row.appendChild(remove);

    playlist.appendChild(row);
  });
}


/* ================= DIRECT URL ================= */

playUrlBtn.onclick = () => {

  const url =
    urlInput.value.trim();

  if (!url) {

    setStatus("URL enter karo.");

    return;
  }

  currentFile = null;

  video.src = url;

  video.load();

  setStatus(
    "Direct URL loading..."
  );

  video.play().catch(() => {});
};


/* ================= AUDIO TRACKS ================= */

function detectAudioTracks() {

  audioTracks.innerHTML = "";

  const defaultOption =
    document.createElement("option");

  defaultOption.value = "-1";
  defaultOption.textContent =
    "Default";

  audioTracks.appendChild(
    defaultOption
  );

  if (!video.audioTracks) {
    return;
  }

  for (
    let i = 0;
    i < video.audioTracks.length;
    i++
  ) {

    const track =
      video.audioTracks[i];

    const option =
      document.createElement("option");

    option.value = i;

    option.textContent =
      track.label ||
      track.language ||
      `Audio ${i + 1}`;

    audioTracks.appendChild(option);
  }
}

audioTracks.onchange = () => {

  if (!video.audioTracks) return;

  const selected =
    Number(audioTracks.value);

  for (
    let i = 0;
    i < video.audioTracks.length;
    i++
  ) {

    video.audioTracks[i].enabled =
      selected === -1
        ? i === 0
        : i === selected;
  }
};


/* ================= SUBTITLE FILE ================= */

subtitleInput.onchange = async () => {

  const file =
    subtitleInput.files?.[0];

  if (!file) return;

  if (subtitleURL) {
    URL.revokeObjectURL(subtitleURL);
  }

  let text =
    await file.text();

  if (
    file.name
      .toLowerCase()
      .endsWith(".srt")
  ) {

    text = convertSRT(text);
  }

  subtitleURL =
    URL.createObjectURL(
      new Blob(
        [text],
        { type: "text/vtt" }
      )
    );

  if (subtitleTrack) {
    subtitleTrack.remove();
  }

  subtitleTrack =
    document.createElement("track");

  subtitleTrack.kind =
    "subtitles";

  subtitleTrack.label =
    file.name;

  subtitleTrack.srclang =
    "en";

  subtitleTrack.src =
    subtitleURL;

  video.appendChild(
    subtitleTrack
  );

  subtitleTrack.track.mode =
    "showing";

  const option =
    document.createElement("option");

  option.value = "external";
  option.textContent =
    file.name;

  subtitleTracks.appendChild(
    option
  );

  subtitleTracks.value =
    "external";

  setStatus(
    "Subtitle loaded: " +
    file.name
  );
};


/* ================= SUBTITLE ON/OFF ================= */

subtitleTracks.onchange = () => {

  if (!video.textTracks) return;

  for (
    const track of video.textTracks
  ) {

    track.mode = "hidden";
  }

  if (
    subtitleTracks.value ===
    "external"
  ) {

    if (subtitleTrack?.track) {
      subtitleTrack.track.mode =
        "showing";
    }

    return;
  }

  const index =
    Number(subtitleTracks.value);

  if (
    index >= 0 &&
    video.textTracks[index]
  ) {

    video.textTracks[index].mode =
      "showing";
  }
};


/* ================= SUBTITLE SIZE ================= */

subtitleSize.onchange = () => {

  const size =
    subtitleSize.value;

  const style =
    document.getElementById(
      "subtitleStyle"
    );

  if (style) {
    style.remove();
  }

  const css =
    document.createElement("style");

  css.id =
    "subtitleStyle";

  css.textContent = `
    video::cue {
      font-size: ${size};
      background: rgba(0,0,0,.75);
      color: white;
    }
  `;

  document.head.appendChild(css);
};


/* ================= SRT -> VTT ================= */

function convertSRT(text) {

  let result =
    text.replace(/\r/g, "");

  result =
    result.replace(
      /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
      "$1.$2"
    );

  return "WEBVTT\n\n" + result;
}


/* ================= FFMPEG FALLBACK ================= */

video.addEventListener(
  "error",
  async () => {

    if (!currentFile) return;

    setStatus(
      "Unsupported format detected. FFmpeg starting..."
    );

    try {

      ffmpegBox.style.display =
        "block";

      ffmpegProgress.value = 0;
      ffmpegText.textContent =
        "0%";

      await getFFmpeg(
        value => {

          ffmpegProgress.value =
            value;

          ffmpegText.textContent =
            value + "%";

        }
      );

      const blob =
        await transcodeVideo(
          currentFile,
          value => {

            ffmpegProgress.value =
              value;

            ffmpegText.textContent =
              value + "%";

          }
        );

      if (currentURL) {
        URL.revokeObjectURL(
          currentURL
        );
      }

      currentURL =
        URL.createObjectURL(blob);

      video.src =
        currentURL;

      video.load();

      setStatus(
        "FFmpeg conversion complete."
      );

      video.play().catch(() => {});

      setTimeout(() => {
        ffmpegBox.style.display =
          "none";
      }, 1000);

    } catch (error) {

      console.error(error);

      ffmpegBox.style.display =
        "none";

      setStatus(
        "File could not be played."
      );
    }
  }
);


/* ================= KEYBOARD ================= */

document.addEventListener(
  "keydown",
  e => {

    const tag =
      document.activeElement?.tagName;

    if (
      tag === "INPUT" ||
      tag === "SELECT" ||
      tag === "TEXTAREA"
    ) return;

    switch (e.key) {

      case " ":
        e.preventDefault();
        playBtn.click();
        break;

      case "ArrowLeft":
        video.currentTime =
          Math.max(
            0,
            video.currentTime - 5
          );
        break;

      case "ArrowRight":
        video.currentTime =
          Math.min(
            video.duration || Infinity,
            video.currentTime + 5
          );
        break;

      case "ArrowUp":
        video.volume =
          Math.min(
            1,
            video.volume + .05
          );

        volume.value =
          video.volume;
        break;

      case "ArrowDown":
        video.volume =
          Math.max(
            0,
            video.volume - .05
          );

        volume.value =
          video.volume;
        break;

      case "f":
      case "F":
        fullscreenBtn.click();
        break;

      case "m":
      case "M":
        muteBtn.click();
        break;

      case "n":
      case "N":
        nextBtn.click();
        break;

      case "p":
      case "P":
        prevBtn.click();
        break;
    }
  }
);


/* ================= TIME ================= */

function formatTime(seconds) {

  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const h =
    Math.floor(seconds / 3600);

  const m =
    Math.floor(
      (seconds % 3600) / 60
    );

  const s =
    Math.floor(seconds % 60);

  if (h > 0) {

    return (
      String(h).padStart(2,"0") +
      ":" +
      String(m).padStart(2,"0") +
      ":" +
      String(s).padStart(2,"0")
    );

  }

  return (
    String(m).padStart(2,"0") +
    ":" +
    String(s).padStart(2,"0")
  );
}


/* ================= INITIAL ================= */

renderPlaylist();

setStatus("Ready");
