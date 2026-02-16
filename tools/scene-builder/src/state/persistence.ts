/**
 * Persistence orchestrator for scene-builder.
 *
 * Auto-saves all persistent state to IndexedDB (debounced) and restores
 * it on startup. Remote signal sources and editor preferences are saved
 * to localStorage for fast access.
 *
 * Non-persisted: undo stack, compositor, local sources (re-discovered),
 * connection status, active selections.
 */

import { dbPut, dbGet, dbGetAll, dbGetAllKeys, dbClearAll } from "./persistence-db.js";
import type { StoreName } from "./persistence-db.js";

// State stores
import { getSceneState, setSceneState, resetSceneState, subscribeScene } from "./scene-state.js";
import { getEntityStore, setEntity, resetEntities, subscribeEntities } from "./entity-store.js";
import { getAssetStore, addAssets, addCategory, resetAssets, subscribeAssets } from "./asset-store.js";
import {
  getChoreographyState,
  setChoreographyState,
  resetChoreographyState,
  subscribeChoreography,
} from "./choreography-state.js";
import { getWiringState, setWiringState, resetWiringState, subscribeWiring } from "./wiring-state.js";
import { getBindingState, setBindingState, resetBindingState, subscribeBindings } from "./binding-store.js";
import {
  getSignalTimelineState,
  setSignalTimelineState,
  resetSignalTimeline,
  subscribeSignalTimeline,
} from "./signal-timeline-state.js";
import {
  getShaderState,
  setShaderState,
  resetShaderState,
  subscribeShaders,
} from "../shader-editor/shader-state.js";
import {
  getSignalSourcesState,
  updateSignalSourcesState,
  resetSignalSources,
  subscribeSignalSources,
} from "./signal-source-state.js";
import { getEditorState, updateEditorState, subscribeEditor } from "./editor-state.js";
import { clearHistory } from "./undo.js";
import { scanAndSyncLocal } from "./local-discovery.js";

import type {
  AssetFile,
  AssetFormat,
  SceneState,
  ChoreographyEditorState,
  SignalTimelineState,
  SignalSource,
  EditorState,
  PanelId,
  PanelLayout,
  PipelineLayout,
  InterfaceState,
  ViewMode,
} from "../types.js";
import type { WiringState } from "./wiring-state.js";
import type { BindingState } from "./binding-store.js";
import type { ShaderEditorState } from "../shader-editor/shader-types.js";

// ---------------------------------------------------------------------------
// Versioned envelope
// ---------------------------------------------------------------------------

interface VersionedData<T = unknown> {
  version: 1;
  data: T;
}

function wrap<T>(data: T): VersionedData<T> {
  return { version: 1, data };
}

// ---------------------------------------------------------------------------
// Stored asset record (ArrayBuffer replaces File)
// ---------------------------------------------------------------------------

interface StoredAsset {
  name: string;
  path: string;
  category: string;
  format: AssetFormat;
  buffer: ArrayBuffer;
  naturalWidth?: number;
  naturalHeight?: number;
  frameCount?: number;
  detectedFps?: number;
}

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

const LS_REMOTE_SOURCES = "sajou:remote-sources";
const LS_EDITOR_PREFS = "sajou:editor-prefs";

// ---------------------------------------------------------------------------
// Serialization: remote sources
// ---------------------------------------------------------------------------

/** Persistable subset of a remote signal source. */
interface PersistedRemoteSource {
  id: string;
  name: string;
  color: string;
  protocol: string;
  url: string;
  apiKey: string;
  availableModels: string[];
  selectedModel: string;
}

function serializeRemoteSources(): string {
  const { sources } = getSignalSourcesState();
  const remotes: PersistedRemoteSource[] = sources
    .filter((s) => s.category === "remote")
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      protocol: s.protocol,
      url: s.url,
      apiKey: s.apiKey,
      availableModels: s.availableModels,
      selectedModel: s.selectedModel,
    }));
  return JSON.stringify(remotes);
}

function restoreRemoteSources(): void {
  const raw = localStorage.getItem(LS_REMOTE_SOURCES);
  if (!raw) return;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    const remotes: SignalSource[] = (parsed as PersistedRemoteSource[]).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      protocol: p.protocol as SignalSource["protocol"],
      url: p.url,
      apiKey: p.apiKey,
      status: "disconnected" as const,
      error: null,
      eventsPerSecond: 0,
      availableModels: p.availableModels ?? [],
      selectedModel: p.selectedModel ?? "",
      streaming: false,
      category: "remote" as const,
    }));

    // Merge with existing state (local sources may already be populated)
    const { sources } = getSignalSourcesState();
    const locals = sources.filter((s) => s.category === "local");
    updateSignalSourcesState({ sources: [...locals, ...remotes] });
  } catch {
    // Corrupted data — ignore
  }
}

