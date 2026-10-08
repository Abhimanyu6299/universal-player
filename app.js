import { transcodeToMp4 } from "./ffmpeg-loader.js";

const $ = id => document.getElementById(id);

const video = $("video");
const ytBox = $("ytBox");
const playerWrap = $("playerWrap");
const subtitleOverlay = $("subtitleOverlay");

const fileInput = $("fileInput");
const urlInput = $("urlInput");
const playUrlBtn = $("playUrlBtn");
const openBtn = $("openBtn");
const dropZone = $("dropZone");

const playBtn = $("playBtn");
const prevBtn = $("prevBtn");
const nextBtn = $("nextBtn");
const backBtn = $("backBtn");
const forwardBtn = $("forwardBtn");
const frameBackBtn = $("frameBackBtn");
const frameNextBtn = $("frameNextBtn");
const muteBtn = $("muteBtn");
const fullscreenBtn = $("fullscreenBtn");
const rotateBtn = $("rotateBtn");
const pipBtn = $("pipBtn");
const lockBtn = $("lockBtn");
const stopBtn = $("stopBtn");
const settingsBtn = $("settingsBtn");

const progress = $("progress");
const currentTimeEl = $("currentTime");
const durationEl = $("duration");

const volume = $("volume");
const brightness = $("brightness");
const contrast = $("contrast");
const saturation = $("saturation");

const volumeValue = $("volumeValue");
const brightnessValue = $("brightnessValue");
const contrastValue = $("contrastValue");
const saturationValue = $("saturationValue");

const subtitleSize = $("subtitleSize");
const subtitleSizeValue = $("subtitleSizeValue");
const subtitleDelay = $("subtitleDelay");
const subtitleMode = $("subtitleMode");
const subtitleFile = $("subtitleFile");

const speed = $("speed");
const aspect = $("aspect");
const quality = $("quality");
const qualityInfo = $("qualityInfo");

const audioTrack = $("audioTrack");
const audioInfo = $("audioInfo");

const repeat = $("repeat");
const shuffle = $("shuffle");

const queueEl = $("queue");
const historyEl = $("history");
const statusEl = $("status");
const settingsPanel = $("settingsPanel");

let currentObjectURL = null;
let currentSource = null;
let currentSourceType = "none";
let currentFile = null;

let queue = [];
let queueIndex = -1;

let hls = null;
let ytPlayer = null;
let ytReady = false;

let rotate = 0;
let locked = false;

let subtitleRaw = "";
let subtitleIsSrt = false;
let subtitleBlobURL = null;

let history = JSON.parse(localStorage.getItem("universalPlayerHistory") || "[]");

let currentRepeat = "off";
let currentShuffle = false;

