import { transcodeToMp4 } from "./ffmpeg-loader.js";

const video = document.getElementById("video");
const playerWrap = document.getElementById("playerWrap");
const audioScreen = document.getElementById("audioScreen");

const playBtn = document.getElementById("playBtn");
const centerPlay = document.getElementById("centerPlay");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const progress = document.getElementById("progress");
const timeEl = document.getElementById("time");
const status = document.getElementById("status");
const info = document.getElementById("info");

const urlInput = document.getElementById("urlInput");
const urlPlayBtn = document.getElementById("urlPlayBtn");

const fileInput = document.getElementById("fileInput");
const fileBtn = document.getElementById("fileBtn");
const drop = document.getElementById("drop");

const volume = document.getElementById("volume");
const volume2 = document.getElementById("volume2");
const volumeValue = document.getElementById("volumeValue");
const muteBtn = document.getElementById("muteBtn");

const speed = document.getElementById("speed");
const speedValue = document.getElementById("speedValue");

const quality = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");

const aspect = document.getElementById("aspect");

const brightness = document.getElementById("brightness");
const contrast = document.getElementById("contrast");
const saturation = document.getElementById("saturation");

const queueEl = document.getElementById("queue");

let hls = null;
let currentObjectURL = null;
let sourceType = "";
let currentFile = null;
let queue = [];
let queueIndex = -1;
let lastVolume = 1;

const settings = {
  brightness: 100,
  contrast: 100,
  saturation: 100
};

function setStatus(msg) {
  status.textContent = msg || "";
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  seconds = Math.max(0, Math.floor(seconds));

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function clearHls() {
  if (hls) {
    try {
      hls.destroy();
    } catch {}
    hls = null;
  }

  quality.innerHTML = `<option value="-1">Auto</option>`;
  qualityValue.textContent = "Auto";
}

function revokeObjectURL() {
  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }
}

function resetVideoSource() {
  clearHls();

  video.pause();

  video.removeAttribute("src");
  video.load();

  revokeObjectURL();

  audioScreen.style.display = "none";
  video.style.display = "block";
}

function isHls(url) {
  return /\.m3u8(?:$|[?#])/i.test(url);
}

function isYouTube(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

function youtubeId(url) {
  try {
    const u = new URL(url);

    if (u.hostname.includes("youtu.be")) {
      return u.pathname.substring(1);
    }

    if (u.searchParams.get("v")) {
      return u.searchParams.get("v");
    }

    const parts = u.pathname.split("/");
    const i = parts.indexOf("embed");

    if (i >= 0 && parts[i + 1]) {
      return parts[i + 1];
    }

    return "";
  } catch {
    return "";
  }
}

function setupQualityLevels() {
  quality.innerHTML = `<option value="-1">Auto</option>`;

  if (!hls || !hls.levels.length) {
    qualityValue.textContent = "Auto";
    return;
  }

  const seen = new Set();

  hls.levels.forEach((level, index) => {
    const height = level.height || 0;
    const bitrate = level.bitrate
      ? `${Math.round(level.bitrate / 1000)} kbps`
      : "";

    const label = height
      ? `${height}p${bitrate ? ` — ${bitrate}` : ""}`
      : `Level ${index + 1}`;

    if (seen.has(label)) return;
    seen.add(label);

    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = label;
    quality.appendChild(option);
  });

  qualityValue.textContent = "Auto";
}

async function playDirectURL(rawURL) {
  let url = rawURL.trim();

  if (!url) {
    setStatus("URL paste karo.");
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    setStatus("Valid http/https video URL paste karo.");
    return;
  }

  if (isYouTube(url)) {
    const id = youtubeId(url);

    if (!id) {
      setStatus("YouTube video ID nahi mili.");
      return;
    }

    /*
      YouTube ko normal <video> me play nahi kiya ja sakta.
      Is player me navigation nahi hota.
      YouTube embed ke liye separate player required hai.
    */
    setStatus("YouTube page URL direct video file nahi hai. MP4/WebM/M3U8 URL use karo.");
    return;
  }

  resetVideoSource();

  sourceType = "remote";
  currentFile = null;

  info.textContent = `Source: ${url}`;

  if (isHls(url)) {
    await playHls(url);
    return;
  }

  setStatus("Loading direct video...");

  video.crossOrigin = "anonymous";
  video.src = url;
  video.load();

  try {
    await video.play();
    setStatus("Playing direct URL");
  } catch (err) {
    /*
      Browser autoplay/security restriction ke case me
      source phir bhi loaded reh sakta hai.
    */
    if (video.readyState >= 2) {
      setStatus("Video loaded. Play button dabao.");
    } else {
      setStatus(
        "Video load nahi hua. URL direct media file hona chahiye aur server CORS/range access allow kare."
      );
    }
  }
}

async function playHls(url) {
  setStatus("Loading HLS...");

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false
    });

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(url);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, async () => {
      setupQualityLevels();

      try {
        await video.play();
        setStatus("HLS playing");
      } catch {
        setStatus("HLS loaded. Play button dabao.");
      }
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        setStatus("HLS network/CORS error.");
        try {
          hls.startLoad();
        } catch {}
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        setStatus("HLS media error.");
        try {
          hls.recoverMediaError();
        } catch {}
      } else {
        setStatus("HLS playback failed.");
      }
    });

    hls.attachMedia(video);
    return;
  }

  /*
    Safari/iOS/macOS me native HLS support ho sakta hai.
  */
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    video.load();

    try {
      await video.play();
    } catch {
      setStatus("HLS loaded. Play button dabao.");
    }

    return;
  }

  setStatus("Is browser me HLS supported nahi hai.");
}

