let viewer = null;
let originalViewer = null;
let energyChart = null;
let gradientChart = null;
let scfAccuracyChart = null;
let nebProfileChart = null;
let currentJob = null;
const RECENT_HISTORY_POINT_LIMIT = 30;
let energySeriesData = [];
let gradientSeriesData = [];
let gradientTargetValue = null;
let scfAccuracySeriesData = [];
let chartControlsBound = false;

let trajectoryFrames = [];
let originalStructure = null;
let currentStep = 0;
let currentLattice = null;
let originalLattice = null;
let originalInputFile = null;
let originalConstraints = [];
let baderChargeChanges = [];
let hasBaderChargeChanges = false;
let showCell = true;
let showAxes = true;
let currentStyle = "ballstick";
let cellRepeat = { x: 2, y: 2, z: 1 };
let maxBondDistance = 2.8;
const FIXED_GLOW_TRANSPARENCY = 42;
let measureMode = false;
let measurementState = {
  current: { atoms: [], labels: [], line: null },
  original: { atoms: [], labels: [], line: null }
};
let chargeMode = false;
let chargeSelections = new Map();
let syncViewsEnabled = true;
let isApplyingSyncedView = false;
const FIXED_ATOM_COLOR = "#00d4ff";
const KNOWN_ELEMENT_COLORS = {
  H: "#ffffff",
  C: "#808080",
  N: "#3b82f6",
  O: "#ef4444",
  S: "#facc15",
  P: "#f97316",
  F: "#22c55e",
  Cl: "#10b981",
  Br: "#92400e",
  I: "#7c3aed",
  Si: "#a3a3a3",
  Al: "#94a3b8",
  Fe: "#b91c1c",
  Co: "#1d4ed8",
  Ni: "#16a34a",
  Cu: "#f59e0b",
  Zn: "#64748b",
  Ag: "#cbd5e1",
  Au: "#eab308",
  Pt: "#475569",
  Pd: "#6b7280"
};
const COVALENT_RADII = {
  H: 0.31,
  C: 0.76,
  N: 0.71,
  O: 0.66,
  F: 0.57,
  P: 1.07,
  S: 1.05,
  Cl: 1.02,
  Br: 1.20,
  I: 1.39,
  Si: 1.11,
  Al: 1.21,
  Fe: 1.24,
  Co: 1.18,
  Ni: 1.21,
  Cu: 1.38,
  Zn: 1.31,
  Ag: 1.45,
  Au: 1.36,
  Pt: 1.36,
  Pd: 1.39
};
const DEFAULT_COVALENT_RADIUS = 1.2;
const BOND_TOLERANCE = 0.45;
const METAL_ELEMENTS = new Set(["Ni", "Cu", "Fe", "Co", "Pt", "Pd", "Ag", "Au", "Zn", "Al"]);
const ADSORBATE_BOND_ELEMENTS = new Set(["O", "N", "S", "C", "P", "F", "Cl", "Br", "I"]);
const WEAK_ADSORPTION_LINE_COLOR = "#111827";
const WEAK_ADSORPTION_DASH_RADIUS = 0.24;
const WEAK_ADSORPTION_DASH_LENGTH = 0.30;
const WEAK_ADSORPTION_GAP_LENGTH = 0.22;
const DELTA_CHARGE_POSITIVE_COLOR = "#dc2626";
const DELTA_CHARGE_NEGATIVE_COLOR = "#2563eb";
const DELTA_CHARGE_NEUTRAL_COLOR = "#6b7280";
const EXTRA_ELEMENT_PALETTE = [
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#8b5cf6",
  "#14b8a6",
  "#e11d48",
  "#0ea5e9",
  "#a855f7",
  "#22c55e"
];
const chartControlIds = {
  energy: {
    xMin: "energyXMin",
    xMax: "energyXMax",
    yMin: "energyYMin",
    yMax: "energyYMax",
    yRangePercent: "energyYRangePercent",
    reset: "energyAxisReset"
  },
  gradient: {
    xMin: "gradientXMin",
    xMax: "gradientXMax",
    yMin: "gradientYMin",
    yMax: "gradientYMax",
    yRangePercent: "gradientYRangePercent",
    reset: "gradientAxisReset"
  },
  scfAccuracy: {
    xMin: "scfAccuracyXMin",
    xMax: "scfAccuracyXMax",
    yMin: "scfAccuracyYMin",
    yMax: "scfAccuracyYMax",
    yRangePercent: "scfAccuracyYRangePercent",
    reset: "scfAccuracyAxisReset"
  }
};
const CHART_DEFINITIONS = {
  energy: {
    canvasId: "energyChart",
    label: "Total Energy (Ry)",
    color: "#2563eb",
    yTitle: "Energy (Ry)"
  },
  gradient: {
    canvasId: "gradientChart",
    label: "Gradient Error (Ry/Bohr)",
    color: "#16a34a",
    yTitle: "Gradient Error (Ry/Bohr)",
    targetValueKey: "gradientTargetValue",
    targetLabel: "Target Gradient Error (Ry/Bohr)"
  },
  scfAccuracy: {
    canvasId: "scfAccuracyChart",
    label: "SCF Accuracy (Ry)",
    color: "#dc2626",
    yTitle: "Accuracy (Ry)",
    pointLimit: RECENT_HISTORY_POINT_LIMIT,
    scientificTicks: true
  }
};
const INPUT_COMPARE_KEYS = [
  "occupations",
  "degauss",
  "nspin",
  "nosym",
  "noinv",
  "noncolin",
  "vdw_corr",
  "conv_thr",
  "electron_maxstep",
  "mixing_beta",
  "mixing_mode",
  "scf_must_converge",
  "startingwfc",
  "forc_conv_thr"
];

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getJobId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("job");
}

async function loadJobs() {
  const res = await fetch("data/jobs.json?t=" + Date.now());
  return await res.json();
}

async function loadVersion() {
  const res = await fetch("data/version.json?t=" + Date.now());
  if (!res.ok) throw new Error("Failed to load version metadata");
  return await res.json();
}

async function loadText(path) {
  const res = await fetch(path + "?t=" + Date.now());
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.text();
}

