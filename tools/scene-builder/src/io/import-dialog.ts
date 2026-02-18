/**
 * Import dialog module.
 *
 * Displays a modal allowing the user to select which sections
 * of a ZIP archive to import. Returns the selection or null if cancelled.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary counts for each importable section. */
export interface ZipSummary {
  /** Number of entity placements in scene.json. */
  entityPlacements: number;
  /** Number of entity definitions in entities.json. */
  entityDefinitions: number;
  /** Number of asset files under assets/. */
  assetFiles: number;
  /** Number of choreography definitions. */
  choreographies: number;
  /** Number of wire connections. */
  wires: number;
  /** Number of bindings. */
  bindings: number;
  /** Number of shader definitions. */
  shaders: number;
  /** Number of p5.js sketch definitions. */
  p5Sketches: number;
}

/** Which sections the user chose to import. */
export interface ImportSelection {
  visualLayout: boolean;
  entitiesAndAssets: boolean;
  choreographiesAndWiring: boolean;
  shaders: boolean;
  p5Sketches: boolean;
}

// ---------------------------------------------------------------------------
// Dialog sections
// ---------------------------------------------------------------------------

interface SectionDef {
  key: keyof ImportSelection;
  label: string;
  summary: (s: ZipSummary) => string;
  available: (s: ZipSummary) => boolean;
}

const SECTIONS: SectionDef[] = [
  {
    key: "visualLayout",
    label: "Visual layout",
    summary: (s) => `${s.entityPlacements} placements, lighting, particles`,
    available: () => true, // scene.json is always present
  },
  {
    key: "entitiesAndAssets",
    label: "Entities & Assets",
    summary: (s) => `${s.entityDefinitions} entities, ${s.assetFiles} assets`,
    available: (s) => s.entityDefinitions > 0 || s.assetFiles > 0,
  },
  {
    key: "choreographiesAndWiring",
    label: "Choreographies & Wiring",
    summary: (s) => `${s.choreographies} choreos, ${s.wires} wires, ${s.bindings} bindings`,
    available: (s) => s.choreographies > 0,
  },
  {
    key: "shaders",
    label: "Shaders",
    summary: (s) => `${s.shaders} shaders`,
    available: (s) => s.shaders > 0,
  },
  {
    key: "p5Sketches",
    label: "p5.js Sketches",
    summary: (s) => `${s.p5Sketches} sketches`,
    available: (s) => s.p5Sketches > 0,
  },
];

// ---------------------------------------------------------------------------
// Warning logic
// ---------------------------------------------------------------------------

/** Compute contextual warnings based on the current selection. */
function getWarnings(sel: ImportSelection, summary: ZipSummary): string[] {
  const warnings: string[] = [];

  if (sel.visualLayout && !sel.entitiesAndAssets && summary.entityDefinitions > 0) {
    warnings.push("Visual layout without Entities may produce invisible meshes (missing definitions).");
  }

  if (sel.choreographiesAndWiring && !sel.visualLayout && !sel.entitiesAndAssets) {
    warnings.push("Choreographies may reference entities not present in your current scene.");
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show the import selection dialog.
 *
 * @returns The user's selection, or `null` if cancelled (Cancel button or Escape).
 */
export function showImportDialog(summary: ZipSummary): Promise<ImportSelection | null> {
  return new Promise((resolve) => {
    // --- Backdrop ---
    const backdrop = document.createElement("div");
    backdrop.className = "import-dialog-backdrop";

    // --- Dialog ---
    const dialog = document.createElement("div");
    dialog.className = "import-dialog";

    // Title
    const title = document.createElement("h3");
    title.className = "import-dialog-title";
    title.textContent = "Import scene";
    dialog.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "import-dialog-subtitle";
    subtitle.textContent = "Select which sections to import. Unchecked sections keep their current state.";
    dialog.appendChild(subtitle);

    // --- Sections ---
    const sectionsContainer = document.createElement("div");
    sectionsContainer.className = "import-dialog-sections";

    const selection: ImportSelection = {
      visualLayout: true,
      entitiesAndAssets: true,
      choreographiesAndWiring: true,
      shaders: true,
      p5Sketches: true,
    };

    const checkboxes: { key: keyof ImportSelection; input: HTMLInputElement }[] = [];

    for (const section of SECTIONS) {
      const available = section.available(summary);

      const row = document.createElement("label");
      row.className = "import-dialog-row";
      if (!available) row.classList.add("import-dialog-row--disabled");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = available;
      checkbox.disabled = !available;
      if (!available) selection[section.key] = false;

      const textWrap = document.createElement("div");
      textWrap.className = "import-dialog-row-text";

      const labelEl = document.createElement("span");
      labelEl.className = "import-dialog-row-label";
      labelEl.textContent = section.label;

      const summaryEl = document.createElement("span");
      summaryEl.className = "import-dialog-row-summary";
      summaryEl.textContent = section.summary(summary);

      textWrap.appendChild(labelEl);
      textWrap.appendChild(summaryEl);

      row.appendChild(checkbox);
      row.appendChild(textWrap);
      sectionsContainer.appendChild(row);

      checkboxes.push({ key: section.key, input: checkbox });
    }

    dialog.appendChild(sectionsContainer);

    // --- Warning area ---
    const warningArea = document.createElement("div");
    warningArea.className = "import-dialog-warnings";
    dialog.appendChild(warningArea);

    function updateWarnings(): void {
      for (const { key, input } of checkboxes) {
        selection[key] = input.checked;
      }
      const warnings = getWarnings(selection, summary);
      warningArea.innerHTML = "";
      for (const msg of warnings) {
        const w = document.createElement("div");
        w.className = "import-dialog-warning";
        w.textContent = msg;
        warningArea.appendChild(w);
      }
    }

    for (const { input } of checkboxes) {
      input.addEventListener("change", updateWarnings);
    }
    updateWarnings();

    // --- Buttons ---
    const buttonRow = document.createElement("div");
    buttonRow.className = "import-dialog-buttons";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "import-dialog-btn import-dialog-btn--cancel";
    cancelBtn.textContent = "Cancel";

    const importBtn = document.createElement("button");
    importBtn.className = "import-dialog-btn import-dialog-btn--import";
    importBtn.textContent = "Import";

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(importBtn);
    dialog.appendChild(buttonRow);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    // --- Event handlers ---
    function cleanup(): void {
      document.body.removeChild(backdrop);
      document.removeEventListener("keydown", onKey);
    }

    function onCancel(): void {
      cleanup();
      resolve(null);
    }

    function onImport(): void {
      for (const { key, input } of checkboxes) {
        selection[key] = input.checked;
      }
      // Must have at least one section selected
      if (!selection.visualLayout && !selection.entitiesAndAssets &&
          !selection.choreographiesAndWiring && !selection.shaders && !selection.p5Sketches) {
        return; // Don't close — nothing selected
      }
      cleanup();
      resolve(selection);
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.stopPropagation();
        onImport();
      }
    }

    cancelBtn.addEventListener("click", onCancel);
    importBtn.addEventListener("click", onImport);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) onCancel();
    });
    document.addEventListener("keydown", onKey);

    // Focus the dialog for keyboard navigation
    dialog.setAttribute("tabindex", "-1");
    dialog.focus();
  });
}
