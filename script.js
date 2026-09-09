const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const maskInput = $("maskInput");
const dropZone = $("dropZone");
const maskUploadWrap = $("maskUploadWrap");
const maskStatus = $("maskStatus");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const emptyState = $("emptyState");
const status = $("status");

const controls = {
  shape: $("shape"),
  count: $("count"),
  minW: $("minW"),
  maxW: $("maxW"),
  minH: $("minH"),
  maxH: $("maxH"),
  lockRatio: $("lockRatio"),
  scatter: $("scatter"),
  rotation: $("rotation"),
  margin: $("margin"),
  showHoles: $("showHoles"),
  outline: $("outline"),
  holeMode: $("holeMode"),
};

const outputs = {
  count: $("countOut"),
  minW: $("minWOut"),
  maxW: $("maxWOut"),
  minH: $("minHOut"),
  maxH: $("maxHOut"),
  scatter: $("scatterOut"),
  rotation: $("rotationOut"),
  margin: $("marginOut"),
};

const randomizeBtn = $("randomize");
const downloadBtn = $("download");
const fitButton = $("fitButton");

let sourceImage = null;
let sourceName = "diecut";
let maskImage = null;
let maskCanvas = null;
let cuts = [];
let syncingRatio = false;

function syncOutputs() {
  outputs.count.value = controls.count.value;
  outputs.minW.value = `${controls.minW.value}px`;
  outputs.maxW.value = `${controls.maxW.value}px`;
  outputs.minH.value = `${controls.minH.value}px`;
  outputs.maxH.value = `${controls.maxH.value}px`;
  outputs.scatter.value = `${controls.scatter.value}%`;
  outputs.rotation.value = `${controls.rotation.value}°`;
  outputs.margin.value = `${controls.margin.value}%`;
}
syncOutputs();

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clampPair(a, b) {
  return a <= b ? [a, b] : [b, a];
}

function getMaskAspect() {
  if (controls.shape.value === "custom" && maskImage) {
    return maskImage.width / maskImage.height;
  }
  return 1;
}

function getDimensions() {
  let [minW, maxW] = clampPair(Number(controls.minW.value), Number(controls.maxW.value));
  let [minH, maxH] = clampPair(Number(controls.minH.value), Number(controls.maxH.value));

  if (!controls.lockRatio.checked) {
    return { minW, maxW, minH, maxH };
  }

  const aspect = getMaskAspect();

  // Width is the master value while ratio lock is on.
  minH = Math.max(1, Math.round(minW / aspect));
  maxH = Math.max(1, Math.round(maxW / aspect));

  return { minW, maxW, minH, maxH };
}

function syncLockedHeightFromWidth() {
  if (!controls.lockRatio.checked || syncingRatio) return;
  syncingRatio = true;
  const aspect = getMaskAspect();
  controls.minH.value = Math.min(Number(controls.minH.max), Math.max(Number(controls.minH.min), Math.round(Number(controls.minW.value) / aspect)));
  controls.maxH.value = Math.min(Number(controls.maxH.max), Math.max(Number(controls.maxH.min), Math.round(Number(controls.maxW.value) / aspect)));
  syncOutputs();
  syncingRatio = false;
}

function syncLockedWidthFromHeight() {
  if (!controls.lockRatio.checked || syncingRatio) return;
  syncingRatio = true;
  const aspect = getMaskAspect();
  controls.minW.value = Math.min(Number(controls.minW.max), Math.max(Number(controls.minW.min), Math.round(Number(controls.minH.value) * aspect)));
  controls.maxW.value = Math.min(Number(controls.maxW.max), Math.max(Number(controls.maxW.min), Math.round(Number(controls.maxH.value) * aspect)));
  syncOutputs();
  syncingRatio = false;
}

