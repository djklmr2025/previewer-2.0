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
    viewMode: 'preview', // preview | deck | sticker
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
    threeRuntime: null,

    // Animacion runtime para visor (rutas + movers)
    animation: {
      rafId: 0,
      lastTs: 0,
      lineNodes: [],
      moverNodes: [],
      flatElements: [],
      elementsById: new Map()
    },

    // Deck/Lamina runtime
    deck: {
      panelEl: null,
      listEl: null,
      titleEl: null,
      textEl: null,
      mediaWrapEl: null,
      mediaImageEl: null,
      mediaVideoEl: null,
      controlPoints: [],
      activeIndex: -1
    }
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

  function readQueryMode() {
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get('mode') || '').trim().toLowerCase();
    if (raw === 'deck') return 'deck';
    if (raw === 'sticker') return 'sticker';
    return 'preview';
  }

  function getRectLike(elem) {
    const x = Number(elem.x ?? 0);
    const y = Number(elem.y ?? 0);
    const w = Number(elem.width ?? elem.w ?? 0);
    const h = Number(elem.height ?? elem.h ?? 0);
    return { x, y, w, h };
  }

  function getPointXY(p) {
    if (!p) return null;
    let x = 0;
    let y = 0;
    if (typeof p.x === 'number') x = p.x;
    else if (typeof p.x === 'string') x = parseFloat(p.x) || 0;
    else if (typeof p[0] === 'number') x = p[0];
    else if (typeof p[0] === 'string') x = parseFloat(p[0]) || 0;

    if (typeof p.y === 'number') y = p.y;
    else if (typeof p.y === 'string') y = parseFloat(p.y) || 0;
    else if (typeof p[1] === 'number') y = p[1];
    else if (typeof p[1] === 'string') y = parseFloat(p[1]) || 0;

    return { x, y };
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

  function getElementDescendantIds(elem) {
    const ids = [];
    walkElements([elem], (el) => {
      if (el && el.id && el.id !== elem.id) {
        ids.push(String(el.id));
      }
    });
    return ids;
  }

  function applyLiveDelta(project) {
    const resolved = resolveProjectPayload(project);
    if (!resolved) return;

    // 1. Actualizar cámara si es necesario
    const cam = resolved.camera || {};
    if (Number.isFinite(cam.zoom) && (cam.zoom !== state.project.camera?.zoom || cam.x !== state.project.camera?.x || cam.y !== state.project.camera?.y)) {
      state.zoom = clamp(Number(cam.zoom), 0.1, 5);
      state.project.camera = { ...cam };
      updateWorldTransform();
    }

    // 2. Obtener listas aplanadas
    const oldFlat = flattenElements(state.project.elements || []);
    const newFlat = flattenElements(resolved.elements || []);

    const oldMap = new Map(oldFlat.map((e) => [String(e.id || ''), e]));
    const newMap = new Map(newFlat.map((e) => [String(e.id || ''), e]));

    // 3. Preservar progreso local de vehículos animados en la nueva jerarquía
    for (const newElem of newFlat) {
      const id = String(newElem.id || '');
      if (id && (newElem.type === 'mover' || (newElem.followRoute === true && newElem.routeId))) {
        const oldElem = oldMap.get(id);
        if (oldElem) {
          if (newElem.progress === undefined || Number.isFinite(oldElem.progress)) {
            newElem.progress = oldElem.progress;
          }
          if (newElem.routeProgress === undefined || Number.isFinite(oldElem.routeProgress)) {
            newElem.routeProgress = oldElem.routeProgress;
          }
          newElem._portalCooldownSeconds = oldElem._portalCooldownSeconds;
        }
      }
    }

    // 4. Procesar eliminaciones
    for (const oldElem of oldFlat) {
      const id = String(oldElem.id || '');
      if (!id) continue;
      if (!newMap.has(id)) {
        // Elemento eliminado!
        const node = els.world.querySelector(`[data-id="${id}"]`);
        if (node) node.remove();

        // Limpiar de animación (incluyendo posibles descendientes si era un grupo)
        const affectedIds = [id, ...getElementDescendantIds(oldElem)];
        if (node) {
          state.animation.lineNodes = state.animation.lineNodes.filter((ln) => ln.node !== node && !node.contains(ln.node));
        }
        state.animation.moverNodes = state.animation.moverNodes.filter((m) => !affectedIds.includes(m.elem.id));
      }
    }

    // Mapeo de padres en el nuevo proyecto
    const parentMap = new Map();
    const walkParent = (elements, parentId = null) => {
      elements.forEach((el) => {
        if (parentId) parentMap.set(String(el.id || ''), String(parentId));
        if (el.type === 'group' && Array.isArray(el.elements)) {
          walkParent(el.elements, el.id);
        }
      });
    };
    walkParent(resolved.elements);

    // Helper: marcar todos los descendientes de un elemento como ya procesados
    const skipSet = new Set();
    const markDescendantsSkipped = (elem) => {
      if (elem.type === 'group' && Array.isArray(elem.elements)) {
        walkElements(elem.elements, (child) => {
          if (child.id) skipSet.add(String(child.id));
        });
      }
    };

    // Helper: insertar nuevo nodo en els.world en el orden correcto
    const insertRootNode = (newNode, newElem) => {
      const siblings = resolved.elements;
      const index = siblings.indexOf(newElem);
      let nextDOMNode = null;
      if (index !== -1) {
        for (let i = index + 1; i < siblings.length; i++) {
          const sibId = String(siblings[i].id || '');
          if (!sibId) continue;
          const sibNode = els.world.querySelector(`[data-id="${sibId}"]`);
          if (sibNode && sibNode.parentNode === els.world) {
            nextDOMNode = sibNode;
            break;
          }
        }
      }
      if (nextDOMNode) {
        els.world.insertBefore(newNode, nextDOMNode);
      } else {
        els.world.appendChild(newNode);
      }
    };

    // 5. Procesar modificaciones y adiciones
    // IMPORTANTE: flattenElements incluye grupos Y sus hijos.
    // Cuando se renderiza un grupo, renderElement ya renderiza sus hijos recursivamente.
    // Usamos skipSet para no procesar hijos que ya fueron renderizados por su padre.
    // Helper: identificar descendientes animados para ignorar sus cambios geométricos
    const animSet = new Set();
    const markAnim = (elems, isAnim) => {
      elems.forEach((e) => {
        const anim = isAnim || e.followRoute === true || e.type === 'mover';
        if (anim && e.id) animSet.add(String(e.id));
        if (e.type === 'group' && Array.isArray(e.elements)) {
          markAnim(e.elements, anim);
        }
      });
    };
    markAnim(resolved.elements, false);

    for (const newElem of newFlat) {
      const id = String(newElem.id || '');
      if (!id || skipSet.has(id)) continue;

      const parentId = parentMap.get(id);
      const oldElem = oldMap.get(id);

      if (oldElem) {
        // Elemento existente — verificar si cambió
        const getHashable = (el) => {
          const clone = { ...el };
          if (clone.type === 'group') {
            delete clone.elements; // Evita re-renderizar todo el grupo si un hijo cambia
          }
          if (animSet.has(String(clone.id || ''))) {
            delete clone.progress;
            delete clone.routeProgress;
            delete clone._portalCooldownSeconds;
            delete clone.x;
            delete clone.y;
            delete clone.angle;
            delete clone.flowDirection;
            delete clone.points;
            delete clone.width;
            delete clone.height;
            delete clone.cx;
            delete clone.cy;
            delete clone.endX;
            delete clone.endY;
            delete clone.x1;
            delete clone.y1;
            delete clone.x2;
            delete clone.y2;
            delete clone.rx;
            delete clone.ry;
          }
          return JSON.stringify(clone);
        };

        const oldJSON = getHashable(oldElem);
        const newJSON = getHashable(newElem);

        if (oldJSON !== newJSON) {
          // Elemento modificado → re-renderizar
          const oldNode = els.world.querySelector(`[data-id="${id}"]`);
          if (oldNode) {
            // Limpiar de animación
            const affectedIds = [id, ...getElementDescendantIds(oldElem)];
            state.animation.lineNodes = state.animation.lineNodes.filter((ln) => ln.node !== oldNode && !oldNode.contains(ln.node));
            state.animation.moverNodes = state.animation.moverNodes.filter((m) => !affectedIds.includes(String(m.elem.id || '')));

            const tempParent = svgEl('g');
            renderElement(newElem, tempParent);
            const newNode = tempParent.firstChild;

            if (newNode) {
              oldNode.parentNode.replaceChild(newNode, oldNode);
            }

            // Si es un grupo, marcar sus hijos como ya procesados (ya renderizados dentro)
            markDescendantsSkipped(newElem);
          }
        }
      } else {
        // Elemento nuevo
        if (parentId) {
          // Es hijo de un grupo.
          const parentOld = oldMap.get(parentId);

          if (!parentOld) {
            // Padre también es nuevo → el padre renderizará todos sus hijos al ser procesado
            continue;
          }

          // ¿El padre cambió?
          const parentNew = newMap.get(parentId);
          const parentChanged = JSON.stringify(parentOld) !== JSON.stringify(parentNew);
          if (parentChanged) {
            // El padre será/fue re-renderizado incluyendo este nuevo hijo → skipear
            continue;
          }

          // Padre sin cambios pero este hijo es nuevo → insertar en el nodo del padre existente
          const parentNode = els.world.querySelector(`[data-id="${parentId}"]`);
          if (parentNode) {
            const tempParent = svgEl('g');
            renderElement(newElem, tempParent);
            const newNode = tempParent.firstChild;
            if (newNode) {
              parentNode.appendChild(newNode);
            }
            markDescendantsSkipped(newElem);
          }
        } else {
          // Elemento raíz nuevo → insertar en els.world
          const tempParent = svgEl('g');
          renderElement(newElem, tempParent);
          const newNode = tempParent.firstChild;
          if (newNode) {
            insertRootNode(newNode, newElem);
          }
          // Marcar hijos como ya procesados (renderizados dentro del grupo)
          markDescendantsSkipped(newElem);
        }
      }
    }

    // 6. Actualizar el estado del proyecto y caché
    state.project = resolved;
    updateAnimationCache();

    // 7. Sincronizar deck si cambió
    const oldCPs = JSON.stringify(state.deck.controlPoints || []);
    buildDeckControlPoints(resolved.elements);
    const newCPs = JSON.stringify(state.deck.controlPoints || []);
    if (oldCPs !== newCPs) {
      renderDeckPanel();
    }

    // 8. Arrancar animación si aún no está corriendo
    startSceneAnimation();
  }

  function renderElement(elem, parent) {
    if (!elem || typeof elem !== 'object') return;

    if (elem.type === 'group' && Array.isArray(elem.elements)) {
      const g = svgEl('g', { class: 'sticker' });
      if (elem.id) g.setAttribute('data-id', elem.id);
      parent.appendChild(g);
      elem.elements.forEach((child) => renderElement(child, g));
      return;
    }

    if (elem.hidden === true) return;

    const fill = gradientFill(elem.fillColor || '#00bcd4', elem.fillGradient);
    const stroke = elem.strokeColor || '#e94560';
    const lineWidth = Number(elem.lineWidth ?? elem.strokeWidth ?? 2);

    let node = null;
    const isMover = elem.type === 'mover';
    const isFollower = elem.followRoute === true && elem.routeId;

    if (elem.type === 'line') {
      const curve = getRouteCurve(elem);
      if (curve !== 'line') {
        const pts = getRoutePoints(elem);
        const pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(' ');
        node = svgEl('polyline', {
          points: pointsAttr,
          fill: 'none',
          stroke,
          'stroke-width': lineWidth,
          'stroke-linecap': 'round',
          'stroke-dasharray': elem.active ? '8 8' : null
        });
      } else {
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
      }

      if (elem.active) {
        state.animation.lineNodes.push({
          node,
          speed: Math.max(0.2, Number(elem.speed) || 1),
          offset: 0
        });
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
    } else if (isMover) {
      const { x, y, w, h } = getRectLike(elem);
      const moverW = Math.max(8, Number(w) || 44);
      const moverH = Math.max(8, Number(h) || 28);
      const fillSafe = elem.fillColor || '#93c5fd';
      const strokeSafe = elem.strokeColor || '#0b1027';
      const g = svgEl('g');
      
      const rx = -moverW / 2;
      const ry = -moverH / 2;
      
      const r = svgEl('rect', {
        x: rx,
        y: ry,
        width: moverW,
        height: moverH,
        rx: Math.max(3, Math.min(moverW, moverH) * 0.25),
        fill: fillSafe,
        stroke: strokeSafe,
        'stroke-width': Math.max(1, lineWidth * 0.75)
      });
      const eye = svgEl('rect', {
        x: rx + moverW * 0.22,
        y: ry + moverH * 0.3,
        width: moverW * 0.56,
        height: moverH * 0.4,
        rx: Math.max(2, moverH * 0.12),
        fill: '#dbeafe',
        opacity: '0.9'
      });
      g.appendChild(r);
      g.appendChild(eye);
      node = g;
    }

    if (!node) return;

    if (Number.isFinite(elem.rotation) && elem.rotation !== 0 && !isMover) {
      const { x, y, w, h } = getRectLike(elem);
      const cx = x + w / 2;
      const cy = y + h / 2;
      node.setAttribute('transform', `rotate(${Number(elem.rotation)} ${cx} ${cy})`);
    }

    node.classList.add('sticker');

    if (isMover || isFollower) {
      const center = getElementCenterPoint(elem);
      if (isMover) {
        state.animation.moverNodes.push({
          node,
          elem,
          isMover: true,
          cx: center.x,
          cy: center.y
        });
        if (elem.id) node.setAttribute('data-id', elem.id);
        parent.appendChild(node);
      } else {
        const wrapper = svgEl('g');
        if (elem.id) wrapper.setAttribute('data-id', elem.id);
        wrapper.appendChild(node);
        state.animation.moverNodes.push({
          wrapper,
          node,
          elem,
          isMover: false,
          cx: center.x,
          cy: center.y
        });
        parent.appendChild(wrapper);
      }
    } else {
      if (elem.id) node.setAttribute('data-id', elem.id);
      parent.appendChild(node);
    }
  }

  function renderProject() {
    stopSceneAnimation();
    clearScene();
    state.animation.lineNodes = [];
    state.animation.moverNodes = [];
    const elements = Array.isArray(state.project.elements) ? state.project.elements : [];
    elements.forEach((elem) => renderElement(elem, els.world));
    buildDeckControlPoints(elements);
    renderDeckPanel();
    updateWorldTransform();
    startSceneAnimation();
  }

  function ensureDeckUI() {
    if (state.deck.panelEl) return;
    const panel = document.createElement('aside');
    panel.id = 'deck-panel-v2';
    panel.className = 'deck-panel-v2';
    panel.innerHTML = `
      <div class="deck-head-v2">
        <strong>Lámina</strong>
        <span id="deck-count-v2">0</span>
      </div>
      <div id="deck-list-v2" class="deck-list-v2"></div>
      <div class="deck-slide-v2">
        <div id="deck-title-v2" class="deck-title-v2">Sin selección</div>
        <div id="deck-text-v2" class="deck-text-v2">Selecciona un punto de control.</div>
        <div id="deck-media-v2" class="deck-media-v2">
          <img id="deck-image-v2" alt="slide image" hidden />
          <video id="deck-video-v2" controls playsinline hidden></video>
        </div>
      </div>
    `;
    els.workspace.appendChild(panel);
    state.deck.panelEl = panel;
    state.deck.listEl = panel.querySelector('#deck-list-v2');
    state.deck.titleEl = panel.querySelector('#deck-title-v2');
    state.deck.textEl = panel.querySelector('#deck-text-v2');
    state.deck.mediaWrapEl = panel.querySelector('#deck-media-v2');
    state.deck.mediaImageEl = panel.querySelector('#deck-image-v2');
    state.deck.mediaVideoEl = panel.querySelector('#deck-video-v2');
  }

  function buildDeckControlPoints(elements) {
    const flat = flattenElements(elements || []);
    const cps = [];
    flat.forEach((elem) => {
      if (!elem || typeof elem !== 'object') return;
      const meta = (elem.meta && typeof elem.meta === 'object') ? elem.meta : null;
      if (!meta || !meta.controlPoint) return;

      const slideFromMeta = (meta.slide && typeof meta.slide === 'object') ? meta.slide : {};
      const slideFromElem = (elem.slide && typeof elem.slide === 'object') ? elem.slide : {};
      const title = String(
        slideFromMeta.title || slideFromElem.title || meta.slideTitle || elem.slideTitle || elem.name || `Punto ${cps.length + 1}`
      );
      const text = String(slideFromMeta.text || slideFromElem.text || meta.slideText || elem.slideText || '');
      const imageUrl = String(
        slideFromMeta.imageUrl || slideFromElem.imageUrl || meta.slideImageUrl || elem.slideImageUrl || ''
      ).trim();
      const videoUrl = String(
        slideFromMeta.videoUrl || slideFromElem.videoUrl || meta.slideVideoUrl || elem.slideVideoUrl || ''
      ).trim();
      cps.push({
        id: String(elem.id || `cp-${cps.length + 1}`),
        title,
        text,
        imageUrl,
        videoUrl
      });
    });
    state.deck.controlPoints = cps;
    if (state.deck.activeIndex >= cps.length) state.deck.activeIndex = cps.length ? 0 : -1;
    if (state.deck.activeIndex < 0 && cps.length) state.deck.activeIndex = 0;
  }

  function renderDeckPanel() {
    const isDeck = state.viewMode === 'deck';
    els.workspace.classList.toggle('deck-open-v2', isDeck);
    if (!isDeck) return;

    ensureDeckUI();
    const listEl = state.deck.listEl;
    if (!listEl) return;
    listEl.innerHTML = '';

    const countEl = state.deck.panelEl.querySelector('#deck-count-v2');
    if (countEl) countEl.textContent = String(state.deck.controlPoints.length);

    if (!state.deck.controlPoints.length) {
      const empty = document.createElement('div');
      empty.className = 'deck-empty-v2';
      empty.textContent = '(No hay puntos de control en este diseño)';
      listEl.appendChild(empty);
      updateDeckSlide();
      return;
    }

    state.deck.controlPoints.forEach((cp, idx) => {
      const b = document.createElement('button');
      b.className = `deck-item-v2 ${idx === state.deck.activeIndex ? 'active' : ''}`;
      b.textContent = cp.title;
      b.addEventListener('click', () => {
        state.deck.activeIndex = idx;
        renderDeckPanel();
      });
      listEl.appendChild(b);
    });

    updateDeckSlide();
  }

  function updateDeckSlide() {
    if (!state.deck.titleEl || !state.deck.textEl) return;
    const cp = state.deck.controlPoints[state.deck.activeIndex] || null;
    const img = state.deck.mediaImageEl;
    const vid = state.deck.mediaVideoEl;

    if (vid) {
      try {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      } catch (_) {
        // no-op
      }
      vid.hidden = true;
    }
    if (img) {
      img.removeAttribute('src');
      img.hidden = true;
    }

    if (!cp) {
      state.deck.titleEl.textContent = 'Sin selección';
      state.deck.textEl.textContent = 'Selecciona un punto de control.';
      return;
    }

    state.deck.titleEl.textContent = cp.title || 'Diapositiva';
    state.deck.textEl.textContent = cp.text || '(Sin texto)';

    if (cp.videoUrl && vid) {
      vid.src = cp.videoUrl;
      vid.hidden = false;
      return;
    }
    if (cp.imageUrl && img) {
      img.src = cp.imageUrl;
      img.hidden = false;
    }
  }

  function flattenElements(elements, out = []) {
    (elements || []).forEach((elem) => {
      if (!elem || typeof elem !== 'object') return;
      out.push(elem);
      if (elem.type === 'group' && Array.isArray(elem.elements)) {
        flattenElements(elem.elements, out);
      }
    });
    return out;
  }

  function getRouteCurve(elem) {
    if (!elem || typeof elem !== 'object') return 'line';
    if (elem.routeCircular === true) return 'circle';
    return normalizeRouteCurveValue(elem.routeCurve);
  }

  function normalizeRouteCurveValue(raw) {
    const v = String(raw || 'line').toLowerCase();
    if (v === 'circle' || v === 'semi' || v === 'quarter' || v === 'custom') return v;
    return 'line';
  }

  function getRouteArcDegrees(elem) {
    const raw = Number(elem && elem.routeArcDegrees);
    if (!Number.isFinite(raw)) return 120;
    return Math.max(5, Math.min(355, raw));
  }

  function buildArcPointsFromChord(x1, y1, x2, y2, fraction, side) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const chord = Math.sqrt(dx * dx + dy * dy);
    if (!(chord > 0)) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];

    const theta = Math.max(0.0001, Math.min((Math.PI * 2) - 0.0001, (Math.PI * 2) * fraction));
    const r = chord / (2 * Math.sin(theta / 2));
    const half = chord / 2;
    const h = Math.sqrt(Math.max(0, (r * r) - (half * half)));
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const nxL = -dy / chord;
    const nyL = dx / chord;
    const sign = String(side || 'left') === 'right' ? -1 : 1;
    const cx = mx + (nxL * h * sign);
    const cy = my + (nyL * h * sign);

    const a0 = Math.atan2(y1 - cy, x1 - cx);
    const candA = a0 + theta;
    const candB = a0 - theta;
    const exA = cx + r * Math.cos(candA);
    const eyA = cy + r * Math.sin(candA);
    const exB = cx + r * Math.cos(candB);
    const eyB = cy + r * Math.sin(candB);
    const dA = Math.sqrt(Math.pow(exA - x2, 2) + Math.pow(eyA - y2, 2));
    const dB = Math.sqrt(Math.pow(exB - x2, 2) + Math.pow(eyB - y2, 2));
    const dir = dA <= dB ? 1 : -1;

    const steps = Math.max(8, Math.round(72 * fraction));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = a0 + (dir * theta * t);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }

  function getRoutePoints(elem) {
    if (!elem || typeof elem !== 'object') return [];
    if (elem.type === 'line') {
      if (!Number.isFinite(elem.x) || !Number.isFinite(elem.y) || !Number.isFinite(elem.endX) || !Number.isFinite(elem.endY)) return [];
      const curve = getRouteCurve(elem);
      if (curve === 'circle') {
        const cx = (elem.x + elem.endX) / 2;
        const cy = (elem.y + elem.endY) / 2;
        const radius = Math.max(2, Math.sqrt(Math.pow(elem.endX - elem.x, 2) + Math.pow(elem.endY - elem.y, 2)) / 2);
        const segments = 72;
        const pts = [];
        for (let i = 0; i <= segments; i++) {
          const a = (Math.PI * 2 * i) / segments;
          pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
        }
        return pts;
      }
      if (curve === 'semi') {
        return buildArcPointsFromChord(
          elem.x, elem.y, elem.endX, elem.endY, 0.5, elem.routeArcSide || 'left'
        );
      }
      if (curve === 'quarter') {
        return buildArcPointsFromChord(
          elem.x, elem.y, elem.endX, elem.endY, 0.25, elem.routeArcSide || 'left'
        );
      }
      if (curve === 'custom') {
        const deg = getRouteArcDegrees(elem);
        return buildArcPointsFromChord(
          elem.x, elem.y, elem.endX, elem.endY, deg / 360, elem.routeArcSide || 'left'
        );
      }
      return [{ x: elem.x, y: elem.y }, { x: elem.endX, y: elem.endY }];
    }
    if ((elem.type === 'path' || elem.type === 'polygon') && Array.isArray(elem.points)) {
      const pts = elem.points
        .map((p) => getPointXY(p))
        .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!pts.length) return [];
      if (elem.type === 'polygon' && elem.closed) {
        pts.push({ x: pts[0].x, y: pts[0].y });
      }
      return pts;
    }
    return [];
  }

  function getPolylineLength(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
  }

  function getPointOnPolyline(points, t) {
    if (!Array.isArray(points) || points.length === 0) return null;
    if (points.length === 1) return { x: points[0].x, y: points[0].y, angle: 0 };
    const clamped = Math.max(0, Math.min(1, Number(t) || 0));
    const total = getPolylineLength(points);
    if (total <= 0) return { x: points[0].x, y: points[0].y, angle: 0 };
    const target = clamped * total;
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const seg = Math.sqrt(dx * dx + dy * dy);
      if (seg <= 0) continue;
      if (acc + seg >= target || i === points.length - 1) {
        const local = Math.max(0, Math.min(1, (target - acc) / seg));
        return {
          x: p0.x + dx * local,
          y: p0.y + dy * local,
          angle: Math.atan2(dy, dx)
        };
      }
      acc += seg;
    }
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    return { x: last.x, y: last.y, angle: Math.atan2(last.y - prev.y, last.x - prev.x) };
  }

  function getElementCenterPoint(elem) {
    if (!elem || typeof elem !== 'object') return { x: 0, y: 0 };
    if (elem.type === 'line') {
      return {
        x: ((Number(elem.x ?? elem.x1 ?? 0) + Number(elem.endX ?? elem.x2 ?? 0)) / 2),
        y: ((Number(elem.y ?? elem.y1 ?? 0) + Number(elem.endY ?? elem.y2 ?? 0)) / 2)
      };
    }
    if ((elem.type === 'path' || elem.type === 'polygon') && Array.isArray(elem.points) && elem.points.length > 0) {
      let sumX = 0, sumY = 0, count = 0;
      elem.points.forEach((p) => {
        const pt = getPointXY(p);
        if (pt) {
          sumX += pt.x;
          sumY += pt.y;
          count++;
        }
      });
      if (count > 0) return { x: sumX / count, y: sumY / count };
    }
    const { x, y, w, h } = getRectLike(elem);
    return { x: x + w / 2, y: y + h / 2 };
  }

  function isRouteElement(elem) {
    if (!elem) return false;
    return (elem.type === 'line' || elem.type === 'path' || elem.type === 'polygon') &&
           Boolean(elem.isRoute || elem.useAsRoute || elem.routeCircular);
  }

  function findConnectedRoute(routeElem, atEnd, flatElements) {
    if (!routeElem) return null;
    const pts = getRoutePoints(routeElem);
    if (pts.length < 2) return null;
    const pt = atEnd ? pts[pts.length - 1] : pts[0];

    const threshold = 28;
    let best = null;
    let bestDist = Infinity;

    flatElements.forEach((candidate) => {
      if (!isRouteElement(candidate)) return;
      if (!candidate || String(candidate.id) === String(routeElem.id)) return;
      const opts = getRoutePoints(candidate);
      if (opts.length < 2) return;

      const dStart = Math.sqrt(Math.pow(opts[0].x - pt.x, 2) + Math.pow(opts[0].y - pt.y, 2));
      const dEnd = Math.sqrt(Math.pow(opts[opts.length - 1].x - pt.x, 2) + Math.pow(opts[opts.length - 1].y - pt.y, 2));
      const d = Math.min(dStart, dEnd);
      if (d > threshold) return;

      // Priorizar conexión con rutas del mismo color (mismo ramal/línea)
      const currentColorMatch = best && routeElem.strokeColor && best.route.strokeColor &&
        (String(routeElem.strokeColor).toLowerCase() === String(best.route.strokeColor).toLowerCase());
      const candidateColorMatch = routeElem.strokeColor && candidate.strokeColor &&
        (String(routeElem.strokeColor).toLowerCase() === String(candidate.strokeColor).toLowerCase());

      let isBetter = false;
      if (!best) {
        isBetter = true;
      } else if (candidateColorMatch && !currentColorMatch) {
        isBetter = true;
      } else if (candidateColorMatch === currentColorMatch) {
        isBetter = (d < bestDist);
      }

      if (isBetter) {
        bestDist = d;
        if (dStart <= dEnd) {
          best = { route: candidate, progress: 0.0001, direction: 'right' };
        } else {
          best = { route: candidate, progress: 0.9999, direction: 'left' };
        }
      }
    });
    return best;
  }

  function getPortalCenter(portal) {
    if (!portal || portal.type !== 'portal') return null;
    const x = Number(portal.x);
    const y = Number(portal.y);
    const w = Number(portal.width);
    const h = Number(portal.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
    return { x: x + (w / 2), y: y + (h / 2), r: Math.max(8, Math.min(Math.abs(w), Math.abs(h)) / 2) };
  }

  function findPortalAtPoint(x, y, kind, flatElements) {
    const tKind = String(kind || '');
    let found = null;
    let bestDist = Infinity;
    flatElements.forEach((elem) => {
      if (!elem || elem.type !== 'portal') return;
      if (String(elem.portalKind || '') !== tKind) return;
      const c = getPortalCenter(elem);
      if (!c) return;
      const d = Math.sqrt(Math.pow(x - c.x, 2) + Math.pow(y - c.y, 2));
      if (d <= c.r + 8 && d < bestDist) {
        bestDist = d;
        found = elem;
      }
    });
    return found;
  }

  function normalizePortalKey(rawKey) {
    const raw = String(rawKey || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) return '';
    return raw.replace(/[^A-Z0-9]/g, '');
  }

  function parsePortalKey(rawKey) {
    const key = normalizePortalKey(rawKey);
    if (!key) return null;
    const match = /^([A-Z])([0-9]+)?$/.exec(key);
    if (!match) return { key, letter: '', index: null, counterpart: '', family: key };
    const letter = String(match[1] || '');
    const index = Number.isFinite(Number(match[2])) ? Number(match[2]) : null;
    let counterpart = letter;
    let family = letter;
    if (letter === 'A' || letter === 'B') {
      counterpart = letter === 'A' ? 'B' : 'A';
      family = 'AB';
    } else if (letter === 'C' || letter === 'D') {
      counterpart = letter === 'C' ? 'D' : 'C';
      family = 'CD';
    }
    return { key, letter, index, counterpart, family };
  }

  function scorePortalMatch(importInfo, exportPortal) {
    const expInfo = parsePortalKey(exportPortal && exportPortal.portalKey);
    if (!importInfo || !expInfo) return -1;
    if (expInfo.key === importInfo.key) return 1000;
    if (importInfo.index != null && expInfo.index != null && expInfo.index !== importInfo.index) return -1;

    let score = 0;
    if (importInfo.family && expInfo.family === importInfo.family) score += 100;
    if (expInfo.letter && expInfo.letter === importInfo.counterpart) score += 150;
    if (importInfo.index != null && expInfo.index === importInfo.index) score += 80;
    if (!score && importInfo.letter && expInfo.letter === importInfo.letter) score += 30;
    return score;
  }

  function findMatchingExportPortal(importPortal, flatElements) {
    if (!importPortal || importPortal.type !== 'portal') return null;
    const importInfo = parsePortalKey(importPortal.portalKey);
    if (!importInfo || !importInfo.key) return null;

    const importCenter = getPortalCenter(importPortal);
    let out = null;
    let bestScore = -1;
    let bestDist = Infinity;
    flatElements.forEach((elem) => {
      if (!elem || elem.type !== 'portal') return;
      if (String(elem.portalKind || '') !== 'export') return;
      const score = scorePortalMatch(importInfo, elem);
      if (score < 0) return;
      const c = getPortalCenter(elem);
      const d = (c && importCenter) ? Math.sqrt(Math.pow(c.x - importCenter.x, 2) + Math.pow(c.y - importCenter.y, 2)) : Infinity;
      if (score > bestScore || (score === bestScore && d < bestDist)) {
        bestScore = score;
        bestDist = d;
        out = elem;
      }
    });
    return out;
  }

  function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function findNearestRouteForPoint(x, y, flatElements) {
    let best = null;
    let bestDist = Infinity;
    flatElements.forEach((elem) => {
      if (!isRouteElement(elem)) return;
      const pts = getRoutePoints(elem);
      if (pts.length < 2) return;
      for (let i = 1; i < pts.length; i++) {
        const d = distanceToLineSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
        if (d < bestDist) {
          bestDist = d;
          best = elem;
        }
      }
    });
    return best;
  }

  function projectPointToRouteProgress(routeElem, x, y) {
    const pts = getRoutePoints(routeElem);
    if (!pts || pts.length < 2) return 0;
    let totalLen = 0;
    const segLens = [];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segLens.push(len);
      totalLen += len;
    }
    if (totalLen <= 0) return 0;

    let bestDist = Infinity;
    let bestAlong = 0;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const vx = p1.x - p0.x;
      const vy = p1.y - p0.y;
      const lenSq = vx * vx + vy * vy;
      if (lenSq <= 0) {
        acc += segLens[i - 1];
        continue;
      }
      const t = Math.max(0, Math.min(1, (((x - p0.x) * vx) + ((y - p0.y) * vy)) / lenSq));
      const px = p0.x + vx * t;
      const py = p0.y + vy * t;
      const d = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
      if (d < bestDist) {
        bestDist = d;
        bestAlong = acc + (segLens[i - 1] * t);
      }
      acc += segLens[i - 1];
    }
    return Math.max(0, Math.min(1, bestAlong / totalLen));
  }

  function applyPortalTeleport(elem, statePos, flatElements, dt) {
    if (!elem || !statePos || !statePos.routeFound) return statePos;
    const cd = Number(elem._portalCooldownSeconds);
    if (Number.isFinite(cd) && cd > 0) {
      if (dt > 0) {
        elem._portalCooldownSeconds = Math.max(0, cd - dt);
      }
      return statePos;
    }

    const pIn = findPortalAtPoint(statePos.x, statePos.y, 'import', flatElements);
    if (!pIn) return statePos;
    const pOut = findMatchingExportPortal(pIn, flatElements);
    if (!pOut) return statePos;
    const cOut = getPortalCenter(pOut);
    if (!cOut) return statePos;

    const nearest = findNearestRouteForPoint(cOut.x, cOut.y, flatElements);
    if (nearest) {
      elem.routeId = String(nearest.id);
      const t = projectPointToRouteProgress(nearest, cOut.x, cOut.y);
      if (elem.type === 'mover') {
        elem.progress = t;
      } else {
        elem.routeProgress = t;
      }
    }
    elem._portalCooldownSeconds = 0.5;
    return { x: cOut.x, y: cOut.y, angle: statePos.angle || 0, routeFound: true };
  }


  function resolveElementRouteState(elem, dt, flatElements, byId) {
    if (!elem || typeof elem !== 'object') return { x: 0, y: 0, angle: 0, routeFound: false };

    const isMover = elem.type === 'mover';
    const defaultCenter = getElementCenterPoint(elem);
    const enabled = isMover ? true : Boolean(elem.followRoute);
    const autoConnect = Boolean(elem.autoConnectRoute || elem.autoConnect);
    if (!enabled) {
      return { x: defaultCenter.x, y: defaultCenter.y, angle: 0, routeFound: false };
    }

    let routeId = String(elem.routeId || elem.routePathId || elem.followPathId || '');
    if (!routeId) return { x: defaultCenter.x, y: defaultCenter.y, angle: 0, routeFound: false };

    let route = byId.get(routeId);
    if (!route) return { x: defaultCenter.x, y: defaultCenter.y, angle: 0, routeFound: false };

    let points = getRoutePoints(route);
    if (points.length <= 1) return { x: defaultCenter.x, y: defaultCenter.y, angle: 0, routeFound: false };

    const progressKey = isMover ? 'progress' : 'routeProgress';
    const rawProgress = Number(elem[progressKey]);
    let progress = Number.isFinite(rawProgress) ? rawProgress : 0;

    const dirRaw = isMover ? elem.flowDirection : (elem.routeDirection || elem.flowDirection);
    let dir = String(dirRaw || 'right') === 'left' ? -1 : 1;
    const routeMode = String(elem.routeMode || 'loop');

    if (elem.active !== false) {
      const rawSpeed = Number(isMover ? elem.speed : (elem.routeSpeed || elem.speed));
      const speed = Number.isFinite(rawSpeed) ? Math.max(1, Math.min(300, rawSpeed)) : 40;

      let remainingDist = dir * 2.5 * speed * dt;
      let guard = 0;

      while (Math.abs(remainingDist) > 1e-6 && guard < 16) {
        guard += 1;
        const routeLen = Math.max(1e-6, getPolylineLength(points));
        const along = progress * routeLen;
        const nextAlong = along + remainingDist;

        if (nextAlong >= 0 && nextAlong <= routeLen) {
          progress = nextAlong / routeLen;
          remainingDist = 0;
          break;
        }

        if (nextAlong > routeLen) {
          const overflow = nextAlong - routeLen;
          if (autoConnect) {
            const next = findConnectedRoute(route, true, flatElements);
            if (next && next.route) {
              route = next.route;
              points = getRoutePoints(route);
              elem.routeId = String(route.id);
              dir = String(next.direction || 'right') === 'left' ? -1 : 1;
              if (isMover) elem.flowDirection = dir < 0 ? 'left' : 'right';
              else elem.routeDirection = dir < 0 ? 'left' : 'right';
              progress = Math.max(0, Math.min(1, Number(next.progress) || 0));
              remainingDist = Math.abs(overflow) * (dir < 0 ? -1 : 1);
              continue;
            }
          }

          if (routeMode === 'stop') {
            progress = 1;
            elem.active = false;
          } else {
            progress = (nextAlong % routeLen) / routeLen;
          }
          remainingDist = 0;
          break;
        }

        // nextAlong < 0
        const overflow = -nextAlong;
        if (autoConnect) {
          const next = findConnectedRoute(route, false, flatElements);
          if (next && next.route) {
            route = next.route;
            points = getRoutePoints(route);
            elem.routeId = String(route.id);
            dir = String(next.direction || 'right') === 'left' ? -1 : 1;
            if (isMover) elem.flowDirection = dir < 0 ? 'left' : 'right';
            else elem.routeDirection = dir < 0 ? 'left' : 'right';
            progress = Math.max(0, Math.min(1, Number(next.progress) || 0));
            remainingDist = Math.abs(overflow) * (dir < 0 ? -1 : 1);
            continue;
          }
        }

        if (routeMode === 'stop') {
          progress = 0;
          elem.active = false;
        } else {
          const routeLen = Math.max(1e-6, getPolylineLength(points));
          const wrapped = ((nextAlong % routeLen) + routeLen) % routeLen;
          progress = wrapped / routeLen;
        }
        remainingDist = 0;
        break;
      }
    }

    if (routeMode === 'stop') {
      if (progress <= 0) {
        progress = 0;
        elem.active = false;
      } else if (progress >= 1) {
        progress = 1;
        elem.active = false;
      }
    } else {
      progress = ((progress % 1) + 1) % 1;
    }
    elem[progressKey] = progress;

    const p = getPointOnPolyline(points, progress);
    if (!p) return { x: defaultCenter.x, y: defaultCenter.y, angle: 0, routeFound: false };
    const rawState = { x: p.x, y: p.y, angle: p.angle, routeFound: true };
    return applyPortalTeleport(elem, rawState, flatElements, dt);
  }

  function updateAnimationCache() {
    const flat = flattenElements(state.project.elements || []);
    state.animation.flatElements = flat;
    state.animation.elementsById = new Map(flat.map((e) => [String(e.id || ''), e]));
  }

  function startSceneAnimation() {
    if (state.animation.rafId) return;
    updateAnimationCache();
    const flat = state.animation.flatElements;
    const byId = state.animation.elementsById;

    // Pre-calcular e inicializar posición en primer frame
    state.animation.moverNodes.forEach((m) => {
      const statePos = resolveElementRouteState(m.elem, 0, flat, byId);
      if (statePos.routeFound) {
        const angleDeg = (statePos.angle * 180) / Math.PI;
        if (m.isMover) {
          m.node.setAttribute('transform', `translate(${statePos.x} ${statePos.y}) rotate(${angleDeg})`);
        } else {
          const dx = statePos.x - m.cx;
          const dy = statePos.y - m.cy;
          m.wrapper.setAttribute('transform', `translate(${dx} ${dy}) rotate(${angleDeg} ${m.cx} ${m.cy})`);
        }
      }
    });

    const tick = (ts) => {
      const last = state.animation.lastTs || ts;
      const dt = Math.max(0.001, Math.min(0.05, (ts - last) / 1000));
      state.animation.lastTs = ts;

      const currentFlat = state.animation.flatElements || [];
      const currentById = state.animation.elementsById || new Map();

      state.animation.lineNodes.forEach((ln) => {
        ln.offset -= dt * 64 * ln.speed;
        ln.node.setAttribute('stroke-dashoffset', String(ln.offset));
      });

      state.animation.moverNodes.forEach((m) => {
        const currentElem = currentById.get(String(m.elem.id || '')) || m.elem;
        const statePos = resolveElementRouteState(currentElem, dt, currentFlat, currentById);
        if (statePos.routeFound) {
          const angleDeg = (statePos.angle * 180) / Math.PI;
          if (m.isMover) {
            m.node.setAttribute('transform', `translate(${statePos.x} ${statePos.y}) rotate(${angleDeg})`);
          } else {
            const dx = statePos.x - m.cx;
            const dy = statePos.y - m.cy;
            m.wrapper.setAttribute('transform', `translate(${dx} ${dy}) rotate(${angleDeg} ${m.cx} ${m.cy})`);
          }
        }
      });

      state.animation.rafId = requestAnimationFrame(tick);
    };

    state.animation.lastTs = 0;
    state.animation.rafId = requestAnimationFrame(tick);
  }

  function stopSceneAnimation() {
    if (state.animation.rafId) cancelAnimationFrame(state.animation.rafId);
    state.animation.rafId = 0;
    state.animation.lastTs = 0;
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

    if (elem.type === 'rectangle' || elem.type === 'image' || elem.type === 'circle' || elem.type === 'mover') {
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

    if (elem.type === 'mover') {
      const { x, y, w, h } = getRectLike(elem);
      const mw = Math.max(8, Number(w) || 44);
      const mh = Math.max(8, Number(h) || 28);
      return `<rect x="${x}" y="${y}" width="${mw}" height="${mh}" rx="${Math.max(3, Math.min(mw, mh) * 0.25)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${Math.max(1, lineWidth * 0.75)}"/>`;
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
    state.viewMode = readQueryMode();
    closeMediaOverlay();

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

  function setupLiveReceiver() {
    const params = new URLSearchParams(window.location.search);
    const builderLive = params.get('builderLive') === '1' || params.get('builder_live') === '1';
    if (!builderLive) return;

    document.body.classList.add('builder-live');

    const session = params.get('liveSession') || '';
    const storageKey = session ? `flow-builder-live-${session}` : '';
    let lastSignature = '';

    const applyLivePayload = (project) => {
      if (!project) return;
      try {
        applyLiveDelta(project);
      } catch (error) {
        console.warn('⚠️ Error al aplicar builder-live:', error);
      }
    };

    window.addEventListener('message', (event) => {
      const data = event && event.data ? event.data : null;
      if (!data || typeof data !== 'object') return;
      if (String(data.type || '') !== 'flow-builder-project') return;
      if (!data.project) return;
      applyLivePayload(data.project);
    });

    if (storageKey) {
      const pullFromStorage = () => {
        try {
          const rawJson = localStorage.getItem(storageKey);
          if (!rawJson) return;
          const parsed = JSON.parse(rawJson);
          const sig = String(parsed && parsed.signature || '');
          if (!sig || sig === lastSignature) return;
          lastSignature = sig;
          applyLivePayload(parsed.project);
        } catch (e) {
          // Ignorar
        }
      };
      pullFromStorage();
      setInterval(pullFromStorage, 180);
    }

    if (typeof BroadcastChannel !== 'undefined' && session) {
      try {
        const channel = new BroadcastChannel(`flow-builder-live-channel-${session}`);
        channel.addEventListener('message', (evt) => {
          const data = evt && evt.data ? evt.data : null;
          if (!data || typeof data !== 'object') return;
          if (String(data.type || '') !== 'flow-builder-project') return;
          const sig = String(data.signature || '');
          if (sig && sig === lastSignature) return;
          if (sig) lastSignature = sig;
          applyLivePayload(data.project);
        });
      } catch (e) {
        // Ignorar
      }
    }
  }

  async function boot() {
    state.viewMode = readQueryMode();

    // Si se pasa un modo o builderLive en la URL, ocultar barras de herramientas y estado
    const params = new URLSearchParams(window.location.search);
    const hasMode = params.has('mode');
    const isLive = params.get('builderLive') === '1' || params.get('builder_live') === '1';
    if (hasMode || isLive) {
      document.body.classList.add('viewer-mode-active');
    }

    bindEvents();
    updateWorldTransform();
    renderMediaList();
    setupLiveReceiver();
    setStatus('Previewer 2.0 listo.');

    try {
      await loadFromQuery();
    } catch (err) {
      setStatus(`Carga automática falló: ${err.message}`);
    }
  }

  boot();
})();