async function loadJSON(path) {
  const res = await fetch(path + "?t=" + Date.now());
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function renderVersionStamp(version) {
  const el = document.getElementById("versionStamp");
  if (!el) return;

  const updatedAt = version?.updated_at_local || version?.updated_at_iso || "Not available";
  const commit = version?.source_commit ? `Commit before update: ${version.source_commit}` : "";
  el.innerHTML = `
    <strong>Latest update</strong>
    <span>${escapeHTML(updatedAt)}</span>
    ${commit ? `<span>${escapeHTML(commit)}</span>` : ""}
  `;
}

async function refreshVersionStamp() {
  try {
    renderVersionStamp(await loadVersion());
  } catch (e) {
    renderVersionStamp({ updated_at_local: "No update timestamp yet" });
  }
}

function updateOriginalStructureSource() {
  const el = document.getElementById("originalStructureSource");
  if (!el) return;
  el.textContent = `Source: ${originalInputFile ?? "not available"}`;
}

function updateCurrentStructureSource(sourcePath) {
  const el = document.getElementById("currentStructureSource");
  if (!el) return;

  const fileName = typeof sourcePath === "string"
    ? sourcePath.split(/[\\/]/).filter(Boolean).pop()
    : null;
  el.textContent = `Source: ${fileName || "not available"}`;
}

function updateFixedAtomStatus() {
  const el = document.getElementById("fixedAtomStatus");
  if (!el) return;

  if (!Array.isArray(originalConstraints) || !originalConstraints.length) {
    el.textContent = "Fixed atoms: no if_pos constraint data found";
    return;
  }

  const fixedCount = originalConstraints.filter((item) =>
    item.fixed || (item.if_pos || []).some((flag) => Number(flag) === 0)
  ).length;

  el.textContent = fixedCount > 0
    ? `Fixed atoms: ${fixedCount} highlighted`
    : "Fixed atoms: none in input file";
}

function enableMiddleMousePan(containerId) {
  const el = document.getElementById(containerId);
  if (!el || el.dataset.middlePanBound === "true") return;

  const preventAutoScroll = (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  };

  el.addEventListener("mousedown", preventAutoScroll);
  el.addEventListener("auxclick", preventAutoScroll);
  el.dataset.middlePanBound = "true";
}

function updateSyncViewsButton() {
  const button = document.getElementById("syncViewsToggle");
  if (!button) return;
  button.textContent = `Sync Views: ${syncViewsEnabled ? "On" : "Off"}`;
}

function applyViewerLinkState() {
  if (!viewer || !originalViewer) return;
  const syncedViewers = [viewer, originalViewer].filter(Boolean);
  if (!syncViewsEnabled) {
    syncedViewers.forEach((targetViewer) => targetViewer.setViewChangeCallback(null));
    return;
  }

  syncedViewers.forEach((sourceViewer) => {
    sourceViewer.setViewChangeCallback((view) => {
      if (isApplyingSyncedView) return;
      isApplyingSyncedView = true;
      syncedViewers.forEach((targetViewer) => {
        if (targetViewer !== sourceViewer) targetViewer.setView(view, true);
      });
      isApplyingSyncedView = false;
    });
  });
}

function useTrajectoryAsOriginalFallback() {
  if (!trajectoryFrames.length) return;
  originalStructure = trajectoryFrames[0].xyz;
  if (!originalLattice) {
    originalLattice = currentLattice;
  }
  if (!originalInputFile) {
    originalInputFile = "fallback from trajectory.xyz step 1";
  }
}

function initViewer() {
  if (!viewer) {
    viewer = $3Dmol.createViewer("viewer", { backgroundColor: "white" });
    window.addEventListener("resize", () => {
      if (viewer) {
        viewer.resize();
        viewer.render();
      }
      if (originalViewer) {
        originalViewer.resize();
        originalViewer.render();
      }
    });
  }

  if (!originalViewer) {
    originalViewer = $3Dmol.createViewer("originalViewer", { backgroundColor: "white" });
  }

  enableMiddleMousePan("viewer");
  enableMiddleMousePan("originalViewer");
  applyViewerLinkState();
  updateSyncViewsButton();
  updateChargeToggleButton();
}

function formatAtomLabel(atom) {
  const elem = atom.elem || atom.atom || "Atom";
  const idx = atom.serial ?? atom.index;
  return idx !== undefined ? `${elem}${idx}` : elem;
}

function distanceBetweenAtoms(atomA, atomB) {
  const dx = atomA.x - atomB.x;
  const dy = atomA.y - atomB.y;
  const dz = atomA.z - atomB.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function updateMeasurementStatus(message) {
  const el = document.getElementById("measureStatus");
  if (el) el.textContent = message;
}

function getMeasurementViewer(which) {
  return which === "original" ? originalViewer : viewer;
}

function clearMeasurement(which = null) {
  const keys = which ? [which] : Object.keys(measurementState);

  for (const key of keys) {
    const targetViewer = getMeasurementViewer(key);
    const state = measurementState[key];
    state.atoms = [];

    if (targetViewer) {
      for (const label of state.labels) {
        targetViewer.removeLabel(label);
      }
      if (state.line) {
        targetViewer.removeShape(state.line);
      }
      targetViewer.render();
    }

    state.labels = [];
    state.line = null;
  }

  updateMeasurementStatus(measureMode ? "Select atom 1 of 2" : "Measurement off");
}

function updateChargeToggleButton() {
  const button = document.getElementById("chargeToggle");
  if (!button) return;
  button.textContent = `Delta Charge: ${chargeMode ? "On" : "Off"}`;
}

function updateCurrentChargeStatus(message = null) {
  const el = document.getElementById("currentChargeStatus");
  if (!el) return;

  if (message) {
    el.textContent = message;
  } else if (hasBaderChargeChanges) {
    const selectedCount = chargeSelections.size;
    if (selectedCount) {
      el.textContent = `Delta charge: ${selectedCount} atom${selectedCount === 1 ? "" : "s"} labeled.`;
    } else {
      el.textContent = chargeMode
        ? "Delta charge mode on: click atoms in the current structure."
        : "Delta charge mode off.";
    }
  } else {
    el.textContent = "Delta charge: no Bader charge changes found for this job.";
  }
}

function clearChargeSelections(render = true) {
  if (viewer) {
    for (const selection of chargeSelections.values()) {
      if (selection.marker) viewer.removeShape(selection.marker);
      if (selection.label) viewer.removeLabel(selection.label);
    }
    if (render) viewer.render();
  }
  chargeSelections.clear();
  updateCurrentChargeStatus();
}

function resolveClickedChargeAtomIndex(atom) {
  if (!atom || !baderChargeChanges.length) return null;
  const nat = baderChargeChanges.length;
  const candidates = [atom.serial, atom.index]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));

  for (const value of candidates) {
    if (value >= 1 && value <= nat) return value;
  }

  for (const value of candidates) {
    if (value >= 0) return (value % nat) + 1;
  }

  return null;
}

function handleChargeClick(atom) {
  if (!chargeMode || measureMode || !hasBaderChargeChanges || !viewer || !atom) return;

  const atomIndex = resolveClickedChargeAtomIndex(atom);
  const entry = baderChargeChanges.find((item) => item.atomIndex === atomIndex);
  if (!entry) {
    updateCurrentChargeStatus(`Delta charge: no value found for ${formatAtomLabel(atom)}.`);
    return;
  }

  if (chargeSelections.has(atomIndex)) {
    const existing = chargeSelections.get(atomIndex);
    if (existing.marker) viewer.removeShape(existing.marker);
    if (existing.label) viewer.removeLabel(existing.label);
    chargeSelections.delete(atomIndex);
    updateCurrentChargeStatus();
    viewer.render();
    return;
  }

  const maxAbsDelta = Math.max(...baderChargeChanges.map((item) => Math.abs(item.deltaCharge)).filter(Number.isFinite), 0);
  const color = getDeltaChargeColor(entry.deltaCharge, maxAbsDelta);
  chargeSelections.set(atomIndex, {
    atomIndex,
    element: entry.element || atom.elem || "Atom",
    deltaCharge: entry.deltaCharge,
    marker: viewer.addSphere({
      center: { x: atom.x, y: atom.y, z: atom.z },
      radius: 0.78,
      color,
      alpha: 0.42
    }),
    label: viewer.addLabel(formatDeltaCharge(entry.deltaCharge), {
      position: { x: atom.x, y: atom.y, z: atom.z + 0.45 },
      inFront: true,
      backgroundColor: "#111827",
      fontColor: "white",
      backgroundOpacity: 0.95,
      fontSize: 13
    })
  });

  updateCurrentChargeStatus();
  viewer.render();
}