function makeVectorPath(shape, width, height) {
  const p = new Path2D();
  const rx = width / 2;
  const ry = height / 2;

  if (shape === "circle") {
    p.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  } else if (shape === "diamond") {
    p.moveTo(0, -ry);
    p.lineTo(rx, 0);
    p.lineTo(0, ry);
    p.lineTo(-rx, 0);
    p.closePath();
  } else if (shape === "star") {
    for (let i = 0; i < 10; i++) {
      const outer = i % 2 === 0;
      const xRad = outer ? rx : rx * 0.46;
      const yRad = outer ? ry : ry * 0.46;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = Math.cos(a) * xRad;
      const y = Math.sin(a) * yRad;
      i === 0 ? p.moveTo(x, y) : p.lineTo(x, y);
    }
    p.closePath();
  } else {
    p.moveTo(0, -ry);
    p.bezierCurveTo(rx * 0.18, -ry * 0.58, rx * 0.80, -ry * 0.10, rx * 0.80, ry * 0.33);
    p.bezierCurveTo(rx * 0.80, ry * 0.84, rx * 0.42, ry, 0, ry);
    p.bezierCurveTo(-rx * 0.42, ry, -rx * 0.80, ry * 0.84, -rx * 0.80, ry * 0.33);
    p.bezierCurveTo(-rx * 0.80, -ry * 0.10, -rx * 0.18, -ry * 0.58, 0, -ry);
    p.closePath();
  }
  return p;
}

function createMaskCanvas(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const cctx = c.getContext("2d");
  cctx.clearRect(0, 0, c.width, c.height);
  cctx.drawImage(img, 0, 0);
  return c;
}

function createCustomClipCanvas(width, height) {
  if (!maskCanvas) return null;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  const cctx = c.getContext("2d");
  cctx.clearRect(0, 0, c.width, c.height);
  cctx.drawImage(maskCanvas, 0, 0, c.width, c.height);
  return c;
}

function generateCuts() {
  if (!sourceImage) return;

  if (controls.shape.value === "custom" && !maskImage) {
    cuts = [];
    render();
    status.textContent = "사용자 PNG 마스크를 선택해 주세요.";
    return;
  }

  const count = Number(controls.count.value);
  const { minW, maxW, minH, maxH } = getDimensions();

  const marginPx = Math.min(sourceImage.width, sourceImage.height) * Number(controls.margin.value) / 100;
  const topH = sourceImage.height;
  const scatterH = Math.round(topH * Number(controls.scatter.value) / 100);

  cuts = Array.from({ length: count }, () => {
    let w = rand(minW, maxW);
    let h;

    if (controls.lockRatio.checked) {
      const aspect = getMaskAspect();
      h = w / aspect;
    } else {
      h = rand(minH, maxH);
    }

    const safeX = Math.max(w * 0.55, marginPx);
    const safeY = Math.max(h * 0.55, marginPx);
    const sx = rand(safeX, Math.max(safeX, sourceImage.width - safeX));
    const sy = rand(safeY, Math.max(safeY, sourceImage.height - safeY));

    const dx = rand(w * 0.6, Math.max(w * 0.6, sourceImage.width - w * 0.6));
    const dy = topH + rand(h * 0.6, Math.max(h * 0.6, scatterH - h * 0.6));

    return {
      sx, sy, dx, dy, w, h,
      sourceRotation: rand(-10, 10) * Math.PI / 180,
      destRotation: rand(-Number(controls.rotation.value), Number(controls.rotation.value)) * Math.PI / 180,
    };
  });

  render();
}

function fillVectorHole(cut) {
  ctx.save();
  ctx.translate(cut.sx, cut.sy);
  ctx.rotate(cut.sourceRotation);
  const path = makeVectorPath(controls.shape.value, cut.w, cut.h);

  if (controls.holeMode.value === "transparent") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fill(path);
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.fillStyle = controls.holeMode.value === "white" ? "#ffffff" : "#fbfaf7";
    ctx.fill(path);
  }

  if (controls.outline.checked) {
    ctx.strokeStyle = "rgba(70, 68, 63, .28)";
    ctx.lineWidth = Math.max(1, Math.min(cut.w, cut.h) * 0.025);
    ctx.stroke(path);
  }
  ctx.restore();
}

