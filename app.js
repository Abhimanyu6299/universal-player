import {
  transcodeVideo,
  getFFmpeg
} from "./ffmpeg-loader.js";

const video = document.getElementById("video");
const fileInput = document.getElementById("fileInput");
const urlInput = document.getElementById("urlInput");

const playBtn = document.getElementById("playBtn");
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

const playUrlBtn = document.getElementById("playUrlBtn");
const historyList = document.getElementById("historyList");

const status = document.getElementById("status");
const progressBox = document.getElementById("ffmpegProgressBox");
const ffmpegProgress = document.getElementById("ffmpegProgress");

let currentFile = null;
let currentURL = null;
let rotation = 0;
let history = JSON.parse(localStorage.getItem("vp_history") || "[]");

function showStatus(message) {
  if (status) status.textContent = message;
}

function setFFmpegProgress(value) {
  if (!progressBox || !ffmpegProgress) return;

  progressBox.style.display = "block";
  ffmpegProgress.value = value;

  if (value >= 100) {
    setTimeout(() => {
      progressBox.style.display = "none";
    }, 500);
  }
}

/* ---------------- PLAY / PAUSE ---------------- */

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

/* ---------------- SEEK ---------------- */

backBtn.onclick = () => {
  video.currentTime = Math.max(0, video.currentTime - 10);
};

forwardBtn.onclick = () => {
  video.currentTime = Math.min(
    video.duration || Infinity,
    video.currentTime + 10
  );
};

/* ---------------- PROGRESS ---------------- */

video.addEventListener("timeupdate", () => {
  if (!video.duration) return;

  progress.value =
    (video.currentTime / video.duration) * 100;

  currentTime.textContent = formatTime(video.currentTime);

  saveCurrentPosition();
});

video.addEventListener("loadedmetadata", () => {
  duration.textContent = formatTime(video.duration);
});

progress.oninput = () => {
  if (!video.duration) return;

  video.currentTime =
    (progress.value / 100) * video.duration;
};

/* ---------------- VOLUME ---------------- */

volume.oninput = () => {
  video.volume = Number(volume.value);
};

muteBtn.onclick = () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "🔇" : "🔊";
};

/* ---------------- SPEED ---------------- */

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

/* ---------------- ASPECT ---------------- */

aspect.onchange = () => {
  video.style.objectFit = aspect.value;
};

/* ---------------- ROTATION ---------------- */

rotateBtn.onclick = () => {
  rotation = (rotation + 90) % 360;

  video.style.transform = `rotate(${rotation}deg)`;
};

/* ---------------- FULLSCREEN ---------------- */

fullscreenBtn.onclick = async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    console.log(e);
  }
};

/* ---------------- LOCAL FILE ---------------- */

fileInput.onchange = async () => {
  const file = fileInput.files?.[0];

  if (!file) return;

  currentFile = file;

  if (currentURL) {
    URL.revokeObjectURL(currentURL);
  }

  currentURL = URL.createObjectURL(file);

  video.src = currentURL;

  showStatus("Video loading...");

  video.load();

  video.play().catch(() => {});

  addHistory(file.name, currentURL);
};

/* ---------------- NATIVE PLAYBACK ERROR ---------------- */

video.addEventListener("error", async () => {
  if (!currentFile) return;

  showStatus(
    "Browser ne file ko directly play nahi kiya. FFmpeg fallback start ho raha hai..."
  );

  try {
    setFFmpegProgress(0);

    await getFFmpeg(setFFmpegProgress);

    showStatus("FFmpeg engine loaded. Converting...");

    const blob = await transcodeVideo(
      currentFile,
      setFFmpegProgress
    );

    if (currentURL) {
      URL.revokeObjectURL(currentURL);
    }

    currentURL = URL.createObjectURL(blob);

    video.src = currentURL;

    video.load();

    showStatus("FFmpeg conversion complete.");

    video.play().catch(() => {});
  } catch (error) {
    console.error(error);

    showStatus(
      "Ye file browser/FFmpeg se play nahi ho paayi."
    );
  }
});

/* ---------------- DIRECT URL ---------------- */

playUrlBtn.onclick = () => {
  const url = urlInput.value.trim();

  if (!url) {
    showStatus("Video URL enter karo.");
    return;
  }

  currentFile = null;

  if (currentURL) {
    URL.revokeObjectURL(currentURL);
    currentURL = null;
  }

  video.src = url;
  video.load();

  showStatus(
    "Direct URL load ho raha hai. Server CORS allow karta hona chahiye."
  );

  video.play().catch(() => {});

  addHistory(url, url);
};

/* ---------------- HISTORY ---------------- */

function addHistory(name, src) {
  history = history.filter(item => item.src !== src);

  history.unshift({
    name,
    src,
    position: 0,
    time: Date.now()
  });

  history = history.slice(0, 50);

  localStorage.setItem(
    "vp_history",
    JSON.stringify(history)
  );

  renderHistory();
}

function renderHistory() {
  if (!historyList) return;

  historyList.innerHTML = "";

  history.forEach((item, index) => {
    const row = document.createElement("div");

    row.className = "history-item";

    row.innerHTML = `
      <span>${escapeHTML(item.name)}</span>
      <button data-index="${index}">▶</button>
    `;

    row.querySelector("button").onclick = () => {
      playHistoryItem(item);
    };

    historyList.appendChild(row);
  });
}

function playHistoryItem(item) {
  currentFile = null;

  video.src = item.src;

  video.addEventListener(
    "loadedmetadata",
    function restorePosition() {
      if (item.position) {
        video.currentTime = item.position;
      }

      video.removeEventListener(
        "loadedmetadata",
        restorePosition
      );
    }
  );

  video.load();

  video.play().catch(() => {});
}

/* ---------------- SAVE POSITION ---------------- */

function saveCurrentPosition() {
  if (!video.src) return;

  const index = history.findIndex(
    item => item.src === video.src
  );

  if (index === -1) return;

  history[index].position = video.currentTime;

  localStorage.setItem(
    "vp_history",
    JSON.stringify(history)
  );
}

/* ---------------- KEYBOARD ---------------- */

document.addEventListener("keydown", event => {
  const tag = document.activeElement?.tagName;

  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT"
  ) {
    return;
  }

  switch (event.key) {
    case " ":
      event.preventDefault();

      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      break;

    case "ArrowLeft":
      video.currentTime = Math.max(
        0,
        video.currentTime - 5
      );
      break;

    case "ArrowRight":
      video.currentTime = Math.min(
        video.duration || Infinity,
        video.currentTime + 5
      );
      break;

    case "ArrowUp":
      video.volume = Math.min(
        1,
        video.volume + 0.05
      );

      volume.value = video.volume;
      break;

    case "ArrowDown":
      video.volume = Math.max(
        0,
        video.volume - 0.05
      );

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
  }
});

/* ---------------- TIME FORMAT ---------------- */

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return (
    String(mins).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0")
  );
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

renderHistory();

showStatus("Ready");
