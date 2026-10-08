import {
  getFFmpeg,
  transcodeToMp4,
  extractAudioTracks
} from "./ffmpeg-loader.js";


const $ = id =>
  document.getElementById(id);


const video =
  $("video");

const shell =
  $("playerShell");

const controls =
  $("controls");

const progress =
  $("progress");

const time =
  $("time");

const status =
  $("status");

const info =
  $("info");

const queueEl =
  $("queue");

const overlayTitle =
  $("overlayTitle");


let queue = [];

let currentIndex = -1;

let sourceKind = "";

let sourceFile = null;

let currentObjectUrl = "";

let subtitleTrack = null;

let subtitleRaw = "";

let subtitleMode = "off";

let subtitleDelay = 0;

let subtitleSize = 100;

let aspect =
  localStorage.getItem("up_aspect") ||
  "best";

let rotate = 0;

let mirror = false;

let flip = false;

let shuffle = false;

let repeat = "off";

let hideTimer = null;

let externalAudio =
  new Audio();

externalAudio.preload =
  "auto";

externalAudio.playsInline =
  true;

let externalTracks = [];

let externalAudioActive =
  false;

let audioExtracting =
  false;


/* SPEED */

for (
  let x = .25;
  x <= 4.0001;
  x += .01
) {

  const o =
    document.createElement("option");

  o.value =
    x.toFixed(2);

  o.textContent =
    `${x.toFixed(2)}×`;

  $("speed").appendChild(o);

}

$("speed").value =
  "1.00";


/* STATUS */

function setStatus(msg) {

  status.textContent =
    msg || "";

}


/* TIME */

function fmt(s) {

  if (!Number.isFinite(s))
    return "00:00";

  s =
    Math.max(
      0,
      Math.floor(s)
    );

  const h =
    Math.floor(s / 3600);

  const m =
    Math.floor(
      (s % 3600) / 60
    );

  const sec =
    s % 60;

  if (h) {

    return `${String(h).padStart(2,"0")}:` +
           `${String(m).padStart(2,"0")}:` +
           `${String(sec).padStart(2,"0")}`;

  }

  return `${String(m).padStart(2,"0")}:` +
         `${String(sec).padStart(2,"0")}`;

}


/* CURRENT TITLE */

function titleOfCurrent() {

  if (
    currentIndex >= 0 &&
    queue[currentIndex]
  ) {

    return queue[currentIndex].name;

  }

  return (
    overlayTitle.textContent ||
    "current"
  );

}


/* RESUME */

function saveState() {

  if (
    !video.currentSrc ||
    !Number.isFinite(video.currentTime)
  ) return;

  localStorage.setItem(
    "up_resume_" +
    titleOfCurrent(),
    String(video.currentTime)
  );

}


/* CONTROLS */

function showControls() {

  shell.classList.add(
    "controls-visible"
  );

  clearTimeout(hideTimer);

  if (!video.paused) {

    hideTimer =
      setTimeout(
        () =>
          shell.classList.remove(
            "controls-visible"
          ),
        3000
      );

  }

}


function toggleMenu(el) {

  [
    $("audioMenu"),
    $("subtitleMenu"),
    $("aspectMenu"),
    $("moreMenu")
  ].forEach(x => {

    if (x !== el)
      x.classList.remove("open");

  });

  el.classList.toggle("open");

  showControls();

}


function closeMenus() {

  document
    .querySelectorAll(".popover")
    .forEach(
      x =>
        x.classList.remove("open")
    );

}


/* ASPECT */

const aspectItems = [

  ["best","Best Fit"],

  ["fit","Fit Screen"],

  ["fill","Fill Screen / Full"],

  ["stretch","Stretch"],

  ["original","Original / 1:1"],

  ["16:9","16:9"],

  ["4:3","4:3"],

  ["16:10","16:10"],

  ["2:1","2:1"],

  ["2.21:1","2.21:1"],

  ["2.35:1","2.35:1"],

  ["2.39:1","2.39:1"],

  ["5:4","5:4"],

  ["center","Center"]

];