function handleMeasurementClick(which, atom) {
  if (!measureMode || !atom) return;
  const targetViewer = getMeasurementViewer(which);
  const state = measurementState[which];
  if (!targetViewer || !state) return;

  if (state.atoms.length === 2) {
    clearMeasurement(which);
  }

  state.atoms.push({
    index: atom.index,
    serial: atom.serial,
    elem: atom.elem,
    x: atom.x,
    y: atom.y,
    z: atom.z
  });

  const pickNumber = state.atoms.length;
  const marker = targetViewer.addLabel(`${pickNumber}: ${formatAtomLabel(atom)}`, {
    position: { x: atom.x, y: atom.y, z: atom.z },
    backgroundColor: "#111827",
    fontColor: "white",
    backgroundOpacity: 0.85,
    fontSize: 12
  });
  state.labels.push(marker);

  if (state.atoms.length === 1) {
    updateMeasurementStatus(`Select atom 2 of 2 (${which} structure)`);
    targetViewer.render();
    return;
  }

  const [atomA, atomB] = state.atoms;
  const distance = distanceBetweenAtoms(atomA, atomB);
  state.line = targetViewer.addLine({
    start: { x: atomA.x, y: atomA.y, z: atomA.z },
    end: { x: atomB.x, y: atomB.y, z: atomB.z },
    color: "#7c3aed",
    linewidth: 3,
    dashed: true
  });

  const midpoint = {
    x: (atomA.x + atomB.x) / 2,
    y: (atomA.y + atomB.y) / 2,
    z: (atomA.z + atomB.z) / 2
  };
  const distanceLabel = targetViewer.addLabel(`${distance.toFixed(3)} A`, {
    position: midpoint,
    backgroundColor: "#7c3aed",
    fontColor: "white",
    backgroundOpacity: 0.9,
    fontSize: 12
  });
  state.labels.push(distanceLabel);
  updateMeasurementStatus(`Distance (${which}): ${distance.toFixed(3)} A`);
  targetViewer.render();
}

function parseXYZTrajectory(xyzText) {
  const lines = xyzText.split(/\r?\n/);
  const frames = [];
  let i = 0;

  while (i < lines.length) {
    const nat = parseInt((lines[i] || "").trim(), 10);
    if (Number.isNaN(nat) || nat <= 0) {
      i++;
      continue;
    }

    const comment = lines[i + 1] || "";
    const atomLines = [];
    for (let j = 0; j < nat; j++) {
      const line = lines[i + 2 + j];
      if (line && line.trim()) atomLines.push(line);
    }

    if (atomLines.length === nat) {
      frames.push({
        nat,
        comment,
        xyz: `${nat}\n${comment}\n${atomLines.join("\n")}\n`
      });
    }

    i += nat + 2;
  }

  return frames;
}

function parseXYZAtoms(xyzText) {
  const lines = xyzText.split(/\r?\n/);
  const nat = parseInt((lines[0] || "").trim(), 10);
  if (Number.isNaN(nat) || nat <= 0) return [];

  const atoms = [];
  for (let i = 0; i < nat; i++) {
    const parts = (lines[i + 2] || "").trim().split(/\s+/);
    if (parts.length < 4) continue;

    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

    atoms.push({ index: i + 1, elem: parts[0], x, y, z });
  }

  return atoms;
}

function formatBondDistance(value) {
  return `${Number(value).toFixed(2)} A`;
}

function updateBondDistanceLabel() {
  const slider = document.getElementById("bondDistanceSlider");
  if (slider) slider.value = String(maxBondDistance);
  const el = document.getElementById("bondDistanceValue");
  if (el) el.textContent = formatBondDistance(maxBondDistance);
}

function addBondBetweenAtoms(atomA, atomAIndex, atomB, atomBIndex, bondOrder = 1) {
  if (!atomA || !atomB || atomAIndex === atomBIndex) return;

  atomA.bonds = Array.isArray(atomA.bonds) ? atomA.bonds : [];
  atomA.bondOrder = Array.isArray(atomA.bondOrder) ? atomA.bondOrder : [];
  atomB.bonds = Array.isArray(atomB.bonds) ? atomB.bonds : [];
  atomB.bondOrder = Array.isArray(atomB.bondOrder) ? atomB.bondOrder : [];

  if (!atomA.bonds.includes(atomBIndex)) {
    atomA.bonds.push(atomBIndex);
    atomA.bondOrder.push(bondOrder);
  }

  if (!atomB.bonds.includes(atomAIndex)) {
    atomB.bonds.push(atomAIndex);
    atomB.bondOrder.push(bondOrder);
  }
}

function addDashedBondCylinder(targetViewer, start, end, color) {
  if (!targetViewer || !start || !end) return;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!Number.isFinite(length) || length <= 0) return;

  const ux = dx / length;
  const uy = dy / length;
  const uz = dz / length;
  const stride = WEAK_ADSORPTION_DASH_LENGTH + WEAK_ADSORPTION_GAP_LENGTH;

  for (let offset = 0; offset < length; offset += stride) {
    const dashStart = offset;
    const dashEnd = Math.min(offset + WEAK_ADSORPTION_DASH_LENGTH, length);
    if (dashEnd <= dashStart) continue;

    targetViewer.addCylinder({
      start: {
        x: start.x + ux * dashStart,
        y: start.y + uy * dashStart,
        z: start.z + uz * dashStart
      },
      end: {
        x: start.x + ux * dashEnd,
        y: start.y + uy * dashEnd,
        z: start.z + uz * dashEnd
      },
      radius: WEAK_ADSORPTION_DASH_RADIUS,
      color
    });
  }
}

function getAdsorptionPairCutoff(atomA, atomB, maxDistance) {
  const cutoff = Number(maxDistance);
  const elemA = normalizeElementSymbol(atomA.elem);
  const elemB = normalizeElementSymbol(atomB.elem);
  const radiusA = COVALENT_RADII[elemA] || DEFAULT_COVALENT_RADIUS;
  const radiusB = COVALENT_RADII[elemB] || DEFAULT_COVALENT_RADIUS;
  return Math.min(cutoff, radiusA + radiusB + BOND_TOLERANCE);
}

function addAdsorptionMetalContacts(targetViewer, atoms, maxDistance) {
  const cutoff = Number(maxDistance);
  if (!targetViewer || !Array.isArray(atoms) || !atoms.length || !Number.isFinite(cutoff) || cutoff <= 0) {
    return;
  }

  const maxDistanceSq = cutoff * cutoff;
  const weakLinePairs = new Set();
  for (let i = 0; i < atoms.length; i++) {
    const atomA = atoms[i];
    const elemA = normalizeElementSymbol(atomA.elem);
    if (!ADSORBATE_BOND_ELEMENTS.has(elemA)) continue;

    for (let j = 0; j < atoms.length; j++) {
      if (i === j) continue;
      const atomB = atoms[j];
      const elemB = normalizeElementSymbol(atomB.elem);
      if (!METAL_ELEMENTS.has(elemB)) continue;

      const dx = atomA.x - atomB.x;
      const dy = atomA.y - atomB.y;
      const dz = atomA.z - atomB.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq > maxDistanceSq) continue;

      const strongCutoff = getAdsorptionPairCutoff(atomA, atomB, cutoff);
      if (distanceSq <= strongCutoff * strongCutoff) {
        addBondBetweenAtoms(atomA, i, atomB, j, 1);
      } else {
        const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (weakLinePairs.has(pairKey)) continue;
        weakLinePairs.add(pairKey);
        addDashedBondCylinder(
          targetViewer,
          { x: atomA.x, y: atomA.y, z: atomA.z },
          { x: atomB.x, y: atomB.y, z: atomB.z },
          WEAK_ADSORPTION_LINE_COLOR
        );
      }
    }
  }
}

