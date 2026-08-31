// js/photo.js —— 图片处理核心：尺寸预设、裁切、简易换底

// 证件照尺寸预设 (mm)
const PHOTO_PRESETS = {
  one:      { name: '一寸',   width: 25, height: 35 },
  smallOne: { name: '小一寸', width: 22, height: 32 },
  two:      { name: '两寸',   width: 35, height: 49 },
  smallTwo: { name: '小两寸', width: 35, height: 45 },
};

// 纸张预设 (mm)
const PAPER_PRESETS = {
  a4:    { name: 'A4',  width: 210, height: 297 },
  a5:    { name: 'A5',  width: 148, height: 210 },
  a6:    { name: 'A6',  width: 105, height: 148 },
  inch5: { name: '5寸', width: 89,  height: 127 },
  inch6: { name: '6寸', width: 102, height: 152 },
};

// 背景色选项
const BG_COLORS = [
  { id: 'original', name: '保留原图', value: null },
  { id: 'white',    name: '白底',     value: '#ffffff' },
  { id: 'blue',     name: '蓝底',     value: '#3b7dd8' },
  { id: 'red',      name: '红底',     value: '#d8342d' },
];

const PRINT_DPI = 300;
const MM_PER_INCH = 25.4;

function mmToPx(mm, dpi) {
  dpi = dpi || PRINT_DPI;
  return mm / MM_PER_INCH * dpi;
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
  ];
}

// 从 File 加载为 HTMLImageElement
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 按比例居中裁切，返回 canvas（保留原图分辨率）
function cropToRatio(source, ratioW, ratioH) {
  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;
  const targetRatio = ratioW / ratioH;
  const srcRatio = srcW / srcH;
  let sx, sy, sw, sh;
  if (srcRatio > targetRatio) {
    sh = srcH;
    sw = srcH * targetRatio;
    sx = (srcW - sw) / 2;
    sy = 0;
  } else {
    sw = srcW;
    sh = srcW / targetRatio;
    sx = 0;
    sy = (srcH - sh) / 2;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

// 简易换背景：取边缘颜色估计背景，按阈值替换为新色，边缘做线性过渡
function changeBackground(sourceCanvas, newColor, threshold) {
  threshold = threshold || 60;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // 采样四角区域估计背景色
  const edge = Math.max(4, Math.round(Math.min(w, h) * 0.06));
  let br = 0, bg = 0, bb = 0, cnt = 0;
  const corners = [[0, 0], [w - edge, 0], [0, h - edge], [w - edge, h - edge]];
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + edge; y++) {
      for (let x = cx; x < cx + edge; x++) {
        const i = (y * w + x) * 4;
        br += data[i]; bg += data[i + 1]; bb += data[i + 2]; cnt++;
      }
    }
  }
  br /= cnt; bg /= cnt; bb /= cnt;

  const [nr, ng, nb] = hexToRgb(newColor);
  const thr2 = threshold * threshold;
  const soft = 35;
  const softThr2 = (threshold + soft) * (threshold + soft);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dr = r - br, dg = g - bg, db = b - bb;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 < thr2) {
      data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
    } else if (dist2 < softThr2) {
      const t = (Math.sqrt(dist2) - threshold) / soft;
      const mix = t < 0 ? 0 : (t > 1 ? 1 : t);
      data[i]     = r * mix + nr * (1 - mix);
      data[i + 1] = g * mix + ng * (1 - mix);
      data[i + 2] = b * mix + nb * (1 - mix);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// 生成证件照 canvas（高分辨率，按 300dpi）
// source: HTMLImageElement 或 canvas
// photoSizeMm: {width, height}
// bgColor: '#xxxxxx' 或 null
function generatePhoto(source, photoSizeMm, bgColor, threshold) {
  const cropped = cropToRatio(source, photoSizeMm.width, photoSizeMm.height);
  let processed = cropped;
  if (bgColor) {
    processed = changeBackground(cropped, bgColor, threshold);
  }
  const targetW = Math.round(mmToPx(photoSizeMm.width, PRINT_DPI));
  const targetH = Math.round(mmToPx(photoSizeMm.height, PRINT_DPI));
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(processed, 0, 0, targetW, targetH);
  return out;
}