function status(text) {
  statusEl.textContent = text || "";
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

function isYouTube(url) {
  try {
    const u = new URL(url);

    return (
      u.hostname.includes("youtube.com") ||
      u.hostname === "youtu.be" ||
      u.hostname.includes("youtube-nocookie.com")
    );
  } catch {
    return false;
  }
}

function getYouTubeId(url) {
  try {
    const u = new URL(url);

    if (u.hostname === "youtu.be") {
      return u.pathname.replace("/", "").split("/")[0];
    }

    if (u.searchParams.get("v")) {
      return u.searchParams.get("v");
    }

    const parts = u.pathname.split("/").filter(Boolean);

    const embedIndex = parts.indexOf("embed");
    if (embedIndex >= 0 && parts[embedIndex + 1]) {
      return parts[embedIndex + 1];
    }

    const shortsIndex = parts.indexOf("shorts");
    if (shortsIndex >= 0 && parts[shortsIndex + 1]) {
      return parts[shortsIndex + 1];
    }

    return null;
  } catch {
    return null;
  }
}

function cleanupHls() {
  if (hls) {
    try {
      hls.destroy();
    } catch {}

    hls = null;
  }
}

function cleanupYouTube() {
  if (ytPlayer) {
    try {
      ytPlayer.destroy();
    } catch {}
  }

  ytPlayer = null;
  ytReady = false;
  ytBox.style.display = "none";
}

function showNativeVideo() {
  cleanupYouTube();
  video.style.display = "block";
}

function showYouTube() {
  cleanupHls();

  video.pause();
  video.removeAttribute("src");
  video.load();

  video.style.display = "none";
  ytBox.style.display = "block";
}

function applyVideoFilter() {
  const b = Number(brightness.value) / 100;
  const c = Number(contrast.value) / 100;
  const s = Number(saturation.value) / 100;

  video.style.filter =
    `brightness(${b}) contrast(${c}) saturate(${s})`;
}

function updateSettingLabels() {
  volumeValue.textContent = `${volume.value}%`;
  brightnessValue.textContent = `${brightness.value}%`;
  contrastValue.textContent = `${contrast.value}%`;
  saturationValue.textContent = `${saturation.value}%`;
  subtitleSizeValue.textContent = `${subtitleSize.value}%`;

  subtitleOverlay.style.fontSize = `${subtitleSize.value}%`;

  applyVideoFilter();
}

function setVolume(value) {
  value = Math.max(0, Math.min(100, Number(value)));

  volume.value = value;

  if (currentSourceType === "youtube" && ytPlayer) {
    try {
      ytPlayer.setVolume(value);
    } catch {}
  } else {
    video.volume = value / 100;
  }

  updateSettingLabels();
}

function changeRange(id, amount) {
  const el = $(id);

  let value = Number(el.value);
  const step = Number(el.step || 1);

  value += amount * step;

  const min = Number(el.min);
  const max = Number(el.max);

  value = Math.max(min, Math.min(max, value));

  el.value = value;
  el.dispatchEvent(new Event("input"));
}

function populateSpeed() {
  speed.innerHTML = "";

  for (let i = 25; i <= 400; i++) {
    const value = i / 100;

    const option = document.createElement("option");
    option.value = value.toFixed(2);
    option.textContent = `${value.toFixed(2)}×`;

    if (Math.abs(value - 1) < 0.001) {
      option.selected = true;
    }

    speed.appendChild(option);
  }
}

populateSpeed();

function setPlaybackRate() {
  const value = Number(speed.value);

  if (currentSourceType === "youtube" && ytPlayer) {
    try {
      ytPlayer.setPlaybackRate(value);
    } catch {}
  } else {
    video.playbackRate = value;
  }
}

function applyAspect() {
  const mode = aspect.value;

  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "contain";

  playerWrap.style.aspectRatio = "16/9";

  if (mode === "fill") {
    video.style.objectFit = "fill";
  }

  if (mode === "fit" || mode === "best") {
    video.style.objectFit = "contain";
  }

  if (mode === "original") {
    video.style.width = "auto";
    video.style.height = "auto";
    video.style.maxWidth = "100%";
    video.style.maxHeight = "100%";
    video.style.objectFit = "contain";
  }

  if (mode === "center") {
    video.style.width = "auto";
    video.style.height = "auto";
    video.style.maxWidth = "100%";
    video.style.maxHeight = "100%";
    video.style.objectFit = "contain";
  }

  const ratios = {
    "16:9": "16/9",
    "4:3": "4/3",
    "16:10": "16/10",
    "2:1": "2/1",
    "2.21:1": "2.21/1",
    "2.35:1": "2.35/1",
    "2.39:1": "2.39/1",
    "5:4": "5/4"
  };

  if (ratios[mode]) {
    playerWrap.style.aspectRatio = ratios[mode];
    video.style.objectFit = "contain";
  }

  if (document.fullscreenElement === playerWrap) {
    playerWrap.style.aspectRatio = "auto";
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (!document.fullscreenEnabled) {
      status("Fullscreen browser me available nahi hai.");
      return;
    }

    await playerWrap.requestFullscreen();

    try {
      if (screen.orientation?.lock) {
        await screen.orientation.lock("landscape");
      }
    } catch {}

  } catch (error) {
    status("Fullscreen error: " + error.message);
  }
}

document.addEventListener("fullscreenchange", () => {
  const active = document.fullscreenElement === playerWrap;

  fullscreenBtn.textContent = active
    ? "⛶ Exit Fullscreen"
    : "⛶ Fullscreen";

  applyAspect();
});

function togglePlay() {
  if (currentSourceType === "youtube") {
    if (!ytPlayer || !ytReady) return;

    try {
      const state = ytPlayer.getPlayerState();

      if (state === 1) {
        ytPlayer.pauseVideo();
      } else {
        ytPlayer.playVideo();
      }
    } catch {}

    return;
  }

  if (!video.src) return;

  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
}

function seek(seconds) {
  if (currentSourceType === "youtube") {
    try {
      const t = ytPlayer.getCurrentTime();
      ytPlayer.seekTo(Math.max(0, t + seconds), true);
    } catch {}

    return;
  }

  if (!Number.isFinite(video.duration)) return;

  video.currentTime = Math.max(
    0,
    Math.min(video.duration, video.currentTime + seconds)
  );
}

function stopVideo() {
  if (currentSourceType === "youtube") {
    try {
      ytPlayer.stopVideo();
    } catch {}

    return;
  }

  video.pause();

  try {
    video.currentTime = 0;
  } catch {}
}

function toggleMute() {
  if (currentSourceType === "youtube") {
    if (!ytPlayer) return;

    try {
      if (ytPlayer.isMuted()) {
        ytPlayer.unMute();
        muteBtn.textContent = "🔊";
      } else {
        ytPlayer.mute();
        muteBtn.textContent = "🔇";
      }
    } catch {}

    return;
  }

  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "🔇" : "🔊";
}

function frameStep(direction) {
  if (currentSourceType !== "native") return;

  video.pause();

  const frame = 1 / 30;

  video.currentTime = Math.max(
    0,
    Math.min(
      Number.isFinite(video.duration) ? video.duration : Infinity,
      video.currentTime + direction * frame
    )
  );
}

function rotateVideo() {
  rotate = (rotate + 90) % 360;
  video.style.transform = `rotate(${rotate}deg)`;
}

async function pictureInPicture() {
  if (currentSourceType !== "native") {
    status("PiP custom native video ke liye available hai.");
    return;
  }

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }

    if (video.requestPictureInPicture) {
      await video.requestPictureInPicture();
    } else {
      status("Is browser me PiP supported nahi hai.");
    }
  } catch (e) {
    status("PiP: " + e.message);
  }
}

