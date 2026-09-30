// js/layout.js —— 纸张排版编辑器：批量装箱 + 自由拖拽(多选/框选/对齐)

class PaperEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.paperSizeMm = { width: 210, height: 297 };
    // placement: { id, photoCanvas, xMm, yMm, wMm, hMm }
    this.placements = [];
    this.selectedIds = new Set();
    this.mode = 'free';
    this.viewScale = 1;
    this.onChange = null;
    this.onSelectionChange = null;
    this._marquee = null;
    this.border = { color: '#333333', width: 0 };
    this._setupInteraction();
    this.fitToContainer();
  }

  fitToContainer() {
    const container = this.canvas.parentElement;
    const availW = (container.clientWidth || 600) - 24;
    const availH = (container.clientHeight || 700) - 24;
    const paperWpx = mmToPx(this.paperSizeMm.width, 96);
    const paperHpx = mmToPx(this.paperSizeMm.height, 96);
    this.viewScale = Math.min(availW / paperWpx, availH / paperHpx);
    if (this.viewScale > 1.5) this.viewScale = 1.5;
    if (this.viewScale < 0.2) this.viewScale = 0.2;
    this.canvas.width = Math.round(paperWpx * this.viewScale);
    this.canvas.height = Math.round(paperHpx * this.viewScale);
    this.render();
  }

  setPaperSize(sizeMm) {
    this.paperSizeMm = { width: sizeMm.width, height: sizeMm.height };
    this.placements = this.placements.filter(function (p) {
      return p.xMm + p.wMm <= sizeMm.width + 0.01 && p.yMm + p.hMm <= sizeMm.height + 0.01;
    });
    this._reconcileSelection();
    this.fitToContainer();
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'free') {
      this.selectedIds.clear();
      this._marquee = null;
      this.render();
      this._fireSel();
    }
  }

  mmToView(mm) {
    return mmToPx(mm, 96) * this.viewScale;
  }

  // ---------- 选择 ----------
  selectedCount() { return this.selectedIds.size; }

  _fireSel() {
    if (this.onSelectionChange) this.onSelectionChange(this.selectedIds.size);
  }

  _reconcileSelection() {
    const ids = new Set(this.placements.map(function (p) { return p.id; }));
    this.selectedIds.forEach(function (id) { if (!ids.has(id)) this.selectedIds.delete(id); }, this);
  }

  _selected() {
    return this.placements.filter(function (p) { return this.selectedIds.has(p.id); }, this);
  }

  selectAll() {
    this.selectedIds = new Set(this.placements.map(function (p) { return p.id; }));
    this.render();
    this._fireSel();
  }

  clearSelection() {
    this.selectedIds.clear();
    this.render();
    this._fireSel();
  }

  selectBySize(wMm, hMm) {
    this.selectedIds.clear();
    this.placements.forEach(function (p) {
      if (Math.abs(p.wMm - wMm) < 0.05 && Math.abs(p.hMm - hMm) < 0.05) {
        this.selectedIds.add(p.id);
      }
    }, this);
    this.render();
    this._fireSel();
  }

  deleteSelected() {
    this.placements = this.placements.filter(function (p) { return !this.selectedIds.has(p.id); }, this);
    this.selectedIds.clear();
    this.render();
    this._fireSel();
  }

  // ---------- 对齐 / 分布 ----------
  align(type) {
    const sel = this._selected();
    if (sel.length < 2) return;
    const min = function (arr) { return Math.min.apply(null, arr); };
    const max = function (arr) { return Math.max.apply(null, arr); };
    if (type === 'left') {
      const m = min(sel.map(function (p) { return p.xMm; }));
      sel.forEach(function (p) { p.xMm = m; });
    } else if (type === 'right') {
      const m = max(sel.map(function (p) { return p.xMm + p.wMm; }));
      sel.forEach(function (p) { p.xMm = m - p.wMm; });
    } else if (type === 'top') {
      const m = min(sel.map(function (p) { return p.yMm; }));
      sel.forEach(function (p) { p.yMm = m; });
    } else if (type === 'bottom') {
      const m = max(sel.map(function (p) { return p.yMm + p.hMm; }));
      sel.forEach(function (p) { p.yMm = m - p.hMm; });
    } else if (type === 'hcenter') {
      const l = min(sel.map(function (p) { return p.xMm; }));
      const r = max(sel.map(function (p) { return p.xMm + p.wMm; }));
      const c = (l + r) / 2;
      sel.forEach(function (p) { p.xMm = c - p.wMm / 2; });
    } else if (type === 'vcenter') {
      const t = min(sel.map(function (p) { return p.yMm; }));
      const b = max(sel.map(function (p) { return p.yMm + p.hMm; }));
      const c = (t + b) / 2;
      sel.forEach(function (p) { p.yMm = c - p.hMm / 2; });
    } else if (type === 'dh') {
      this._distribute('xMm', 'wMm');
    } else if (type === 'dv') {
      this._distribute('yMm', 'hMm');
    }
    this._clampSelected();
    this.render();
  }

  _distribute(aKey, sKey) {
    const sel = this._selected();
    if (sel.length < 3) return;
    sel.sort(function (a, b) { return a[aKey] - b[aKey]; });
    const start = sel[0][aKey];
    const end = sel[sel.length - 1][aKey] + sel[sel.length - 1][sKey];
    const totalSize = sel.reduce(function (s, p) { return s + p[sKey]; }, 0);
    const gap = (end - start - totalSize) / (sel.length - 1);
    let cur = start;
    sel.forEach(function (p) { p[aKey] = cur; cur += p[sKey] + gap; });
  }

  _clampSelected() {
    const W = this.paperSizeMm.width, H = this.paperSizeMm.height;
    this._selected().forEach(function (p) {
      p.xMm = Math.max(0, Math.min(W - p.wMm, p.xMm));
      p.yMm = Math.max(0, Math.min(H - p.hMm, p.yMm));
    });
  }

  // ---------- 增删 ----------
  addPhoto(photoCanvas, sizeMm, srcImg, xMm, yMm) {
    if (xMm == null) xMm = (this.paperSizeMm.width - sizeMm.width) / 2;
    if (yMm == null) yMm = (this.paperSizeMm.height - sizeMm.height) / 2;
    if (xMm < 0) xMm = 0;
    if (yMm < 0) yMm = 0;
    const p = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      photoCanvas: photoCanvas,
      srcImg: srcImg || null,
      xMm: xMm, yMm: yMm,
      wMm: sizeMm.width, hMm: sizeMm.height,
    };
    this.placements.push(p);
    this.selectedIds.clear();
    this.selectedIds.add(p.id);
    this.render();
    this._fireSel();
    return p;
  }

  removePhoto(id) {
    this.placements = this.placements.filter(function (p) { return p.id !== id; });
    this.selectedIds.delete(id);
    this.render();
    this._fireSel();
  }

  clear() {
    this.placements = [];
    this.selectedIds.clear();
    this.render();
    this._fireSel();
  }

  count() { return this.placements.length; }

  // ---------- 自动排版 ----------
  autoGrid(photoCanvas, sizeMm, gapMm) {
    this.placements = [];
    this.selectedIds.clear();
    const pw = sizeMm.width, ph = sizeMm.height;
    const m = gapMm;
    const availW = this.paperSizeMm.width - 2 * m;
    const availH = this.paperSizeMm.height - 2 * m;
    const cols = Math.floor((availW + gapMm) / (pw + gapMm));
    const rows = Math.floor((availH + gapMm) / (ph + gapMm));
    const totalW = cols * pw + (cols - 1) * gapMm;
    const totalH = rows * ph + (rows - 1) * gapMm;
    const offX = m + (availW - totalW) / 2;
    const offY = m + (availH - totalH) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.placements.push({
          id: 'grid_' + r + '_' + c,
          photoCanvas: photoCanvas,
          xMm: offX + c * (pw + gapMm),
          yMm: offY + r * (ph + gapMm),
          wMm: pw, hMm: ph,
        });
      }
    }
    this.render();
    this._fireSel();
    return { rows: rows, cols: cols, count: rows * cols };
  }

  autoPack(items, gapMm) {
    this.placements = [];
    this.selectedIds.clear();
    const paperW = this.paperSizeMm.width, paperH = this.paperSizeMm.height;
    const rects = [];
    items.forEach(function (item) {
      for (let i = 0; i < item.count; i++) {
        rects.push({ w: item.sizeMm.width, h: item.sizeMm.height, photoCanvas: item.photoCanvas, srcImg: item.srcImg || null });
      }
    });
    rects.sort(function (a, b) { return b.h - a.h; });
    const m = gapMm;
    const limitX = paperW - m;
    const limitY = paperH - m;
    let x = m, y = m, rowH = 0, placed = 0, overflow = 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x + r.w > limitX + 0.001) { y += rowH + gapMm; x = m; rowH = 0; }
      if (y + r.h > limitY + 0.001) { overflow++; continue; }
      this.placements.push({
        id: 'pack_' + placed, photoCanvas: r.photoCanvas, srcImg: r.srcImg,
        xMm: x, yMm: y, wMm: r.w, hMm: r.h,
      });
      x += r.w + gapMm;
      if (r.h > rowH) rowH = r.h;
      placed++;
    }
    this.render();
    this._fireSel();
    return { placed: placed, overflow: overflow, total: rects.length };
  }

  // ---------- 渲染 ----------
  render() {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const bw = (this.border && this.border.width > 0) ? this.mmToView(this.border.width) : 0;
    const bColor = this.border ? this.border.color : '#333333';
    for (const p of this.placements) {
      const x = this.mmToView(p.xMm), y = this.mmToView(p.yMm);
      const w = this.mmToView(p.wMm), h = this.mmToView(p.hMm);
      if (bw > 0) {
        ctx.fillStyle = bColor;
        ctx.fillRect(x - bw, y - bw, w + 2 * bw, h + 2 * bw);
      }
      ctx.drawImage(p.photoCanvas, x, y, w, h);
      if (this.selectedIds.has(p.id)) {
        ctx.strokeStyle = '#007aff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      }
    }
    if (this._marquee && this._marquee.active) {
      const m = this._marquee;
      const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1);
      const w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
      ctx.strokeStyle = '#007aff';
      ctx.fillStyle = 'rgba(0,122,255,0.12)';
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    if (this._snapLines && this._snapLines.length) {
      ctx.save();
      ctx.strokeStyle = '#ff3b6b';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const ln of this._snapLines) {
        ctx.beginPath();
        if (ln.x != null) {
          const xv = this.mmToView(ln.x);
          ctx.moveTo(xv, 0);
          ctx.lineTo(xv, this.canvas.height);
        } else if (ln.y != null) {
          const yv = this.mmToView(ln.y);
          ctx.moveTo(0, yv);
          ctx.lineTo(this.canvas.width, yv);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (this.onChange) this.onChange();
  }

  _hitTest(mx, my) {
    for (let i = this.placements.length - 1; i >= 0; i--) {
      const p = this.placements[i];
      const x = this.mmToView(p.xMm), y = this.mmToView(p.yMm);
      const w = this.mmToView(p.wMm), h = this.mmToView(p.hMm);
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
        return { index: i, placement: p };
      }
    }
    return null;
  }

  // 拖动单张时的智能对齐：吸附到其他照片的边/中心或纸张边/中线，返回参考线
  _computeSnap(p) {
    const TH = 1.5;
    const W = this.paperSizeMm.width, H = this.paperSizeMm.height;
    const others = this.placements.filter(function (x) { return x.id !== p.id; });
    const lines = [];

    const oxVals = [0, W, W / 2];
    others.forEach(function (o) { oxVals.push(o.xMm, o.xMm + o.wMm, o.xMm + o.wMm / 2); });
    const pX = [
      { f: 'L', v: p.xMm },
      { f: 'R', v: p.xMm + p.wMm },
      { f: 'C', v: p.xMm + p.wMm / 2 },
    ];
    let bestX = null;
    pX.forEach(function (pf) {
      oxVals.forEach(function (ox) {
        const d = pf.v - ox;
        if (Math.abs(d) < TH && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { f: pf.f, ox: ox, d: d };
      });
    });
    if (bestX) {
      if (bestX.f === 'L') p.xMm = bestX.ox;
      else if (bestX.f === 'R') p.xMm = bestX.ox - p.wMm;
      else p.xMm = bestX.ox - p.wMm / 2;
      p.xMm = Math.max(0, Math.min(W - p.wMm, p.xMm));
      lines.push({ x: bestX.ox });
    }

    const oyVals = [0, H, H / 2];
    others.forEach(function (o) { oyVals.push(o.yMm, o.yMm + o.hMm, o.yMm + o.hMm / 2); });
    const pY = [
      { f: 'T', v: p.yMm },
      { f: 'B', v: p.yMm + p.hMm },
      { f: 'C', v: p.yMm + p.hMm / 2 },
    ];
    let bestY = null;
    pY.forEach(function (pf) {
      oyVals.forEach(function (oy) {
        const d = pf.v - oy;
        if (Math.abs(d) < TH && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { f: pf.f, oy: oy, d: d };
      });
    });
    if (bestY) {
      if (bestY.f === 'T') p.yMm = bestY.oy;
      else if (bestY.f === 'B') p.yMm = bestY.oy - p.hMm;
      else p.yMm = bestY.oy - p.hMm / 2;
      p.yMm = Math.max(0, Math.min(H - p.hMm, p.yMm));
      lines.push({ y: bestY.oy });
    }
    return lines.length ? lines : null;
  }

  // ---------- 交互 ----------
  _setupInteraction() {
    const self = this;
    let drag = null;

    const getPos = function (e) {
      const rect = self.canvas.getBoundingClientRect();
      return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
    };
    const clampPos = function (pos) {
      pos.mx = Math.max(0, Math.min(self.canvas.width, pos.mx));
      pos.my = Math.max(0, Math.min(self.canvas.height, pos.my));
      return pos;
    };

    const onDown = function (pos, additive) {
      if (self.mode !== 'free') return;
      const hit = self._hitTest(pos.mx, pos.my);

      if (hit) {
        const p = hit.placement;
        if (additive) {
          if (self.selectedIds.has(p.id)) self.selectedIds.delete(p.id);
          else self.selectedIds.add(p.id);
          self.render();
          self._fireSel();
          return;
        }
        if (!self.selectedIds.has(p.id)) {
          self.selectedIds.clear();
          self.selectedIds.add(p.id);
          self.render();
          self._fireSel();
        }
        // 启动整组拖动
        const oneMm = self.mmToView(1);
        const ids = Array.from(self.selectedIds);
        drag = {
          offs: ids.map(function (id) {
            const pp = self.placements.find(function (x) { return x.id === id; });
            return { id: id, oxMm: pos.mx / oneMm - pp.xMm, oyMm: pos.my / oneMm - pp.yMm };
          }),
        };
        // 置顶被点中的
        self.placements.push(self.placements.splice(hit.index, 1)[0]);
        self.canvas.style.cursor = 'grabbing';
      } else {
        if (!additive) {
          self.selectedIds.clear();
          self._fireSel();
        }
        self._marquee = { x0: pos.mx, y0: pos.my, x1: pos.mx, y1: pos.my, active: true };
        self.render();
      }
    };

    this.canvas.addEventListener('mousedown', function (e) {
      onDown(getPos(e), e.ctrlKey || e.metaKey || e.shiftKey);
    });

    const onMove = function (e) {
      if (drag) {
        const pos = getPos(e);
        const oneMm = self.mmToView(1);
        drag.offs.forEach(function (o) {
          const p = self.placements.find(function (x) { return x.id === o.id; });
          if (!p) return;
          let nx = pos.mx / oneMm - o.oxMm;
          let ny = pos.my / oneMm - o.oyMm;
          nx = Math.max(0, Math.min(self.paperSizeMm.width - p.wMm, nx));
          ny = Math.max(0, Math.min(self.paperSizeMm.height - p.hMm, ny));
          p.xMm = nx; p.yMm = ny;
        });
        // 单张拖动时智能对齐参考线 + 吸附
        self._snapLines = null;
        if (drag.offs.length === 1) {
          const mainP = self.placements.find(function (x) { return x.id === drag.offs[0].id; });
          if (mainP) self._snapLines = self._computeSnap(mainP);
        }
        self.render();
      } else if (self._marquee && self._marquee.active) {
        const pos = clampPos(getPos(e));
        self._marquee.x1 = pos.mx;
        self._marquee.y1 = pos.my;
        self.render();
      }
    };

    window.addEventListener('mousemove', onMove);

    const onUp = function () {
      if (drag) { drag = null; self.canvas.style.cursor = ''; self._snapLines = null; self.render(); }
      if (self._marquee && self._marquee.active) {
        const m = self._marquee;
        m.active = false;
        const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1);
        const w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
        if (w > 3 || h > 3) {
          self.placements.forEach(function (p) {
            const px = self.mmToView(p.xMm), py = self.mmToView(p.yMm);
            const pw = self.mmToView(p.wMm), ph = self.mmToView(p.hMm);
            if (px < x + w && px + pw > x && py < y + h && py + ph > y) {
              self.selectedIds.add(p.id);
            }
          });
          self._fireSel();
        }
        self._marquee = null;
        self.render();
      }
    };

    window.addEventListener('mouseup', onUp);

    // 触摸（手机/平板）：拖动照片、双击删除；点空白不拦截以便页面滚动
    let lastTap = { t: 0, x: 0, y: 0 };
    this.canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      const pos = getPos(e.touches[0]);
      const hit = self._hitTest(pos.mx, pos.my);
      if (!hit) {
        if (self.selectedIds.size) { self.selectedIds.clear(); self.render(); self._fireSel(); }
        return;
      }
      e.preventDefault();
      const now = Date.now();
      const isDouble = (now - lastTap.t < 350) && Math.abs(pos.mx - lastTap.x) < 24 && Math.abs(pos.my - lastTap.y) < 24;
      lastTap = { t: now, x: pos.mx, y: pos.my };
      if (isDouble) { self.removePhoto(hit.placement.id); return; }
      onDown(pos, false);
    }, { passive: false });
    window.addEventListener('touchmove', function (e) {
      if (!drag || e.touches.length !== 1) return;
      e.preventDefault();
      onMove(e.touches[0]);
    }, { passive: false });
    window.addEventListener('touchend', function () { onUp(); });

    this.canvas.addEventListener('dblclick', function (e) {
      if (self.mode !== 'free') return;
      const pos = getPos(e);
      const hit = self._hitTest(pos.mx, pos.my);
      if (hit) self.removePhoto(hit.placement.id);
    });

    this.canvas.addEventListener('contextmenu', function (e) {
      if (self.mode !== 'free') return;
      e.preventDefault();
      const pos = getPos(e);
      const hit = self._hitTest(pos.mx, pos.my);
      if (hit) self.removePhoto(hit.placement.id);
    });

    window.addEventListener('keydown', function (e) {
      if (self.mode !== 'free') return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (self.selectedIds.size > 0) { e.preventDefault(); self.deleteSelected(); }
      } else if (e.key === 'Escape') {
        self.clearSelection();
      }
    });
  }

  // ---------- 导出 ----------
  exportCanvas(dpi) {
    dpi = dpi || PRINT_DPI;
    const w = Math.round(mmToPx(this.paperSizeMm.width, dpi));
    const h = Math.round(mmToPx(this.paperSizeMm.height, dpi));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const bwMm = (this.border && this.border.width > 0) ? this.border.width : 0;
    const bColor = this.border ? this.border.color : '#333333';
    for (const p of this.placements) {
      const px = mmToPx(p.xMm, dpi), py = mmToPx(p.yMm, dpi);
      const pw = mmToPx(p.wMm, dpi), ph = mmToPx(p.hMm, dpi);
      if (bwMm > 0) {
        const bw = mmToPx(bwMm, dpi);
        ctx.fillStyle = bColor;
        ctx.fillRect(px - bw, py - bw, pw + 2 * bw, ph + 2 * bw);
      }
      ctx.drawImage(p.photoCanvas, px, py, pw, ph);
    }
    return canvas;
  }
}