async function playLocalFile(file) {
  if (!file) return;

  resetVideoSource();

  currentFile = file;
  sourceType = "local";

  const type = file.type || "";

  const looksAudio =
    type.startsWith("audio/") ||
    /\.(mp3|wav|aac|flac|ogg|m4a)$/i.test(file.name);

  if (looksAudio) {
    audioScreen.style.display = "flex";
  }

  info.textContent =
    `File: ${file.name}\n` +
    `Type: ${type || "unknown"}\n` +
    `Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`;

  currentObjectURL = URL.createObjectURL(file);

  video.src = currentObjectURL;
  video.load();

  setStatus(`Loading ${file.name}...`);

  try {
    await video.play();

    addToQueue(file);

    setStatus(`Playing: ${file.name}`);
  } catch {
    /*
      Browser native decoder fail hone par FFmpeg fallback.
    */
    if (file.size > 1024 * 1024 * 1024) {
      setStatus("File 1 GB se badi hai. FFmpeg conversion mobile par heavy ho sakta hai.");
    }

    try {
      setStatus("Browser decoder unsupported. FFmpeg fallback loading...");

      const blob = await transcodeToMp4(
        file,
        p => {
          setStatus(`FFmpeg converting: ${Math.round(p)}%`);
        }
      );

      resetVideoSource();

      currentObjectURL = URL.createObjectURL(blob);
      sourceType = "ffmpeg";

      video.src = currentObjectURL;
      video.load();

      await video.play();

      setStatus("FFmpeg playback started.");
    } catch (err) {
      console.error(err);
      setStatus(
        `Video play nahi hua: ${err?.message || "unsupported format/codec"}`
      );
    }
  }
}

function togglePlay() {
  if (!video.src && !hls) {
    setStatus("Pehle video open karo.");
    return;
  }

  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
}

video.addEventListener("play", () => {
  playBtn.textContent = "⏸";
  centerPlay.textContent = "⏸";
});

video.addEventListener("pause", () => {
  playBtn.textContent = "▶";
  centerPlay.textContent = "▶";
});

video.addEventListener("loadedmetadata", () => {
  updateInfo();
});

video.addEventListener("durationchange", () => {
  updateProgress();
  updateInfo();
});

video.addEventListener("timeupdate", updateProgress);