function updateProgressNative() {
  if (!Number.isFinite(video.duration)) return;

  progress.value = Math.round(
    (video.currentTime / video.duration) * 1000
  );

  currentTimeEl.textContent = formatTime(video.currentTime);
  durationEl.textContent = formatTime(video.duration);
}

function updateYouTubeProgress() {
  if (!ytPlayer || !ytReady) return;

  try {
    const current = ytPlayer.getCurrentTime();
    const duration = ytPlayer.getDuration();

    if (duration > 0) {
      progress.value = Math.round((current / duration) * 1000);
      currentTimeEl.textContent = formatTime(current);
      durationEl.textContent = formatTime(duration);
    }
  } catch {}
}

setInterval(() => {
  if (currentSourceType === "youtube") {
    updateYouTubeProgress();
  }
}, 500);

progress.addEventListener("input", () => {
  const percent = Number(progress.value) / 1000;

  if (currentSourceType === "youtube") {
    if (!ytPlayer || !ytReady) return;

    try {
      ytPlayer.seekTo(ytPlayer.getDuration() * percent, true);
    } catch {}

    return;
  }

  if (!Number.isFinite(video.duration)) return;

  video.currentTime = video.duration * percent;
});

video.addEventListener("play", () => {
  playBtn.textContent = "⏸";
});

video.addEventListener("pause", () => {
  playBtn.textContent = "▶";
});

video.addEventListener("loadedmetadata", () => {
  durationEl.textContent = formatTime(video.duration);
  status("Video ready.");

  updateAudioTracks();
});

video.addEventListener("timeupdate", updateProgressNative);

video.addEventListener("ended", () => {
  handleEnded();
});

video.addEventListener("error", async () => {
  if (currentSourceType !== "native") return;

  status("Native playback failed. Browser/codec issue detected.");

  if (currentFile) {
    try {
      status("FFmpeg fallback loading...");

      const blob = await transcodeToMp4(
        currentFile,
        p => {
          status(`FFmpeg converting: ${p.toFixed(0)}%`);
        }
      );

      if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
      }

      currentObjectURL = URL.createObjectURL(blob);

      currentSourceType = "native";
      video.src = currentObjectURL;
      await video.play();

      status("FFmpeg converted playback started.");
    } catch (error) {
      status("Playback failed: " + error.message);
    }
  }
});

volume.addEventListener("input", () => {
  setVolume(volume.value);
});

brightness.addEventListener("input", updateSettingLabels);
contrast.addEventListener("input", updateSettingLabels);
saturation.addEventListener("input", updateSettingLabels);

