import { transcodeVideo, getFFmpeg } from "./ffmpeg-loader.js";

const video = document.getElementById("video");
const player = document.getElementById("player");

const fileInput = document.getElementById("fileInput");
const urlInput = document.getElementById("urlInput");
const playUrlBtn = document.getElementById("playUrlBtn");

const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
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
const pipBtn = document.getElementById("pipBtn");

const lockBtn = document.getElementById("lockBtn");
const repeatMode = document.getElementById("repeatMode");
const shuffleBtn = document.getElementById("shuffleBtn");

const audioTracks = document.getElementById("audioTracks");
const subtitleTracks = document.getElementById("subtitleTracks");
const subtitleInput = document.getElementById("subtitleInput");
const subtitleSize = document.getElementById("subtitleSize");

const dropZone = document.getElementById("dropZone");
const playlist = document.getElementById("playlist");
const status = document.getElementById("status");

const videoMessage = document.getElementById("videoMessage");

const ffmpegBox = document.getElementById("ffmpegBox");
const ffmpegProgress = document.getElementById("ffmpegProgress");
const ffmpegText = document.getElementById("ffmpegText");

let queue = [];
let currentIndex = -1;

let currentURL = null;
let currentFile = null;

let rotation = 0;
let shuffleEnabled = false;
let screenLocked = false;
let isTranscoding = false;

let subtitleURL = null;
let subtitleTrackElement = null;

let lastTap = 0;
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

const resumePositions = JSON.parse(
  localStorage.getItem("vp_resume_positions") || "{}"
);


/* SPEED 0.25 - 4.00 */

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


/* STATUS */

function setStatus(message) {
  status.textContent = message;
}


/* MESSAGE */

function showMessage(text) {
  videoMessage.textContent = text;
  videoMessage.style.display = "block";

  clearTimeout(showMessage.timer);

  showMessage.timer = setTimeout(() => {
    videoMessage.style.display = "none";
  }, 700);
}


/* PLAY */

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


/* STOP */

stopBtn.onclick = () => {
  video.pause();
  video.currentTime = 0;
  progress.value = 0;
  currentTime.textContent = "00:00";
  setStatus("Stopped");
};


/* SEEK */

backBtn.onclick = () => {
  video.currentTime = Math.max(0, video.currentTime - 10);
  showMessage("⏪ -10");
};

forwardBtn.onclick = () => {
  video.currentTime = Math.min(
    video.duration || Infinity,
    video.currentTime + 10
  );
  showMessage("⏩ +10");
};


/* PROGRESS */

video.addEventListener("timeupdate", () => {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    progress.value = (video.currentTime / video.duration) * 100;
  }

  currentTime.textContent = formatTime(video.currentTime);
  saveResumePosition();
});

video.addEventListener("loadedmetadata", () => {
  duration.textContent = formatTime(video.duration);
  detectAudioTracks();
  restoreResumePosition();
});

progress.oninput = () => {
  if (!video.duration) return;

  video.currentTime =
    Number(progress.value) / 100 * video.duration;
};


/* VOLUME */

volume.oninput = () => {
  video.volume = Number(volume.value);
  video.muted = false;
  muteBtn.textContent = "🔊";
};

muteBtn.onclick = () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "🔇" : "🔊";
};


/* ASPECT */

aspect.onchange = () => {
  video.style.objectFit = aspect.value;
};


/* ROTATE */

rotateBtn.onclick = () => {
  rotation = (rotation + 90) % 360;
  video.style.transform = `rotate(${rotation}deg)`;
};


/* FULLSCREEN */

fullscreenBtn.onclick = async () => {
  try {
    if (!document.fullscreenElement) {
      await player.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.error(error);
  }
};

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) {
    video.style.maxHeight = "100vh";
    document.body.style.overflow = "hidden";
  } else {
    video.style.maxHeight = "76vh";
    document.body.style.overflow = "";
  }
});


/* PIP */

pipBtn.onclick = async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }

    if (
      document.pictureInPictureEnabled &&
      video.requestPictureInPicture
    ) {
      await video.requestPictureInPicture();
    } else {
      setStatus("Picture-in-Picture not supported.");
    }
  } catch (error) {
    console.error(error);
  }
};


/* FILE INPUT */

fileInput.onchange = () => {
  const files = [...fileInput.files];

  if (files.length) {
    addFiles(files);
  }
};


/* DRAG DROP */

