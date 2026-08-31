// js/app.js —— 主控制器，串联 UI 与各模块

(function () {
  'use strict';

  const state = {
    sourceImg: null,        // 原始上传图 HTMLImageElement
    bgColor: null,          // null = 保留原图，否则 '#xxxxxx'
    bgThreshold: 60,
    paperSizeMm: { width: 210, height: 297 },
    gridGapMm: 2,
    // 需求列表：每项 { preset, customW, customH, count }
    demands: [
      { preset: 'one', customW: 25, customH: 35, count: 8 },
      { preset: 'two', customW: 35, customH: 49, count: 4 },
    ],
  };

  let editor = null;
  const $ = function (id) { return document.getElementById(id); };

  // ---------- 初始化 ----------
  function init() {
    editor = new PaperEditor($('paperCanvas'));
    editor.onChange = updateStatus;
    editor.onSelectionChange = updateSelectionUI;

    buildPaperPresets();
    buildBgColors();
    bindEvents();
    renderDemands();

    window.addEventListener('resize', function () { editor.fitToContainer(); });
    updateStatus();
    updateSelectionUI();
  }

  // ---------- 选项构建 ----------
  function buildPaperPresets() {
    const sel = $('paperPreset');
    Object.keys(PAPER_PRESETS).forEach(function (k) {
      const p = PAPER_PRESETS[k];
      sel.appendChild(new Option(p.name + ' (' + p.width + '×' + p.height + 'mm)', k));
    });
    sel.appendChild(new Option('自定义', 'custom'));
    sel.value = 'a4';
    onPaperPresetChange();
  }

  function buildBgColors() {
    const wrap = $('bgColors');
    BG_COLORS.forEach(function (c, i) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bg-btn' + (i === 0 ? ' active' : '');
      btn.dataset.id = c.id;
      btn.textContent = c.name;
      btn.addEventListener('click', function () {
        wrap.querySelectorAll('.bg-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.bgColor = c.value;
        refreshAllPhotos();
      });
      wrap.appendChild(btn);
    });
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    const fileInput = $('fileInput');
    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      loadImageFromFile(file).then(function (img) {
        state.sourceImg = img;
        $('uploadHint').style.display = 'none';
        $('sourceThumb').src = img.src;
        $('sourceThumb').style.display = 'block';
        refreshAllPhotos();
      }).catch(function () { alert('图片加载失败，请重试。'); });
    });

    const dropZone = $('dropZone');
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag'); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('drag');
      if (!e.dataTransfer.files[0]) return;
      fileInput.files = e.dataTransfer.files;
      fileInput.dispatchEvent(new Event('change'));
    });

    $('paperPreset').addEventListener('change', onPaperPresetChange);
    $('paperW').addEventListener('input', readCustomPaperSize);
    $('paperH').addEventListener('input', readCustomPaperSize);

    $('bgThreshold').addEventListener('input', function (e) {
      state.bgThreshold = parseFloat(e.target.value);
      $('bgThresholdVal').textContent = state.bgThreshold;
      refreshAllPhotos();
    });

    $('gridGap').addEventListener('input', function (e) {
      state.gridGapMm = parseFloat(e.target.value);
      $('gridGapVal').textContent = state.gridGapMm + 'mm';
    });

    $('btnAddDemand').addEventListener('click', addDemand);
    $('btnAutoPack').addEventListener('click', autoPack);
    $('btnClear').addEventListener('click', function () { editor.clear(); updateStatus(); });
    $('btnExportPng').addEventListener('click', function () { exportImg('image/png', '证件照排版.png'); });
    $('btnExportJpg').addEventListener('click', function () { exportImg('image/jpeg', '证件照排版.jpg', 0.95); });
    $('btnPrint').addEventListener('click', printPaper);

    // 自由模式：选择与对齐
    document.querySelectorAll('[data-align]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!b.disabled) editor.align(b.dataset.align);
      });
    });
    $('btnSelectBySize').addEventListener('click', function () {
      const val = $('selectSize').value;
      if (!val || val.indexOf('|') < 0) return;
      const parts = val.split('|');
      editor.selectBySize(parseFloat(parts[0]), parseFloat(parts[1]));
    });
    $('btnSelectAll').addEventListener('click', function () { editor.selectAll(); });
    $('btnSelectNone').addEventListener('click', function () { editor.clearSelection(); });
  }

  function onPaperPresetChange() {
    const sel = $('paperPreset');
    const custom = $('paperCustom');
    if (sel.value === 'custom') {
      custom.style.display = 'flex';
      readCustomPaperSize();
    } else {
      custom.style.display = 'none';
      const p = PAPER_PRESETS[sel.value];
      state.paperSizeMm = { width: p.width, height: p.height };
      $('paperW').value = p.width;
      $('paperH').value = p.height;
      editor.setPaperSize(state.paperSizeMm);
      updateStatus();
    }
  }

  function readCustomPaperSize() {
    const w = parseFloat($('paperW').value);
    const h = parseFloat($('paperH').value);
    if (w > 0 && h > 0) {
      state.paperSizeMm = { width: w, height: h };
      editor.setPaperSize(state.paperSizeMm);
      updateStatus();
    }
  }

  // ---------- 需求列表（尺寸 + 数量，统一入口） ----------
  function renderDemands() {
    const list = $('demandList');
    list.innerHTML = '';
    state.demands.forEach(function (d, idx) {
      list.appendChild(makeDemandRow(d, idx));
    });
  }

  function makeDemandRow(d, idx) {
    const row = document.createElement('div');
    row.className = 'demand-row';

    const sel = document.createElement('select');
    sel.className = 'demand-size';
    Object.keys(PHOTO_PRESETS).forEach(function (k) {
      sel.appendChild(new Option(PHOTO_PRESETS[k].name, k));
    });
    sel.appendChild(new Option('自定义', 'custom'));
    sel.value = d.preset;
    sel.addEventListener('change', function () {
      d.preset = sel.value;
      renderDemands();
    });
    row.appendChild(sel);

    if (d.preset === 'custom') {
      const w = document.createElement('input');
      w.type = 'number'; w.className = 'demand-num'; w.value = d.customW; w.min = 5; w.step = 0.1; w.title = '宽(mm)';
      w.addEventListener('input', function () { d.customW = parseFloat(w.value) || 0; });
      const h = document.createElement('input');
      h.type = 'number'; h.className = 'demand-num'; h.value = d.customH; h.min = 5; h.step = 0.1; h.title = '高(mm)';
      h.addEventListener('input', function () { d.customH = parseFloat(h.value) || 0; });
      row.appendChild(w);
      row.appendChild(h);
    }

    const cnt = document.createElement('input');
    cnt.type = 'number'; cnt.className = 'demand-count'; cnt.value = d.count; cnt.min = 0; cnt.step = 1; cnt.title = '数量';
    cnt.addEventListener('input', function () { d.count = Math.max(0, parseInt(cnt.value, 10) || 0); });
    row.appendChild(cnt);

    const add = document.createElement('button');
    add.type = 'button'; add.className = 'demand-add'; add.textContent = '＋'; add.title = '添加1张到纸张';
    add.addEventListener('click', function () { addOnePhoto(idx); });
    row.appendChild(add);

    const del = document.createElement('button');
    del.type = 'button'; del.className = 'demand-del'; del.textContent = '×'; del.title = '删除该项';
    del.addEventListener('click', function () {
      state.demands.splice(idx, 1);
      renderDemands();
    });
    row.appendChild(del);

    return row;
  }

  function addDemand() {
    state.demands.push({ preset: 'one', customW: 25, customH: 35, count: 1 });
    renderDemands();
  }

  function resolveDemandSize(d) {
    if (d.preset === 'custom') return { width: d.customW, height: d.customH };
    const p = PHOTO_PRESETS[d.preset];
    return { width: p.width, height: p.height };
  }

  // 自由模式：添加1张某尺寸到纸张
  function addOnePhoto(idx) {
    if (!state.sourceImg) { alert('请先上传照片。'); return; }
    const d = state.demands[idx];
    if (!d) return;
    const sizeMm = resolveDemandSize(d);
    if (!sizeMm.width || !sizeMm.height) { alert('该尺寸项无效，请填好宽高。'); return; }
    const photoCanvas = generatePhoto(state.sourceImg, sizeMm, state.bgColor, state.bgThreshold);
    editor.addPhoto(photoCanvas, sizeMm);
    updateStatus();
  }

  // 背景/阈值/换图变化后，重新生成纸上所有照片
  function refreshAllPhotos() {
    if (!state.sourceImg) return;
    editor.placements.forEach(function (p) {
      p.photoCanvas = generatePhoto(state.sourceImg, { width: p.wMm, height: p.hMm }, state.bgColor, state.bgThreshold);
    });
    editor.render();
  }

  // ---------- 批量自动排版 ----------
  function autoPack() {
    if (!state.sourceImg) { alert('请先上传照片。'); return; }
    const items = state.demands.map(function (d) {
      const sizeMm = resolveDemandSize(d);
      const photoCanvas = generatePhoto(state.sourceImg, sizeMm, state.bgColor, state.bgThreshold);
      return { photoCanvas: photoCanvas, sizeMm: sizeMm, count: d.count };
    });
    const result = editor.autoPack(items, state.gridGapMm);
    let msg = '已排 ' + result.placed + ' 张';
    if (result.overflow > 0) msg += '，放不下 ' + result.overflow + ' 张（请减数量或换更大纸张）';
    $('packResult').textContent = msg;
    updateStatus();
  }

  // ---------- 导出 / 打印 ----------
  function exportImg(type, filename, quality) {
    if (editor.count() === 0) { alert('纸张上还没有照片，请先排版。'); return; }
    downloadCanvas(editor.exportCanvas(300), filename, type, quality);
  }

  function printPaper() {
    if (editor.count() === 0) { alert('纸张上还没有照片，请先排版。'); return; }
    printCanvas(editor.exportCanvas(300), state.paperSizeMm);
  }

  // ---------- 状态 ----------
  function updateStatus() {
    $('statusPaper').textContent = state.paperSizeMm.width + '×' + state.paperSizeMm.height + ' mm';
    $('statusCount').textContent = editor.count();
    const sSel = $('statusSelected');
    if (sSel) sSel.textContent = editor.selectedCount();
    refreshSizeSelector();
  }

  function updateSelectionUI(count) {
    if (count == null) count = editor.selectedCount();
    const info = $('selectionInfo');
    if (info) info.textContent = '已选 ' + count + ' 张';
    document.querySelectorAll('[data-align]').forEach(function (b) {
      const t = b.dataset.align;
      b.disabled = (t === 'dh' || t === 'dv') ? count < 3 : count < 2;
    });
  }

  function refreshSizeSelector() {
    const sel = $('selectSize');
    if (!sel) return;
    const seen = {};
    editor.placements.forEach(function (p) {
      const key = p.wMm.toFixed(1) + '|' + p.hMm.toFixed(1);
      if (!seen[key]) seen[key] = { w: p.wMm, h: p.hMm, n: 0 };
      seen[key].n++;
    });
    const prevVal = sel.value;
    sel.innerHTML = '';
    const keys = Object.keys(seen);
    if (keys.length === 0) {
      sel.appendChild(new Option('（纸张上无照片）', ''));
      return;
    }
    keys.forEach(function (k) {
      const v = seen[k];
      let name = '';
      Object.keys(PHOTO_PRESETS).forEach(function (pk) {
        const pp = PHOTO_PRESETS[pk];
        if (Math.abs(pp.width - v.w) < 0.1 && Math.abs(pp.height - v.h) < 0.1) name = pp.name;
      });
      const label = (name ? name + ' ' : '') + v.w + '×' + v.h + 'mm (' + v.n + '张)';
      sel.appendChild(new Option(label, v.w + '|' + v.h));
    });
    if (prevVal && prevVal.indexOf('|') >= 0) {
      const has = Array.prototype.some.call(sel.options, function (o) { return o.value === prevVal; });
      if (has) sel.value = prevVal;
    }
  }

  // ---------- 启动 ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