subtitleSize.addEventListener("input", () => {
  updateSettingLabels();
  updateSubtitle();
});

subtitleDelay.addEventListener("input", updateSubtitle);

speed.addEventListener("change", setPlaybackRate);
aspect.addEventListener("change", applyAspect);

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

fullscreenBtn.addEventListener("click", toggleFullscreen);
playBtn.addEventListener("click", togglePlay);

backBtn.addEventListener("click", () => seek(-10));
forwardBtn.addEventListener("click", () => seek(10));

frameBackBtn.addEventListener("click", () => frameStep(-1));
frameNextBtn.addEventListener("click", () => frameStep(1));

muteBtn.addEventListener("click", toggleMute);
rotateBtn.addEventListener("click", rotateVideo);
pipBtn.addEventListener("click", pictureInPicture);
stopBtn.addEventListener("click", stopVideo);

lockBtn.addEventListener("click", () => {
  locked = !locked;

  document.body.classList.toggle("locked", locked);

  lockBtn.textContent = locked ? "🔓 Unlock" : "🔒 Lock";
});

openBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", event => {
  const files = [...event.target.files];

  if (!files.length) return;

  queue = files.map(file => ({
    file,
    name: file.name,
    type: "file"
  }));

  queueIndex = 0;

  renderQueue();
  playQueueItem(0);
});

dropZone.addEventListener("dragover", event => {
  event.preventDefault();
  dropZone.classList.add("drag");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag");
});

dropZone.addEventListener("drop", event => {
  event.preventDefault();
  dropZone.classList.remove("drag");

  const files = [...event.dataTransfer.files];

  if (!files.length) return;

  queue = files.map(file => ({
    file,
    name: file.name,
    type: "file"
  }));

  queueIndex = 0;

  renderQueue();
  playQueueItem(0);
});

playUrlBtn.addEventListener("click", () => {
  const url = urlInput.value.trim();

  if (!url) {
    status("URL paste karo.");
    return;
  }

  playURL(url);
});

async function playURL(url) {
  currentFile = null;
  currentSource = url;

  if (isYouTube(url)) {
    const id = getYouTubeId(url);

    if (!id) {
      status("YouTube video ID nahi mila.");
      return;
    }

    playYouTube(id, url);
    return;
  }

  cleanupYouTube();
  showNativeVideo();

  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }

  currentSourceType = "native";

  if (/\.m3u8($|\?)/i.test(url)) {
    playHLS(url);
    return;
  }

  cleanupHls();

  video.src = url;
  video.load();

  try {
    await video.play();
  } catch {
    status("Play button dabao.");
  }

  addHistory(url, url);
}

function playHLS(url) {
  cleanupHls();

  currentSourceType = "hls";

  quality.innerHTML = `<option value="-1">Auto</option>`;
  audioTrack.innerHTML = `<option value="-1">Default</option>`;

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls();

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      populateHlsQualities();
      populateHlsAudioTracks();

      status("HLS stream ready.");

      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        status("HLS error: " + data.details);
      }
    });

  } else if (
    video.canPlayType("application/vnd.apple.mpegurl")
  ) {
    video.src = url;

    video.addEventListener(
      "loadedmetadata",
      () => {
        video.play().catch(() => {});
      },
      { once:true }
    );

    qualityInfo.textContent =
      "Native HLS browser quality control available nahi ho sakta.";
  } else {
    status("Is browser me HLS supported nahi hai.");
  }

  addHistory(url, url);
}

function populateHlsQualities() {
  quality.innerHTML = `<option value="-1">Auto</option>`;

  if (!hls || !hls.levels.length) {
    qualityInfo.textContent = "No multiple quality levels found.";
    return;
  }

  const levels = [...hls.levels]
    .map((level, index) => ({
      index,
      height: level.height || 0,
      width: level.width || 0,
      bitrate: level.bitrate || 0
    }))
    .sort((a,b) => b.height - a.height);

  levels.forEach(level => {
    const option = document.createElement("option");

    option.value = String(level.index);

    let text = level.height
      ? `${level.height}p`
      : "Unknown";

    if (level.bitrate) {
      text += ` · ${(level.bitrate / 1000000).toFixed(1)} Mbps`;
    }

    option.textContent = text;

    quality.appendChild(option);
  });

  qualityInfo.textContent =
    `${levels.length} quality levels available.`;
}

