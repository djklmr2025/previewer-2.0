(() => {
  const els = {
    stage: document.getElementById('stage'),
    scene: document.getElementById('scene'),
    world: document.getElementById('world'),
    defs: document.getElementById('defs'),
    bgImage: document.getElementById('bg-image'),
    status: document.getElementById('status'),
    zoomLabel: document.getElementById('zoom-label'),
    inputJson: document.getElementById('input-json'),
    inputBg: document.getElementById('input-bg'),
    btnOpenJson: document.getElementById('btn-open-json'),
    btnClear: document.getElementById('btn-clear'),
    btnOpenBg: document.getElementById('btn-open-bg'),
    btnLock: document.getElementById('btn-lock'),
    btnRotateLeft: document.getElementById('btn-rotate-left'),
    btnRotateRight: document.getElementById('btn-rotate-right'),
    btnFlipH: document.getElementById('btn-flip-h'),
    btnFlipV: document.getElementById('btn-flip-v'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    btnZoomIn: document.getElementById('btn-zoom-in')
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
    gradientCounter: 0
  };

  function setStatus(msg) {
    els.status.textContent = msg;
  }

  function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
  }

  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    });
    return node;
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
        x1, y1, x2, y2,
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
        x, y, width: w, height: h,
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
        cx, cy, r,
        fill,
        stroke,
        'stroke-width': lineWidth
      });
    } else if (elem.type === 'polygon' || elem.type === 'path') {
      const pts = Array.isArray(elem.points) ? elem.points : [];
      const points = pts
        .map((p) => `${Number(p.x ?? 0)},${Number(p.y ?? 0)}`)
        .join(' ');
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
    setStatus(`Proyecto cargado: ${elements.length} elementos.`);
  }

  async function parseAndApplyProject(rawText) {
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error('JSON inválido');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Proyecto inválido');
    }

    if (!Array.isArray(data.elements)) {
      if (Array.isArray(data?.project?.elements)) data = data.project;
      else throw new Error('No se encontró arreglo elements en el JSON');
    }

    state.project = data;
    renderProject();
  }

  async function loadFromQuery() {
    const params = new URLSearchParams(window.location.search);

    const jsonData = params.get('data');
    if (jsonData) {
      try {
        await parseAndApplyProject(decodeURIComponent(jsonData));
      } catch {
        await parseAndApplyProject(jsonData);
      }
      return;
    }

    const id = params.get('id');
    if (id) {
      const res = await fetch(`/api/project?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`No se pudo cargar id=${id}`);
      const text = await res.text();
      await parseAndApplyProject(text);
      return;
    }

    const projectUrl = params.get('project');
    if (projectUrl) {
      const res = await fetch(projectUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo cargar URL de proyecto');
      const text = await res.text();
      await parseAndApplyProject(text);
      return;
    }
  }

  function bindEvents() {
    els.btnOpenJson.addEventListener('click', () => els.inputJson.click());
    els.btnOpenBg.addEventListener('click', () => els.inputBg.click());

    els.inputJson.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        await parseAndApplyProject(text);
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
      e.target.value = '';
    });

    els.inputBg.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      els.bgImage.src = url;
      els.bgImage.hidden = false;
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
      try { els.stage.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    els.stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -0.1 : 0.1;
      state.zoom = clamp(state.zoom + dir, 0.1, 5);
      updateWorldTransform();
    }, { passive: false });
  }

  async function boot() {
    bindEvents();
    updateWorldTransform();
    setStatus('Previewer 2.0 listo.');

    try {
      await loadFromQuery();
    } catch (err) {
      setStatus(`Carga automática falló: ${err.message}`);
    }
  }

  boot();
})();