["dragenter", "dragover"].forEach(eventName => {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.add("active");
  });
});

["dragleave", "drop"].forEach(eventName => {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.remove("active");
  });
});

dropZone.addEventListener("drop", event => {
  const files = [...event.dataTransfer.files];

  if (files.length) {
    addFiles(files);
  }
});


/* ADD FILES */

function addFiles(files) {
  files.forEach(file => {
    queue.push({
      name: file.name,
      file: file,
      url: null
    });
  });

  renderPlaylist();

  if (currentIndex === -1) {
    playIndex(0);
  } else {
    setStatus(`${files.length} file(s) added.`);
  }
}


/* PLAY INDEX */

async function playIndex(index) {
  if (index < 0 || index >= queue.length) return;

  currentIndex = index;

  const item = queue[index];

  currentFile = item.file || null;

  if (currentURL && currentURL.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(currentURL);
    } catch {}
  }

  if (item.file) {
    currentURL = URL.createObjectURL(item.file);
  } else {
    currentURL = item.url;
  }

  if (!currentURL) {
    setStatus("Unable to load media.");
    return;
  }

  video.src = currentURL;
  video.load();

  video.playbackRate = Number(speed.value);

  renderPlaylist();

  setStatus("Loading: " + item.name);

  try {
    await video.play();
  } catch {}
}


/* NEXT */

nextBtn.onclick = () => {
  playNextSmart();
};


/* PREVIOUS */

prevBtn.onclick = () => {
  if (!queue.length) return;

  let index = currentIndex - 1;

  if (index < 0) {
    index = queue.length - 1;
  }

  playIndex(index);
};


/* NEXT SMART */

function playNextSmart() {
  if (!queue.length) return;

  if (repeatMode.value === "one") {
    video.currentTime = 0;
    video.play().catch(() => {});
    return;
  }

  if (shuffleEnabled && queue.length > 1) {
    let next;

    do {
      next = Math.floor(Math.random() * queue.length);
    } while (next === currentIndex);

    playIndex(next);
    return;
  }

  const next = currentIndex + 1;

  if (next < queue.length) {
    playIndex(next);
    return;
  }

  if (repeatMode.value === "all") {
    playIndex(0);
    return;
  }

  setStatus("Playlist finished.");
}


/* ENDED */

video.addEventListener("ended", () => {
  playNextSmart();
});


/* PLAYLIST */