function applyAspect() {

  const v =
    video;

  v.style.objectPosition =
    "center";

  switch (aspect) {

    case "best":

    case "fit":

      v.style.objectFit =
        "contain";

      break;


    case "fill":

      v.style.objectFit =
        "cover";

      break;


    case "stretch":

      v.style.objectFit =
        "fill";

      break;


    case "original":

      v.style.objectFit =
        "none";

      break;


    case "center":

      v.style.objectFit =
        "none";

      break;


    default: {

      const [
        w,
        h
      ] =
        aspect
          .split(":")
          .map(Number);

      v.style.objectFit =
        "contain";

      v.style.aspectRatio =
        `${w}/${h}`;

      break;

    }

  }


  if (
    aspect === "center"
  ) {

    v.style.objectPosition =
      "center";

  }


  $("aspectMenu")
    .querySelectorAll(
      ".menu-item"
    )
    .forEach(
      b =>
        b.classList.toggle(
          "active",
          b.dataset.aspect === aspect
        )
    );


  localStorage.setItem(
    "up_aspect",
    aspect
  );

}


function resetRatioInline() {

  video.style.aspectRatio =
    "auto";

}


function transformVideo() {

  resetRatioInline();

  video.style.transform =
    `rotate(${rotate}deg) ` +
    `scale(${mirror ? -1 : 1},${flip ? -1 : 1})`;

  applyAspect();

}


function filterVideo() {

  video.style.filter =
    `brightness(${$("brightness").value}%) ` +
    `contrast(${$("contrast").value}%) ` +
    `saturate(${$("saturation").value}%) ` +
    `hue-rotate(${$("hue").value}deg)`;

}


/* ASPECT MENU */

function renderAspectMenu() {

  const m =
    $("aspectMenu");

  m.innerHTML =
    `<div class="menu-title">Aspect ratio</div>` +

    aspectItems
      .map(
        ([v,l]) =>
          `<button class="menu-item ${
            v === aspect ? "active" : ""
          }" data-aspect="${v}">
            ${v === aspect ? "✓ " : ""}
            ${l}
          </button>`
      )
      .join("");


  m.querySelectorAll(
    "[data-aspect]"
  ).forEach(
    b =>
      b.onclick = () => {

        aspect =
          b.dataset.aspect;

        transformVideo();

        renderAspectMenu();

        closeMenus();

      }
  );

}


/* MORE MENU */

function renderMoreMenu() {

  const m =
    $("moreMenu");

  m.innerHTML = `

    <div class="menu-title">
      More controls
    </div>

    <button class="menu-item"
      data-action="rotate">
      ↻ Rotate 90°
    </button>

    <button class="menu-item"
      data-action="mirror">
      ⇋ Mirror
    </button>

    <button class="menu-item"
      data-action="flip">
      ⇵ Flip
    </button>

    <button class="menu-item"
      data-action="pip">
      ▣ Picture in Picture
    </button>

    <button class="menu-item"
      data-action="screenshot">
      📷 Screenshot
    </button>

    <button class="menu-item"
      data-action="frameback">
      ◀ Frame back
    </button>

    <button class="menu-item"
      data-action="frameforward">
      Frame forward ▶
    </button>

    <button class="menu-item"
      data-action="stop">
      ■ Stop
    </button>

    <button class="menu-item"
      data-action="bookmark">
      🔖 Bookmark position
    </button>

    <button class="menu-item"
      data-action="timestamp">
      ⏱ Copy timestamp
    </button>

    <button class="menu-item"
      data-action="extract">
      🎧 Prepare MKV audio tracks
    </button>

  `;


  m.querySelectorAll(
    "[data-action]"
  ).forEach(
    b =>
      b.onclick = () =>
        runMore(
          b.dataset.action
        )
  );

}


/* AUDIO MENU */

function renderAudioMenu() {

  const m =
    $("audioMenu");

  let items = [];


  if (
    video.audioTracks &&
    video.audioTracks.length
  ) {

    items =
      [
        ...video.audioTracks
      ]
      .map(
        (t,i) => ({

          i,

          label:
            t.label ||
            t.language ||
            `Audio ${i + 1}`,

          kind:
            "native"

        })
      );

  }


  if (
    externalTracks.length
  ) {

    items =
      externalTracks.map(
        (t,i) => ({

          i,

          label:
            t.label,

          kind:
            "external"

        })
      );

  }


  if (!items.length) {

    m.innerHTML = `

      <div class="menu-title">
        Audio
      </div>

      <button
        class="menu-item"
        data-action="extract">

        No switchable tracks detected

        <br>

        <small>
          Tap to prepare MKV audio tracks
        </small>

      </button>

    `;


    m.querySelector(
      "[data-action]"
    ).onclick =
      () =>
        runMore("extract");

    return;

  }


  m.innerHTML =
    `<div class="menu-title">Audio</div>` +

    items
      .map(
        x =>
          `<button
            class="menu-item"
            data-audio="${x.i}"
            data-kind="${x.kind}">
            ${x.label}
          </button>`
      )
      .join("");


  m.querySelectorAll(
    "[data-audio]"
  ).forEach(
    b =>
      b.onclick =
        () =>
          selectAudio(
            Number(b.dataset.audio),
            b.dataset.kind
          )
  );

}