// ---------------------------------------------------------------------------
// Serialization: editor preferences
// ---------------------------------------------------------------------------

interface PersistedEditorPrefs {
  panelLayouts: Record<PanelId, PanelLayout>;
  gridEnabled: boolean;
  gridSize: number;
  snapToGrid: boolean;
  rideauSplit: number;
  interfaceState: InterfaceState;
  viewMode: ViewMode;
  pipelineLayout?: PipelineLayout;
}

function serializeEditorPrefs(): string {
  const s = getEditorState();
  const prefs: PersistedEditorPrefs = {
    panelLayouts: s.panelLayouts,
    gridEnabled: s.gridEnabled,
    gridSize: s.gridSize,
    snapToGrid: s.snapToGrid,
    rideauSplit: s.rideauSplit,
    interfaceState: s.interfaceState,
    viewMode: s.viewMode,
    pipelineLayout: s.pipelineLayout,
  };
  return JSON.stringify(prefs);
}

function restoreEditorPrefs(): void {
  const raw = localStorage.getItem(LS_EDITOR_PREFS);
  if (!raw) return;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return;

    const prefs = parsed as Partial<PersistedEditorPrefs>;
    const update: Partial<EditorState> = {};

    if (prefs.panelLayouts) update.panelLayouts = prefs.panelLayouts;
    if (typeof prefs.gridEnabled === "boolean") update.gridEnabled = prefs.gridEnabled;
    if (typeof prefs.gridSize === "number") update.gridSize = prefs.gridSize;
    if (typeof prefs.snapToGrid === "boolean") update.snapToGrid = prefs.snapToGrid;
    if (typeof prefs.rideauSplit === "number") update.rideauSplit = prefs.rideauSplit;
    if (typeof prefs.interfaceState === "number") update.interfaceState = prefs.interfaceState;
    if (prefs.viewMode) update.viewMode = prefs.viewMode;

    // Pipeline layout — restore or migrate from rideauSplit
    if (prefs.pipelineLayout) {
      update.pipelineLayout = prefs.pipelineLayout;
    } else if (typeof prefs.rideauSplit === "number") {
      // Migration: derive from rideauSplit
      if (prefs.rideauSplit >= 0.95) {
        update.pipelineLayout = { extended: ["signal", "choreographer"] };
      } else {
        update.pipelineLayout = { extended: ["visual"] };
      }
    }

    if (Object.keys(update).length > 0) {
      updateEditorState(update);
    }
  } catch {
    // Corrupted data — ignore
  }
}

// ---------------------------------------------------------------------------
// Debounced save helpers
// ---------------------------------------------------------------------------

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced save to IndexedDB. */
function debouncedSave(store: StoreName, serialize: () => unknown): void {
  const existing = debounceTimers.get(store);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    store,
    setTimeout(() => {
      debounceTimers.delete(store);
      dbPut(store, "current", wrap(serialize())).catch((err: unknown) => {
        console.error(`[persistence] Failed to save ${store}:`, err);
      });
    }, 500),
  );
}

/** Debounced save to localStorage. */
function debouncedLocalSave(key: string, serialize: () => string): void {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      try {
        localStorage.setItem(key, serialize());
      } catch (err: unknown) {
        console.error(`[persistence] Failed to save ${key}:`, err);
      }
    }, 300),
  );
}

// ---------------------------------------------------------------------------
// Asset persistence (incremental)
// ---------------------------------------------------------------------------