quality.addEventListener("change", () => {
  const value = Number(quality.value);

  if (currentSourceType === "hls" && hls) {
    hls.currentLevel = value;
    return;
  }

  if (currentSourceType === "youtube") {
    status(
      "YouTube quality YouTube player khud manage karta hai."
    );
  }
});

function populateHlsAudioTracks() {
  audioTrack.innerHTML = `<option value="-1">Default</option>`;

  if (!hls || !hls.audioTracks?.length) {
    audioInfo.textContent =
      "No selectable HLS audio tracks found.";
    return;
  }

  hls.audioTracks.forEach((track, index) => {
    const option = document.createElement("option");

    option.value = String(index);

    option.textContent =
      track.name ||
      track.lang ||
      `Audio ${index + 1}`;

    audioTrack.appendChild(option);
  });

  audioInfo.textContent =
    `${hls.audioTracks.length} HLS audio tracks found.`;
}

audioTrack.addEventListener("change", () => {
  const value = Number(audioTrack.value);

  if (currentSourceType === "hls" && hls) {
    if (value >= 0) {
      hls.audioTrack = value;
    }

    return;
  }

  if (
    currentSourceType === "native" &&
    video.audioTracks
  ) {
    for (let i = 0; i < video.audioTracks.length; i++) {
      video.audioTracks[i].enabled = i === value;
    }

    return;
  }

  if (currentSourceType === "youtube") {
    status(
      "YouTube audio language player ke andar available ho to YouTube settings se change karo."
    );
  }
});

function updateAudioTracks() {
  audioTrack.innerHTML = `<option value="-1">Default</option>`;

  if (!video.audioTracks) {
    audioInfo.textContent =
      "Is browser me direct media audio-track API available nahi hai.";
    return;
  }

  if (!video.audioTracks.length) {
    audioInfo.textContent =
      "No selectable audio tracks detected.";
    return;
  }

  for (let i = 0; i < video.audioTracks.length; i++) {
    const track = video.audioTracks[i];

    const option = document.createElement("option");

    option.value = String(i);

    option.textContent =
      track.label ||
      track.language ||
      `Audio ${i + 1}`;

    audioTrack.appendChild(option);
  }

  audioInfo.textContent =
    `${video.audioTracks.length} audio tracks detected.`;
}

function loadYouTubeAPI() {
  return new Promise(resolve => {
    if (window.YT?.Player) {
      resolve();
      return;
    }

    const old = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      if (old) old();
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
}

async function playYouTube(videoId, originalURL) {
  cleanupHls();
  showYouTube();

  currentSourceType = "youtube";

  await loadYouTubeAPI();

  if (ytPlayer) {
    try {
      ytPlayer.destroy();
    } catch {}
  }

  ytReady = false;

  ytPlayer = new YT.Player("ytPlayer", {
    videoId,

    width:"100%",
    height:"100%",

    playerVars:{
      autoplay:1,
      playsinline:1,
      rel:0,
      fs:1,
      enablejsapi:1
    },

    events:{
      onReady:event => {
        ytReady = true;

        try {
          event.target.setVolume(Number(volume.value));
        } catch {}

        status("YouTube video player ke andar chal raha hai.");

        updateYouTubeProgress();
      },

      onStateChange:event => {
        if (!window.YT) return;

        if (event.data === YT.PlayerState.PLAYING) {
          playBtn.textContent = "⏸";
        }

        if (event.data === YT.PlayerState.PAUSED) {
          playBtn.textContent = "▶";
        }

        if (event.data === YT.PlayerState.ENDED) {
          handleEnded();
        }
      },

      onError:event => {
        status(
          "YouTube playback error: " +
          event.data
        );
      }
    }
  });

  quality.innerHTML =
    `<option value="-1">YouTube Auto</option>`;

  qualityInfo.textContent =
    "YouTube quality YouTube automatically manage karta hai.";

  audioTrack.innerHTML =
    `<option value="-1">YouTube Audio / Default</option>`;

  audioInfo.textContent =
    "YouTube embedded player apne available audio options handle karta hai.";

  addHistory(originalURL, originalURL);
}

function handleEnded() {
  if (currentRepeat === "one") {
    if (currentSourceType === "youtube") {
      try {
        ytPlayer.seekTo(0, true);
        ytPlayer.playVideo();
      } catch {}
    } else {
      video.currentTime = 0;
      video.play().catch(() => {});
    }

    return;
  }

  if (queue.length > 1) {
    if (currentShuffle) {
      let next;

      do {
        next = Math.floor(Math.random() * queue.length);
      } while (
        queue.length > 1 &&
        next === queueIndex
      );

      queueIndex = next;
    } else {
      queueIndex++;

      if (queueIndex >= queue.length) {
        if (currentRepeat === "all") {
          queueIndex = 0;
        } else {
          queueIndex = -1;
          return;
        }
      }
    }

    playQueueItem(queueIndex);
  }
}

function playQueueItem(index) {
  if (index < 0 || index >= queue.length) return;

  queueIndex = index;

  const item = queue[index];

  if (item.type === "file") {
    playFile(item.file);
  } else if (item.type === "url") {
    playURL(item.url);
  }
}

async function playFile(file) {
  currentFile = file;
  currentSource = file.name;

  cleanupHls();
  cleanupYouTube();
  showNativeVideo();

  currentSourceType = "native";

  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL);
  }

  currentObjectURL = URL.createObjectURL(file);

  video.src = currentObjectURL;
  video.load();

  try {
    await video.play();
    status(file.name);
  } catch {
    status(
      "Video ready. Play button dabao."
    );
  }

  addHistory(
    file.name,
    "local:" + file.name
  );
}

