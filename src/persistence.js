// localStorage autosave (spec §8): persists the full Project (grids'
// opacity/rowColors/orMode/position) — clipboard/selection/history are
// transient UI state and are not persisted (spec §8 note).
const STORAGE_KEY = 'mode2-sprites/project';
const DEBOUNCE_MS = 300;

export function serializeProject(project) {
  return JSON.stringify({
    paletteType: project.paletteType === 'screen8' ? 'screen8' : 'regular',
    grids: project.grids.map((sprite) => ({
      opacity: Array.from(sprite.opacity),
      rowColors: Array.from(sprite.rowColors),
      orMode: sprite.orMode,
      x: sprite.x,
      y: sprite.y,
    })),
  });
}

// Returns a plain Project object, or null if `json` isn't a
// well-formed serialized project (missing/malformed fields).
export function deserializeProject(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.grids) || data.grids.length === 0) return null;
  try {
    return {
      paletteType: data.paletteType === 'screen8' ? 'screen8' : 'regular',
      grids: data.grids.map((g) => ({
        opacity: Uint8Array.from(g.opacity),
        rowColors: Uint8Array.from(g.rowColors),
        orMode: !!g.orMode,
        x: g.x | 0,
        y: g.y | 0,
      })),
    };
  } catch {
    return null;
  }
}

export function saveProject(project, storage = window.localStorage) {
  storage.setItem(STORAGE_KEY, serializeProject(project));
}

// Returns a restored Project, or null if nothing valid is stored.
export function loadProject(storage = window.localStorage) {
  const json = storage.getItem(STORAGE_KEY);
  if (json === null) return null;
  return deserializeProject(json);
}

export function clearSavedProject(storage = window.localStorage) {
  storage.removeItem(STORAGE_KEY);
}

// Debounced autosave: call `trigger()` on every mutation; the actual
// `saveProject` write is coalesced to at most once per `delayMs`.
// `onSave`, if given, is called after each completed write.
export function createAutosave(project, { storage = window.localStorage, delayMs = DEBOUNCE_MS, onSave } = {}) {
  let timer = null;
  function save() {
    saveProject(project, storage);
    onSave && onSave();
  }
  function trigger() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      save();
    }, delayMs);
  }
  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    save();
  }
  return { trigger, flush };
}