function addStructureModel(targetViewer, xyzText, matrix) {
  if (!targetViewer || !xyzText) return;
  const model = targetViewer.addModel(
    buildDisplayXYZ(xyzText, matrix, `Structure | ${cellRepeat.x} x ${cellRepeat.y} x ${cellRepeat.z}`),
    "xyz"
  );
  const atoms = model.selectedAtoms({});
  addAdsorptionMetalContacts(targetViewer, atoms, maxBondDistance);
  model.setColorByElement({}, getColorScheme());
}

function normalizeElementSymbol(elem) {
  const clean = String(elem ?? "").trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function getDisplayedElementTypes() {
  const seen = new Set();
  const ordered = [];

  const addAtomList = (atoms) => {
    for (const atom of atoms) {
      const elem = normalizeElementSymbol(atom.elem);
      if (!elem || seen.has(elem)) continue;
      seen.add(elem);
      ordered.push(elem);
    }
  };

  if (originalStructure) addAtomList(parseXYZAtoms(originalStructure));
  if (trajectoryFrames.length) addAtomList(parseXYZAtoms(trajectoryFrames[trajectoryFrames.length - 1].xyz));

  return ordered;
}

function createFallbackElementColor(index, total) {
  if (index < EXTRA_ELEMENT_PALETTE.length) return EXTRA_ELEMENT_PALETTE[index];
  const hue = Math.round((360 / Math.max(total, 1)) * index) % 360;
  return `hsl(${hue}, 68%, 52%)`;
}

function renderAtomLegend() {
  const legendBox = document.getElementById("legendBox");
  if (!legendBox) return;

  const colorScheme = getColorScheme();
  const atomTypes = getDisplayedElementTypes();
  const legendItems = atomTypes.map((elem) => {
    const color = colorScheme[elem];
    const swatchStyle = [
      "width:14px",
      "height:14px",
      `background:${color}`,
      "border:1px solid #444",
      "display:inline-block"
    ].join(";");
    return `
      <span style="display:inline-flex;align-items:center;gap:6px;margin-left:10px;">
        <span style="${swatchStyle}"></span> ${escapeHTML(elem)}
      </span>
    `;
  }).join("");

  legendBox.innerHTML = `
    <b>Atom colors:</b>
    ${legendItems}
    <span style="display:inline-flex;align-items:center;gap:6px;margin-left:10px;">
      <span style="width:14px;height:14px;background:${FIXED_ATOM_COLOR};border:1px solid #444;display:inline-block;"></span> Fixed atom
    </span>
    <span style="display:inline-flex;align-items:center;gap:6px;margin-left:10px;">
      <span style="width:18px;height:0;border-top:2px dashed ${WEAK_ADSORPTION_LINE_COLOR};display:inline-block;"></span> Weak adsorption bond
    </span>
  `;
}

function buildFixedAtomMarkers(xyzText, matrix, constraints) {
  if (!xyzText || !Array.isArray(constraints) || !constraints.length) return [];

  const baseAtoms = parseXYZAtoms(xyzText);
  if (!baseAtoms.length) return [];

  const fixedByIndex = new Map(
    constraints
      .filter((item) => item.fixed || (item.if_pos || []).some((flag) => Number(flag) === 0))
      .map((item) => [Number(item.index), item])
  );
  if (!fixedByIndex.size) return [];

  const markers = [];
  const a = matrix?.[0] || [0, 0, 0];
  const b = matrix?.[1] || [0, 0, 0];
  const c = matrix?.[2] || [0, 0, 0];
  const repeatX = matrix ? cellRepeat.x : 1;
  const repeatY = matrix ? cellRepeat.y : 1;
  const repeatZ = matrix ? cellRepeat.z : 1;

  for (let ix = 0; ix < repeatX; ix++) {
    for (let iy = 0; iy < repeatY; iy++) {
      for (let iz = 0; iz < repeatZ; iz++) {
        const dx = ix * a[0] + iy * b[0] + iz * c[0];
        const dy = ix * a[1] + iy * b[1] + iz * c[1];
        const dz = ix * a[2] + iy * b[2] + iz * c[2];

        for (const atom of baseAtoms) {
          const constraint = fixedByIndex.get(atom.index);
          if (!constraint) continue;
          markers.push({
            elem: atom.elem,
            index: atom.index,
            if_pos: constraint.if_pos || [1, 1, 1],
            x: atom.x + dx,
            y: atom.y + dy,
            z: atom.z + dz
          });
        }
      }
    }
  }

  return markers;
}

function addFixedAtomGlow(targetViewer, xyzText, matrix, constraints) {
  const markers = buildFixedAtomMarkers(xyzText, matrix, constraints);
  if (!markers.length) return;

  const alpha = Math.max(0, Math.min(1, 1 - FIXED_GLOW_TRANSPARENCY / 100));
  if (alpha <= 0) return;

  for (const marker of markers) {
    const center = { x: marker.x, y: marker.y, z: marker.z };
    targetViewer.addSphere({
      center,
      radius: 0.78,
      color: FIXED_ATOM_COLOR,
      alpha
    });
    targetViewer.addSphere({
      center,
      radius: 0.48,
      color: "#fff176",
      alpha: Math.min(1, alpha * 0.82)
    });
  }
}

function savedViewStorageKey() {
  return `qeJobViewer.savedView.${currentJob || "default"}`;
}

function getSavedView() {
  try {
    const raw = localStorage.getItem(savedViewStorageKey());
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function applySavedOrDefaultView(targetViewer) {
  if (!targetViewer) return;

  const savedView = getSavedView();
  if (savedView) {
    targetViewer.setView(savedView);
  } else {
    targetViewer.zoomTo();
    targetViewer.rotate(-90, "x");
  }
}

function saveCurrentView() {
  const sourceViewer = viewer || originalViewer;
  if (!sourceViewer) return;

  try {
    localStorage.setItem(savedViewStorageKey(), JSON.stringify(sourceViewer.getView()));
    updateViewSaveStatus("Saved view");
  } catch (e) {
    updateViewSaveStatus("Could not save view");
  }
}

function clearSavedView() {
  try {
    localStorage.removeItem(savedViewStorageKey());
    updateViewSaveStatus("Saved view cleared");
  } catch (e) {
    updateViewSaveStatus("Could not clear view");
  }
  renderFrame(currentStep, false);
  renderOriginalStructure(false);
}

function updateViewSaveStatus(message) {
  const el = document.getElementById("viewSaveStatus");
  if (el) el.textContent = message;
}

function buildXYZFromAtoms(atoms, comment = "Generated structure") {
  return `${atoms.length}\n${comment}\n${atoms.map(atom =>
    `${atom.elem} ${atom.x.toFixed(10)} ${atom.y.toFixed(10)} ${atom.z.toFixed(10)}`
  ).join("\n")}\n`;
}

function scaleVector(vector, factor) {
  return vector.map(value => value * factor);
}

function getDisplayLattice(matrix) {
  if (!matrix) return null;
  return [
    scaleVector(matrix[0], cellRepeat.x),
    scaleVector(matrix[1], cellRepeat.y),
    scaleVector(matrix[2], cellRepeat.z)
  ];
}

function buildDisplayXYZ(xyzText, matrix, comment) {
  if (!xyzText || !matrix) return xyzText;
  if (cellRepeat.x === 1 && cellRepeat.y === 1 && cellRepeat.z === 1) return xyzText;

  const atoms = parseXYZAtoms(xyzText);
  if (!atoms.length) return xyzText;

  const expandedAtoms = [];
  const a = matrix[0];
  const b = matrix[1];
  const c = matrix[2];

  for (let ix = 0; ix < cellRepeat.x; ix++) {
    for (let iy = 0; iy < cellRepeat.y; iy++) {
      for (let iz = 0; iz < cellRepeat.z; iz++) {
        const dx = ix * a[0] + iy * b[0] + iz * c[0];
        const dy = ix * a[1] + iy * b[1] + iz * c[1];
        const dz = ix * a[2] + iy * b[2] + iz * c[2];

        for (const atom of atoms) {
          expandedAtoms.push({
            elem: atom.elem,
            x: atom.x + dx,
            y: atom.y + dy,
            z: atom.z + dz
          });
        }
      }
    }
  }

  return buildXYZFromAtoms(expandedAtoms, comment);
}

function getColorScheme() {
  const atomTypes = getDisplayedElementTypes();
  const colorScheme = {};
  let fallbackIndex = 0;
  const unknownCount = atomTypes.filter((elem) => !KNOWN_ELEMENT_COLORS[elem]).length;

  for (const elem of atomTypes) {
    if (KNOWN_ELEMENT_COLORS[elem]) {
      colorScheme[elem] = KNOWN_ELEMENT_COLORS[elem];
      continue;
    }

    colorScheme[elem] = createFallbackElementColor(fallbackIndex, unknownCount);
    fallbackIndex += 1;
  }

  return colorScheme;
}

function applyStyleToViewer(targetViewer) {
  if (!targetViewer) return;
  const colorScheme = getColorScheme();

  if (currentStyle === "stick") {
    targetViewer.setStyle({}, {
      stick: { radius: 0.18, colorscheme: colorScheme }
    });
  } else if (currentStyle === "sphere") {
    targetViewer.setStyle({}, {
      sphere: { scale: 0.60, colorscheme: colorScheme }
    });
  } else {
    targetViewer.setStyle({}, {
      stick: { radius: 0.16, colorscheme: colorScheme },
      sphere: { scale: 0.32, colorscheme: colorScheme }
    });
  }
}

function getDeltaChargeColor(value, maxAbsDelta) {
  const magnitude = maxAbsDelta > 0 ? Math.min(Math.abs(value) / maxAbsDelta, 1) : 0;
  if (Math.abs(value) < 1e-12) return DELTA_CHARGE_NEUTRAL_COLOR;

  const strong = value > 0 ? DELTA_CHARGE_POSITIVE_COLOR : DELTA_CHARGE_NEGATIVE_COLOR;
  const weak = value > 0 ? "#fecaca" : "#bfdbfe";
  return magnitude > 0.66 ? strong : weak;
}

function formatDeltaCharge(value) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${num >= 0 ? "+" : ""}${num.toFixed(4)} e`;
}

function addLatticeBox(targetViewer, matrix) {
  if (!matrix || !showCell) return;

  const a = matrix[0];
  const b = matrix[1];
  const c = matrix[2];

  const O   = { x: 0, y: 0, z: 0 };
  const A   = { x: a[0], y: a[1], z: a[2] };
  const B   = { x: b[0], y: b[1], z: b[2] };
  const C   = { x: c[0], y: c[1], z: c[2] };
  const AB  = { x: a[0] + b[0], y: a[1] + b[1], z: a[2] + b[2] };
  const AC  = { x: a[0] + c[0], y: a[1] + c[1], z: a[2] + c[2] };
  const BC  = { x: b[0] + c[0], y: b[1] + c[1], z: b[2] + c[2] };
  const ABC = { x: a[0] + b[0] + c[0], y: a[1] + b[1] + c[1], z: a[2] + b[2] + c[2] };

  const edges = [
    [O, A], [O, B], [O, C],
    [A, AB], [A, AC],
    [B, AB], [B, BC],
    [C, AC], [C, BC],
    [AB, ABC], [AC, ABC], [BC, ABC]
  ];

  for (const [p1, p2] of edges) {
    targetViewer.addLine({
      start: p1,
      end: p2,
      color: "black",
      linewidth: 2
    });
  }
}

function addAxes(targetViewer, matrix) {
  if (!showAxes || !matrix) return;

  const a = matrix[0];
  const b = matrix[1];
  const c = matrix[2];

  const O = { x: 0, y: 0, z: 0 };
  const A = { x: a[0], y: a[1], z: a[2] };
  const B = { x: b[0], y: b[1], z: b[2] };
  const C = { x: c[0], y: c[1], z: c[2] };

  targetViewer.addArrow({ start: O, end: A, radius: 0.08, color: "red" });
  targetViewer.addArrow({ start: O, end: B, radius: 0.08, color: "green" });
  targetViewer.addArrow({ start: O, end: C, radius: 0.08, color: "blue" });

  targetViewer.addLabel("a", {
    position: A,
    fontColor: "red",
    backgroundOpacity: 0
  });
  targetViewer.addLabel("b", {
    position: B,
    fontColor: "green",
    backgroundOpacity: 0
  });
  targetViewer.addLabel("c", {
    position: C,
    fontColor: "blue",
    backgroundOpacity: 0
  });
}

function renderOriginalStructure(preserveView = false) {
  initViewer();

  if (!originalStructure) {
    originalViewer.clear();
    originalViewer.addLabel("Original input structure not available.", {
      position: { x: 0, y: 0, z: 0 },
      inFront: true,
      fontSize: 16,
      backgroundColor: "white",
      fontColor: "#374151",
      backgroundOpacity: 0.9
    });
    originalViewer.zoomTo();
    originalViewer.render();
    return;
  }

  let savedView = null;
  if (preserveView && originalViewer) savedView = originalViewer.getView();

  originalViewer.clear();
  addStructureModel(originalViewer, originalStructure, originalLattice);
  clearMeasurement("original");
  originalViewer.setClickable({}, true, function(atom) {
    handleMeasurementClick("original", atom);
  });
  applyStyleToViewer(originalViewer);
  addFixedAtomGlow(originalViewer, originalStructure, originalLattice, originalConstraints);
  addLatticeBox(originalViewer, getDisplayLattice(originalLattice));
  addAxes(originalViewer, getDisplayLattice(originalLattice));

  if (preserveView && savedView) {
    originalViewer.setView(savedView);
  } else {
    applySavedOrDefaultView(originalViewer);
  }

  originalViewer.resize();
  originalViewer.render();
}

function updateDeltaChargeStatus() {
  updateChargeToggleButton();
  updateCurrentChargeStatus();
}

function renderFrame(index, preserveView = false) {
  if (!trajectoryFrames.length) return;

  currentStep = Math.max(0, Math.min(index, trajectoryFrames.length - 1));
  const frame = trajectoryFrames[currentStep];

  initViewer();

  let savedView = null;
  if (preserveView) savedView = viewer.getView();

  clearChargeSelections(false);
  viewer.clear();
  addStructureModel(viewer, frame.xyz, currentLattice);
  clearMeasurement("current");
  viewer.setClickable({}, true, function(atom) {
    handleChargeClick(atom);
    handleMeasurementClick("current", atom);
  });

  applyStyleToViewer(viewer);
  addLatticeBox(viewer, getDisplayLattice(currentLattice));
  addAxes(viewer, getDisplayLattice(currentLattice));

  if (preserveView && savedView) {
    viewer.setView(savedView);
  } else {
    applySavedOrDefaultView(viewer);
  }

  viewer.resize();
  viewer.render();
  updateDeltaChargeStatus();

  const slider = document.getElementById("stepSlider");
  slider.max = trajectoryFrames.length;
  slider.value = currentStep + 1;

  document.getElementById("stepLabel").textContent =
    `Step: ${currentStep + 1} / ${trajectoryFrames.length}`;
}

function setBallStick() {
  currentStyle = "ballstick";
  renderFrame(currentStep, true);
  renderOriginalStructure(true);
}

function setStick() {
  currentStyle = "stick";
  renderFrame(currentStep, true);
  renderOriginalStructure(true);
}

function setSphere() {
  currentStyle = "sphere";
  renderFrame(currentStep, true);
  renderOriginalStructure(true);
}

function toggleCell() {
  showCell = !showCell;
  renderFrame(currentStep, true);
  renderOriginalStructure(true);
}

function changeCellRepeat(value) {
  cellRepeat = value === "2x2x1"
    ? { x: 2, y: 2, z: 1 }
    : { x: 1, y: 1, z: 1 };
  renderFrame(currentStep, false);
  renderOriginalStructure(false);
}

function toggleAxes() {
  showAxes = !showAxes;
  renderFrame(currentStep, true);
  renderOriginalStructure(true);
}

function setBondDistance(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return;
  maxBondDistance = parsed;
  updateBondDistanceLabel();
  renderFrame(currentStep, true);
  renderOriginalStructure(true);
}

function resetView() {
  if (viewer) renderFrame(currentStep, false);
  if (originalViewer) renderOriginalStructure(false);
}

function toggleSyncViews() {
  syncViewsEnabled = !syncViewsEnabled;
  applyViewerLinkState();
  updateSyncViewsButton();
}

function toggleMeasureMode() {
  measureMode = !measureMode;
  if (measureMode && chargeMode) {
    chargeMode = false;
    updateChargeToggleButton();
    updateCurrentChargeStatus();
  }
  const button = document.getElementById("measureToggle");
  if (button) {
    button.textContent = measureMode ? "Exit Measure" : "Measure Distance";
  }
  clearMeasurement();
}

function toggleChargeMode() {
  if (!hasBaderChargeChanges) {
    chargeMode = false;
    updateChargeToggleButton();
    updateCurrentChargeStatus();
    return;
  }

  chargeMode = !chargeMode;
  if (chargeMode && measureMode) {
    measureMode = false;
    const measureButton = document.getElementById("measureToggle");
    if (measureButton) measureButton.textContent = "Measure Distance";
    clearMeasurement();
  }
  updateChargeToggleButton();
  updateCurrentChargeStatus();
}

function goFirst() {
  renderFrame(0);
}

function goLast() {
  renderFrame(trajectoryFrames.length - 1);
}

function prevStep() {
  if (currentStep > 0) renderFrame(currentStep - 1);
}

function nextStep() {
  if (currentStep < trajectoryFrames.length - 1) renderFrame(currentStep + 1);
}

function goToStep(stepNumber) {
  renderFrame(stepNumber - 1);
}



function parseSeriesCSV(csv) {
  const lines = csv.trim().split("\n");
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const [step, value] = lines[i].split(",");
    const s = Number(step);
    const v = Number(value);
    if (!Number.isNaN(s) && !Number.isNaN(v)) {
      data.push({ step: s, value: v });
    }
  }
  return data;
}

function parseNebProfileCSV(csv) {
  return csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [coordinate, energy, error] = line.split(",");
    return {
      coordinate: Number(coordinate),
      energy: Number(energy),
      error: error === "" ? null : Number(error)
    };
  }).filter((point) => Number.isFinite(point.coordinate) && Number.isFinite(point.energy));
}

function renderNebProfile(points, job) {
  const card = document.getElementById("nebProfileCard");
  if (!card) return;
  card.hidden = points.length === 0;
  if (nebProfileChart) nebProfileChart.destroy();
  nebProfileChart = null;
  if (!points.length) return;

  const peak = points.reduce((best, point) => point.energy > best.energy ? point : best);
  const forwardActivationEnergy = peak.energy - points[0].energy;
  const reactionEnergy = points.at(-1).energy;
  const reverseActivationEnergy = peak.energy - reactionEnergy;
  document.getElementById("nebProfileSummary").textContent =
    `Activation energy (forward): ${forwardActivationEnergy.toFixed(3)} eV · ` +
    `Activation energy (reverse): ${reverseActivationEnergy.toFixed(3)} eV · ` +
    `Transition-state coordinate: ${peak.coordinate.toFixed(3)} · ` +
    `Reaction energy: ${reactionEnergy.toFixed(3)} eV · ${points.length} images`;

  nebProfileChart = new Chart(document.getElementById("nebProfileChart").getContext("2d"), {
    type: "line",
    data: {
      datasets: [{
        label: "Relative energy (eV)",
        data: points.map((point) => ({ x: point.coordinate, y: point.energy })),
        borderColor: "#7c3aed",
        backgroundColor: "#7c3aed",
        pointRadius: 5,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      parsing: false,
      scales: {
        x: { type: "linear", title: { display: true, text: "Reaction coordinate" } },
        y: { title: { display: true, text: "Relative energy (eV)" } }
      },
      plugins: {
        tooltip: {
          callbacks: {
            afterLabel(context) {
              const error = points[context.dataIndex]?.error;
              return Number.isFinite(error) ? `Path error: ${error.toFixed(3)} eV/A` : "";
            }
          }
        }
      }
    }
  });
}

function parseCSVLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value.trim());
  return values;
}

function findHeaderIndex(headers, names) {
  return headers.findIndex((header) => names.includes(header));
}

function parseBaderChargeChangesCSV(csv) {
  const lines = csv.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((header) =>
    header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  );
  let atomIndexCol = findHeaderIndex(headers, ["atom", "atom_index", "index", "atom_id", "id", "serial"]);
  let elementCol = findHeaderIndex(headers, ["element", "elem", "symbol", "atom_symbol"]);
  let deltaCol = findHeaderIndex(headers, [
    "delta_charge",
    "charge_delta",
    "d_charge",
    "dq",
    "delta",
    "change",
    "bader_charge_change",
    "charge_change"
  ]);

  if (deltaCol < 0) {
    deltaCol = headers.findIndex((header) => header.includes("delta") || header.includes("change"));
  }

  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const columns = parseCSVLine(lines[i]);
    const numericColumns = columns
      .map((value, index) => ({ index, value: Number(value) }))
      .filter((item) => Number.isFinite(item.value));

    if (atomIndexCol < 0 || deltaCol < 0) {
      if (atomIndexCol < 0 && numericColumns.length > 1) atomIndexCol = numericColumns[0].index;
      if (deltaCol < 0 && numericColumns.length > 1) deltaCol = numericColumns[numericColumns.length - 1].index;
    }

    const atomIndex = atomIndexCol >= 0 ? Number.parseInt(columns[atomIndexCol], 10) : i;
    const deltaCharge = deltaCol >= 0
      ? Number(columns[deltaCol])
      : numericColumns[numericColumns.length - 1]?.value;
    if (!Number.isFinite(atomIndex) || !Number.isFinite(deltaCharge)) continue;

    entries.push({
      atomIndex,
      element: elementCol >= 0 ? columns[elementCol] : null,
      deltaCharge
    });
  }

  return entries;
}

function parseAxisValue(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return undefined;
  const value = input.value.trim();
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getAxisBounds(chartKey) {
  const ids = chartControlIds[chartKey];
  if (!ids) return null;

  return {
    x: {
      min: parseAxisValue(ids.xMin),
      max: parseAxisValue(ids.xMax)
    },
    y: {
      min: parseAxisValue(ids.yMin),
      max: parseAxisValue(ids.yMax)
    }
  };
}

function parseRangePercent(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return 10;
  const parsed = Number(input.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function getAutoYBounds(data, rangePercent, targetValue = null) {
  const values = data.map(point => point.value);
  if (targetValue !== null && Number.isFinite(targetValue)) {
    values.push(targetValue);
  }
  if (values.length === 0) return {};

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue;

  if (span === 0) {
    const padding = Math.abs(minValue) > 0 ? Math.abs(minValue) * 0.1 : 1;
    return {
      min: minValue - padding,
      max: maxValue + padding
    };
  }

  const clampedPercent = Math.max(0, Math.min(rangePercent, 100));
  if (clampedPercent === 100) {
    return {
      min: minValue,
      max: maxValue
    };
  }

  const rangeFromMin = Math.abs(minValue) > 0
    ? Math.abs(minValue) * (clampedPercent / 100)
    : span * (clampedPercent / 100);

  return {
    min: minValue,
    max: minValue + rangeFromMin
  };
}

function resetAxisInputs(chartKey) {
  const ids = chartControlIds[chartKey];
  if (!ids) return;

  [ids.xMin, ids.xMax, ids.yMin, ids.yMax].forEach((inputId) => {
    const input = document.getElementById(inputId);
    if (input) input.value = "";
  });
}

function redrawCharts() {
  const chartStates = {
    energy: { data: energySeriesData, chart: energyChart },
    gradient: { data: gradientSeriesData, chart: gradientChart, targetValue: gradientTargetValue },
    scfAccuracy: { data: scfAccuracySeriesData, chart: scfAccuracyChart }
  };

  for (const [chartKey, state] of Object.entries(chartStates)) {
    const definition = CHART_DEFINITIONS[chartKey];
    const nextChart = state.data.length > 0
      ? drawSeriesChart(
          chartKey,
          definition.canvasId,
          state.chart,
          state.data,
          definition.label,
          definition.color,
          definition.yTitle,
          state.targetValue ?? null,
          definition.targetLabel ?? null,
          getAxisBounds(chartKey),
          definition.scientificTicks === true
        )
      : destroyChart(state.chart);

    if (chartKey === "energy") energyChart = nextChart;
    if (chartKey === "gradient") gradientChart = nextChart;
    if (chartKey === "scfAccuracy") scfAccuracyChart = nextChart;
  }
}

function bindChartControls() {
  if (chartControlsBound) return;

  Object.keys(chartControlIds).forEach((chartKey) => {
    const ids = chartControlIds[chartKey];

    [ids.xMin, ids.xMax, ids.yMin, ids.yMax].forEach((inputId) => {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener("change", redrawCharts);
    });

    const resetButton = document.getElementById(ids.reset);
    if (resetButton) {
      resetButton.addEventListener("click", () => {
        resetAxisInputs(chartKey);
        redrawCharts();
      });
    }

    const yRangeSelect = document.getElementById(ids.yRangePercent);
    if (yRangeSelect) {
      yRangeSelect.addEventListener("change", redrawCharts);
    }
  });

  chartControlsBound = true;
}

function destroyChart(existingChart) {
  if (existingChart) existingChart.destroy();
  return null;
}

function drawSeriesChart(chartKey, canvasId, existingChart, data, label, color, yTitle, targetValue = null, targetLabel = null, axisBounds = null, scientificTicks = false) {
  const pointLimit = CHART_DEFINITIONS[chartKey]?.pointLimit ?? null;
  const visibleData = pointLimit ? data.slice(-pointLimit) : data;
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (existingChart) existingChart.destroy();
  const ids = chartControlIds[chartKey];
  const autoYBounds = ids
    ? getAutoYBounds(visibleData, parseRangePercent(ids.yRangePercent), targetValue)
    : {};
  const resolvedYMin = axisBounds?.y?.min ?? autoYBounds.min;
  const resolvedYMax = axisBounds?.y?.max ?? autoYBounds.max;

  const datasets = [{
    label,
    data: visibleData.map(d => d.value),
    tension: 0.15,
    borderColor: color,
    backgroundColor: color,
    pointRadius: 2
  }];

  if (targetValue !== null && visibleData.length > 0) {
    datasets.push({
      label: targetLabel ?? "Target",
      data: visibleData.map(() => targetValue),
      borderColor: "#dc2626",
      backgroundColor: "#dc2626",
      borderDash: [6, 4],
      pointRadius: 0,
      tension: 0
    });
  }

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: visibleData.map(d => d.step),
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: {
          title: { display: true, text: "Step" },
          min: axisBounds?.x?.min,
          max: axisBounds?.x?.max
        },
        y: {
          title: { display: true, text: yTitle },
          min: resolvedYMin,
          max: resolvedYMax,
          ticks: scientificTicks ? {
            callback(value) {
              return Number(value).toExponential(2);
            }
          } : undefined
        }
      }
    }
  });
}

function formatScientific(value, digits = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return value ?? "-";
  return num.toExponential(digits);
}

function formatInputValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return escapeHTML(value);
}

function renderInputDetails(inputDetails, job) {
  const el = document.getElementById("inputDetails");
  if (!el) return;

  if (!inputDetails || (!inputDetails.input_file && !inputDetails.text)) {
    el.innerHTML = `
      <div><b>Input file:</b> ${escapeHTML(job.input_file_name ?? "-")}</div>
      <p>No input file was exported for this job yet. Run the scanner again to create input.json.</p>
    `;
    return;
  }

  const rows = INPUT_COMPARE_KEYS.map((key) => `
    <tr>
      <th>${escapeHTML(key)}</th>
      <td>${formatInputValue(inputDetails.parameters?.[key])}</td>
    </tr>
  `).join("");

  el.innerHTML = `
    <div><b>Input file:</b> ${escapeHTML(inputDetails.input_file ?? job.input_file ?? "-")}</div>
    <div class="input-table-wrap">
      <table class="input-table">
        <tbody>${rows}</tbody>
      </table>
    </div>
    <h3>Full Input File</h3>
    <pre>${escapeHTML(inputDetails.text || "")}</pre>
  `;
}

function renderStatus(status, job) {
  document.getElementById("status").innerHTML = `
    <div><b>Job:</b> ${escapeHTML(status.job ?? job.label ?? "-")}</div>
    <div><b>Status:</b> ${escapeHTML(job.status ?? "-")}</div>
    <div><b>Converged:</b> ${escapeHTML(status.converged ?? "-")}</div>
    <div><b>Latest energy:</b> ${escapeHTML(status.latest_energy_ry ?? "-")}</div>
    <div><b>Latest gradient error:</b> ${escapeHTML(formatScientific(status.latest_gradient_error_ry_bohr))}</div>
    <div><b>Latest SCF accuracy:</b> ${escapeHTML(formatScientific(status.latest_scf_accuracy_ry))}</div>
    <div><b>BFGS steps:</b> ${escapeHTML(status.bfgs_steps ?? "-")}</div>
    <div><b>SCF cycles:</b> ${escapeHTML(status.scf_cycles ?? "-")}</div>
    <div><b>Atoms:</b> ${escapeHTML(status.nat_latest ?? "-")}</div>
    <div><b>Geometry steps:</b> ${escapeHTML(status.num_structure_steps ?? "-")}</div>
    <div><b>Structure source:</b> ${escapeHTML(job.structure_source_file ?? "-")}</div>
    <div><b>Last update:</b> ${escapeHTML(status.last_update ?? "-")}</div>
    ${job.note ? `<div><b>Note:</b> ${escapeHTML(job.note)}</div>` : ""}
  `;
}

async function refreshJob() {
  const jobs = await loadJobs();
  const job = jobs.find(j => j.job_id === currentJob);

  if (!job) {
    document.getElementById("status").innerHTML = "Job not found in jobs.json.";
    return;
  }

  updateCurrentStructureSource(job.structure_source_file);

  trajectoryFrames = [];
  originalStructure = null;
  currentLattice = null;
  originalLattice = null;
  originalInputFile = null;
  originalConstraints = [];
  baderChargeChanges = [];
  hasBaderChargeChanges = false;
  chargeMode = false;
  clearChargeSelections(false);
  energySeriesData = [];
  gradientSeriesData = [];
  gradientTargetValue = null;
  scfAccuracySeriesData = [];
  renderNebProfile([], job);
  redrawCharts();
  updateDeltaChargeStatus();

  document.getElementById("jobTitle").textContent = job.label;

  try {
    const inputPath = job.input_file_data ?? `data/${job.job_id}/input.json`;
    const inputDetails = await loadJSON(inputPath);
    renderInputDetails(inputDetails, job);
  } catch (e) {
    renderInputDetails(null, job);
    console.error(e);
  }

  if (!job.status_file) {
    document.getElementById("status").innerHTML = `
      <div><b>Job:</b> ${escapeHTML(job.label)}</div>
      <div><b>Status:</b> ${escapeHTML(job.status)}</div>
      <div><b>Source dir:</b> ${escapeHTML(job.source_dir ?? "-")}</div>
      <div><b>Output file:</b> ${escapeHTML(job.output_file ?? "-")}</div>
      <div><b>Error:</b> ${escapeHTML(job.error ?? "-")}</div>
    `;
    document.getElementById("outputTail").textContent = "No output data available.";
    redrawCharts();
    return;
  }

  const status = await loadJSON(`data/${job.job_id}/status.json`);
  renderStatus(status, job);

  if (job.neb_profile_file) {
    try {
      renderNebProfile(parseNebProfileCSV(await loadText(job.neb_profile_file)), job);
    } catch (e) {
      renderNebProfile([], job);
      console.error(e);
    }
  }

  try {
    const csv = await loadText(`data/${job.job_id}/energy.csv`);
    const parsed = parseSeriesCSV(csv);
    energySeriesData = parsed;
    redrawCharts();
  } catch (e) {
    energySeriesData = [];
    redrawCharts();
    console.error(e);
  }

  try {
    const csv = await loadText(`data/${job.job_id}/gradient_error.csv`);
    const parsed = parseSeriesCSV(csv);
    gradientSeriesData = parsed;
    gradientTargetValue = status.target_gradient_error_ry_bohr ?? null;
    redrawCharts();
  } catch (e) {
    gradientSeriesData = [];
    gradientTargetValue = null;
    redrawCharts();
    console.error(e);
  }

  try {
    const csv = await loadText(`data/${job.job_id}/scf_accuracy.csv`);
    scfAccuracySeriesData = parseSeriesCSV(csv);
    redrawCharts();
  } catch (e) {
    scfAccuracySeriesData = [];
    redrawCharts();
    console.error(e);
  }

  try {
    const atomicPositions = await loadText(`data/${job.job_id}/latest_atomic_positions.txt`);
    document.getElementById("atomicPositions").textContent = atomicPositions || "No ATOMIC_POSITIONS block found.";
  } catch (e) {
    document.getElementById("atomicPositions").textContent = "Could not load atomic positions.";
    console.error(e);
  }

  try {
    const outputTail = await loadText(`data/${job.job_id}/latest_output_tail.txt`);
    document.getElementById("outputTail").textContent = outputTail;
  } catch (e) {
    document.getElementById("outputTail").textContent = "Could not load output tail.";
    console.error(e);
  }

  const viewerDiv = document.getElementById("viewer");
  if (job.has_structure) {
    try {
      const trajText = await loadText(`data/${job.job_id}/trajectory.xyz`);
      trajectoryFrames = parseXYZTrajectory(trajText);

      if (trajectoryFrames.length === 0) {
        const xyzText = await loadText(`data/${job.job_id}/structure.xyz`);
        trajectoryFrames = parseXYZTrajectory(xyzText);
      }

      try {
        const lattice = await loadJSON(`data/${job.job_id}/lattice.json`);
        currentLattice = lattice.matrix_angstrom || null;
      } catch (e) {
        currentLattice = null;
      }

      try {
        originalStructure = await loadText(`data/${job.job_id}/original_structure.xyz`);
      } catch (e) {
        originalStructure = null;
      }

      try {
        const lattice = await loadJSON(`data/${job.job_id}/original_lattice.json`);
        originalLattice = lattice.matrix_angstrom || null;
        originalInputFile = lattice.input_file || null;
      } catch (e) {
        originalLattice = null;
        originalInputFile = null;
      }

      try {
        const constraints = await loadJSON(`data/${job.job_id}/original_constraints.json`);
        originalConstraints = constraints.constraints || [];
      } catch (e) {
        originalConstraints = [];
      }

      try {
        const baderCSV = await loadText(job.bader_charge_changes_file ?? `data/${job.job_id}/bader_charge_changes.csv`);
        baderChargeChanges = parseBaderChargeChangesCSV(baderCSV);
        hasBaderChargeChanges = baderChargeChanges.length > 0;
      } catch (e) {
        baderChargeChanges = [];
        hasBaderChargeChanges = false;
      }

      if (!originalStructure) {
        useTrajectoryAsOriginalFallback();
      }

      updateOriginalStructureSource();
      updateFixedAtomStatus();
      updateDeltaChargeStatus();
      renderAtomLegend();

      if (trajectoryFrames.length > 0) {
        renderOriginalStructure(false);
        renderFrame(trajectoryFrames.length - 1);
      } else {
        viewerDiv.innerHTML = "<p>No structure frames available.</p>";
      }
    } catch (e) {
      renderAtomLegend();
      viewerDiv.innerHTML = "<p>Structure file could not be loaded.</p>";
      console.error(e);
    }
  } else {
    renderAtomLegend();
    viewerDiv.innerHTML = "<p>No structure available for this calculation output.</p>";
  }
}

async function main() {
  refreshVersionStamp();

  currentJob = getJobId();
  if (!currentJob) {
    document.getElementById("status").innerHTML = "No job selected.";
    return;
  }

  updateBondDistanceLabel();
  bindChartControls();

  try {
    await refreshJob();
  } catch (e) {
    document.getElementById("status").innerHTML = "Failed to load job data.";
    console.error(e);
  }
}

main();
setInterval(main, 60000);