function renderQueue() {
  queueEl.innerHTML = "";

  if (!queue.length) {
    queueEl.innerHTML =
      `<div class="info">Queue empty.</div>`;
    return;
  }

  queue.forEach((item,index) => {
    const row = document.createElement("div");
    row.className = "item";

    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent =
      `${index + 1}. ${item.name || item.url}`;

    const play = document.createElement("button");
    play.textContent = "▶";
    play.onclick = () => playQueueItem(index);

    row.appendChild(title);
    row.appendChild(play);

    queueEl.appendChild(row);
  });
}

function addHistory(name,url) {
  if (!url) return;

  history = history.filter(item => item.url !== url);

  history.unshift({
    name,
    url,
    time:Date.now()
  });

  history = history.slice(0,50);

  localStorage.setItem(
    "universalPlayerHistory",
    JSON.stringify(history)
  );

  renderHistory();
}

function renderHistory() {
  historyEl.innerHTML = "";

  if (!history.length) {
    historyEl.innerHTML =
      `<div class="info">History empty.</div>`;
    return;
  }

  history.forEach(item => {
    const row = document.createElement("div");
    row.className = "item";

    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = item.name;

    const play = document.createElement("button");
    play.textContent = "▶";

    play.onclick = () => {
      if (item.url.startsWith("local:")) {
        status(
          "Local file reload ke baad available nahi hoti. File dobara select karo."
        );
      } else {
        urlInput.value = item.url;
        playURL(item.url);
      }
    };

    row.appendChild(title);
    row.appendChild(play);

    historyEl.appendChild(row);
  });
}

subtitleFile.addEventListener("change", async () => {
  const file = subtitleFile.files?.[0];

  if (!file) return;

  subtitleRaw = await file.text();
  subtitleIsSrt =
    /\.srt$/i.test(file.name);

  subtitleMode.value = "on";

  updateSubtitle();

  status("Subtitle loaded.");
});

subtitleMode.addEventListener("change", () => {
  updateSubtitle();
});

function parseSrtToVtt(text, delayMs) {
  let result = text.replace(/\r/g,"");

  const blocks = result.split(/\n{2,}/);

  const output = ["WEBVTT", ""];

  for (const block of blocks) {
    const lines = block.split("\n");

    if (!lines.length) continue;

    let timeIndex =
      lines.findIndex(line => line.includes("-->"));

    if (timeIndex === -1) continue;

    let timeLine = lines[timeIndex];

    const match = timeLine.match(
      /(\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(\d{1,2}:\d{2}:\d{2}[,.]\d{3})/
    );

    if (!match) continue;

    const start = shiftTimestamp(
      match[1],
      delayMs
    );

    const end = shiftTimestamp(
      match[2],
      delayMs
    );

    if (end <= 0) continue;

    output.push(
      `${start} --> ${end}`
    );

    for (let i = timeIndex + 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        output.push(lines[i]);
      }
    }

    output.push("");
  }

  return output.join("\n");
}