function fillCustomHole(cut) {
  const mask = createCustomClipCanvas(cut.w, cut.h);
  if (!mask) return;

  const temp = document.createElement("canvas");
  temp.width = canvas.width;
  temp.height = canvas.height;
  const t = temp.getContext("2d");

  t.save();
  t.translate(cut.sx, cut.sy);
  t.rotate(cut.sourceRotation);
  t.drawImage(mask, -cut.w / 2, -cut.h / 2, cut.w, cut.h);
  t.restore();

  if (controls.holeMode.value === "transparent") {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(temp, 0, 0);
    ctx.restore();
  } else {
    const fillLayer = document.createElement("canvas");
    fillLayer.width = canvas.width;
    fillLayer.height = canvas.height;
    const f = fillLayer.getContext("2d");
    f.fillStyle = controls.holeMode.value === "white" ? "#ffffff" : "#fbfaf7";
    f.fillRect(0, 0, fillLayer.width, fillLayer.height);
    f.globalCompositeOperation = "destination-in";
    f.drawImage(temp, 0, 0);
    ctx.drawImage(fillLayer, 0, 0);
  }

  if (controls.outline.checked) {
    // Soft outline via mask expansion approximation.
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.globalCompositeOperation = "source-over";
    const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [ox, oy] of offsets) {
      ctx.drawImage(temp, ox, oy);
    }
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(temp, 0, 0);
    ctx.restore();
  }
}

function drawVectorFragment(cut) {
  ctx.save();
  ctx.translate(cut.dx, cut.dy);
  ctx.rotate(cut.destRotation);
  const path = makeVectorPath(controls.shape.value, cut.w, cut.h);
  ctx.clip(path);

  ctx.drawImage(
    sourceImage,
    cut.sx - cut.w / 2, cut.sy - cut.h / 2,
    cut.w, cut.h,
    -cut.w / 2, -cut.h / 2,
    cut.w, cut.h
  );
  ctx.restore();

  if (controls.outline.checked) {
    ctx.save();
    ctx.translate(cut.dx, cut.dy);
    ctx.rotate(cut.destRotation);
    const path = makeVectorPath(controls.shape.value, cut.w, cut.h);
    ctx.strokeStyle = "rgba(70, 68, 63, .24)";
    ctx.lineWidth = Math.max(1, Math.min(cut.w, cut.h) * 0.025);
    ctx.stroke(path);
    ctx.restore();
  }
}

function drawCustomFragment(cut) {
  const mask = createCustomClipCanvas(cut.w, cut.h);
  if (!mask) return;

  const piece = document.createElement("canvas");
  piece.width = Math.max(1, Math.ceil(cut.w));
  piece.height = Math.max(1, Math.ceil(cut.h));
  const pctx = piece.getContext("2d");

  pctx.drawImage(
    sourceImage,
    cut.sx - cut.w / 2, cut.sy - cut.h / 2,
    cut.w, cut.h,
    0, 0, piece.width, piece.height
  );
  pctx.globalCompositeOperation = "destination-in";
  pctx.drawImage(mask, 0, 0, piece.width, piece.height);
  pctx.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.translate(cut.dx, cut.dy);
  ctx.rotate(cut.destRotation);
  ctx.drawImage(piece, -cut.w / 2, -cut.h / 2, cut.w, cut.h);
  ctx.restore();

  if (controls.outline.checked) {
    ctx.save();
    ctx.translate(cut.dx, cut.dy);
    ctx.rotate(cut.destRotation);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(mask, -cut.w / 2 - 1, -cut.h / 2, cut.w, cut.h);
    ctx.drawImage(mask, -cut.w / 2 + 1, -cut.h / 2, cut.w, cut.h);
    ctx.drawImage(mask, -cut.w / 2, -cut.h / 2 - 1, cut.w, cut.h);
    ctx.drawImage(mask, -cut.w / 2, -cut.h / 2 + 1, cut.w, cut.h);
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(mask, -cut.w / 2, -cut.h / 2, cut.w, cut.h);
    ctx.restore();
  }
}

function render() {
  if (!sourceImage) return;

  const W = sourceImage.width;
  const topH = sourceImage.height;
  const scatterH = Math.max(1, Math.round(topH * Number(controls.scatter.value) / 100));
  const H = topH + scatterH;

  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(sourceImage, 0, 0);

  if (controls.showHoles.checked) {
    for (const cut of cuts) {
      if (controls.shape.value === "custom") fillCustomHole(cut);
      else fillVectorHole(cut);
    }
  }

  for (const cut of cuts) {
    if (controls.shape.value === "custom") drawCustomFragment(cut);
    else drawVectorFragment(cut);
  }

  emptyState.hidden = true;
  status.textContent = `${W} × ${H}px · ${cuts.length}개 조각`;
  fitCanvas();
}

