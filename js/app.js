// js/app.js —— 主控制器，串联 UI 与各模块

(function () {
  'use strict';

  const state = {
    photos: [],              // 每项 { id, img, sizes: [{ preset, customW, customH, count }] }
    bgColor: null,           // null = 保留原图，否则 '#xxxxxx'
    bgThreshold: 60,
    border: { color: '#333333', width: 0 },
    paperSizeMm: { width: 210, height: 297 },
    gridGapMm: 2,
  };

  let editor = null;
  const $ = function (id) { return document.getElementById(id); };
  let photoIdSeq = 0;

  // ---------- 初始化 ----------
  function init() {
    editor = new PaperEditor($('paperCanvas'));
    editor.border = state.border;
    editor.onChange = updateStatus;
    editor.onSelectionChange = updateSelectionUI;

    buildPaperPresets();
    buildBgColors();
    bindEvents();

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
      const files = Array.prototype.slice.call(e.target.files || []);
      if (files.length === 0) return;
      Promise.all(files.map(function (f) { return loadImageFromFile(f); }))
        .then(function (imgs) {
          imgs.forEach(function (img) {
            state.photos.push({
              id: 'ph_' + (++photoIdSeq),
              img: img,
              sizes: [{ preset: 'one', customW: 25, customH: 35, count: 1 }],
            });
          });
          renderPhotoList();
          fileInput.value = '';
          showToast('已成功添加 ' + imgs.length + ' 张照片');
        })
        .catch(function () { showToast('图片加载失败，请重试', 'danger'); });
    });

    const dropZone = $('dropZone');
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag'); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('drag');
      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
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

    $('borderColor').addEventListener('input', function (e) {
      state.border.color = e.target.value;
      editor.border = state.border;
      editor.render();
    });
    $('borderWidth').addEventListener('input', function (e) {
      state.border.width = parseFloat(e.target.value);
      $('borderWidthVal').textContent = state.border.width + 'mm';
      editor.border = state.border;
      editor.render();
    });

    $('gridGap').addEventListener('input', function (e) {
      state.gridGapMm = parseFloat(e.target.value);
      $('gridGapVal').textContent = state.gridGapMm + 'mm';
    });

    $('btnAutoPack').addEventListener('click', autoPack);
    $('btnClear').addEventListener('click', function () { editor.clear(); updateStatus(); });
    $('btnExportPng').addEventListener('click', function () { exportImg('image/png', '证件照排版.png'); });
    $('btnExportJpg').addEventListener('click', function () { exportImg('image/jpeg', '证件照排版.jpg', 0.95); });
    $('btnPrint').addEventListener('click', printPaper);

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

  // ---------- 轻提示（toast） ----------
  let toastTimer = null;
  function showToast(msg, type) {
    let t = $('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    if (type === 'danger') t.classList.add('danger');
    else t.classList.remove('danger');
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // ---------- 照片列表（每张照片可设多个尺寸+数量） ----------
  function renderPhotoList() {
    const list = $('photoList');
    list.innerHTML = '';
    const hint = $('photoListHint');
    if (hint) hint.style.display = state.photos.length === 0 ? 'block' : 'none';
    state.photos.forEach(function (ph, idx) {
      list.appendChild(makePhotoRow(ph, idx));
    });
  }

  function makePhotoRow(ph, idx) {
    const item = document.createElement('div');
    item.className = 'photo-item';

    const head = document.createElement('div');
    head.className = 'photo-head';

    const thumb = document.createElement('img');
    thumb.className = 'photo-thumb';
    thumb.src = ph.img.src;
    thumb.alt = '';
    head.appendChild(thumb);

    const label = document.createElement('span');
    label.className = 'photo-label';
    label.textContent = '照片 ' + (idx + 1);
    head.appendChild(label);

    const delPhoto = document.createElement('button');
    delPhoto.type = 'button'; delPhoto.className = 'del-photo'; delPhoto.textContent = '×'; delPhoto.title = '删除该照片';
    delPhoto.addEventListener('click', function () {
      state.photos.splice(idx, 1);
      renderPhotoList();
    });
    head.appendChild(delPhoto);

    item.appendChild(head);

    const sizeList = document.createElement('div');
    sizeList.className = 'size-list';
    ph.sizes.forEach(function (s, sIdx) {
      sizeList.appendChild(makeSizeRow(ph, idx, s, sIdx));
    });
    item.appendChild(sizeList);

    const addSize = document.createElement('button');
    addSize.type = 'button'; addSize.className = 'btn ghost small add-size-btn'; addSize.textContent = '+ 添加尺寸';
    addSize.addEventListener('click', function () {
      ph.sizes.push({ preset: 'one', customW: 25, customH: 35, count: 1 });
      renderPhotoList();
    });
    item.appendChild(addSize);

    return item;
  }

  function makeSizeRow(ph, phIdx, s, sIdx) {
    const row = document.createElement('div');
    row.className = 'size-row';

    const sel = document.createElement('select');
    sel.className = 'demand-size';
    Object.keys(PHOTO_PRESETS).forEach(function (k) {
      sel.appendChild(new Option(PHOTO_PRESETS[k].name, k));
    });
    sel.appendChild(new Option('自定义', 'custom'));
    sel.value = s.preset;
    sel.addEventListener('change', function () {
      s.preset = sel.value;
      renderPhotoList();
    });
    row.appendChild(sel);

    if (s.preset === 'custom') {
      const w = document.createElement('input');
      w.type = 'number'; w.className = 'demand-num'; w.value = s.customW; w.min = 5; w.step = 0.1; w.title = '宽(mm)';
      w.addEventListener('input', function () { s.customW = parseFloat(w.value) || 0; });
      const h = document.createElement('input');
      h.type = 'number'; h.className = 'demand-num'; h.value = s.customH; h.min = 5; h.step = 0.1; h.title = '高(mm)';
      h.addEventListener('input', function () { s.customH = parseFloat(h.value) || 0; });
      row.appendChild(w);
      row.appendChild(h);
    }

    const cnt = document.createElement('input');
    cnt.type = 'number'; cnt.className = 'demand-count'; cnt.value = s.count; cnt.min = 0; cnt.step = 1; cnt.title = '数量';
    cnt.addEventListener('input', function () { s.count = Math.max(0, parseInt(cnt.value, 10) || 0); });
    row.appendChild(cnt);

    const add = document.createElement('button');
    add.type = 'button'; add.className = 'demand-add'; add.textContent = '＋'; add.title = '数量+1';
    add.addEventListener('click', function () {
      s.count += 1;
      cnt.value = s.count;
    });
    row.appendChild(add);

    const del = document.createElement('button');
    del.type = 'button'; del.className = 'demand-del'; del.textContent = '×'; del.title = '删除该尺寸';
    del.addEventListener('click', function () {
      ph.sizes.splice(sIdx, 1);
      renderPhotoList();
    });
    row.appendChild(del);

    return row;
  }

  function resolveSize(s) {
    if (s.preset === 'custom') return { width: s.customW, height: s.customH };
    const p = PHOTO_PRESETS[s.preset];
    return { width: p.width, height: p.height };
  }

  // 背景/阈值变化后，用各 placement 的 srcImg 重新生成照片
  function refreshAllPhotos() {
    let changed = false;
    editor.placements.forEach(function (p) {
      if (!p.srcImg) return;
      p.photoCanvas = generatePhoto(p.srcImg, { width: p.wMm, height: p.hMm }, state.bgColor, state.bgThreshold);
      changed = true;
    });
    if (changed) editor.render();
  }

  // ---------- 批量自动排版 ----------
  function autoPack() {
    if (state.photos.length === 0) { alert('请先上传照片。'); return; }
    const items = [];
    state.photos.forEach(function (ph) {
      ph.sizes.forEach(function (s) {
        const sizeMm = resolveSize(s);
        if (!sizeMm.width || !sizeMm.height) return;
        const photoCanvas = generatePhoto(ph.img, sizeMm, state.bgColor, state.bgThreshold);
        items.push({ photoCanvas: photoCanvas, sizeMm: sizeMm, count: s.count, srcImg: ph.img });
      });
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