function shiftTimestamp(timestamp, delayMs) {
  const clean = timestamp.replace(",", ".");

  const parts = clean.split(":");

  let h = Number(parts[0]);
  let m = Number(parts[1]);
  let s = Number(parts[2]);

  let total =
    h * 3600 +
    m * 60 +
    s +
    Number(delayMs) / 1000;

  total = Math.max(0,total);

  h = Math.floor(total / 3600);
  total %= 3600;

  m = Math.floor(total / 60);
  s = total % 60;

  return (
    String(h).padStart(2,"0") +
    ":" +
    String(m).padStart(2,"0") +
    ":" +
    s.toFixed(3).padStart(6,"0")
  );
}

function makeVtt() {
  if (!subtitleRaw) return null;

  if (subtitleIsSrt) {
    return parseSrtToVtt(
      subtitleRaw,
      Number(subtitleDelay.value) || 0
    );
  }

  return shiftVtt(
    subtitleRaw,
    Number(subtitleDelay.value) || 0
  );
}

function shiftVtt(text,delayMs) {
  const lines = text.replace(/\r/g,"").split("\n");

  return lines.map(line => {
    if (!line.includes("-->")) {
      return line;
    }

    const parts = line.split("-->");

    if (parts.length !== 2) return line;

    return (
      shiftTimestamp(parts[0].trim(),delayMs) +
      " --> " +
      shiftTimestamp(parts[1].trim(),delayMs)
    );
  }).join("\n");
}

function updateSubtitle() {
  subtitleOverlay.textContent = "";

  if (
    subtitleMode.value === "off" ||
    !subtitleRaw
  ) {
    return;
  }

  const vtt = makeVtt();

  if (!vtt) return;

  if (subtitleBlobURL) {
    URL.revokeObjectURL(subtitleBlobURL);
  }

  subtitleBlobURL = URL.createObjectURL(
    new Blob([vtt], {type:"text/vtt"})
  );

  /*
   * Custom subtitle renderer.
   * This avoids depending on browser VTT rendering for
   * our delay/size controls.
   */
  if (currentSourceType !== "youtube") {
    renderSubtitleCues(vtt);
  }
}

let subtitleCues = [];

function parseVttCues(vtt) {
  const blocks =
    vtt.replace(/\r/g,"").split(/\n{2,}/);

  const cues = [];

  for (const block of blocks) {
    const lines = block.split("\n");

    const timeLine =
      lines.find(line => line.includes("-->"));

    if (!timeLine) continue;

    const match =
      timeLine.match(
        /(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})/
      );

    if (!match) continue;

    const textIndex =
      lines.indexOf(timeLine);

    const text =
      lines
        .slice(textIndex + 1)
        .filter(Boolean)
        .join("\n");

    cues.push({
      start:timestampSeconds(match[1]),
      end:timestampSeconds(match[2]),
      text
    });
  }

  return cues;
}

function timestampSeconds(value) {
  const p = value.split(":");

  return (
    Number(p[0]) * 3600 +
    Number(p[1]) * 60 +
    Number(p[2])
  );
}