video.addEventListener("error", () => {
  if (sourceType === "remote") {
    setStatus(
      "Direct URL play nahi hua. Check karo URL actual MP4/WebM/M3U8 file hai aur server browser access allow karta hai."
    );
  }
});

function updateProgress() {
  const duration = video.duration;

  if (Number.isFinite(duration) && duration > 0) {
    progress.value = Math.round(
      (video.currentTime / duration) * 1000
    );
  } else {
    progress.value = 0;
  }

  timeEl.textContent =
    `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
}

progress.addEventListener("input", () => {
  if (Number.isFinite(video.duration)) {
    video.currentTime =
      (Number(progress.value) / 1000) * video.duration;
  }
});

document.getElementById("backBtn").onclick = () => {
  video.currentTime = Math.max(0, video.currentTime - 10);
};

document.getElementById("forwardBtn").onclick = () => {
  video.currentTime = Math.min(
    video.duration || Infinity,
    video.currentTime + 10
  );
};

playBtn.onclick = togglePlay;
centerPlay.onclick = togglePlay;

document.getElementById("stopBtn").onclick = () => {
  video.pause();
  video.currentTime = 0;
};

muteBtn.onclick = () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "🔇" : "🔊";
};

function setVolume(v) {
  v = Math.max(0, Math.min(100, Number(v)));
  video.volume = v / 100;
  video.muted = v === 0;

  volume.value = v;
  volume2.value = v;
  volumeValue.textContent = `${Math.round(v)}%`;
}

volume.oninput = e => setVolume(e.target.value);
volume2.oninput = e => setVolume(e.target.value);

speed.onchange = () => {
  video.playbackRate = Number(speed.value);
  speedValue.textContent =
    `${Number(speed.value).toFixed(2)}×`;
};

quality.onchange = () => {
  if (!hls) return;

  const level = Number(quality.value);

  hls.currentLevel = level;

  if (level === -1) {
    qualityValue.textContent = "Auto";
  } else {
    const l = hls.levels[level];
    qualityValue.textContent =
      l?.height ? `${l.height}p` : `Level ${level + 1}`;
  }
};

function updateFilter() {
  video.style.filter =
    `brightness(${settings.brightness}%) ` +
    `contrast(${settings.contrast}%) ` +
    `saturate(${settings.saturation}%)`;
}

brightness.oninput = () => {
  settings.brightness = Number(brightness.value);
  document.getElementById("brightnessValue").textContent =
    `${settings.brightness}%`;
  updateFilter();
};

contrast.oninput = () => {
  settings.contrast = Number(contrast.value);
  document.getElementById("contrastValue").textContent =
    `${settings.contrast}%`;
  updateFilter();
};

saturation.oninput = () => {
  settings.saturation = Number(saturation.value);
  document.getElementById("saturationValue").textContent =
    `${settings.saturation}%`;
  updateFilter();
};

document.querySelectorAll("[data-adjust]").forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.adjust;
    const dir = Number(btn.dataset.dir);

    if (key === "volume") {
      setVolume(Number(volume2.value) + dir * 5);
      return;
    }

    const input = document.getElementById(key);
    input.value = Math.max(
      Number(input.min),
      Math.min(Number(input.max), Number(input.value) + dir * 5)
    );

    input.dispatchEvent(new Event("input"));
  });
});

aspect.onchange = () => {
  const value = aspect.value;

  video.style.objectFit = "contain";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.margin = "0";

  if (value === "cover") {
    video.style.objectFit = "cover";
  }

  if (value === "stretch") {
    video.style.objectFit = "fill";
  }

  if (value === "center") {
    video.style.objectFit = "contain";
    video.style.width = "auto";
    video.style.maxWidth = "100%";
  }

  if (value.includes(":")) {
    const parts = value.split(":");
    const ratio = Number(parts[0]) / Number(parts[1]);

    playerWrap.style.aspectRatio = `${ratio}`;
    video.style.objectFit = "contain";
  } else {
    playerWrap.style.aspectRatio = "16/9";
  }
};

function updateFullscreenButton() {
  fullscreenBtn.textContent =
    document.fullscreenElement ? "⛶ Exit" : "⛶";
}

fullscreenBtn.onclick = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await playerWrap.requestFullscreen();
    }
  } catch (err) {
    console.error(err);
    setStatus("Fullscreen browser ne reject kiya.");
  }
};

document.addEventListener("fullscreenchange", updateFullscreenButton);

document.getElementById("pipBtn").onclick = async () => {
  try {
    if (!document.pictureInPictureElement) {
      await video.requestPictureInPicture();
    } else {
      await document.exitPictureInPicture();
    }
  } catch {
    setStatus("Picture-in-Picture supported nahi hai.");
  }
};

urlPlayBtn.onclick = () => playDirectURL(urlInput.value);

urlInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    playDirectURL(urlInput.value);
  }
});

fileBtn.onclick = () => fileInput.click();

fileInput.onchange = () => {
  [...fileInput.files].forEach(file => addToQueue(file));

  if (fileInput.files[0]) {
    playLocalFile(fileInput.files[0]);
  }
};

drop.addEventListener("dragover", e => {
  e.preventDefault();
  drop.style.background = "#181818";
});

drop.addEventListener("dragleave", () => {
  drop.style.background = "";
});

drop.addEventListener("drop", e => {
  e.preventDefault();
  drop.style.background = "";

  const files = [...e.dataTransfer.files];

  files.forEach(file => addToQueue(file));

  if (files[0]) {
    playLocalFile(files[0]);
  }
});

function addToQueue(file) {
  if (queue.some(x => x.name === file.name && x.size === file.size)) {
    return;
  }

  queue.push(file);
  renderQueue();
}

function renderQueue() {
  queueEl.innerHTML = "";

  queue.forEach((file, index) => {
    const div = document.createElement("div");
    div.className = "item";

    const name = document.createElement("span");
    name.textContent = file.name;

    const size = document.createElement("small");
    size.textContent =
      `${(file.size / 1024 / 1024).toFixed(1)} MB`;

    div.append(name, size);

    div.onclick = () => {
      queueIndex = index;
      playLocalFile(file);
    };

    queueEl.appendChild(div);
  });
}

document.getElementById("nextBtn").onclick = () => {
  if (!queue.length) return;

  queueIndex =
    queueIndex < queue.length - 1 ? queueIndex + 1 : 0;

  playLocalFile(queue[queueIndex]);
};

document.getElementById("prevBtn").onclick = () => {
  if (!queue.length) return;

  queueIndex =
    queueIndex > 0 ? queueIndex - 1 : queue.length - 1;

  playLocalFile(queue[queueIndex]);
};

video.addEventListener("ended", () => {
  if (queue.length > 1) {
    document.getElementById("nextBtn").click();
  }
});

function updateInfo() {
  const duration = video.duration;

  let resolution = "Unknown";

  if (video.videoWidth && video.videoHeight) {
    resolution =
      `${video.videoWidth} × ${video.videoHeight}`;
  }

  info.textContent =
    `Source: ${sourceType || "unknown"}\n` +
    `Resolution: ${resolution}\n` +
    `Duration: ${formatTime(duration)}\n` +
    `Current: ${formatTime(video.currentTime)}\n` +
    `URL: ${video.currentSrc || "local file"}`;
}

document.addEventListener("keydown", e => {
  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "SELECT"
  ) return;

  if (e.code === "Space" || e.key.toLowerCase() === "k") {
    e.preventDefault();
    togglePlay();
  }

  if (e.key === "ArrowLeft") {
    video.currentTime = Math.max(0, video.currentTime - 5);
  }

  if (e.key === "ArrowRight") {
    video.currentTime =
      Math.min(video.duration || Infinity, video.currentTime + 5);
  }

  if (e.key.toLowerCase() === "f") {
    fullscreenBtn.click();
  }

  if (e.key.toLowerCase() === "m") {
    muteBtn.click();
  }
});

setVolume(100);
updateFilter();
updateFullscreenButton();