/* SUBTITLE MENU */

function renderSubtitleMenu() {

  const m =
    $("subtitleMenu");

  m.innerHTML = `

    <div class="menu-title">
      Subtitles
    </div>

    <button
      class="menu-item ${
        subtitleMode === "off"
          ? "active"
          : ""
      }"
      data-sub="off">

      ✓ Off

    </button>

    ${
      subtitleTrack
      ?
      `
      <button
        class="menu-item ${
          subtitleMode === "on"
            ? "active"
            : ""
        }"
        data-sub="on">

        CC Loaded

      </button>
      `
      :
      ""
    }

    <button
      class="menu-item"
      data-sub="load">

      Load SRT / VTT

    </button>

    <button
      class="menu-item"
      data-sub="minus">

      Subtitle size −

    </button>

    <button
      class="menu-item"
      data-sub="plus">

      Subtitle size +

    </button>

  `;


  m.querySelectorAll(
    "[data-sub]"
  ).forEach(
    b =>
      b.onclick = () => {

        const a =
          b.dataset.sub;


        if (
          a === "load"
        ) {

          $("subtitleFile").click();

        }


        else if (
          a === "off"
        ) {

          subtitleMode =
            "off";

          if (
            subtitleTrack
          ) {

            subtitleTrack.track.mode =
              "disabled";

          }

          renderSubtitleMenu();

          closeMenus();

        }


        else if (
          a === "on"
        ) {

          subtitleMode =
            "on";

          if (
            subtitleTrack
          ) {

            subtitleTrack.track.mode =
              "showing";

          }

          renderSubtitleMenu();

          closeMenus();

        }


        else if (
          a === "minus"
        ) {

          subtitleSize =
            Math.max(
              70,
              subtitleSize - 10
            );

          applySubtitleStyle();

        }


        else if (
          a === "plus"
        ) {

          subtitleSize =
            Math.min(
              180,
              subtitleSize + 10
            );

          applySubtitleStyle();

        }

      }
  );

}


/* SUBTITLE FILE INPUT */

const subFile =
  document.createElement(
    "input"
  );

subFile.type =
  "file";

subFile.accept =
  ".srt,.vtt,text/vtt";

subFile.className =
  "hidden";

subFile.id =
  "subtitleFile";

document.body.appendChild(
  subFile
);


subFile.onchange =
  () => {

    if (
      subFile.files[0]
    ) {

      loadSubtitle(
        subFile.files[0]
      );

    }

  };


/* SRT TO VTT */

function srtToVtt(
  text,
  delayMs = 0
) {

  let t =
    text
      .replace(/\r/g,"")
      .trim();


  if (
    !t.startsWith("WEBVTT")
  ) {

    t =
      "WEBVTT\n\n" +
      t;

  }


  const lines =
    t.split("\n");


  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    if (
      lines[i].includes("-->")
    ) {

      const parts =
        lines[i].split("-->");


      const shift =
        x =>
          shiftTime(
            x.trim(),
            delayMs
          );


      lines[i] =
        `${shift(parts[0])} --> ${shift(parts[1])}`;

    }

  }


  return lines.join("\n");

}


/* SUBTITLE TIME SHIFT */

function shiftTime(
  ts,
  ms
) {

  const m =
    ts.match(
      /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/
    );

  if (!m)
    return ts;


  let total =
    (
      (+m[1] * 3600) +
      (+m[2] * 60) +
      (+m[3])
    ) * 1000
    +
    (+m[4])
    +
    ms;


  total =
    Math.max(
      0,
      total
    );


  const h =
    Math.floor(
      total / 3600000
    );

  total %= 3600000;


  const mi =
    Math.floor(
      total / 60000
    );

  total %= 60000;


  const s =
    Math.floor(
      total / 1000
    );

  const ms2 =
    total % 1000;


  return (
    `${String(h).padStart(2,"0")}:` +
    `${String(mi).padStart(2,"0")}:` +
    `${String(s).padStart(2,"0")}.` +
    `${String(ms2).padStart(3,"0")}`
  );

}


