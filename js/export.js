// js/export.js —— 导出图片与打印

function downloadCanvas(canvas, filename, type, quality) {
  type = type || 'image/png';
  quality = quality || 0.95;
  canvas.toBlob(function (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }, type, quality);
}

// 打印：用隐藏 iframe 在当前页内打印，不新开窗口
function printCanvas(canvas, paperSizeMm) {
  const dataUrl = canvas.toDataURL('image/png');
  const wMm = paperSizeMm.width;
  const hMm = paperSizeMm.height;

  let iframe = document.getElementById('__printFrame');
  if (iframe) iframe.remove();
  iframe = document.createElement('iframe');
  iframe.id = '__printFrame';
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const fw = iframe.contentWindow;
  const doc = fw.document;
  doc.open();
  doc.write([
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>打印</title>',
    '<style>',
    '@page { size: ', wMm, 'mm ', hMm, 'mm; margin: 0; }',
    'html, body { margin: 0; padding: 0; }',
    'img { width: ', wMm, 'mm; height: ', hMm, 'mm; display: block; }',
    '</style></head><body><img src="', dataUrl, '"></body></html>'
  ].join(''));
  doc.close();

  const img = doc.querySelector('img');
  const doPrint = function () { fw.focus(); fw.print(); };
  if (img && !img.complete) {
    img.onload = doPrint;
  } else {
    setTimeout(doPrint, 120);
  }
}
