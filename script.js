const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const dropZone = $("dropZone");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const emptyState = $("emptyState");
const status = $("status");

const controls = {
  shape: $("shape"),
  count: $("count"),
  minSize: $("minSize"),
  maxSize: $("maxSize"),
  scatter: $("scatter"),
  rotation: $("rotation"),
  margin: $("margin"),
  showHoles: $("showHoles"),
  outline: $("outline"),
  holeMode: $("holeMode"),
};

const outputs = {
  count: $("countOut"),
  minSize: $("minSizeOut"),
  maxSize: $("maxSizeOut"),
  scatter: $("scatterOut"),
  rotation: $("rotationOut"),
  margin: $("marginOut"),
};

const randomizeBtn = $("randomize");
const downloadBtn = $("download");
const fitButton = $("fitButton");

let sourceImage = null;
let sourceName = "diecut";
let cuts = [];
let displayScale = 1;

function syncOutputs() {
  outputs.count.value = controls.count.value;
  outputs.minSize.value = `${controls.minSize.value}px`;
  outputs.maxSize.value = `${controls.maxSize.value}px`;
  outputs.scatter.value = `${controls.scatter.value}%`;
  outputs.rotation.value = `${controls.rotation.value}°`;
  outputs.margin.value = `${controls.margin.value}%`;
}
syncOutputs();

function seededRandom(min, max) {
  return min + Math.random() * (max - min);
}

function makePath(shape, size) {
  const p = new Path2D();
  const r = size / 2;

  if (shape === "circle") {
    p.arc(0, 0, r, 0, Math.PI * 2);
  } else if (shape === "diamond") {
    p.moveTo(0, -r);
    p.lineTo(r * 0.78, 0);
    p.lineTo(0, r);
    p.lineTo(-r * 0.78, 0);
    p.closePath();
  } else if (shape === "star") {
    const outer = r, inner = r * 0.46;
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      i === 0 ? p.moveTo(x, y) : p.lineTo(x, y);
    }
    p.closePath();
  } else {
    // Teardrop: pointed top, rounded lower body.
    p.moveTo(0, -r);
    p.bezierCurveTo(r * 0.16, -r * 0.58, r * 0.78, -r * 0.08, r * 0.78, r * 0.34);
    p.bezierCurveTo(r * 0.78, r * 0.84, r * 0.40, r, 0, r);
    p.bezierCurveTo(-r * 0.40, r, -r * 0.78, r * 0.84, -r * 0.78, r * 0.34);
    p.bezierCurveTo(-r * 0.78, -r * 0.08, -r * 0.16, -r * 0.58, 0, -r);
    p.closePath();
  }
  return p;
}