/* LOAD SUBTITLE */

function loadSubtitle(file) {

  const r =
    new FileReader();


  r.onload =
    () => {

      subtitleRaw =
        r.result;

      installSubtitle();

      setStatus(
        `Subtitle loaded: ${file.name}`
      );

    };


  r.readAsText(file);

}


/* INSTALL SUBTITLE */

function installSubtitle() {

  if (
    subtitleTrack
  ) {

    subtitleTrack.remove();

  }


  const vtt =
    srtToVtt(
      subtitleRaw,
      subtitleDelay
    );


  const url =
    URL.createObjectURL(
      new Blob(
        [vtt],
        {
          type:"text/vtt"
        }
      )
    );


  subtitleTrack =
    document.createElement(
      "track"
    );


  subtitleTrack.kind =
    "subtitles";

  subtitleTrack.label =
    "Loaded";

  subtitleTrack.srclang =
    "und";

  subtitleTrack.src =
    url;


  video.appendChild(
    subtitleTrack
  );


  subtitleTrack.track.mode =
    subtitleMode === "on"
      ? "showing"
      : "disabled";


  applySubtitleStyle();

  renderSubtitleMenu();

}


/* SUBTITLE CONTROLS */

$("subDelay").onchange =
  () => {

    subtitleDelay =
      Number(
        $("subDelay").value
      ) || 0;

    if (subtitleRaw)
      installSubtitle();

  };


$("subSize").oninput =
  () => {

    subtitleSize =
      Number(
        $("subSize").value
      );

    applySubtitleStyle();

  };


function applySubtitleStyle() {

  let style =
    document.getElementById(
      "subtitle-style"
    );


  if (!style) {

    style =
      document.createElement(
        "style"
      );

    style.id =
      "subtitle-style";

    document.head.appendChild(
      style
    );

  }


  style.textContent =
    `video::cue{
      font-size:${subtitleSize}%
    }`;


  $("subSize").value =
    subtitleSize;

}


/* QUEUE */

function renderQueue() {

  queueEl.innerHTML =
    queue.length

      ?

      queue
        .map(
          (x,i) => `

          <div class="queue-item">

            <button
              data-play="${i}">
              ▶
            </button>

            <div class="name">
              ${escapeHtml(x.name)}
            </div>

            <span class="badge">
              ${
                i === currentIndex
                  ? "Playing"
                  : ""
              }
            </span>

            <button
              data-remove="${i}">
              ×
            </button>

          </div>

        `
        )
        .join("")

      :

      "<div class='status'>Queue empty.</div>";


  queueEl
    .querySelectorAll(
      "[data-play]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            playIndex(
              Number(
                b.dataset.play
              )
            )
    );


  queueEl
    .querySelectorAll(
      "[data-remove]"
    )
    .forEach(
      b =>
        b.onclick =
          () => {

            const i =
              Number(
                b.dataset.remove
              );


            queue.splice(
              i,
              1
            );


            if (
              i < currentIndex
            ) {

              currentIndex--;

            }


            renderQueue();

          }
    );

}