/** Save assets incrementally — only new ones that are not yet in IndexedDB. */
async function saveAssetsIncremental(): Promise<void> {
  const { assets } = getAssetStore();
  if (assets.length === 0) return;

  const existingKeys = new Set(
    (await dbGetAllKeys("assets")).map((k) => String(k)),
  );

  for (const asset of assets) {
    if (existingKeys.has(asset.path)) continue;

    try {
      const buffer = await asset.file.arrayBuffer();
      const record: StoredAsset = {
        name: asset.name,
        path: asset.path,
        category: asset.category,
        format: asset.format,
        buffer,
        naturalWidth: asset.naturalWidth,
        naturalHeight: asset.naturalHeight,
        frameCount: asset.frameCount,
        detectedFps: asset.detectedFps,
      };
      await dbPut("assets", asset.path, record);
    } catch (err: unknown) {
      console.error(`[persistence] Failed to save asset ${asset.path}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-save initialization
// ---------------------------------------------------------------------------

/** Start subscribing to all stores and auto-saving changes. */
export function initAutoSave(): void {
  // IndexedDB stores — debounced 500ms
  subscribeScene(() =>
    debouncedSave("scene", () => getSceneState()),
  );
  subscribeEntities(() =>
    debouncedSave("entities", () => getEntityStore().entities),
  );
  subscribeChoreography(() =>
    debouncedSave("choreographies", () => getChoreographyState()),
  );
  subscribeWiring(() =>
    debouncedSave("wires", () => getWiringState()),
  );
  subscribeBindings(() =>
    debouncedSave("bindings", () => getBindingState()),
  );
  subscribeSignalTimeline(() =>
    debouncedSave("timeline", () => getSignalTimelineState()),
  );
  subscribeShaders(() =>
    debouncedSave("shaders", () => getShaderState()),
  );

  // Assets — incremental, debounced
  subscribeAssets(() => {
    const existing = debounceTimers.get("assets");
    if (existing) clearTimeout(existing);
    debounceTimers.set(
      "assets",
      setTimeout(() => {
        debounceTimers.delete("assets");
        saveAssetsIncremental().catch((err: unknown) => {
          console.error("[persistence] Failed to save assets:", err);
        });
      }, 500),
    );
  });

  // localStorage stores — debounced 300ms
  subscribeSignalSources(() =>
    debouncedLocalSave(LS_REMOTE_SOURCES, serializeRemoteSources),
  );
  subscribeEditor(() =>
    debouncedLocalSave(LS_EDITOR_PREFS, serializeEditorPrefs),
  );

  // Flush pending saves on page unload
  window.addEventListener("beforeunload", flushPendingSaves);
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/** MIME type lookup for reconstructing File objects. */
function mimeFromFormat(format: AssetFormat): string {
  switch (format) {
    case "png": return "image/png";
    case "svg": return "image/svg+xml";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "jpeg": return "image/jpeg";
    default: return "application/octet-stream";
  }
}

/**
 * Attempt to restore state from IndexedDB + localStorage.
 * Returns true if scene data was found and restored.
 */
export async function restoreState(): Promise<boolean> {
  try {
    // 1. Check if scene data exists
    const sceneRecord = await dbGet<VersionedData<SceneState>>("scene", "current");
    if (!sceneRecord?.data) return false; // First launch — nothing to restore

    // 2. Restore scene state
    setSceneState(sceneRecord.data);

    // 3. Restore entity definitions
    const entityRecord = await dbGet<VersionedData<Record<string, { id: string }>>>("entities", "current");
    if (entityRecord?.data) {
      for (const [id, entry] of Object.entries(entityRecord.data)) {
        setEntity(id, entry as Parameters<typeof setEntity>[1]);
      }
    }

    // 4. Restore choreography state
    const choreoRecord = await dbGet<VersionedData<ChoreographyEditorState>>("choreographies", "current");
    if (choreoRecord?.data) {
      setChoreographyState({
        ...choreoRecord.data,
        selectedChoreographyId: null,
        selectedStepId: null,
      });
    }

    // 5. Restore wiring state
    const wiringRecord = await dbGet<VersionedData<WiringState>>("wires", "current");
    if (wiringRecord?.data) {
      setWiringState({
        ...wiringRecord.data,
        draggingWireId: null,
      });
    }

    // 6. Restore binding state
    const bindingRecord = await dbGet<VersionedData<BindingState>>("bindings", "current");
    if (bindingRecord?.data) {
      setBindingState(bindingRecord.data);
    }

    // 7. Restore signal timeline
    const timelineRecord = await dbGet<VersionedData<SignalTimelineState>>("timeline", "current");
    if (timelineRecord?.data) {
      setSignalTimelineState({
        ...timelineRecord.data,
        selectedStepId: null,
      });
    }

    // 8. Restore shader state
    const shaderRecord = await dbGet<VersionedData<ShaderEditorState>>("shaders", "current");
    if (shaderRecord?.data) {
      setShaderState({
        ...shaderRecord.data,
        selectedShaderId: null,
        playing: true,
      });
    }

    // 9. Restore assets (ArrayBuffer → File → objectUrl)
    const assetRecords = await dbGetAll<StoredAsset>("assets");
    if (assetRecords.length > 0) {
      const assetFiles: AssetFile[] = [];
      const categories = new Set<string>();

      for (const rec of assetRecords) {
        const mime = mimeFromFormat(rec.format);
        const file = new File([rec.buffer], rec.name, { type: mime });
        const objectUrl = URL.createObjectURL(file);

        assetFiles.push({
          path: rec.path,
          name: rec.name,
          objectUrl,
          file,
          category: rec.category,
          format: rec.format,
          naturalWidth: rec.naturalWidth,
          naturalHeight: rec.naturalHeight,
          frameCount: rec.frameCount,
          detectedFps: rec.detectedFps,
        });

        if (rec.category) categories.add(rec.category);
      }

      addAssets(assetFiles);
      for (const cat of categories) {
        addCategory(cat);
      }
    }

    // 9. Restore localStorage data
    restoreRemoteSources();
    restoreEditorPrefs();

    // 10. Clear undo stack — restored state has no undo history
    clearHistory();

    console.info("[persistence] State restored from IndexedDB");
    return true;
  } catch (err: unknown) {
    console.error("[persistence] Failed to restore state:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Force persist (used after import)
// ---------------------------------------------------------------------------

/** Immediately save all stores — bypasses debounce. */
export async function forcePersistAll(): Promise<void> {
  // Cancel any pending debounced saves
  for (const [key, timer] of debounceTimers) {
    clearTimeout(timer);
    debounceTimers.delete(key);
  }

  await Promise.all([
    dbPut("scene", "current", wrap(getSceneState())),
    dbPut("entities", "current", wrap(getEntityStore().entities)),
    dbPut("choreographies", "current", wrap(getChoreographyState())),
    dbPut("wires", "current", wrap(getWiringState())),
    dbPut("bindings", "current", wrap(getBindingState())),
    dbPut("timeline", "current", wrap(getSignalTimelineState())),
    dbPut("shaders", "current", wrap(getShaderState())),
  ]);

  // Assets: save all (force, not incremental)
  const { assets } = getAssetStore();
  for (const asset of assets) {
    const buffer = await asset.file.arrayBuffer();
    const record: StoredAsset = {
      name: asset.name,
      path: asset.path,
      category: asset.category,
      format: asset.format,
      buffer,
      naturalWidth: asset.naturalWidth,
      naturalHeight: asset.naturalHeight,
      frameCount: asset.frameCount,
      detectedFps: asset.detectedFps,
    };
    await dbPut("assets", asset.path, record);
  }

  // localStorage
  try {
    localStorage.setItem(LS_REMOTE_SOURCES, serializeRemoteSources());
    localStorage.setItem(LS_EDITOR_PREFS, serializeEditorPrefs());
  } catch {
    // localStorage full — not critical
  }
}

// ---------------------------------------------------------------------------
// New Scene (clear all persistence)
// ---------------------------------------------------------------------------

/** Clear all persisted data and reset stores to defaults. */
export async function newScene(): Promise<void> {
  // 1. Clear IndexedDB
  await dbClearAll();

  // 2. Clear localStorage persistence keys
  localStorage.removeItem(LS_REMOTE_SOURCES);
  localStorage.removeItem(LS_EDITOR_PREFS);

  // 3. Reset all stores to defaults
  resetAssets();
  resetEntities();
  resetSceneState();
  resetChoreographyState();
  resetWiringState();
  resetBindingState();
  resetSignalTimeline();
  resetShaderState();
  resetSignalSources();
  clearHistory();

  // 4. Re-discover local sources
  await scanAndSyncLocal();
}

// ---------------------------------------------------------------------------
// Flush pending saves (beforeunload)
// ---------------------------------------------------------------------------

/** Synchronously flush all pending debounced saves. */
function flushPendingSaves(): void {
  for (const [key, timer] of debounceTimers) {
    clearTimeout(timer);
    debounceTimers.delete(key);
  }

  // Best-effort synchronous writes for IndexedDB
  // We cannot await promises in beforeunload, but we can start the transactions
  // and the browser will try to complete them before tearing down.
  try {
    dbPut("scene", "current", wrap(getSceneState())).catch(() => {});
    dbPut("entities", "current", wrap(getEntityStore().entities)).catch(() => {});
    dbPut("choreographies", "current", wrap(getChoreographyState())).catch(() => {});
    dbPut("wires", "current", wrap(getWiringState())).catch(() => {});
    dbPut("bindings", "current", wrap(getBindingState())).catch(() => {});
    dbPut("timeline", "current", wrap(getSignalTimelineState())).catch(() => {});
    dbPut("shaders", "current", wrap(getShaderState())).catch(() => {});
  } catch {
    // Best effort — page is unloading
  }

  // localStorage is synchronous — always succeeds if quota allows
  try {
    localStorage.setItem(LS_REMOTE_SOURCES, serializeRemoteSources());
    localStorage.setItem(LS_EDITOR_PREFS, serializeEditorPrefs());
  } catch {
    // localStorage full — not critical
  }
}