function generateCuts() {
  if (!sourceImage) return;

  const count = Number(controls.count.value);
  let minSize = Number(controls.minSize.value);
  let maxSize = Number(controls.maxSize.value);
  if (minSize > maxSize) [minSize, maxSize] = [maxSize, minSize];

  const margin = Math.min(sourceImage.width, sourceImage.height) * Number(controls.margin.value) / 100;
  const topH = sourceImage.height;
  const scatterH = Math.round(topH * Number(controls.scatter.value) / 100);

  cuts = Array.from({ length: count }, () => {
    const size = seededRandom(minSize, maxSize);
    const safe = Math.max(size * 0.9, margin);
    const sx = seededRandom(safe, Math.max(safe, sourceImage.width - safe));
    const sy = seededRandom(safe, Math.max(safe, sourceImage.height - safe));

    const lowerPad = size;
    const dx = seededRandom(lowerPad, Math.max(lowerPad, sourceImage.width - lowerPad));
    const dy = topH + seededRandom(size, Math.max(size, scatterH - size));

    return {
      sx, sy, dx, dy, size,
      sourceRotation: seededRandom(-12, 12) * Math.PI / 180,
      destRotation: seededRandom(-Number(controls.rotation.value), Number(controls.rotation.value)) * Math.PI / 180,
      stretchX: seededRandom(0.78, 1.18),
      stretchY: seededRandom(0.86, 1.22),
    };
  });
  render();
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

  // Paper background for composition. Transparent holes are punched after this.
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, W, H);

  ctx.drawImage(sourceImage, 0, 0);

  // Draw holes in the original.
  if (controls.showHoles.checked) {
    for (const cut of cuts) {
      ctx.save();
      ctx.translate(cut.sx, cut.sy);
      ctx.rotate(cut.sourceRotation);
      ctx.scale(cut.stretchX, cut.stretchY);

      const path = makePath(controls.shape.value, cut.size);
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
        ctx.lineWidth = Math.max(1, cut.size * 0.025);
        ctx.stroke(path);
      }
      ctx.restore();
    }
  }

  // Scatter extracted image fragments below.
  for (const cut of cuts) {
    ctx.save();
    ctx.translate(cut.dx, cut.dy);
    ctx.rotate(cut.destRotation);
    ctx.scale(cut.stretchX, cut.stretchY);

    const path = makePath(controls.shape.value, cut.size);
    ctx.clip(path);

    // Keep the fragment's texture tied to the sampled source coordinate.
    ctx.rotate(-cut.sourceRotation);
    ctx.drawImage(
      sourceImage,
      cut.sx - cut.size, cut.sy - cut.size,
      cut.size * 2, cut.size * 2,
      -cut.size, -cut.size,
      cut.size * 2, cut.size * 2
    );
    ctx.restore();

    if (controls.outline.checked) {
      ctx.save();
      ctx.translate(cut.dx, cut.dy);
      ctx.rotate(cut.destRotation);
      ctx.scale(cut.stretchX, cut.stretchY);
      const path = makePath(controls.shape.value, cut.size);
      ctx.strokeStyle = "rgba(70, 68, 63, .24)";
      ctx.lineWidth = Math.max(1, cut.size * 0.025);
      ctx.stroke(path);
      ctx.restore();
    }
  }

  emptyState.hidden = true;
  status.textContent = `${W} × ${H}px · ${cuts.length}개 조각`;
  fitCanvas();
}

function fitCanvas() {
  if (!sourceImage) return;
  const shell = $("canvasShell");
  const maxW = Math.max(220, shell.clientWidth - 44);
  displayScale = Math.min(1, maxW / canvas.width);
  canvas.style.width = `${Math.round(canvas.width * displayScale)}px`;
  canvas.style.height = `${Math.round(canvas.height * displayScale)}px`;
}

async function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("이미지 파일을 선택해 주세요.");
    return;
  }

  sourceName = (file.name || "diecut").replace(/\.[^.]+$/, "");
  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    sourceImage = img;
    randomizeBtn.disabled = false;
    downloadBtn.disabled = false;
    fitButton.disabled = false;
    URL.revokeObjectURL(url);

    // Scale control defaults to image size so tiny/huge images remain usable.
    const base = Math.min(img.width, img.height);
    const minDefault = Math.max(8, Math.round(base * 0.035));
    const maxDefault = Math.max(minDefault + 6, Math.round(base * 0.08));
    controls.minSize.max = Math.max(100, Math.round(base * 0.20));
    controls.maxSize.max = Math.max(180, Math.round(base * 0.32));
    controls.minSize.value = Math.min(Number(controls.minSize.max), minDefault);
    controls.maxSize.value = Math.min(Number(controls.maxSize.max), maxDefault);
    syncOutputs();

    generateCuts();
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("이미지를 읽을 수 없습니다.");
  };

  img.src = url;
}

fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));

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
dropZone.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));

randomizeBtn.addEventListener("click", generateCuts);
fitButton.addEventListener("click", fitCanvas);
window.addEventListener("resize", fitCanvas);

Object.entries(controls).forEach(([key, el]) => {
  const eventName = el.type === "range" ? "input" : "change";
  el.addEventListener(eventName, () => {
    syncOutputs();

    // Geometry-changing controls need fresh coordinates.
    if (["count", "minSize", "maxSize", "scatter", "rotation", "margin"].includes(key)) {
      generateCuts();
    } else {
      render();
    }
  });
});

downloadBtn.addEventListener("click", () => {
  if (!sourceImage) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sourceName}-diecut.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }, "image/png");
});
