(() => {
  const els = {
    workspace: document.getElementById('workspace'),
    stage: document.getElementById('stage'),
    scene: document.getElementById('scene'),
    world: document.getElementById('world'),
    defs: document.getElementById('defs'),
    bgImage: document.getElementById('bg-image'),
    status: document.getElementById('status'),
    zoomLabel: document.getElementById('zoom-label'),

    inputJson: document.getElementById('input-json'),
    inputBg: document.getElementById('input-bg'),
    inputUploadJson: document.getElementById('input-upload-json'),
    inputMedia: document.getElementById('input-media'),

    btnOpenJson: document.getElementById('btn-open-json'),
    btnOpenMedia: document.getElementById('btn-open-media'),
    btnClear: document.getElementById('btn-clear'),
    btnOpenBg: document.getElementById('btn-open-bg'),

    btnLock: document.getElementById('btn-lock'),
    btnRotateLeft: document.getElementById('btn-rotate-left'),
    btnRotateRight: document.getElementById('btn-rotate-right'),
    btnFlipH: document.getElementById('btn-flip-h'),
    btnFlipV: document.getElementById('btn-flip-v'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    btnZoomIn: document.getElementById('btn-zoom-in'),

    btnLibraryToggle: document.getElementById('btn-library-toggle'),
    btnLibraryHide: document.getElementById('btn-library-hide'),
    btnLibraryRefresh: document.getElementById('btn-library-refresh'),
    librarySearch: document.getElementById('library-search'),
    libraryScope: document.getElementById('library-scope'),
    libraryList: document.getElementById('library-list'),

    uploadKind: document.getElementById('upload-kind'),
    uploadFolder: document.getElementById('upload-folder'),
    uploadKey: document.getElementById('upload-key'),
    btnUploadJson: document.getElementById('btn-upload-json'),

    btnMediaToggle: document.getElementById('btn-media-toggle'),
    btnMediaHide: document.getElementById('btn-media-hide'),
    btnMediaRefresh: document.getElementById('btn-media-refresh'),
    btnMediaClearList: document.getElementById('btn-media-clear-list'),
    mediaSearch: document.getElementById('media-search'),
    mediaList: document.getElementById('media-list'),

    mediaOverlay: document.getElementById('media-overlay'),
    mediaTitle: document.getElementById('media-title'),
    btnMediaClose: document.getElementById('btn-media-close'),
    mediaImage: document.getElementById('media-image'),
    mediaVideo: document.getElementById('media-video'),
    mediaModelViewer: document.getElementById('media-model-viewer'),
    media3dCanvas: document.getElementById('media-3d-canvas')
  };

  const state = {
    project: { elements: [], camera: { x: 0, y: 0, zoom: 1 } },
    zoom: 1,
    rotateDeg: 0,
    flipX: 1,
    flipY: 1,
    fixed: false,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    gradientCounter: 0,

    libraryVisible: false,
    libraryItems: [],
    previewCache: new Map(),
    previewLoading: new Set(),
    listRenderTimer: null,

    mediaVisible: false,
    mediaItems: [],
    mediaUrls: [],
    activeMediaId: '',
    mediaRenderTimer: null,

    modelViewerReadyPromise: null,
    threeModules: null,
    threeRuntime: null
  };

  function setStatus(msg) {
    els.status.textContent = msg;
  }

  function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
  }

  function formatBytes(bytes) {
    const val = Number(bytes || 0);
    if (!Number.isFinite(val) || val <= 0) return '0 B';
    if (val < 1024) return `${val} B`;
    if (val < 1024 * 1024) return `${(val / 1024).toFixed(1)} KB`;
    return `${(val / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(value) {
    if (!value) return 'sin fecha';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'sin fecha';
    return d.toLocaleString();
  }

  function simpleId(id) {
    if (!id) return 'sin-id';
    const parts = String(id).split('/');
    return parts[parts.length - 1] || id;
  }

  function extName(name) {
    const n = String(name || '').toLowerCase();
    const i = n.lastIndexOf('.');
    return i >= 0 ? n.slice(i + 1) : '';
  }

  function baseName(name) {
    const n = String(name || '');
    const i = n.lastIndexOf('.');
    return i >= 0 ? n.slice(0, i) : n;
  }

  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    });
    return node;
  }

  function setLibraryVisible(on) {
    state.libraryVisible = Boolean(on);
    els.workspace.classList.toggle('library-open', state.libraryVisible);
    if (state.libraryVisible && state.libraryItems.length === 0) {
      void loadLibraryCatalog();
    }
  }

  function setMediaVisible(on) {
    state.mediaVisible = Boolean(on);
    els.workspace.classList.toggle('media-open', state.mediaVisible);
  }

  function updateWorldTransform() {
    const z = state.zoom;
    const tr = `translate(${state.panX} ${state.panY}) scale(${z}) rotate(${state.rotateDeg}) scale(${state.flipX} ${state.flipY})`;
    els.world.setAttribute('transform', tr);
    els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    els.btnLock.setAttribute('aria-pressed', String(state.fixed));
    els.btnLock.textContent = `Fijar: ${state.fixed ? 'ON' : 'OFF'}`;
  }

  function gradientFill(fillColor, grad) {
    if (!grad || typeof grad !== 'object') return fillColor || '#00bcd4';

    const id = `g_${Date.now()}_${state.gradientCounter++}`;
    const x1 = grad.x1 ?? 0;
    const y1 = grad.y1 ?? 0;
    const x2 = grad.x2 ?? 1;
    const y2 = grad.y2 ?? 1;
    const defsGrad = svgEl('linearGradient', {
      id,
      x1,
      y1,
      x2,
      y2,
      gradientUnits: 'objectBoundingBox'
    });

    const stops = Array.isArray(grad.stops) ? grad.stops : [];
    if (stops.length === 0) {
      defsGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': fillColor || '#00bcd4' }));
      defsGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#ffffff' }));
    } else {
      stops.forEach((s) => {
        defsGrad.appendChild(svgEl('stop', {
          offset: `${clamp(Number(s.offset ?? 0), 0, 1) * 100}%`,
          'stop-color': s.color || '#00bcd4'
        }));
      });
    }

    els.defs.appendChild(defsGrad);
    return `url(#${id})`;
  }

  function clearScene() {
    els.world.innerHTML = '';
    els.defs.innerHTML = '';
  }

  function getRectLike(elem) {
    const x = Number(elem.x ?? 0);
    const y = Number(elem.y ?? 0);
    const w = Number(elem.width ?? elem.w ?? 0);
    const h = Number(elem.height ?? elem.h ?? 0);
    return { x, y, w, h };
  }

  function walkElements(elements, visitor) {
    const stack = Array.isArray(elements) ? elements.slice() : [];
    while (stack.length) {
      const elem = stack.pop();
      if (!elem || typeof elem !== 'object') continue;

      visitor(elem);

      if (elem.type === 'group' && Array.isArray(elem.elements)) {
        for (let i = elem.elements.length - 1; i >= 0; i -= 1) stack.push(elem.elements[i]);
      }
    }
  }

  function resolveProjectPayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (Array.isArray(raw.elements)) return raw;

    const possible = [
      'project', 'data', 'payload', 'result', 'value',
      'diagram', 'flow', 'content', 'document'
    ];

    for (const key of possible) {
      const value = raw[key];
      if (value && typeof value === 'object' && Array.isArray(value.elements)) {
        return value;
      }
    }

    return null;
  }

  function applyProject(project, source = 'local') {
    const resolved = resolveProjectPayload(project);
    if (!resolved) throw new Error('No se encontró arreglo elements en el JSON');

    state.project = resolved;
    const cam = resolved.camera || {};
    if (Number.isFinite(cam.zoom)) state.zoom = clamp(Number(cam.zoom), 0.1, 5);

    renderProject();
    const count = Array.isArray(resolved.elements) ? resolved.elements.length : 0;
    setStatus(`Cargado (${source}): ${count} elementos.`);
    return resolved;
  }

  function renderElement(elem, parent) {
    if (!elem || typeof elem !== 'object') return;

    if (elem.type === 'group' && Array.isArray(elem.elements)) {
      const g = svgEl('g', { class: 'sticker' });
      parent.appendChild(g);
      elem.elements.forEach((child) => renderElement(child, g));
      return;
    }

    if (elem.hidden === true) return;

    const fill = gradientFill(elem.fillColor || '#00bcd4', elem.fillGradient);
    const stroke = elem.strokeColor || '#e94560';
    const lineWidth = Number(elem.lineWidth ?? elem.strokeWidth ?? 2);

    let node = null;

    if (elem.type === 'line') {
      const x1 = Number(elem.x ?? elem.x1 ?? 0);
      const y1 = Number(elem.y ?? elem.y1 ?? 0);
      const x2 = Number(elem.endX ?? elem.x2 ?? 0);
      const y2 = Number(elem.endY ?? elem.y2 ?? 0);
      node = svgEl('line', {
        x1,
        y1,
        x2,
        y2,
        stroke,
        'stroke-width': lineWidth,
        'stroke-linecap': 'round',
        'stroke-dasharray': elem.active ? '8 8' : null
      });

      if (elem.active) {
        const anim = svgEl('animate', {
          attributeName: 'stroke-dashoffset',
          from: '0',
          to: '-16',
          dur: `${Math.max(0.2, 2 / (Number(elem.speed) || 1))}s`,
          repeatCount: 'indefinite'
        });
        node.appendChild(anim);
      }
    } else if (elem.type === 'rectangle') {
      const { x, y, w, h } = getRectLike(elem);
      node = svgEl('rect', {
        x,
        y,
        width: w,
        height: h,
        rx: Number(elem.radius ?? 0),
        fill,
        stroke,
        'stroke-width': lineWidth
      });
    } else if (elem.type === 'circle') {
      const { x, y, w, h } = getRectLike(elem);
      const r = Number(elem.radius ?? Math.min(w, h) / 2);
      const cx = Number(elem.cx ?? (x + (w || r * 2) / 2));
      const cy = Number(elem.cy ?? (y + (h || r * 2) / 2));
      node = svgEl('circle', {
        cx,
        cy,
        r,
        fill,
        stroke,
        'stroke-width': lineWidth
      });
    } else if (elem.type === 'polygon' || elem.type === 'path') {
      const pts = Array.isArray(elem.points) ? elem.points : [];
      const points = pts.map((p) => `${Number(p.x ?? 0)},${Number(p.y ?? 0)}`).join(' ');
      if (points) {
        node = svgEl('polygon', {
          points,
          fill,
          stroke,
          'stroke-width': lineWidth
        });
      }
    } else if (elem.type === 'image') {
      const { x, y, w, h } = getRectLike(elem);
      const src = elem.imageSrc || elem.imageData || '';
      if (src) {
        node = svgEl('image', {
          x,
          y,
          width: w,
          height: h,
          href: src,
          preserveAspectRatio: 'none'
        });
      }
    }

    if (!node) return;

    if (Number.isFinite(elem.rotation) && elem.rotation !== 0) {
      const { x, y, w, h } = getRectLike(elem);
      const cx = x + w / 2;
      const cy = y + h / 2;
      node.setAttribute('transform', `rotate(${Number(elem.rotation)} ${cx} ${cy})`);
    }

    node.classList.add('sticker');
    parent.appendChild(node);
  }

  function renderProject() {
    clearScene();
    const elements = Array.isArray(state.project.elements) ? state.project.elements : [];
    elements.forEach((elem) => renderElement(elem, els.world));
    updateWorldTransform();
  }

  async function parseAndApplyProject(rawText, source = 'archivo') {
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error('JSON inválido');
    }

    applyProject(data, source);
  }

  function computeElementBounds(elem) {
    if (!elem || typeof elem !== 'object') return null;

    if (elem.type === 'line') {
      const x1 = Number(elem.x ?? elem.x1 ?? 0);
      const y1 = Number(elem.y ?? elem.y1 ?? 0);
      const x2 = Number(elem.endX ?? elem.x2 ?? 0);
      const y2 = Number(elem.endY ?? elem.y2 ?? 0);
      return {
        minX: Math.min(x1, x2),
        minY: Math.min(y1, y2),
        maxX: Math.max(x1, x2),
        maxY: Math.max(y1, y2)
      };
    }

    if (elem.type === 'rectangle' || elem.type === 'image' || elem.type === 'circle') {
      const { x, y, w, h } = getRectLike(elem);
      if (elem.type === 'circle' && Number.isFinite(elem.radius)) {
        const r = Number(elem.radius);
        return {
          minX: Number(elem.x ?? 0) - r,
          minY: Number(elem.y ?? 0) - r,
          maxX: Number(elem.x ?? 0) + r,
          maxY: Number(elem.y ?? 0) + r
        };
      }
      return { minX: x, minY: y, maxX: x + w, maxY: y + h };
    }

    if (elem.type === 'polygon' || elem.type === 'path') {
      const pts = Array.isArray(elem.points) ? elem.points : [];
      if (!pts.length) return null;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      pts.forEach((p) => {
        const x = Number(p.x ?? 0);
        const y = Number(p.y ?? 0);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      });
      return { minX, minY, maxX, maxY };
    }

    return null;
  }

  function mergeBounds(a, b) {
    if (!a) return b;
    if (!b) return a;
    return {
      minX: Math.min(a.minX, b.minX),
      minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX),
      maxY: Math.max(a.maxY, b.maxY)
    };
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function thumbElementSvg(elem) {
    if (!elem || typeof elem !== 'object') return '';

    if (elem.type === 'group' && Array.isArray(elem.elements)) {
      return elem.elements.map(thumbElementSvg).join('');
    }

    if (elem.hidden === true) return '';

    const fill = elem.fillColor || '#22d3ee';
    const stroke = elem.strokeColor || '#e94560';
    const lineWidth = Number(elem.lineWidth ?? elem.strokeWidth ?? 2);

    if (elem.type === 'line') {
      const x1 = Number(elem.x ?? elem.x1 ?? 0);
      const y1 = Number(elem.y ?? elem.y1 ?? 0);
      const x2 = Number(elem.endX ?? elem.x2 ?? 0);
      const y2 = Number(elem.endY ?? elem.y2 ?? 0);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeAttr(stroke)}" stroke-width="${lineWidth}" stroke-linecap="round" />`;
    }

    if (elem.type === 'rectangle') {
      const { x, y, w, h } = getRectLike(elem);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Number(elem.radius ?? 0)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${lineWidth}"/>`;
    }

    if (elem.type === 'circle') {
      const { x, y, w, h } = getRectLike(elem);
      const r = Number(elem.radius ?? Math.min(w, h) / 2);
      const cx = Number(elem.cx ?? (x + (w || r * 2) / 2));
      const cy = Number(elem.cy ?? (y + (h || r * 2) / 2));
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${lineWidth}"/>`;
    }

    if (elem.type === 'polygon' || elem.type === 'path') {
      const pts = Array.isArray(elem.points) ? elem.points : [];
      const points = pts.map((p) => `${Number(p.x ?? 0)},${Number(p.y ?? 0)}`).join(' ');
      if (!points) return '';
      return `<polygon points="${escapeAttr(points)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${lineWidth}"/>`;
    }

    if (elem.type === 'image') {
      const { x, y, w, h } = getRectLike(elem);
      const src = elem.imageSrc || '';
      if (!src) return '';
      return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${escapeAttr(src)}" preserveAspectRatio="none" />`;
    }

    return '';
  }

  function getFirstImageSrc(project) {
    let found = '';
    walkElements(project.elements || [], (elem) => {
      if (found) return;
      if (elem.type === 'image' && typeof elem.imageSrc === 'string' && elem.imageSrc.trim()) {
        found = elem.imageSrc.trim();
      }
    });
    return found;
  }

  function buildThumbDataUrl(project) {
    const elements = [];
    walkElements(project.elements || [], (elem) => {
      if (elements.length < 40) elements.push(elem);
    });

    let bounds = null;
    elements.forEach((elem) => {
      bounds = mergeBounds(bounds, computeElementBounds(elem));
    });

    if (!bounds) bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

    const w = Math.max(10, bounds.maxX - bounds.minX);
    const h = Math.max(10, bounds.maxY - bounds.minY);
    const pad = Math.max(w, h) * 0.08;
    const minX = bounds.minX - pad;
    const minY = bounds.minY - pad;
    const viewW = w + pad * 2;
    const viewH = h + pad * 2;

    const content = elements.map(thumbElementSvg).join('');
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${viewW} ${viewH}"><rect x="${minX}" y="${minY}" width="${viewW}" height="${viewH}" fill="#0b1f3f"/>${content}</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function placeholderThumb(kind) {
    const label = kind === 'project' ? 'PROY' : 'VECT';
    const color = kind === 'project' ? '#34d399' : '#38bdf8';
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10254a"/><stop offset="100%" stop-color="#0a1f3e"/></linearGradient></defs><rect width="160" height="120" fill="url(#g)"/><rect x="20" y="24" width="120" height="72" rx="10" fill="none" stroke="${color}" stroke-width="4"/><circle cx="50" cy="60" r="10" fill="${color}"/><rect x="68" y="48" width="52" height="24" rx="4" fill="${color}" opacity="0.7"/><text x="80" y="110" text-anchor="middle" font-size="16" fill="#dbeafe" font-family="Segoe UI">${label}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  async function fetchCatalogScope(scope) {
    const res = await fetch(`/api/library?scope=${encodeURIComponent(scope)}&mode=expanded&limit=200`, {
      cache: 'no-store'
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`No se pudo listar ${scope}: ${body || res.status}`);
    }

    const data = await res.json();
    const blobs = Array.isArray(data.blobs) ? data.blobs : [];

    return blobs.map((b) => ({
      id: String(b.pathname || ''),
      kind: scope === 'projects' ? 'project' : 'vector',
      size: Number(b.size || 0),
      uploadedAt: b.uploadedAt || '',
      name: ''
    }));
  }

  function scheduleLibraryRender() {
    if (state.listRenderTimer) clearTimeout(state.listRenderTimer);
    state.listRenderTimer = setTimeout(() => {
      renderLibraryList();
    }, 90);
  }

  function scheduleMediaRender() {
    if (state.mediaRenderTimer) clearTimeout(state.mediaRenderTimer);
    state.mediaRenderTimer = setTimeout(() => {
      renderMediaList();
    }, 60);
  }

  async function ensureItemPreview(item) {
    if (!item || !item.id) return;
    if (state.previewCache.has(item.id)) return;
    if (state.previewLoading.has(item.id)) return;

    state.previewLoading.add(item.id);
    try {
      const res = await fetch(`/api/project?id=${encodeURIComponent(item.id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const raw = await res.json();
      const project = resolveProjectPayload(raw);
      if (!project) throw new Error('payload sin elements');

      const firstImage = getFirstImageSrc(project);
      const thumb = firstImage || buildThumbDataUrl(project);
      const name = String(project.name || '').trim() || simpleId(item.id);

      state.previewCache.set(item.id, {
        thumb,
        name,
        count: Array.isArray(project.elements) ? project.elements.length : 0
      });
    } catch {
      state.previewCache.set(item.id, {
        thumb: placeholderThumb(item.kind),
        name: simpleId(item.id),
        count: 0
      });
    } finally {
      state.previewLoading.delete(item.id);
      scheduleLibraryRender();
    }
  }

  function filteredLibraryItems() {
    const search = String(els.librarySearch.value || '').trim().toLowerCase();
    const scope = els.libraryScope.value || 'all';

    return state.libraryItems.filter((item) => {
      if (scope !== 'all') {
        const expectedKind = scope === 'projects' ? 'project' : 'vector';
        if (item.kind !== expectedKind) return false;
      }

      if (!search) return true;

      const cache = state.previewCache.get(item.id);
      const byName = String(cache?.name || '').toLowerCase().includes(search);
      const byId = String(item.id || '').toLowerCase().includes(search);
      return byName || byId;
    });
  }

  function renderLibraryList() {
    const items = filteredLibraryItems();
    els.libraryList.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'library-empty';
      empty.textContent = 'Sin resultados. Ajusta filtro, alcance o sube un JSON.';
      els.libraryList.appendChild(empty);
      return;
    }

    items.forEach((item, idx) => {
      const cache = state.previewCache.get(item.id);
      const row = document.createElement('div');
      row.className = 'library-item';
      row.dataset.id = item.id;

      const img = document.createElement('img');
      img.className = 'library-thumb';
      img.alt = 'preview';
      img.src = cache?.thumb || placeholderThumb(item.kind);

      const meta = document.createElement('div');
      meta.className = 'library-meta';
      const title = document.createElement('div');
      title.className = 'library-title';
      title.textContent = cache?.name || simpleId(item.id);
      const sub = document.createElement('div');
      sub.className = 'library-sub';
      sub.textContent = `${item.kind === 'project' ? 'Proyecto' : 'Vector'} • ${formatDate(item.uploadedAt)}`;

      const pills = document.createElement('div');
      pills.className = 'library-pills';
      const pillSize = document.createElement('span');
      pillSize.className = 'pill';
      pillSize.textContent = formatBytes(item.size);
      const pillCount = document.createElement('span');
      pillCount.className = 'pill';
      pillCount.textContent = `${cache?.count ?? '-'} el.`;
      pills.appendChild(pillSize);
      pills.appendChild(pillCount);

      meta.appendChild(title);
      meta.appendChild(sub);
      meta.appendChild(pills);

      const action = document.createElement('button');
      action.className = 'btn btn-small';
      action.textContent = 'Ver';
      action.addEventListener('click', () => {
        void loadStoredItem(item);
      });

      row.appendChild(img);
      row.appendChild(meta);
      row.appendChild(action);
      els.libraryList.appendChild(row);

      if (!cache && idx < 24) {
        void ensureItemPreview(item);
      }
    });
  }

  async function loadLibraryCatalog() {
    setStatus('Cargando catálogo de JSON...');

    try {
      const selected = els.libraryScope.value || 'all';
      let rows = [];

      if (selected === 'all') {
        const [vectors, projects] = await Promise.all([fetchCatalogScope('library'), fetchCatalogScope('projects')]);
        rows = vectors.concat(projects);
      } else if (selected === 'projects') {
        rows = await fetchCatalogScope('projects');
      } else {
        rows = await fetchCatalogScope('library');
      }

      rows.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
      state.libraryItems = rows;
      renderLibraryList();
      setStatus(`Catálogo listo: ${rows.length} item(s).`);
    } catch (error) {
      setStatus(`Error cargando catálogo: ${error.message}`);
    }
  }

  async function loadStoredItem(item) {
    if (!item?.id) return;

    try {
      const res = await fetch(`/api/project?id=${encodeURIComponent(item.id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`No se pudo cargar id=${item.id}`);
      const raw = await res.text();
      await parseAndApplyProject(raw, `${item.kind}:${item.id}`);
      closeMediaOverlay();
    } catch (error) {
      setStatus(`Error cargando item: ${error.message}`);
    }
  }

  async function uploadJsonFile(file) {
    const kind = els.uploadKind.value || 'vector';
    const endpoint = kind === 'project' ? '/api/publish-project' : '/api/publish';

    const text = await file.text();
    let payload;

    try {
      const parsed = JSON.parse(text);
      const resolved = resolveProjectPayload(parsed);
      if (!resolved) throw new Error('JSON sin elements');
      payload = resolved;
    } catch (error) {
      throw new Error(`No se pudo leer JSON: ${error.message}`);
    }

    const folder = String(els.uploadFolder.value || '').trim();
    if (folder) payload.folder = folder;

    if (!payload.name || !String(payload.name).trim()) {
      payload.name = file.name.replace(/\.json$/i, '') || `json-${Date.now()}`;
    }

    const headers = { 'content-type': 'application/json' };
    const key = String(els.uploadKey.value || '').trim();
    if (key) headers['x-publish-key'] = key;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok || !body?.ok) {
      const details = Array.isArray(body?.details) ? ` ${body.details.join(' | ')}` : '';
      throw new Error(`${body?.error || res.statusText}.${details}`);
    }

    setStatus(`Publicado OK (${kind}): ${body.id}`);
    await loadLibraryCatalog();

    if (body.id) {
      const item = {
        id: body.id,
        kind: kind === 'project' ? 'project' : 'vector',
        size: 0,
        uploadedAt: new Date().toISOString(),
        name: payload.name
      };
      await loadStoredItem(item);
    }
  }

  function mediaKindFromFile(file) {
    const type = String(file.type || '').toLowerCase();
    const ext = extName(file.name);

    if (ext === 'gltf' || ext === 'glb') return 'model-gltf';
    if (ext === 'obj') return 'model-obj';
    if (ext === 'mtl') return 'model-mtl';

    if (type.startsWith('video/') || ext === 'mp4' || ext === 'webm') return 'video';

    if (
      type.startsWith('image/') ||
      ext === 'gif' || ext === 'webp' || ext === 'png' || ext === 'jpg' || ext === 'jpeg'
    ) {
      return 'image';
    }

    return 'other';
  }

  function mediaPlaceholder(kind, name) {
    let label = 'FILE';
    let color = '#93c5fd';
    if (kind === 'video') {
      label = 'VIDEO';
      color = '#f59e0b';
    } else if (kind === 'model-gltf' || kind === 'model-obj') {
      label = '3D';
      color = '#34d399';
    } else if (kind === 'image') {
      label = 'IMG';
      color = '#38bdf8';
    }

    const title = String(name || '').slice(0, 12);
    const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#111f3b"/><stop offset="100%" stop-color="#0b1530"/></linearGradient></defs><rect width="160" height="120" fill="url(#g)"/><rect x="18" y="18" width="124" height="68" rx="10" fill="none" stroke="${color}" stroke-width="4"/><text x="80" y="57" text-anchor="middle" font-size="22" fill="${color}" font-family="Segoe UI" font-weight="700">${label}</text><text x="80" y="104" text-anchor="middle" font-size="11" fill="#dbeafe" font-family="Segoe UI">${escapeAttr(title)}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function clearMediaUrls() {
    state.mediaUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {
        // no-op
      }
    });
    state.mediaUrls = [];
  }

  function resetMediaList() {
    closeMediaOverlay();
    clearMediaUrls();
    state.mediaItems = [];
    state.activeMediaId = '';
    renderMediaList();
  }

  function filteredMediaItems() {
    const search = String(els.mediaSearch.value || '').trim().toLowerCase();
    if (!search) return state.mediaItems;

    return state.mediaItems.filter((item) => {
      return String(item.name || '').toLowerCase().includes(search);
    });
  }

  function renderMediaList() {
    const rows = filteredMediaItems();
    els.mediaList.innerHTML = '';

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'library-empty';
      empty.textContent = 'No hay media cargada. Usa "Abrir Media/3D".';
      els.mediaList.appendChild(empty);
      return;
    }

    rows.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'library-item';
      row.dataset.id = item.id;

      const img = document.createElement('img');
      img.className = 'library-thumb';
      img.alt = 'media';
      img.src = item.thumb;

      const meta = document.createElement('div');
      meta.className = 'library-meta';
      const title = document.createElement('div');
      title.className = 'library-title';
      title.textContent = item.name;
      const sub = document.createElement('div');
      sub.className = 'library-sub';
      sub.textContent = `${item.kind} • ${formatBytes(item.size)}`;

      const pills = document.createElement('div');
      pills.className = 'library-pills';
      const pillExt = document.createElement('span');
      pillExt.className = 'pill';
      pillExt.textContent = item.ext || '-';
      pills.appendChild(pillExt);

      meta.appendChild(title);
      meta.appendChild(sub);
      meta.appendChild(pills);

      const action = document.createElement('button');
      action.className = 'btn btn-small';
      action.textContent = 'Ver';
      action.addEventListener('click', () => {
        void openMediaItem(item);
      });

      row.appendChild(img);
      row.appendChild(meta);
      row.appendChild(action);
      els.mediaList.appendChild(row);
    });
  }

  function hideAllMediaWidgets() {
    els.mediaImage.hidden = true;
    els.mediaVideo.hidden = true;
    els.mediaModelViewer.hidden = true;
    els.media3dCanvas.hidden = true;
  }

  function disposeThreeRuntime() {
    const rt = state.threeRuntime;
    if (!rt) return;

    if (rt.rafId) cancelAnimationFrame(rt.rafId);
    if (rt.controls && typeof rt.controls.dispose === 'function') rt.controls.dispose();

    if (rt.scene) {
      rt.scene.traverse((obj) => {
        if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m && typeof m.dispose === 'function' && m.dispose());
          } else if (typeof obj.material.dispose === 'function') {
            obj.material.dispose();
          }
        }
      });
    }

    if (rt.renderer && typeof rt.renderer.dispose === 'function') rt.renderer.dispose();
    state.threeRuntime = null;
  }

  function closeMediaOverlay() {
    hideAllMediaWidgets();

    try {
      els.mediaVideo.pause();
      els.mediaVideo.removeAttribute('src');
      els.mediaVideo.load();
    } catch (_) {
      // no-op
    }

    try {
      els.mediaModelViewer.removeAttribute('src');
    } catch (_) {
      // no-op
    }

    disposeThreeRuntime();
    els.mediaOverlay.hidden = true;
    state.activeMediaId = '';
  }

  function openMediaOverlay(title) {
    els.mediaTitle.textContent = title || 'Media Viewer';
    els.mediaOverlay.hidden = false;
  }

  async function ensureModelViewerLoaded() {
    if (customElements.get('model-viewer')) return;
    if (state.modelViewerReadyPromise) {
      await state.modelViewerReadyPromise;
      return;
    }

    state.modelViewerReadyPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
      script.onload = () => {
        customElements.whenDefined('model-viewer').then(resolve).catch(reject);
      };
      script.onerror = () => reject(new Error('No se pudo cargar model-viewer'));
      document.head.appendChild(script);
    });

    await state.modelViewerReadyPromise;
  }

  async function ensureThreeModules() {
    if (state.threeModules) return state.threeModules;

    const THREE = await import('https://unpkg.com/three@0.164.1/build/three.module.js');
    const { OrbitControls } = await import('https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js');
    const { OBJLoader } = await import('https://unpkg.com/three@0.164.1/examples/jsm/loaders/OBJLoader.js');
    const { MTLLoader } = await import('https://unpkg.com/three@0.164.1/examples/jsm/loaders/MTLLoader.js');

    state.threeModules = {
      THREE,
      OrbitControls,
      OBJLoader,
      MTLLoader
    };

    return state.threeModules;
  }

  function fitCameraToObject(THREE, camera, controls, object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    const fov = camera.fov * (Math.PI / 180);
    const distance = (maxSize / Math.sin(fov / 2)) * 0.75;

    camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
    camera.near = Math.max(0.01, distance / 1000);
    camera.far = distance * 100;
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  }

  async function renderObjPreview(item) {
    const mods = await ensureThreeModules();
    const THREE = mods.THREE;

    disposeThreeRuntime();

    els.media3dCanvas.hidden = false;
    const canvas = els.media3dCanvas;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false
    });

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(400, Math.floor(rect.width || 960));
    const height = Math.max(280, Math.floor(rect.height || 540));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1f3f);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 20000);
    const controls = new mods.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;

    const amb = new THREE.AmbientLight(0xffffff, 0.85);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 3, 4);
    scene.add(amb, dir);

    const manager = new THREE.LoadingManager();
    const resourceMap = item.resourceMap || new Map();
    manager.setURLModifier((url) => {
      const clean = String(url || '').split('/').pop().toLowerCase();
      return resourceMap.get(clean) || url;
    });

    const addLoadedObject = (obj) => {
      scene.add(obj);
      fitCameraToObject(THREE, camera, controls, obj);

      const runtime = {
        renderer,
        scene,
        camera,
        controls,
        rafId: 0
      };

      const tick = () => {
        runtime.rafId = requestAnimationFrame(tick);
        controls.update();
        renderer.render(scene, camera);
      };

      tick();
      state.threeRuntime = runtime;
    };

    await new Promise((resolve, reject) => {
      const objLoader = new mods.OBJLoader(manager);

      const onObj = (obj) => {
        addLoadedObject(obj);
        resolve();
      };

      const onErr = (err) => {
        reject(err || new Error('No se pudo cargar OBJ'));
      };

      if (item.mtlUrl) {
        const mtlLoader = new mods.MTLLoader(manager);
        mtlLoader.load(
          item.mtlUrl,
          (materials) => {
            materials.preload();
            objLoader.setMaterials(materials);
            objLoader.load(item.url, onObj, undefined, onErr);
          },
          undefined,
          onErr
        );
      } else {
        objLoader.load(item.url, onObj, undefined, onErr);
      }
    });
  }

  async function openMediaItem(item) {
    if (!item) return;

    closeMediaOverlay();
    hideAllMediaWidgets();

    openMediaOverlay(item.name);
    state.activeMediaId = item.id;

    if (item.kind === 'image') {
      els.mediaImage.src = item.url;
      els.mediaImage.hidden = false;
      setStatus(`Media: ${item.name}`);
      return;
    }

    if (item.kind === 'video') {
      els.mediaVideo.src = item.url;
      els.mediaVideo.hidden = false;
      try {
        await els.mediaVideo.play();
      } catch (_) {
        // no-op
      }
      setStatus(`Media: ${item.name}`);
      return;
    }

    if (item.kind === 'model-gltf') {
      await ensureModelViewerLoaded();
      els.mediaModelViewer.src = item.url;
      els.mediaModelViewer.hidden = false;
      setStatus(`3D GLTF: ${item.name}`);
      return;
    }

    if (item.kind === 'model-obj') {
      await renderObjPreview(item);
      setStatus(`3D OBJ: ${item.name}`);
      return;
    }

    setStatus(`Formato no soportado aún: ${item.name}`);
  }

  function addMediaFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    resetMediaList();

    const byName = new Map();
    files.forEach((file) => {
      byName.set(String(file.name || '').toLowerCase(), file);
    });

    const urlByName = new Map();
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      state.mediaUrls.push(url);
      urlByName.set(String(file.name || '').toLowerCase(), url);
    });

    const mtlByBase = new Map();
    files.forEach((file) => {
      if (mediaKindFromFile(file) === 'model-mtl') {
        mtlByBase.set(baseName(file.name).toLowerCase(), file);
      }
    });

    files.forEach((file) => {
      const kind = mediaKindFromFile(file);
      if (kind === 'model-mtl' || kind === 'other') return;

      const nameKey = String(file.name || '').toLowerCase();
      const url = urlByName.get(nameKey);
      const ext = extName(file.name);

      const item = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${nameKey}`,
        name: file.name,
        kind,
        ext,
        size: Number(file.size || 0),
        url,
        thumb: kind === 'image' ? url : mediaPlaceholder(kind, file.name),
        mtlUrl: '',
        resourceMap: urlByName
      };

      if (kind === 'model-obj') {
        const mtl = mtlByBase.get(baseName(file.name).toLowerCase());
        if (mtl) {
          const mtlKey = String(mtl.name || '').toLowerCase();
          item.mtlUrl = urlByName.get(mtlKey) || '';
        }
      }

      state.mediaItems.push(item);
    });

    renderMediaList();
    setMediaVisible(true);
    setStatus(`Media cargada: ${state.mediaItems.length} item(s).`);

    if (state.mediaItems.length > 0) {
      void openMediaItem(state.mediaItems[0]);
    }
  }

  async function loadFromQuery() {
    const params = new URLSearchParams(window.location.search);

    const jsonData = params.get('data');
    if (jsonData) {
      try {
        await parseAndApplyProject(decodeURIComponent(jsonData), 'parámetro data');
      } catch {
        await parseAndApplyProject(jsonData, 'parámetro data');
      }
      return;
    }

    const id = params.get('id');
    if (id) {
      const res = await fetch(`/api/project?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`No se pudo cargar id=${id}`);
      const text = await res.text();
      await parseAndApplyProject(text, `id:${id}`);
      return;
    }

    const projectUrl = params.get('project');
    if (projectUrl) {
      const res = await fetch(projectUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo cargar URL de proyecto');
      const text = await res.text();
      await parseAndApplyProject(text, 'URL externa');
    }
  }

  function bindEvents() {
    els.btnOpenJson.addEventListener('click', () => els.inputJson.click());
    els.btnOpenMedia.addEventListener('click', () => els.inputMedia.click());
    els.btnOpenBg.addEventListener('click', () => els.inputBg.click());

    els.btnLibraryToggle.addEventListener('click', () => setLibraryVisible(!state.libraryVisible));
    els.btnLibraryHide.addEventListener('click', () => setLibraryVisible(false));
    els.btnLibraryRefresh.addEventListener('click', () => {
      void loadLibraryCatalog();
    });

    els.btnMediaToggle.addEventListener('click', () => setMediaVisible(!state.mediaVisible));
    els.btnMediaHide.addEventListener('click', () => setMediaVisible(false));
    els.btnMediaRefresh.addEventListener('click', () => renderMediaList());
    els.btnMediaClearList.addEventListener('click', () => {
      resetMediaList();
      setStatus('Lista media limpia.');
    });

    els.mediaSearch.addEventListener('input', () => {
      scheduleMediaRender();
    });

    els.btnMediaClose.addEventListener('click', () => {
      closeMediaOverlay();
      setStatus('Overlay multimedia cerrado.');
    });

    els.librarySearch.addEventListener('input', () => renderLibraryList());
    els.libraryScope.addEventListener('change', () => {
      void loadLibraryCatalog();
    });

    els.btnUploadJson.addEventListener('click', () => {
      els.inputUploadJson.click();
    });

    els.inputUploadJson.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await uploadJsonFile(file);
      } catch (error) {
        setStatus(`Error al subir JSON: ${error.message}`);
      }
      e.target.value = '';
    });

    els.inputJson.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        await parseAndApplyProject(text, `archivo:${file.name}`);
        closeMediaOverlay();
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
      e.target.value = '';
    });

    els.inputMedia.addEventListener('change', (e) => {
      addMediaFiles(e.target.files);
      e.target.value = '';
    });

    els.inputBg.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      els.bgImage.src = url;
      els.bgImage.hidden = false;
      state.mediaUrls.push(url);
      setStatus('Fondo cargado.');
      e.target.value = '';
    });

    els.btnClear.addEventListener('click', () => {
      state.project = { elements: [], camera: { x: 0, y: 0, zoom: 1 } };
      state.panX = 0;
      state.panY = 0;
      state.zoom = 1;
      state.rotateDeg = 0;
      state.flipX = 1;
      state.flipY = 1;
      els.bgImage.hidden = true;
      els.bgImage.removeAttribute('src');
      clearScene();
      closeMediaOverlay();
      updateWorldTransform();
      setStatus('Vista limpia.');
    });

    els.btnLock.addEventListener('click', () => {
      state.fixed = !state.fixed;
      updateWorldTransform();
      setStatus(state.fixed ? 'Vista fijada.' : 'Vista liberada.');
    });

    els.btnRotateLeft.addEventListener('click', () => {
      state.rotateDeg -= 15;
      updateWorldTransform();
    });

    els.btnRotateRight.addEventListener('click', () => {
      state.rotateDeg += 15;
      updateWorldTransform();
    });

    els.btnFlipH.addEventListener('click', () => {
      state.flipX *= -1;
      updateWorldTransform();
    });

    els.btnFlipV.addEventListener('click', () => {
      state.flipY *= -1;
      updateWorldTransform();
    });

    els.btnZoomOut.addEventListener('click', () => {
      state.zoom = clamp(state.zoom - 0.1, 0.1, 5);
      updateWorldTransform();
    });

    els.btnZoomIn.addEventListener('click', () => {
      state.zoom = clamp(state.zoom + 0.1, 0.1, 5);
      updateWorldTransform();
    });

    els.btnZoomReset.addEventListener('click', () => {
      state.zoom = 1;
      updateWorldTransform();
    });

    els.stage.addEventListener('pointerdown', (e) => {
      if (state.fixed) return;
      if (e.button !== 0) return;
      if (!els.mediaOverlay.hidden) return;
      state.isPanning = true;
      state.panStartX = e.clientX - state.panX;
      state.panStartY = e.clientY - state.panY;
      els.stage.setPointerCapture(e.pointerId);
    });

    els.stage.addEventListener('pointermove', (e) => {
      if (!state.isPanning || state.fixed) return;
      state.panX = e.clientX - state.panStartX;
      state.panY = e.clientY - state.panStartY;
      updateWorldTransform();
    });

    els.stage.addEventListener('pointerup', (e) => {
      state.isPanning = false;
      try {
        els.stage.releasePointerCapture(e.pointerId);
      } catch (_) {
        // no-op
      }
    });

    els.stage.addEventListener('wheel', (e) => {
      if (!els.mediaOverlay.hidden) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? -0.1 : 0.1;
      state.zoom = clamp(state.zoom + dir, 0.1, 5);
      updateWorldTransform();
    }, { passive: false });

    window.addEventListener('beforeunload', () => {
      closeMediaOverlay();
      clearMediaUrls();
    });
  }

  async function boot() {
    bindEvents();
    updateWorldTransform();
    renderMediaList();
    setStatus('Previewer 2.0 listo.');

    try {
      await loadFromQuery();
    } catch (err) {
      setStatus(`Carga automática falló: ${err.message}`);
    }
  }

  boot();
})();