function fitCanvas() {
  if (!sourceImage) return;
  const shell = $("canvasShell");
  const maxW = Math.max(220, shell.clientWidth - 44);
  const displayScale = Math.min(1, maxW / canvas.width);
  canvas.style.width = `${Math.round(canvas.width * displayScale)}px`;
  canvas.style.height = `${Math.round(canvas.height * displayScale)}px`;
}

function tuneSizeControls(img) {
  const base = Math.min(img.width, img.height);
  const minDefault = Math.max(8, Math.round(base * 0.035));
  const maxDefault = Math.max(minDefault + 6, Math.round(base * 0.08));

  for (const id of ["minW", "minH"]) controls[id].max = Math.max(120, Math.round(base * 0.28));
  for (const id of ["maxW", "maxH"]) controls[id].max = Math.max(200, Math.round(base * 0.40));

  controls.minW.value = minDefault;
  controls.maxW.value = maxDefault;
  controls.minH.value = minDefault;
  controls.maxH.value = maxDefault;
  syncOutputs();
}

function loadImageFile(file, onLoaded) {
  if (!file || !file.type.startsWith("image/")) {
    alert("이미지 파일을 선택해 주세요.");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    onLoaded(img, file);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("이미지를 읽을 수 없습니다.");
  };
  img.src = url;
}

fileInput.addEventListener("change", (e) => {
  loadImageFile(e.target.files[0], (img, file) => {
    sourceImage = img;
    sourceName = (file.name || "diecut").replace(/\.[^.]+$/, "");
    randomizeBtn.disabled = false;
    downloadBtn.disabled = false;
    fitButton.disabled = false;
    tuneSizeControls(img);
    if (controls.lockRatio.checked) syncLockedHeightFromWidth();
    generateCuts();
  });
});

maskInput.addEventListener("change", (e) => {
  loadImageFile(e.target.files[0], (img, file) => {
    maskImage = img;
    maskCanvas = createMaskCanvas(img);
    maskStatus.textContent = `${file.name} · ${img.width}×${img.height}px`;
    if (controls.lockRatio.checked) syncLockedHeightFromWidth();
    generateCuts();
  });
});

["dragenter", "dragover"].forEach(type => {
  dropZone.addEventListener(type, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach(type => {
  dropZone.addEventListener(type, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragging");
  });
});
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  loadImageFile(file, (img, f) => {
    sourceImage = img;
    sourceName = (f.name || "diecut").replace(/\.[^.]+$/, "");
    randomizeBtn.disabled = false;
    downloadBtn.disabled = false;
    fitButton.disabled = false;
    tuneSizeControls(img);
    if (controls.lockRatio.checked) syncLockedHeightFromWidth();
    generateCuts();
  });
});

controls.shape.addEventListener("change", () => {
  maskUploadWrap.hidden = controls.shape.value !== "custom";
  if (controls.lockRatio.checked) syncLockedHeightFromWidth();
  generateCuts();
});

controls.lockRatio.addEventListener("change", () => {
  if (controls.lockRatio.checked) syncLockedHeightFromWidth();
  generateCuts();
});

for (const id of ["minW", "maxW"]) {
  controls[id].addEventListener("input", () => {
    if (controls.lockRatio.checked) syncLockedHeightFromWidth();
    syncOutputs();
    generateCuts();
  });
}
for (const id of ["minH", "maxH"]) {
  controls[id].addEventListener("input", () => {
    if (controls.lockRatio.checked) syncLockedWidthFromHeight();
    syncOutputs();
    generateCuts();
  });
}

for (const id of ["count", "scatter", "rotation", "margin"]) {
  controls[id].addEventListener("input", () => {
    syncOutputs();
    generateCuts();
  });
}

for (const id of ["showHoles", "outline", "holeMode"]) {
  controls[id].addEventListener("change", render);
}

randomizeBtn.addEventListener("click", generateCuts);
fitButton.addEventListener("click", fitCanvas);
window.addEventListener("resize", fitCanvas);

downloadBtn.addEventListener("click", () => {
  if (!sourceImage) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = `${sourceName}-diecut.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1500);
  }, "image/png");
});