function renderPlaylist() {
  playlist.innerHTML = "";

  queue.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "item";

    if (index === currentIndex) {
      row.classList.add("active");
    }

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = `${index + 1}. ${item.name}`;

    const play = document.createElement("button");
    play.textContent = "▶";

    play.onclick = () => {
      playIndex(index);
    };

    const remove = document.createElement("button");
    remove.textContent = "✕";

    remove.onclick = () => {
      queue.splice(index, 1);

      if (index === currentIndex) {
        currentIndex = -1;

        video.pause();
        video.removeAttribute("src");
        video.load();

        if (queue.length) {
          playIndex(Math.min(index, queue.length - 1));
        }
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


/* DIRECT URL */

playUrlBtn.onclick = () => {
  const url = urlInput.value.trim();

  if (!url) {
    setStatus("Video URL enter karo.");
    return;
  }

  currentFile = null;
  currentIndex = -1;

  if (currentURL && currentURL.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(currentURL);
    } catch {}
  }

  currentURL = url;

  video.src = url;
  video.load();

  setStatus("Direct URL loading...");

  video.play().catch(() => {});
};


/* AUDIO TRACKS */

function detectAudioTracks() {
  audioTracks.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "-1";
  defaultOption.textContent = "Default";

  audioTracks.appendChild(defaultOption);

  if (!video.audioTracks) return;

  for (let i = 0; i < video.audioTracks.length; i++) {
    const track = video.audioTracks[i];

    const option = document.createElement("option");

    option.value = String(i);

    option.textContent =
      track.label ||
      track.language ||
      `Audio ${i + 1}`;

    audioTracks.appendChild(option);
  }
}

audioTracks.onchange = () => {
  if (!video.audioTracks) return;

  const selected = Number(audioTracks.value);

  for (let i = 0; i < video.audioTracks.length; i++) {
    video.audioTracks[i].enabled =
      selected === -1
        ? i === 0
        : i === selected;
  }
};


/* SUBTITLE */

subtitleInput.onchange = async () => {
  const file = subtitleInput.files?.[0];

  if (!file) return;

  if (subtitleURL) {
    URL.revokeObjectURL(subtitleURL);
  }

  let text = await file.text();

  if (file.name.toLowerCase().endsWith(".srt")) {
    text = convertSRT(text);
  }

  subtitleURL = URL.createObjectURL(
    new Blob([text], {
      type: "text/vtt"
    })
  );

  if (subtitleTrackElement) {
    subtitleTrackElement.remove();
  }

  subtitleTrackElement =
    document.createElement("track");

  subtitleTrackElement.kind = "subtitles";
  subtitleTrackElement.label = file.name;
  subtitleTrackElement.srclang = "en";
  subtitleTrackElement.src = subtitleURL;

  video.appendChild(subtitleTrackElement);

  subtitleTrackElement.track.mode = "showing";

  let option = [...subtitleTracks.options]
    .find(x => x.value === "external");

  if (!option) {
    option = document.createElement("option");
    option.value = "external";
    option.textContent = file.name;
    subtitleTracks.appendChild(option);
  }

  subtitleTracks.value = "external";

  setStatus("Subtitle loaded: " + file.name);
};


/* SUBTITLE SELECT */

subtitleTracks.onchange = () => {
  if (!video.textTracks) return;

  for (const track of video.textTracks) {
    track.mode = "hidden";
  }

  if (subtitleTracks.value === "external") {
    if (subtitleTrackElement?.track) {
      subtitleTrackElement.track.mode = "showing";
    }
  }
};


/* SUBTITLE SIZE */

subtitleSize.onchange = () => {
  let style = document.getElementById("subtitleStyle");

  if (style) style.remove();

  style = document.createElement("style");
  style.id = "subtitleStyle";

  style.textContent = `
    video::cue {
      font-size:${subtitleSize.value};
      background:rgba(0,0,0,.75);
      color:white;
    }
  `;

  document.head.appendChild(style);
};


/* SRT TO VTT */

function convertSRT(text) {
  return "WEBVTT\n\n" +
    text
      .replace(/\r/g, "")
      .replace(
        /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
        "$1.$2"
      );
}


/* SHUFFLE */

shuffleBtn.onclick = () => {
  shuffleEnabled = !shuffleEnabled;

  shuffleBtn.textContent =
    shuffleEnabled
      ? "🔀 Shuffle ON"
      : "🔀 Shuffle";

  setStatus(
    shuffleEnabled
      ? "Shuffle enabled."
      : "Shuffle disabled."
  );
};


/* RESUME */

function resumeKey(item) {
  if (!item) return null;

  if (item.file) {
    return [
      item.name,
      item.file.size,
      item.file.lastModified
    ].join("_");
  }

  return item.url || item.name || null;
}

function saveResumePosition() {
  if (
    currentIndex < 0 ||
    !queue[currentIndex]
  ) {
    return;
  }

  const key = resumeKey(queue[currentIndex]);

  if (!key) return;

  resumePositions[key] = video.currentTime;

  localStorage.setItem(
    "vp_resume_positions",
    JSON.stringify(resumePositions)
  );
}

function restoreResumePosition() {
  if (
    currentIndex < 0 ||
    !queue[currentIndex]
  ) {
    return;
  }

  const key = resumeKey(queue[currentIndex]);

  const saved = resumePositions[key];

  if (
    Number.isFinite(saved) &&
    saved > 5 &&
    Number.isFinite(video.duration) &&
    saved < video.duration - 5
  ) {
    video.currentTime = saved;

    setStatus(
      "Resumed from " + formatTime(saved)
    );
  }
}


/* MOBILE DOUBLE TAP */

video.addEventListener("touchend", event => {
  if (screenLocked) return;

  const now = Date.now();
  const difference = now - lastTap;

  const touch = event.changedTouches[0];

  const x = touch.clientX;
  const width = video.clientWidth;

  if (difference < 300) {
    if (x < width / 2) {
      video.currentTime =
        Math.max(0, video.currentTime - 10);

      showMessage("⏪ -10");
    } else {
      video.currentTime =
        Math.min(
          video.duration || Infinity,
          video.currentTime + 10
        );

      showMessage("⏩ +10");
    }
  }

  lastTap = now;
});


/* TOUCH SEEK */

video.addEventListener(
  "touchstart",
  event => {
    if (screenLocked) return;

    const touch = event.touches[0];

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = video.currentTime;
  },
  { passive: true }
);

video.addEventListener(
  "touchmove",
  event => {
    if (screenLocked) return;

    const touch = event.touches[0];

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    if (
      Math.abs(dx) >
      Math.abs(dy) &&
      Math.abs(dx) > 20
    ) {
      const seek =
        dx / video.clientWidth * 60;

      video.currentTime =
        Math.max(
          0,
          Math.min(
            video.duration || Infinity,
            touchStartTime + seek
          )
        );

      showMessage(
        "⏩ " +
        (seek >= 0 ? "+" : "") +
        Math.round(seek) +
        "s"
      );
    }
  },
  { passive: true }
);


/* DESKTOP DOUBLE CLICK */

video.addEventListener("dblclick", event => {
  if (screenLocked) return;

  const rect = video.getBoundingClientRect();

  const x = event.clientX - rect.left;

  if (x < rect.width / 2) {
    video.currentTime =
      Math.max(0, video.currentTime - 10);

    showMessage("⏪ -10");
  } else {
    video.currentTime =
      Math.min(
        video.duration || Infinity,
        video.currentTime + 10
      );

    showMessage("⏩ +10");
  }
});


/* LOCK */

lockBtn.onclick = () => {
  screenLocked = !screenLocked;

  if (screenLocked) {
    lockBtn.textContent = "🔓 Unlock";
    player.classList.add("locked");
    setStatus("Controls locked.");
  } else {
    lockBtn.textContent = "🔒 Lock";
    player.classList.remove("locked");
    setStatus("Controls unlocked.");
  }
};


/* KEYBOARD */

document.addEventListener("keydown", event => {
  if (screenLocked) return;

  const tag = document.activeElement?.tagName;

  if (
    tag === "INPUT" ||
    tag === "SELECT" ||
    tag === "TEXTAREA"
  ) {
    return;
  }

  switch (event.key) {

    case " ":
      event.preventDefault();
      playBtn.click();
      break;

    case "ArrowLeft":
      video.currentTime =
        Math.max(0, video.currentTime - 5);
      showMessage("⏪ -5");
      break;

    case "ArrowRight":
      video.currentTime =
        Math.min(
          video.duration || Infinity,
          video.currentTime + 5
        );
      showMessage("⏩ +5");
      break;

    case "ArrowUp":
      video.volume =
        Math.min(1, video.volume + .05);
      volume.value = video.volume;
      break;

    case "ArrowDown":
      video.volume =
        Math.max(0, video.volume - .05);
      volume.value = video.volume;
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

    case "l":
    case "L":
      lockBtn.click();
      break;
  }
});


/* FFMPEG FALLBACK */

video.addEventListener("error", async () => {

  if (!currentFile || isTranscoding) {
    setStatus("Unable to play this media.");
    return;
  }

  isTranscoding = true;

  setStatus(
    "Browser cannot play this file. Starting FFmpeg..."
  );

  ffmpegBox.style.display = "block";
  ffmpegProgress.value = 0;
  ffmpegText.textContent = "0%";

  try {

    await getFFmpeg(percent => {
      ffmpegProgress.value = percent;
      ffmpegText.textContent = percent + "%";
    });

    const blob = await transcodeVideo(
      currentFile,
      percent => {
        ffmpegProgress.value = percent;
        ffmpegText.textContent = percent + "%";
      }
    );

    if (currentURL?.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(currentURL);
      } catch {}
    }

    currentURL =
      URL.createObjectURL(blob);

    video.src = currentURL;
    video.load();

    setStatus("FFmpeg conversion complete.");

    video.play().catch(() => {});

    setTimeout(() => {
      ffmpegBox.style.display = "none";
    }, 1000);

  } catch (error) {

    console.error(error);

    ffmpegBox.style.display = "none";

    setStatus(
      "This file could not be played."
    );

  } finally {
    isTranscoding = false;
  }
});


/* FORMAT TIME */

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const hours =
    Math.floor(seconds / 3600);

  const minutes =
    Math.floor((seconds % 3600) / 60);

  const secs =
    Math.floor(seconds % 60);

  if (hours > 0) {
    return (
      String(hours).padStart(2, "0") +
      ":" +
      String(minutes).padStart(2, "0") +
      ":" +
      String(secs).padStart(2, "0")
    );
  }

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0")
  );
}


renderPlaylist();
setStatus("Ready");