function renderSubtitleCues(vtt) {
  subtitleCues = parseVttCues(vtt);

  function tick() {
    if (
      subtitleMode.value === "on" &&
      currentSourceType === "native"
    ) {
      const now = video.currentTime;

      const cue = subtitleCues.find(
        c => now >= c.start && now <= c.end
      );

      subtitleOverlay.textContent =
        cue ? cue.text : "";
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

repeat.addEventListener("change", () => {
  currentRepeat = repeat.value;
});

shuffle.addEventListener("change", () => {
  currentShuffle =
    shuffle.value === "on";

  status(
    currentShuffle
      ? "Shuffle enabled."
      : "Shuffle disabled."
  );
});

prevBtn.addEventListener("click", () => {
  if (!queue.length) return;

  let index = queueIndex - 1;

  if (index < 0) {
    if (currentRepeat === "all") {
      index = queue.length - 1;
    } else {
      index = 0;
    }
  }

  playQueueItem(index);
});

nextBtn.addEventListener("click", () => {
  if (!queue.length) return;

  let index;

  if (currentShuffle) {
    index =
      Math.floor(Math.random() * queue.length);

    if (
      queue.length > 1 &&
      index === queueIndex
    ) {
      index =
        (index + 1) % queue.length;
    }
  } else {
    index = queueIndex + 1;

    if (index >= queue.length) {
      if (currentRepeat === "all") {
        index = 0;
      } else {
        return;
      }
    }
  }

  playQueueItem(index);
});

document.addEventListener("click", event => {
  const btn =
    event.target.closest(
      "[data-action][data-target]"
    );

  if (!btn) return;

  const action = btn.dataset.action;
  const target = btn.dataset.target;

  if (target === "speed") {
    const select = $("speed");

    let index =
      select.selectedIndex +
      (action === "plus" ? 1 : -1);

    index = Math.max(
      0,
      Math.min(
        select.options.length - 1,
        index
      )
    );

    select.selectedIndex = index;
    setPlaybackRate();

    return;
  }

  if (target === "volume") {
    changeRange(
      "volume",
      action === "plus" ? 1 : -1
    );

    return;
  }

  if (target === "brightness") {
    changeRange(
      "brightness",
      action === "plus" ? 1 : -1
    );

    return;
  }

  if (target === "contrast") {
    changeRange(
      "contrast",
      action === "plus" ? 1 : -1
    );

    return;
  }

  if (target === "saturation") {
    changeRange(
      "saturation",
      action === "plus" ? 1 : -1
    );

    return;
  }

  if (target === "subtitleSize") {
    changeRange(
      "subtitleSize",
      action === "plus" ? 1 : -1
    );

    return;
  }

  if (target === "subtitleDelay") {
    const input = subtitleDelay;

    let value =
      Number(input.value) || 0;

    value +=
      action === "plus"
        ? Number(input.step || 100)
        : -Number(input.step || 100);

    input.value = value;

    updateSubtitle();
  }
});

document.addEventListener("keydown", event => {
  if (event.target.matches("input,select,textarea")) {
    return;
  }

  if (event.code === "Space" || event.key.toLowerCase() === "k") {
    event.preventDefault();
    togglePlay();
  }

  if (event.key === "ArrowLeft") {
    seek(-5);
  }

  if (event.key === "ArrowRight") {
    seek(5);
  }

  if (event.key === "ArrowUp") {
    changeRange("volume",1);
  }

  if (event.key === "ArrowDown") {
    changeRange("volume",-1);
  }

  if (event.key.toLowerCase() === "f") {
    toggleFullscreen();
  }

  if (event.key.toLowerCase() === "m") {
    toggleMute();
  }

  if (event.key.toLowerCase() === "l") {
    lockBtn.click();
  }

  if (event.key.toLowerCase() === "n") {
    nextBtn.click();
  }

  if (event.key.toLowerCase() === "p") {
    prevBtn.click();
  }

  if (event.key === ",") {
    frameBackBtn.click();
  }

  if (event.key === ".") {
    frameNextBtn.click();
  }

  if (event.key === "[") {
    changeRange("brightness",-5);
  }

  if (event.key === "]") {
    changeRange("brightness",5);
  }

  if (event.key === "Escape" && locked) {
    lockBtn.click();
  }
});

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

playerWrap.addEventListener("touchstart", event => {
  if (event.touches.length !== 1) return;

  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
  touchStartTime = Date.now();
});

playerWrap.addEventListener("touchend", event => {
  if (event.changedTouches.length !== 1) return;

  const x = event.changedTouches[0].clientX;
  const y = event.changedTouches[0].clientY;

  const dx = x - touchStartX;
  const dy = y - touchStartY;

  const duration =
    Date.now() - touchStartTime;

  if (duration > 700) return;

  if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy)) {
    seek(dx > 0 ? 10 : -10);
  }
});

let lastTap = 0;

playerWrap.addEventListener("click", event => {
  if (
    event.target.closest("button") ||
    event.target.closest("input") ||
    event.target.closest("select")
  ) {
    return;
  }

  const now = Date.now();

  if (now - lastTap < 280) {
    const rect =
      playerWrap.getBoundingClientRect();

    const x =
      event.clientX - rect.left;

    if (x < rect.width / 2) {
      seek(-10);
    } else {
      seek(10);
    }
  }

  lastTap = now;
});

updateSettingLabels();
applyAspect();
renderHistory();
renderQueue();

status("Universal Player ready.");