function escapeHtml(s) {

  return s.replace(
    /[&<>"']/g,
    c =>
      ({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#39;"
      }[c])
  );

}


/* FILES */

function addFiles(files) {

  [...files].forEach(
    file => {

      queue.push({

        name:
          file.name,

        file,

        size:
          file.size

      });

    }
  );


  renderQueue();


  if (
    currentIndex < 0 &&
    queue.length
  ) {

    playIndex(0);

  }

}


$("fileInput").onchange =
  e =>
    addFiles(
      e.target.files
    );


$("dropzone").ondragover =
  e => {

    e.preventDefault();

    $("dropzone").style.borderColor =
      "#fff";

  };


$("dropzone").ondragleave =
  () => {

    $("dropzone").style.borderColor =
      "#666";

  };


$("dropzone").ondrop =
  e => {

    e.preventDefault();

    $("dropzone").style.borderColor =
      "#666";

    addFiles(
      e.dataTransfer.files
    );

  };


/* PLAY QUEUE */

async function playIndex(i) {

  if (!queue[i])
    return;


  currentIndex =
    i;


  const item =
    queue[i];


  sourceFile =
    item.file;

  sourceKind =
    "file";


  await loadSource(
    item.file,
    item.name
  );


  renderQueue();

}


/* PLAY URL */

async function playUrl(url) {

  sourceFile =
    null;

  sourceKind =
    "url";

  currentIndex =
    -1;


  await loadSource(
    url,
    url.split("/").pop() ||
    "Remote media"
  );

}


/* LOAD SOURCE */

async function loadSource(
  src,
  name
) {

  externalAudio.pause();

  externalAudio.src =
    "";

  externalTracks =
    [];

  externalAudioActive =
    false;


  video.muted =
    false;


  overlayTitle.textContent =
    name;


  if (
    currentObjectUrl
  ) {

    URL.revokeObjectURL(
      currentObjectUrl
    );

  }


  currentObjectUrl =
    "";


  video.src =
    typeof src === "string"
      ? src
      :
      (
        currentObjectUrl =
          URL.createObjectURL(
            src
          )
      );


  video.load();


  setStatus(
    "Loading…"
  );


  try {

    await video.play();

  } catch {}


  showControls();

}


/* METADATA */

video.addEventListener(
  "loadedmetadata",
  () => {

    const type =
      video.videoWidth
        ? `Video ${video.videoWidth}×${video.videoHeight}`
        : "Audio";


    shell.classList.toggle(
      "audio-only",
      !video.videoWidth
    );


    info.innerHTML =
      `<b>File:</b> ${escapeHtml(titleOfCurrent())}<br>` +
      `<b>Type:</b> ${type}<br>` +
      `<b>Duration:</b> ${fmt(video.duration)}<br>` +
      `<b>Source:</b> ${sourceKind}`;


    setStatus(
      "Ready"
    );


    const saved =
      Number(
        localStorage.getItem(
          "up_resume_" +
          titleOfCurrent()
        )
      );


    if (
      saved > 3 &&
      saved < video.duration - 3
    ) {

      video.currentTime =
        saved;

    }


    renderAudioMenu();

    renderSubtitleMenu();

  }
);


/* UNSUPPORTED CODEC */

video.addEventListener(
  "error",
  async () => {

    if (
      sourceKind === "file" &&
      sourceFile
    ) {

      setStatus(
        "Browser codec unsupported. Trying FFmpeg conversion…"
      );


      try {

        const blob =
          await transcodeToMp4(
            sourceFile,
            p =>
              setStatus(
                `FFmpeg converting ${p.toFixed(0)}%…`
              )
          );


        sourceKind =
          "ffmpeg";


        await loadSource(
          blob,
          titleOfCurrent() +
          " (converted)"
        );


        setStatus(
          "FFmpeg converted playback"
        );


      } catch (e) {

        setStatus(
          "Playback failed: " +
          (e.message || e)
        );

      }


    } else {

      setStatus(
        "Browser could not play this URL. Remote FFmpeg needs CORS access."
      );

    }

  }
);


/* TIME */

video.addEventListener(
  "timeupdate",
  () => {

    if (
      video.duration
    ) {

      progress.value =
        Math.round(
          video.currentTime /
          video.duration *
          1000
        );


      time.textContent =
        `${fmt(video.currentTime)} / ${fmt(video.duration)}`;

    }


    saveState();


    if (
      externalAudioActive
    ) {

      syncExternal(false);

    }

  }
);


/* PLAY */

video.addEventListener(
  "play",
  () => {

    $("playBtn").textContent =
      "⏸";


    if (
      externalAudioActive
    ) {

      externalAudio
        .play()
        .catch(
          () => {}
        );

    }


    showControls();

  }
);


/* PAUSE */

video.addEventListener(
  "pause",
  () => {

    $("playBtn").textContent =
      "▶";


    externalAudio.pause();

    showControls();

  }
);


/* END */

video.addEventListener(
  "ended",
  () => {

    if (
      repeat === "one"
    ) {

      video.currentTime =
        0;

      video.play();

      return;

    }


    if (
      repeat === "all"
    ) {

      nextIndex();

      return;

    }


    if (
      currentIndex >= 0 &&
      currentIndex < queue.length - 1
    ) {

      nextIndex();

    }

  }
);


/* INFO */

video.addEventListener(
  "durationchange",
  renderInfo
);


function renderInfo() {

  if (!video.duration)
    return;


  info.innerHTML =
    `<b>File:</b> ${escapeHtml(titleOfCurrent())}<br>` +
    `<b>Resolution:</b> ${video.videoWidth || "-"}×${video.videoHeight || "-"}<br>` +
    `<b>Duration:</b> ${fmt(video.duration)}<br>` +
    `<b>Current:</b> ${fmt(video.currentTime)}<br>` +
    `<b>Speed:</b> ${video.playbackRate.toFixed(2)}×`;

}


/* VOLUME */

video.addEventListener(
  "volumechange",
  () => {

    $("volume").value =
      video.volume;


    $("audioBtn").textContent =
      video.muted
        ? "🔇"
        : "🔊";

  }
);


/* CONTROLS */

$("progress").oninput =
  () => {

    if (
      video.duration
    ) {

      video.currentTime =
        (
          Number(
            progress.value
          ) / 1000
        ) *
        video.duration;

    }


    syncExternal(true);

  };


$("playBtn").onclick =
  () =>
    video.paused
      ? video.play()
      : video.pause();


$("backBtn").onclick =
  () =>
    video.currentTime =
      Math.max(
        0,
        video.currentTime - 10
      );


$("forwardBtn").onclick =
  () =>
    video.currentTime =
      Math.min(
        video.duration || Infinity,
        video.currentTime + 10
      );


$("prevBtn").onclick =
  prevIndex;


$("nextBtn").onclick =
  nextIndex;


$("speed").onchange =
  () => {

    video.playbackRate =
      Number(
        $("speed").value
      );


    if (
      externalAudioActive
    ) {

      externalAudio.playbackRate =
        video.playbackRate;

    }

  };


$("volume").oninput =
  () => {

    video.volume =
      Number(
        $("volume").value
      );

    externalAudio.volume =
      video.volume;

  };


$("audioBtn").onclick =
  () => {

    video.muted =
      !video.muted;


    if (
      externalAudioActive
    ) {

      externalAudio.muted =
        video.muted;

    }

  };


$("fullscreenBtn").onclick =
  enterFullscreen;


$("fullscreenBtn2").onclick =
  enterFullscreen;


$("aspectBtn").onclick =
  () =>
    toggleMenu(
      $("aspectMenu")
    );


$("moreBtn").onclick =
  () =>
    toggleMenu(
      $("moreMenu")
    );


$("subtitleBtn").onclick =
  () =>
    toggleMenu(
      $("subtitleMenu")
    );


$("audioBtn").ondblclick =
  () =>
    toggleMenu(
      $("audioMenu")
    );


$("shuffleBtn").onclick =
  () => {

    shuffle =
      !shuffle;

    $("shuffleBtn").textContent =
      shuffle
        ? "On"
        : "Off";

    setStatus(
      `Shuffle ${
        shuffle
          ? "enabled"
          : "disabled"
      }`
    );

  };


$("repeat").onchange =
  () =>
    repeat =
      $("repeat").value;


$("urlBtn").onclick =
  () => {

    const u =
      $("urlInput").value.trim();

    if (u)
      playUrl(u);

  };


/* QUEUE NAVIGATION */

function prevIndex() {

  if (
    currentIndex <= 0
  )
    return;


  playIndex(
    currentIndex - 1
  );

}


function nextIndex() {

  if (!queue.length)
    return;


  if (shuffle) {

    let n =
      Math.floor(
        Math.random() *
        queue.length
      );


    if (
      queue.length > 1 &&
      n === currentIndex
    ) {

      n =
        (n + 1) %
        queue.length;

    }


    playIndex(n);

    return;

  }


  if (
    currentIndex <
    queue.length - 1
  ) {

    playIndex(
      currentIndex + 1
    );

  }

  else if (
    repeat === "all"
  ) {

    playIndex(0);

  }

}


/* FULLSCREEN */

async function enterFullscreen() {

  try {

    await shell.requestFullscreen();

    if (
      screen.orientation?.lock
    ) {

      screen.orientation
        .lock("landscape")
        .catch(
          () => {}
        );

    }

  } catch {}

}


document.addEventListener(
  "fullscreenchange",
  () => {

    if (
      !document.fullscreenElement
    ) {

      screen.orientation
        ?.unlock
        ?.()
        .catch
        ?.(
          () => {}
        );

    }

  }
);


/* EXTERNAL AUDIO */

function syncExternal(force) {

  if (
    !externalAudioActive
  )
    return;


  const diff =
    Math.abs(
      (externalAudio.currentTime || 0) -
      video.currentTime
    );


  if (
    force ||
    diff > .35
  ) {

    try {

      externalAudio.currentTime =
        video.currentTime;

    } catch {}

  }

}


async function selectAudio(
  index,
  kind
) {

  if (
    kind === "native"
  ) {

    const tracks =
      video.audioTracks;


    if (!tracks)
      return;


    [
      ...tracks
    ].forEach(
      (t,i) =>
        t.enabled =
          i === index
    );


    closeMenus();

    setStatus(
      "Audio track changed"
    );

    return;

  }


  const t =
    externalTracks[index];


  if (!t)
    return;


  externalAudio.src =
    t.url;


  externalAudio.currentTime =
    video.currentTime;


  externalAudio.playbackRate =
    video.playbackRate;


  externalAudio.volume =
    video.volume;


  externalAudio.muted =
    video.muted;


  externalAudioActive =
    true;


  video.muted =
    true;


  try {

    await externalAudio.play();

  } catch {}


  closeMenus();


  setStatus(
    `Audio: ${t.label}`
  );

}


/* EXTRACT MKV AUDIO */

async function prepareAudioTracks() {

  if (
    audioExtracting
  )
    return;


  if (
    !sourceFile &&
    sourceKind !== "url"
  ) {

    setStatus(
      "Play an MKV/media file first."
    );

    return;

  }


  audioExtracting =
    true;


  setStatus(
    "Preparing audio tracks… This may use a lot of RAM/CPU."
  );


  try {

    const input =
      sourceFile ||
      video.currentSrc;


    const tracks =
      await extractAudioTracks(
        input,
        p =>
          setStatus(
            `Audio extraction ${p.toFixed(0)}%…`
          )
      );


    externalTracks.forEach(
      t =>
        URL.revokeObjectURL(
          t.url
        )
    );


    externalTracks =
      tracks.map(
        t => ({

          ...t,

          url:
            URL.createObjectURL(
              t.blob
            )

        })
      );


    renderAudioMenu();


    setStatus(
      `${externalTracks.length} audio track(s) prepared.`
    );


  } catch (e) {

    setStatus(
      "Audio extraction failed: " +
      (e.message || e)
    );

  } finally {

    audioExtracting =
      false;

  }

}


/* MORE ACTIONS */

function runMore(a) {

  closeMenus();


  if (
    a === "rotate"
  ) {

    rotate =
      (rotate + 90) %
      360;

    transformVideo();

  }


  if (
    a === "mirror"
  ) {

    mirror =
      !mirror;

    transformVideo();

  }


  if (
    a === "flip"
  ) {

    flip =
      !flip;

    transformVideo();

  }


  if (
    a === "pip"
  ) {

    if (
      document.pictureInPictureEnabled &&
      !video.disablePictureInPicture
    ) {

      video
        .requestPictureInPicture()
        .catch(
          () => {}
        );

    }

  }


  if (
    a === "screenshot"
  ) {

    screenshot();

  }


  if (
    a === "frameback"
  ) {

    video.currentTime =
      Math.max(
        0,
        video.currentTime -
        1 / 30
      );

  }


  if (
    a === "frameforward"
  ) {

    video.currentTime =
      Math.min(
        video.duration || Infinity,
        video.currentTime +
        1 / 30
      );

  }


  if (
    a === "stop"
  ) {

    video.pause();

    video.currentTime =
      0;

  }


  if (
    a === "bookmark"
  ) {

    localStorage.setItem(
      "up_bookmark_" +
      titleOfCurrent(),
      String(
        video.currentTime
      )
    );


    setStatus(
      "Bookmark saved."
    );

  }


  if (
    a === "timestamp"
  ) {

    navigator.clipboard
      ?.writeText(
        fmt(
          video.currentTime
        )
      )
      .then(
        () =>
          setStatus(
            "Timestamp copied."
          )
      );

  }


  if (
    a === "extract"
  ) {

    prepareAudioTracks();

  }

}


/* SCREENSHOT */

function screenshot() {

  try {

    const c =
      document.createElement(
        "canvas"
      );


    const w =
      video.videoWidth;

    const h =
      video.videoHeight;


    if (!w || !h)
      throw new Error(
        "No video frame"
      );


    c.width =
      w;

    c.height =
      h;


    const ctx =
      c.getContext(
        "2d"
      );


    ctx.filter =
      getComputedStyle(
        video
      ).filter;


    ctx.translate(
      w / 2,
      h / 2
    );


    ctx.rotate(
      rotate *
      Math.PI /
      180
    );


    ctx.scale(
      mirror ? -1 : 1,
      flip ? -1 : 1
    );


    ctx.drawImage(
      video,
      -w / 2,
      -h / 2,
      w,
      h
    );


    c.toBlob(
      b => {

        const a =
          document.createElement(
            "a"
          );


        a.href =
          URL.createObjectURL(b);


        a.download =
          `screenshot-${Date.now()}.png`;


        a.click();

      },
      "image/png"
    );


  } catch (e) {

    setStatus(
      "Screenshot failed: " +
      e.message
    );

  }

}


/* PLAYER CLICK */

shell.addEventListener(
  "click",
  e => {

    if (
      e.target.closest(
        ".controls,.popover"
      )
    )
      return;


    if (
      video.paused
    )
      video.play();
    else
      video.pause();


    showControls();

  }
);


shell.addEventListener(
  "mousemove",
  showControls
);


shell.addEventListener(
  "touchstart",
  showControls,
  {
    passive:true
  }
);


/* CLOSE MENUS */

document.addEventListener(
  "click",
  e => {

    if (
      !e.target.closest(
        ".popover,#aspectBtn,#moreBtn,#subtitleBtn,#audioBtn"
      )
    ) {

      closeMenus();

    }

  }
);


/* SWIPE */

let touchX = 0;

let touchY = 0;

let touchT = 0;


shell.addEventListener(
  "touchstart",
  e => {

    const t =
      e.changedTouches[0];

    touchX =
      t.clientX;

    touchY =
      t.clientY;

    touchT =
      Date.now();

  },
  {
    passive:true
  }
);


shell.addEventListener(
  "touchend",
  e => {

    const t =
      e.changedTouches[0];

    const dx =
      t.clientX -
      touchX;

    const dy =
      t.clientY -
      touchY;

    const dt =
      Date.now() -
      touchT;


    if (
      dt < 500 &&
      Math.abs(dx) > 70 &&
      Math.abs(dx) >
        Math.abs(dy)
    ) {

      video.currentTime =
        Math.max(
          0,
          Math.min(
            video.duration || Infinity,
            video.currentTime +
              (
                dx > 0
                  ? 10
                  : -10
              )
          )
        );


      showControls();

    }

  },
  {
    passive:true
  }
);


/* KEYBOARD */

document.addEventListener(
  "keydown",
  e => {

    if (
      [
        "INPUT",
        "SELECT",
        "TEXTAREA"
      ].includes(
        document.activeElement.tagName
      )
    )
      return;


    if (
      e.code === "Space" ||
      e.key.toLowerCase() === "k"
    ) {

      e.preventDefault();

      video.paused
        ? video.play()
        : video.pause();

    }


    if (
      e.key === "ArrowRight"
    ) {

      video.currentTime =
        Math.min(
          video.duration || Infinity,
          video.currentTime + 5
        );

    }


    if (
      e.key === "ArrowLeft"
    ) {

      video.currentTime =
        Math.max(
          0,
          video.currentTime - 5
        );

    }


    if (
      e.key === "ArrowUp"
    ) {

      video.volume =
        Math.min(
          1,
          video.volume + .05
        );

    }


    if (
      e.key === "ArrowDown"
    ) {

      video.volume =
        Math.max(
          0,
          video.volume - .05
        );

    }


    if (
      e.key.toLowerCase() === "f"
    )
      enterFullscreen();


    if (
      e.key.toLowerCase() === "m"
    )
      video.muted =
        !video.muted;


    if (
      e.key.toLowerCase() === "n"
    )
      nextIndex();


    if (
      e.key.toLowerCase() === "p"
    )
      prevIndex();


    if (
      e.key === ","
    ) {

      video.currentTime =
        Math.max(
          0,
          video.currentTime -
          1 / 30
        );

    }


    if (
      e.key === "."
    ) {

      video.currentTime =
        Math.min(
          video.duration || Infinity,
          video.currentTime +
          1 / 30
        );

    }


    if (
      e.key === "["
    ) {

      video.playbackRate =
        Math.max(
          .25,
          video.playbackRate -
          .05
        );

    }


    if (
      e.key === "]"
    ) {

      video.playbackRate =
        Math.min(
          4,
          video.playbackRate +
          .05
        );

    }

  }
);


/* FILTERS */

[
  "brightness",
  "contrast",
  "saturation",
  "hue"
].forEach(
  id =>
    $(id).oninput =
      filterVideo
);


/* SAVE */

window.addEventListener(
  "beforeunload",
  saveState
);


/* INITIALIZE */

renderAspectMenu();

renderMoreMenu();

renderAudioMenu();

renderSubtitleMenu();

transformVideo();

applySubtitleStyle();
