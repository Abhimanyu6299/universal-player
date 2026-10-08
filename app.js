import {
  transcodeToMp4,
  extractAudioTracks
} from "./ffmpeg-loader.js";

const $ = id => document.getElementById(id);

const video = $("video");
const shell = $("playerShell");
const youtubeFrame = $("youtubeFrame");
const progress = $("progress");
const timeEl = $("time");
const status = $("status");
const queueEl = $("queue");
const overlayTitle = $("overlayTitle");

let queue = [];
let currentIndex = -1;

let sourceKind = "";
let sourceFile = null;
let currentObjectURL = "";

let hls = null;

let subtitleTrack = null;
let subtitleRaw = "";
let subtitleDelay = 0;
let subtitleMode = "off";
let subtitleSize = 100;

let aspect = localStorage.getItem("up_aspect") || "best";
let rotate = 0;
let mirror = false;
let flip = false;

let shuffle = false;
let repeat = "off";

let hideTimer = null;

let ffmpegAbort = false;

let externalTracks = [];
let externalAudio = new Audio();
externalAudio.preload = "auto";
externalAudioActive = false;

let audioContext = null;
let sourceNode = null;
let gainNode = null;
let bassNode = null;
let trebleNode = null;
let balanceNode = null;

const aspectItems = [
  ["best","Best Fit"],
  ["fit","Fit Screen"],
  ["fill","Fill Screen"],
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

/* SPEED 0.25 -> 4.00 */
for(let x=.25;x<=4.0001;x+=.01){
  const option=document.createElement("option");
  option.value=x.toFixed(2);
  option.textContent=`${x.toFixed(2)}×`;
  $("speed").appendChild(option);
}

$("speed").value="1.00";

/* --------------------------------------------------
   BASIC
-------------------------------------------------- */

function setStatus(message){
  status.textContent=message || "";
}

function escapeHTML(str){
  return String(str).replace(/[&<>"']/g,m=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function fmt(seconds){
  if(!Number.isFinite(seconds)) return "00:00";

  seconds=Math.max(0,Math.floor(seconds));

  const h=Math.floor(seconds/3600);
  const m=Math.floor((seconds%3600)/60);
  const s=seconds%60;

  if(h){
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function bytes(n){
  if(!Number.isFinite(n)) return "—";
  const u=["B","KB","MB","GB","TB"];
  let i=0;
  while(n>=1024 && i<u.length-1){
    n/=1024;
    i++;
  }
  return `${n.toFixed(i?2:0)} ${u[i]}`;
}

function currentTitle(){
  return queue[currentIndex]?.name ||
         overlayTitle.textContent ||
         "current";
}

/* --------------------------------------------------
   CONTROLS VISIBILITY
-------------------------------------------------- */

function showControls(){
  shell.classList.add("controls-visible");

  clearTimeout(hideTimer);

  if(!video.paused){
    hideTimer=setTimeout(()=>{
      shell.classList.remove("controls-visible");
    },3500);
  }
}

shell.addEventListener("mousemove",showControls);
shell.addEventListener("touchstart",showControls,{passive:true});

/* --------------------------------------------------
   FULLSCREEN — PROPER ENTER/EXIT
-------------------------------------------------- */

async function toggleFullscreen(){

  try{

    if(document.fullscreenElement){

      await document.exitFullscreen();

      return;
    }

    if(shell.requestFullscreen){

      await shell.requestFullscreen();

      try{
        await screen.orientation?.lock?.("landscape");
      }catch{}

    }

  }catch(error){

    setStatus("Fullscreen error: "+error.message);

  }
}

document.addEventListener("fullscreenchange",()=>{

  const active=!!document.fullscreenElement;

  $("fullscreenBtn").textContent=active?"⛶":"⛶";
  $("topFullscreen").textContent=active?"⛶":"⛶";

  if(!active){

    try{
      screen.orientation?.unlock?.();
    }catch{}

  }

  showControls();
});

$("fullscreenBtn").onclick=toggleFullscreen;
$("topFullscreen").onclick=toggleFullscreen;

/* --------------------------------------------------
   VIDEO TRANSFORM / ASPECT
-------------------------------------------------- */

function applyAspect(){

  video.style.aspectRatio="auto";

  switch(aspect){

    case "best":
    case "fit":
      video.style.objectFit="contain";
      break;

    case "fill":
      video.style.objectFit="cover";
      break;

    case "stretch":
      video.style.objectFit="fill";
      break;

    case "original":
    case "center":
      video.style.objectFit="none";
      break;

    default:{
      const [w,h]=aspect.split(":").map(Number);
      video.style.objectFit="contain";
      video.style.aspectRatio=`${w}/${h}`;
      break;
    }
  }

  video.style.objectPosition="center";

  localStorage.setItem("up_aspect",aspect);

  renderAspectMenu();
}

function transformVideo(){

  video.style.transform=
    `rotate(${rotate}deg) scale(${mirror?-1:1},${flip?-1:1})`;

  applyAspect();
}

/* --------------------------------------------------
   VIDEO FILTERS
-------------------------------------------------- */

function filterVideo(){

  const b=$("brightness").value;
  const c=$("contrast").value;
  const s=$("saturation").value;
  const h=$("hue").value;

  video.style.filter=
    `brightness(${b}%) contrast(${c}%) saturate(${s}%) hue-rotate(${h}deg)`;

  $("brightnessValue").textContent=`${b}%`;
  $("contrastValue").textContent=`${c}%`;
  $("saturationValue").textContent=`${s}%`;
  $("hueValue").textContent=`${h}°`;
}

["brightness","contrast","saturation","hue"].forEach(id=>{
  $(id).oninput=filterVideo;
});

/* --------------------------------------------------
   RANGE +/- BUTTONS
-------------------------------------------------- */

document.querySelectorAll("[data-range]").forEach(button=>{

  button.onclick=()=>{

    const id=button.dataset.range;
    const step=Number(button.dataset.step);
    const input=$(id);

    if(!input) return;

    let value=Number(input.value)+step;

    const min=Number(input.min);
    const max=Number(input.max);

    value=Math.max(min,Math.min(max,value));

    input.value=value;

    input.dispatchEvent(new Event("input",{bubbles:true}));
  };
});

/* --------------------------------------------------
   VOLUME
-------------------------------------------------- */

$("volume").oninput=()=>{

  const value=Number($("volume").value);

  video.volume=value;

  $("volumeValue").textContent=
    `${Math.round(value*100)}%`;

  if(externalAudioActive){
    externalAudio.volume=value;
  }
};

$("audioBtn").onclick=()=>{

  video.muted=!video.muted;

  $("audioBtn").textContent=
    video.muted?"🔇":"🔊";
};

/* --------------------------------------------------
   AUDIO DSP
-------------------------------------------------- */

async function createAudioGraph(){

  if(audioContext) return;

  try{

    audioContext=
      new (window.AudioContext||window.webkitAudioContext)();

    sourceNode=
      audioContext.createMediaElementSource(video);

    gainNode=
      audioContext.createGain();

    bassNode=
      audioContext.createBiquadFilter();

    trebleNode=
      audioContext.createBiquadFilter();

    balanceNode=
      audioContext.createStereoPanner();

    bassNode.type="lowshelf";
    bassNode.frequency.value=200;

    trebleNode.type="highshelf";
    trebleNode.frequency.value=3000;

    sourceNode
      .connect(gainNode)
      .connect(bassNode)
      .connect(trebleNode)
      .connect(balanceNode)
      .connect(audioContext.destination);

    updateAudioDSP();

  }catch(error){

    console.warn("Audio graph unavailable",error);

  }
}

function updateAudioDSP(){

  if(!audioContext) return;

  gainNode.gain.value=
    Number($("gain").value)/100;

  bassNode.gain.value=
    Number($("bass").value);

  trebleNode.gain.value=
    Number($("treble").value);

  balanceNode.pan.value=
    Number($("balance").value);

  $("gainValue").textContent=
    `${$("gain").value}%`;

  $("bassValue").textContent=
    `${$("bass").value} dB`;

  $("trebleValue").textContent=
    `${$("treble").value} dB`;

  $("balanceValue").textContent=
    Number($("balance").value).toFixed(2);
}

["gain","bass","treble","balance"].forEach(id=>{
  $(id).oninput=updateAudioDSP;
});

video.addEventListener("play",async()=>{
  try{
    await createAudioGraph();
    await audioContext?.resume?.();
  }catch{}
});

/* --------------------------------------------------
   QUALITY / HLS
-------------------------------------------------- */

function clearQuality(){

  $("qualitySelect").innerHTML=
    `<option value="">Quality</option>`;
}

function setupQuality(){

  clearQuality();

  if(!hls || !hls.levels?.length){
    return;
  }

  const auto=document.createElement("option");

  auto.value="-1";
  auto.textContent="Auto";

  $("qualitySelect").appendChild(auto);

  hls.levels.forEach((level,index)=>{

    const option=document.createElement("option");

    option.value=index;

    const height=level.height
      ? `${level.height}p`
      : `${Math.round((level.bitrate||0)/1000)} kbps`;

    option.textContent=height;

    $("qualitySelect").appendChild(option);
  });

  $("qualitySelect").value=String(hls.currentLevel);
}

$("qualitySelect").onchange=()=>{

  if(!hls) return;

  const level=Number($("qualitySelect").value);

  if(Number.isFinite(level)){

    hls.currentLevel=level;

    setStatus(
      level===-1
      ?"Quality: Auto"
      :`Quality: ${hls.levels[level]?.height || "Custom"}p`
    );
  }
};

/* --------------------------------------------------
   HLS LOAD
-------------------------------------------------- */

function destroyHLS(){

  if(hls){

    try{
      hls.destroy();
    }catch{}

    hls=null;
  }

  clearQuality();
}

function loadHLS(url){

  destroyHLS();

  sourceKind="hls";

  if(window.Hls && Hls.isSupported()){

    hls=new Hls({
      enableWorker:true,
      lowLatencyMode:false,
      backBufferLength:90,
      maxBufferLength:60,
      capLevelToPlayerSize:false
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED,()=>{

      setupQuality();

      setStatus(
        `HLS loaded • ${hls.levels.length} quality level(s)`
      );

      video.play().catch(()=>{});
    });

    hls.on(Hls.Events.ERROR,(event,data)=>{

      if(data.fatal){

        setStatus(
          `HLS error: ${data.details || "Playback error"}`
        );

        try{
          hls.recoverMediaError();
        }catch{}
      }
    });

    return;
  }

  if(video.canPlayType("application/vnd.apple.mpegurl")){

    video.src=url;
    video.play().catch(()=>{});

    setStatus("Native HLS playback");

    return;
  }

  throw new Error("This browser cannot play HLS.");
}

/* --------------------------------------------------
   YOUTUBE
-------------------------------------------------- */

function youtubeId(url){

  try{

    const u=new URL(url);

    if(u.hostname.includes("youtu.be")){
      return u.pathname.slice(1);
    }

    if(
      u.hostname.includes("youtube.com") ||
      u.hostname.includes("youtube-nocookie.com")
    ){

      if(u.pathname==="/watch"){
        return u.searchParams.get("v");
      }

      if(u.pathname.startsWith("/shorts/")){
        return u.pathname.split("/")[2];
      }

      if(u.pathname.startsWith("/embed/")){
        return u.pathname.split("/")[2];
      }
    }

  }catch{}

  return null;
}

function playYouTube(url){

  const id=youtubeId(url);

  if(!id){
    throw new Error("Invalid YouTube URL");
  }

  destroyHLS();

  sourceKind="youtube";

  video.pause();
  video.removeAttribute("src");
  video.load();

  video.style.display="none";

  youtubeFrame.style.display="block";

  youtubeFrame.src=
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;

  shell.classList.add("youtube-mode");

  overlayTitle.textContent="YouTube";

  setStatus(
    "YouTube loaded. Quality controls are handled by YouTube's player."
  );
}

/* --------------------------------------------------
   DIRECT URL
-------------------------------------------------- */

async function playUrl(url){

  if(!url) return;

  try{

    new URL(url);

  }catch{

    setStatus("Invalid URL.");
    return;
  }

  const yt=youtubeId(url);

  if(yt){

    playYouTube(url);
    return;
  }

  youtubeFrame.src="";
  youtubeFrame.style.display="none";

  video.style.display="block";

  shell.classList.remove("youtube-mode");

  destroyHLS();

  sourceFile=null;
  sourceKind="url";

  overlayTitle.textContent=url;

  const lower=url.toLowerCase().split("?")[0];

  try{

    if(
      lower.endsWith(".m3u8") ||
      lower.includes(".m3u8")
    ){

      loadHLS(url);
      return;
    }

    video.src=url;
    video.load();

    setStatus(
      "Loading remote media…"
    );

    await video.play();

  }catch(error){

    setStatus(
      "Video URL could not be played. The remote server may block browser CORS/range access or the format may not be browser-compatible.\n"+
      error.message
    );
  }
}

/* --------------------------------------------------
   LOCAL FILE
-------------------------------------------------- */

async function playFile(file,index=-1){

  if(!file) return;

  if(file.type==="text/vtt" || /\.srt$/i.test(file.name)){
    loadSubtitle(file);
    return;
  }

  currentIndex=index;

  sourceFile=file;
  sourceKind="local";

  youtubeFrame.src="";
  youtubeFrame.style.display="none";

  video.style.display="block";

  shell.classList.remove("youtube-mode");

  destroyHLS();

  if(currentObjectURL){

    try{
      URL.revokeObjectURL(currentObjectURL);
    }catch{}
  }

  currentObjectURL=
    URL.createObjectURL(file);

  video.src=currentObjectURL;
  video.load();

  overlayTitle.textContent=file.name;

  setStatus(`Loading: ${file.name}`);

  updateInfo(file);

  try{

    await video.play();

    setStatus(`Playing: ${file.name}`);

  }catch(error){

    setStatus(
      `Native playback failed. Trying FFmpeg…`
    );

    await fallbackFFmpeg(file);
  }
}

/* --------------------------------------------------
   FFMPEG FALLBACK
-------------------------------------------------- */

async function fallbackFFmpeg(file){

  if(file.size>1024*1024*1024){

    const yes=confirm(
      "This file is larger than 1 GB.\n\n"+
      "FFmpeg conversion may use a lot of RAM/CPU. Continue?"
    );

    if(!yes){

      setStatus("FFmpeg cancelled.");
      return;
    }
  }

  $("ffmpegProgressWrap").style.display="block";
  $("ffmpegProgress").value=0;

  ffmpegAbort=false;

  try{

    const blob=await transcodeToMp4(
      file,
      percent=>{
        $("ffmpegProgress").value=percent;

        setStatus(
          `FFmpeg conversion: ${percent.toFixed(1)}%`
        );
      },
      ()=>ffmpegAbort
    );

    if(ffmpegAbort){

      setStatus("FFmpeg cancelled.");
      return;
    }

    if(currentObjectURL){

      try{
        URL.revokeObjectURL(currentObjectURL);
      }catch{}
    }

    currentObjectURL=
      URL.createObjectURL(blob);

    video.src=currentObjectURL;
    sourceKind="ffmpeg";

    video.load();

    await video.play();

    setStatus(
      "FFmpeg conversion complete. Playing converted media."
    );

  }catch(error){

    setStatus(
      "FFmpeg playback failed:\n"+
      (error.message||error)
    );

  }finally{

    $("ffmpegProgressWrap").style.display="none";
  }
}

$("cancelFFmpeg").onclick=()=>{
  ffmpegAbort=true;
};

/* --------------------------------------------------
   FILE INPUT
-------------------------------------------------- */

$("fileInput").onchange=()=>{

  const files=[...$("fileInput").files];

  if(!files.length) return;

  queue=files.map(file=>({
    name:file.name,
    file
  }));

  currentIndex=0;

  renderQueue();

  playFile(queue[0].file,0);
};

/* --------------------------------------------------
   DRAG DROP
-------------------------------------------------- */

const dropzone=$("dropzone");

dropzone.addEventListener("dragover",e=>{
  e.preventDefault();
  dropzone.classList.add("drag");
});

dropzone.addEventListener("dragleave",()=>{
  dropzone.classList.remove("drag");
});

dropzone.addEventListener("drop",e=>{

  e.preventDefault();

  dropzone.classList.remove("drag");

  const files=[...e.dataTransfer.files];

  if(!files.length) return;

  queue=files.map(file=>({
    name:file.name,
    file
  }));

  currentIndex=0;

  renderQueue();

  playFile(queue[0].file,0);
});

/* --------------------------------------------------
   QUEUE
-------------------------------------------------- */

function renderQueue(){

  if(!queue.length){

    queueEl.innerHTML=
      `<div class="status">Queue is empty.</div>`;

    return;
  }

  queueEl.innerHTML=queue.map((item,index)=>`

    <div class="queue-item">

      <button data-play="${index}">
        ▶
      </button>

      <div class="name">
        ${escapeHTML(item.name)}
      </div>

      <span class="badge">
        ${index===currentIndex?"Playing":""}
      </span>

    </div>

  `).join("");

  queueEl.querySelectorAll("[data-play]").forEach(btn=>{

    btn.onclick=()=>{
      const index=Number(btn.dataset.play);
      playFile(queue[index].file,index);
    };

  });
}

/* --------------------------------------------------
   NEXT / PREVIOUS
-------------------------------------------------- */

function previous(){

  if(currentIndex>0){

    playFile(
      queue[currentIndex-1].file,
      currentIndex-1
    );
  }
}

function next(){

  if(!queue.length) return;

  if(shuffle){

    if(queue.length===1) return;

    let nextIndex;

    do{
      nextIndex=
        Math.floor(Math.random()*queue.length);
    }while(nextIndex===currentIndex);

    playFile(queue[nextIndex].file,nextIndex);

    return;
  }

  if(currentIndex<queue.length-1){

    playFile(
      queue[currentIndex+1].file,
      currentIndex+1
    );

    return;
  }

  if(repeat==="all"){

    playFile(queue[0].file,0);
  }
}

$("prevBtn").onclick=previous;
$("nextBtn").onclick=next;

$("shuffleBtn").onclick=()=>{

  shuffle=!shuffle;

  $("shuffleBtn").textContent=
    shuffle?"On":"Off";
};

$("repeat").onchange=()=>{
  repeat=$("repeat").value;
};

/* --------------------------------------------------
   PLAY / PAUSE
-------------------------------------------------- */

$("playBtn").onclick=()=>{

  if(sourceKind==="youtube") return;

  if(video.paused){

    video.play().catch(()=>{});

  }else{

    video.pause();

  }
};

video.addEventListener("play",()=>{
  $("playBtn").textContent="❚❚";
  showControls();
});

video.addEventListener("pause",()=>{
  $("playBtn").textContent="▶";
  showControls();
});

video.addEventListener("ended",()=>{

  if(repeat==="one"){

    video.currentTime=0;
    video.play().catch(()=>{});

    return;
  }

  next();
});

/* --------------------------------------------------
   SEEK
-------------------------------------------------- */

$("backBtn").onclick=()=>{
  video.currentTime=Math.max(
    0,
    video.currentTime-10
  );
};

$("forwardBtn").onclick=()=>{
  video.currentTime=Math.min(
    video.duration||Infinity,
    video.currentTime+10
  );
};

progress.oninput=()=>{

  if(!Number.isFinite(video.duration)) return;

  video.currentTime=
    Number(progress.value)/1000*
    video.duration;
};

video.addEventListener("timeupdate",()=>{

  if(Number.isFinite(video.duration)){

    progress.value=
      Math.round(
        video.currentTime/
        video.duration*
        1000
      );

    timeEl.textContent=
      `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
  }

  $("infoPosition").textContent=
    `Position: ${fmt(video.currentTime)}`;

});

/* --------------------------------------------------
   SPEED
-------------------------------------------------- */

$("speed").onchange=()=>{
  video.playbackRate=
    Number($("speed").value);
};

/* --------------------------------------------------
   ASPECT MENU
-------------------------------------------------- */

function renderAspectMenu(){

  const m=$("aspectMenu");

  m.innerHTML=
    `<div class="menu-title">Aspect Ratio</div>`+
    aspectItems.map(([value,label])=>`
      <button
        class="menu-item ${value===aspect?"active":""}"
        data-aspect="${value}">
        ${value===aspect?"✓ ":""}${label}
      </button>
    `).join("");

  m.querySelectorAll("[data-aspect]").forEach(btn=>{

    btn.onclick=()=>{

      aspect=btn.dataset.aspect;

      transformVideo();

      closeMenus();
    };

  });
}

$("aspectBtn").onclick=()=>{
  toggleMenu($("aspectMenu"));
};

/* --------------------------------------------------
   AUDIO MENU
-------------------------------------------------- */

function renderAudioMenu(){

  const m=$("audioMenu");

  let items=[];

  if(video.audioTracks?.length){

    [...video.audioTracks].forEach((track,index)=>{

      items.push({
        index,
        label:
          track.label ||
          track.language ||
          `Audio ${index+1}`,
        kind:"native"
      });

    });
  }

  if(externalTracks.length){

    externalTracks.forEach((track,index)=>{

      items.push({
        index,
        label:track.label,
        kind:"external"
      });

    });
  }

  if(!items.length){

    m.innerHTML=`
      <div class="menu-title">Audio Tracks</div>
      <button class="menu-item" data-extract>
        No switchable tracks detected
        <small>Try preparing MKV audio tracks</small>
      </button>
    `;

    m.querySelector("[data-extract]").onclick=
      prepareAudioTracks;

    return;
  }

  m.innerHTML=
    `<div class="menu-title">Audio Tracks</div>`+
    items.map(item=>`
      <button
        class="menu-item"
        data-audio="${item.index}"
        data-kind="${item.kind}">
        ${escapeHTML(item.label)}
      </button>
    `).join("");

  m.querySelectorAll("[data-audio]").forEach(btn=>{

    btn.onclick=()=>{
      selectAudio(
        Number(btn.dataset.audio),
        btn.dataset.kind
      );
    };

  });
}

async function selectAudio(index,kind){

  if(kind==="native"){

    [...video.audioTracks].forEach(
      (track,i)=>{
        track.enabled=i===index;
      }
    );

    setStatus("Audio track changed.");
    closeMenus();

    return;
  }

  const track=externalTracks[index];

  if(!track) return;

  externalAudio.src=track.url;
  externalAudio.currentTime=
    video.currentTime;

  externalAudio.playbackRate=
    video.playbackRate;

  externalAudio.volume=
    video.volume;

  video.muted=true;

  externalAudioActive=true;

  try{
    await externalAudio.play();
  }catch{}

  setStatus(`Audio: ${track.label}`);

  closeMenus();
}

$("audioBtn").ondblclick=()=>{
  toggleMenu($("audioMenu"));
};

$("audioBtn").onclick=()=>{
  video.muted=!video.muted;
  $("audioBtn").textContent=
    video.muted?"🔇":"🔊";
};

async function prepareAudioTracks(){

  closeMenus();

  if(!sourceFile){

    setStatus(
      "Load a local MKV/media file first."
    );

    return;
  }

  setStatus(
    "Extracting audio tracks…"
  );

  try{

    externalTracks.forEach(track=>{
      try{
        URL.revokeObjectURL(track.url);
      }catch{}
    });

    const result=
      await extractAudioTracks(
        sourceFile,
        percent=>{
          setStatus(
            `Audio extraction ${percent.toFixed(1)}%`
          );
        }
      );

    externalTracks=result.map(track=>({
      ...track,
      url:URL.createObjectURL(track.blob)
    }));

    renderAudioMenu();

    setStatus(
      `${externalTracks.length} audio track(s) prepared.`
    );

  }catch(error){

    setStatus(
      "Audio extraction failed: "+
      (error.message||error)
    );
  }
}

/* --------------------------------------------------
   SUBTITLES
-------------------------------------------------- */

const subtitleInput=document.createElement("input");

subtitleInput.type="file";
subtitleInput.accept=".srt,.vtt,text/vtt";
subtitleInput.className="hidden";

document.body.appendChild(subtitleInput);

function shiftTimestamp(timestamp,delay){

  const match=
    timestamp.match(
      /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/
    );

  if(!match) return timestamp;

  let total=
    Number(match[1])*3600000+
    Number(match[2])*60000+
    Number(match[3])*1000+
    Number(match[4])+
    delay;

  total=Math.max(0,total);

  const h=Math.floor(total/3600000);
  total%=3600000;

  const m=Math.floor(total/60000);
  total%=60000;

  const s=Math.floor(total/1000);
  const ms=total%1000;

  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(ms).padStart(3,"0")}`;
}

function convertSubtitle(text,delay){

  let output=text
    .replace(/\r/g,"")
    .trim();

  if(!output.startsWith("WEBVTT")){
    output="WEBVTT\n\n"+output;
  }

  return output
    .split("\n")
    .map(line=>{

      if(!line.includes("-->")) return line;

      const parts=line.split("-->");

      return `${shiftTimestamp(parts[0].trim(),delay)} --> ${shiftTimestamp(parts[1].trim(),delay)}`;
    })
    .join("\n");
}

function installSubtitle(){

  if(subtitleTrack){

    try{
      URL.revokeObjectURL(
        subtitleTrack.dataset.url
      );
    }catch{}

    subtitleTrack.remove();
  }

  const vtt=
    convertSubtitle(
      subtitleRaw,
      subtitleDelay
    );

  const url=
    URL.createObjectURL(
      new Blob(
        [vtt],
        {type:"text/vtt"}
      )
    );

  subtitleTrack=
    document.createElement("track");

  subtitleTrack.kind="subtitles";
  subtitleTrack.label="Loaded subtitle";
  subtitleTrack.srclang="und";
  subtitleTrack.src=url;
  subtitleTrack.dataset.url=url;

  video.appendChild(subtitleTrack);

  subtitleTrack.track.mode=
    subtitleMode==="on"
    ?"showing"
    :"disabled";

  applySubtitleStyle();

  renderSubtitleMenu();
}

function loadSubtitle(file){

  const reader=new FileReader();

  reader.onload=()=>{

    subtitleRaw=
      String(reader.result||"");

    subtitleMode="on";

    installSubtitle();

    setStatus(
      `Subtitle loaded: ${file.name}`
    );
  };

  reader.readAsText(file);
}

subtitleInput.onchange=()=>{

  if(subtitleInput.files[0]){
    loadSubtitle(
      subtitleInput.files[0]
    );
  }
};

function applySubtitleStyle(){

  let style=
    document.getElementById(
      "subtitle-style"
    );

  if(!style){

    style=document.createElement("style");
    style.id="subtitle-style";

    document.head.appendChild(style);
  }

  style.textContent=
    `video::cue{font-size:${subtitleSize}%}`;

  $("subSize").value=subtitleSize;

  $("subSizeValue").textContent=
    `${subtitleSize}%`;
}

$("subSize").oninput=()=>{
  subtitleSize=
    Number($("subSize").value);

  applySubtitleStyle();
};

$("subDelay").onchange=()=>{

  subtitleDelay=
    Number($("subDelay").value)||0;

  if(subtitleRaw){
    installSubtitle();
  }
};

function renderSubtitleMenu(){

  const m=$("subtitleMenu");

  m.innerHTML=`
    <div class="menu-title">
      Subtitles
    </div>

    <button class="menu-item ${subtitleMode==="off"?"active":""}" data-sub="off">
      ${subtitleMode==="off"?"✓ ":""}Off
    </button>

    ${
      subtitleTrack
      ?`
        <button class="menu-item ${subtitleMode==="on"?"active":""}" data-sub="on">
          ${subtitleMode==="on"?"✓ ":""}Loaded Subtitle
        </button>
      `
      :""
    }

    <button class="menu-item" data-sub="load">
      Load SRT / VTT
    </button>

    <button class="menu-item" data-sub="minus">
      Subtitle Size −
    </button>

    <button class="menu-item" data-sub="plus">
      Subtitle Size +
    </button>
  `;

  m.querySelectorAll("[data-sub]").forEach(btn=>{

    btn.onclick=()=>{

      const action=btn.dataset.sub;

      if(action==="load"){
        subtitleInput.click();
        return;
      }

      if(action==="off"){

        subtitleMode="off";

        if(subtitleTrack)
          subtitleTrack.track.mode="disabled";

        renderSubtitleMenu();
        return;
      }

      if(action==="on"){

        subtitleMode="on";

        if(subtitleTrack)
          subtitleTrack.track.mode="showing";

        renderSubtitleMenu();
        return;
      }

      if(action==="minus"){

        subtitleSize=
          Math.max(
            50,
            subtitleSize-10
          );

        applySubtitleStyle();
        return;
      }

      if(action==="plus"){

        subtitleSize=
          Math.min(
            250,
            subtitleSize+10
          );

        applySubtitleStyle();
      }
    };
  });
}

$("subtitleBtn").onclick=()=>{
  toggleMenu($("subtitleMenu"));
};

/* --------------------------------------------------
   MORE MENU
-------------------------------------------------- */

function renderMoreMenu(){

  const m=$("moreMenu");

  m.innerHTML=`

    <div class="menu-title">
      Advanced Controls
    </div>

    <button class="menu-item" data-action="rotate">
      ↻ Rotate 90°
    </button>

    <button class="menu-item" data-action="mirror">
      ⇋ Mirror
    </button>

    <button class="menu-item" data-action="flip">
      ⇵ Flip
    </button>

    <button class="menu-item" data-action="pip">
      ▣ Picture in Picture
    </button>

    <button class="menu-item" data-action="screenshot">
      📷 Screenshot
    </button>

    <button class="menu-item" data-action="frameback">
      ◀ Previous Frame
    </button>

    <button class="menu-item" data-action="frameforward">
      Next Frame ▶
    </button>

    <button class="menu-item" data-action="bookmark">
      🔖 Save Bookmark
    </button>

    <button class="menu-item" data-action="timestamp">
      ⏱ Copy Timestamp
    </button>

    <button class="menu-item" data-action="extract">
      🎧 Prepare MKV Audio Tracks
    </button>

    <button class="menu-item" data-action="stop">
      ■ Stop
    </button>

  `;

  m.querySelectorAll("[data-action]").forEach(btn=>{

    btn.onclick=()=>{
      runMore(btn.dataset.action);
    };

  });
}

async function runMore(action){

  closeMenus();

  switch(action){

    case "rotate":
      rotate=(rotate+90)%360;
      transformVideo();
      break;

    case "mirror":
      mirror=!mirror;
      transformVideo();
      break;

    case "flip":
      flip=!flip;
      transformVideo();
      break;

    case "pip":

      if(
        document.pictureInPictureEnabled &&
        !video.disablePictureInPicture
      ){

        try{
          await video.requestPictureInPicture();
        }catch(error){
          setStatus(error.message);
        }
      }

      break;

    case "screenshot":
      screenshot();
      break;

    case "frameback":
      video.currentTime=
        Math.max(
          0,
          video.currentTime-1/30
        );
      break;

    case "frameforward":
      video.currentTime=
        Math.min(
          video.duration||Infinity,
          video.currentTime+1/30
        );
      break;

    case "bookmark":

      localStorage.setItem(
        "up_bookmark_"+currentTitle(),
        String(video.currentTime)
      );

      setStatus("Bookmark saved.");
      break;

    case "timestamp":

      try{

        await navigator.clipboard.writeText(
          fmt(video.currentTime)
        );

        setStatus("Timestamp copied.");

      }catch{

        setStatus(
          `Timestamp: ${fmt(video.currentTime)}`
        );
      }

      break;

    case "extract":
      prepareAudioTracks();
      break;

    case "stop":

      video.pause();
      video.currentTime=0;
      break;
  }
}

$("moreBtn").onclick=()=>{
  toggleMenu($("moreMenu"));
};

/* --------------------------------------------------
   SCREENSHOT
-------------------------------------------------- */

function screenshot(){

  if(sourceKind==="youtube"){

    setStatus(
      "Screenshot is disabled for YouTube iframe playback."
    );

    return;
  }

  try{

    const width=video.videoWidth;
    const height=video.videoHeight;

    if(!width || !height)
      throw new Error("No video frame.");

    const canvas=
      document.createElement("canvas");

    const rotated=
      rotate===90 ||
      rotate===270;

    canvas.width=
      rotated?height:width;

    canvas.height=
      rotated?width:height;

    const ctx=
      canvas.getContext("2d");

    ctx.filter=
      getComputedStyle(video).filter;

    ctx.translate(
      canvas.width/2,
      canvas.height/2
    );

    ctx.rotate(
      rotate*Math.PI/180
    );

    ctx.scale(
      mirror?-1:1,
      flip?-1:1
    );

    ctx.drawImage(
      video,
      -width/2,
      -height/2,
      width,
      height
    );

    canvas.toBlob(blob=>{

      if(!blob) return;

      const url=
        URL.createObjectURL(blob);

      const a=
        document.createElement("a");

      a.href=url;
      a.download=
        `Universal-Player-${Date.now()}.png`;

      a.click();

      setTimeout(()=>{
        URL.revokeObjectURL(url);
      },1000);

    },"image/png");

  }catch(error){

    setStatus(
      "Screenshot failed: "+
      error.message
    );
  }
}

/* --------------------------------------------------
   MENUS
-------------------------------------------------- */

function toggleMenu(menu){

  document.querySelectorAll(".popover")
    .forEach(item=>{
      if(item!==menu)
        item.classList.remove("open");
    });

  menu.classList.toggle("open");

  showControls();
}

function closeMenus(){

  document.querySelectorAll(".popover")
    .forEach(menu=>{
      menu.classList.remove("open");
    });
}

document.addEventListener("click",event=>{

  if(
    !event.target.closest(
      ".popover,#audioBtn,#subtitleBtn,#aspectBtn,#moreBtn"
    )
  ){
    closeMenus();
  }

});

/* --------------------------------------------------
   TOUCH GESTURES
-------------------------------------------------- */

let touchX=0;
let touchY=0;
let touchTime=0;

shell.addEventListener("touchstart",event=>{

  const t=event.changedTouches[0];

  touchX=t.clientX;
  touchY=t.clientY;
  touchTime=Date.now();

},{passive:true});

shell.addEventListener("touchend",event=>{

  const t=event.changedTouches[0];

  const dx=t.clientX-touchX;
  const dy=t.clientY-touchY;
  const dt=Date.now()-touchTime;

  if(
    dt<500 &&
    Math.abs(dx)>70 &&
    Math.abs(dx)>Math.abs(dy)
  ){

    video.currentTime=
      Math.max(
        0,
        Math.min(
          video.duration||Infinity,
          video.currentTime+
          (dx>0?10:-10)
        )
      );
  }

},{passive:true});

/* --------------------------------------------------
   DOUBLE TAP
-------------------------------------------------- */

let lastTap=0;

shell.addEventListener("touchend",event=>{

  const now=Date.now();

  if(now-lastTap<300){

    const rect=
      shell.getBoundingClientRect();

    const x=
      event.changedTouches[0].clientX-
      rect.left;

    if(x<rect.width/2){

      video.currentTime=
        Math.max(
          0,
          video.currentTime-10
        );

    }else{

      video.currentTime=
        Math.min(
          video.duration||Infinity,
          video.currentTime+10
        );
    }
  }

  lastTap=now;

},{passive:true});

/* --------------------------------------------------
   KEYBOARD
-------------------------------------------------- */

document.addEventListener("keydown",event=>{

  if(
    ["INPUT","SELECT","TEXTAREA"].includes(
      document.activeElement?.tagName
    )
  ){
    return;
  }

  switch(event.key){

    case " ":
    case "k":
    case "K":

      event.preventDefault();

      if(video.paused)
        video.play().catch(()=>{});
      else
        video.pause();

      break;

    case "ArrowRight":

      video.currentTime=
        Math.min(
          video.duration||Infinity,
          video.currentTime+5
        );

      break;

    case "ArrowLeft":

      video.currentTime=
        Math.max(
          0,
          video.currentTime-5
        );

      break;

    case "ArrowUp":

      video.volume=
        Math.min(
          1,
          video.volume+.05
        );

      $("volume").value=
        video.volume;

      $("volume").dispatchEvent(
        new Event("input")
      );

      break;

    case "ArrowDown":

      video.volume=
        Math.max(
          0,
          video.volume-.05
        );

      $("volume").value=
        video.volume;

      $("volume").dispatchEvent(
        new Event("input")
      );

      break;

    case "f":
    case "F":
      toggleFullscreen();
      break;

    case "m":
    case "M":
      video.muted=!video.muted;
      break;

    case "n":
    case "N":
      next();
      break;

    case "p":
    case "P":
      previous();
      break;

    case ",":
      video.currentTime=
        Math.max(
          0,
          video.currentTime-1/30
        );
      break;

    case ".":

      video.currentTime=
        Math.min(
          video.duration||Infinity,
          video.currentTime+1/30
        );

      break;

    case "[":

      video.playbackRate=
        Math.max(
          .25,
          video.playbackRate-.05
        );

      $("speed").value=
        video.playbackRate.toFixed(2);

      break;

    case "]":

      video.playbackRate=
        Math.min(
          4,
          video.playbackRate+.05
        );

      $("speed").value=
        video.playbackRate.toFixed(2);

      break;

    case "Escape":

      if(document.fullscreenElement)
        document.exitFullscreen();

      break;
  }
});

/* --------------------------------------------------
   INFO
-------------------------------------------------- */

function updateInfo(file){

  $("infoFile").textContent=
    `File: ${file.name}`;

  $("infoType").textContent=
    `Type: ${file.type||"Unknown"}`;

  $("infoSize").textContent=
    `Size: ${bytes(file.size)}`;

  $("infoSource").textContent=
    `Source: ${sourceKind}`;
}

video.addEventListener("loadedmetadata",()=>{

  $("infoResolution").textContent=
    `Resolution: ${video.videoWidth||"—"} × ${video.videoHeight||"—"}`;

  $("infoDuration").textContent=
    `Duration: ${fmt(video.duration)}`;

  $("infoFPS").textContent=
    `FPS: Browser-reported / unavailable`;

  $("infoSource").textContent=
    `Source: ${sourceKind}`;

  const title=
    currentTitle();

  const saved=
    Number(
      localStorage.getItem(
        "up_resume_"+title
      )
    );

  if(
    Number.isFinite(saved) &&
    saved>3 &&
    saved<video.duration-3
  ){

    video.currentTime=saved;

    setStatus(
      `Resume position restored: ${fmt(saved)}`
    );
  }

  renderAudioMenu();
});

/* --------------------------------------------------
   SAVE RESUME
-------------------------------------------------- */

function saveResume(){

  if(
    !video.currentSrc ||
    !Number.isFinite(video.currentTime)
  ) return;

  localStorage.setItem(
    "up_resume_"+currentTitle(),
    String(video.currentTime)
  );
}

video.addEventListener(
  "pause",
  saveResume
);

window.addEventListener(
  "beforeunload",
  saveResume
);

/* --------------------------------------------------
   ERROR HANDLING
-------------------------------------------------- */

video.addEventListener("error",async()=>{

  if(sourceKind==="local" && sourceFile){

    setStatus(
      "Native decoder failed. Starting FFmpeg fallback…"
    );

    await fallbackFFmpeg(sourceFile);

  }else{

    const error=video.error;

    setStatus(
      "Playback error: "+
      (error?.message||
       "Unsupported format, CORS restriction, or invalid media URL.")
    );
  }
});

/* --------------------------------------------------
   URL
-------------------------------------------------- */

$("urlBtn").onclick=()=>{

  const url=
    $("urlInput").value.trim();

  if(url)
    playUrl(url);
};

/* --------------------------------------------------
   INITIALIZE
-------------------------------------------------- */

renderQueue();
renderAspectMenu();
renderMoreMenu();
renderAudioMenu();
renderSubtitleMenu();

filterVideo();
applySubtitleStyle();
transformVideo();

setStatus(
  "Universal Player Ultra ready."
);
