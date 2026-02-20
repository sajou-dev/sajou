/**
 * Export dialog module.
 *
 * Displays a modal allowing the user to select which sections
 * to include in the exported ZIP. Returns the selection or null if cancelled.
 *
 * Reuses the import-dialog CSS classes for consistent styling.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary counts for each exportable section (computed from current state). */
export interface ExportSummary {
  /** Number of entity placements on the scene. */
  entityPlacements: number;
  /** Number of entity definitions. */
  entityDefinitions: number;
  /** Number of assets in the asset store. */
  assetFiles: number;
  /** Number of choreography definitions. */
  choreographies: number;
  /** Number of wire connections (excluding signal→signal-type). */
  wires: number;
  /** Number of bindings. */
  bindings: number;
  /** Number of shader definitions. */
  shaders: number;
  /** Number of sketch definitions (p5.js / Three.js). */
  p5Sketches: number;
}

/** Which sections the user chose to export. */
export interface ExportSelection {
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
  key: keyof ExportSelection;
  label: string;
  summary: (s: ExportSummary) => string;
  available: (s: ExportSummary) => boolean;
}

const SECTIONS: SectionDef[] = [
  {
    key: "visualLayout",
    label: "Visual layout",
    summary: (s) => `${s.entityPlacements} placements, lighting, particles`,
    available: () => true,
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
    label: "Sketches",
    summary: (s) => `${s.p5Sketches} sketches`,
    available: (s) => s.p5Sketches > 0,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show the export selection dialog.
 *
 * @returns The user's selection, or `null` if cancelled (Cancel button or Escape).
 */
export function showExportDialog(summary: ExportSummary): Promise<ExportSelection | null> {
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
    title.textContent = "Export scene";
    dialog.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "import-dialog-subtitle";
    subtitle.textContent = "Select which sections to include in the export.";
    dialog.appendChild(subtitle);

    // --- Sections ---
    const sectionsContainer = document.createElement("div");
    sectionsContainer.className = "import-dialog-sections";

    const selection: ExportSelection = {
      visualLayout: true,
      entitiesAndAssets: true,
      choreographiesAndWiring: true,
      shaders: true,
      p5Sketches: true,
    };

    const checkboxes: { key: keyof ExportSelection; input: HTMLInputElement }[] = [];

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

    // --- Buttons ---
    const buttonRow = document.createElement("div");
    buttonRow.className = "import-dialog-buttons";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "import-dialog-btn import-dialog-btn--cancel";
    cancelBtn.textContent = "Cancel";

    const exportBtn = document.createElement("button");
    exportBtn.className = "import-dialog-btn import-dialog-btn--import";
    exportBtn.textContent = "Export";

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(exportBtn);
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

    function onExport(): void {
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
        onExport();
      }
    }

    cancelBtn.addEventListener("click", onCancel);
    exportBtn.addEventListener("click", onExport);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) onCancel();
    });
    document.addEventListener("keydown", onKey);

    // Focus the dialog for keyboard navigation
    dialog.setAttribute("tabindex", "-1");
    dialog.focus();
  });
}
