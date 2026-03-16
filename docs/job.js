let viewer = null;
let originalViewer = null;
let energyChart = null;
let gradientChart = null;
let currentJob = null;

let trajectoryFrames = [];
let originalStructure = null;
let currentStep = 0;
let currentLattice = null;
let originalLattice = null;
let originalInputFile = null;
let showCell = true;
let showAxes = true;
let currentStyle = "ballstick";
let cellRepeat = { x: 2, y: 2, z: 1 };
let measureMode = false;
let measurementAtoms = [];
let measurementLabels = [];
let measurementLine = null;

function getJobId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("job");
}

async function loadJobs() {
  const res = await fetch("data/jobs.json?t=" + Date.now());
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

function updateOriginalStructureSource() {
  const el = document.getElementById("originalStructureSource");
  if (!el) return;
  el.textContent = `Source: ${originalInputFile ?? "not available"}`;
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

function clearMeasurement() {
  measurementAtoms = [];

  if (viewer) {
    for (const label of measurementLabels) {
      viewer.removeLabel(label);
    }
    if (measurementLine) {
      viewer.removeShape(measurementLine);
    }
  }

  measurementLabels = [];
  measurementLine = null;
  updateMeasurementStatus(measureMode ? "Select atom 1 of 2" : "Measurement off");

  if (viewer) viewer.render();
}

function handleMeasurementClick(atom) {
  if (!measureMode || !atom) return;

  if (measurementAtoms.length === 2) {
    clearMeasurement();
  }

  measurementAtoms.push({
    index: atom.index,
    serial: atom.serial,
    elem: atom.elem,
    x: atom.x,
    y: atom.y,
    z: atom.z
  });

  const pickNumber = measurementAtoms.length;
  const marker = viewer.addLabel(`${pickNumber}: ${formatAtomLabel(atom)}`, {
    position: { x: atom.x, y: atom.y, z: atom.z },
    backgroundColor: "#111827",
    fontColor: "white",
    backgroundOpacity: 0.85,
    fontSize: 12
  });
  measurementLabels.push(marker);

  if (measurementAtoms.length === 1) {
    updateMeasurementStatus("Select atom 2 of 2");
    viewer.render();
    return;
  }

  const [atomA, atomB] = measurementAtoms;
  const distance = distanceBetweenAtoms(atomA, atomB);
  measurementLine = viewer.addLine({
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
  const distanceLabel = viewer.addLabel(`${distance.toFixed(3)} A`, {
    position: midpoint,
    backgroundColor: "#7c3aed",
    fontColor: "white",
    backgroundOpacity: 0.9,
    fontSize: 12
  });
  measurementLabels.push(distanceLabel);
  updateMeasurementStatus(`Distance: ${distance.toFixed(3)} A`);
  viewer.render();
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

    atoms.push({ elem: parts[0], x, y, z });
  }

  return atoms;
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
  return {
    H: "white",
    C: "gray",
    O: "red",
    Ni: "green",
    Cu: "orange"
  };
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
  originalViewer.addModel(
    buildDisplayXYZ(originalStructure, originalLattice, `Original structure | ${cellRepeat.x} x ${cellRepeat.y} x ${cellRepeat.z}`),
    "xyz"
  );
  applyStyleToViewer(originalViewer);
  addLatticeBox(originalViewer, getDisplayLattice(originalLattice));
  addAxes(originalViewer, getDisplayLattice(originalLattice));

  if (preserveView && savedView) {
    originalViewer.setView(savedView);
  } else {
    originalViewer.zoomTo();
  }

  originalViewer.resize();
  originalViewer.render();
}

function renderFrame(index, preserveView = false) {
  if (!trajectoryFrames.length) return;

  currentStep = Math.max(0, Math.min(index, trajectoryFrames.length - 1));
  const frame = trajectoryFrames[currentStep];

  initViewer();

  let savedView = null;
  if (preserveView) savedView = viewer.getView();

  viewer.clear();
  viewer.addModel(
    buildDisplayXYZ(frame.xyz, currentLattice, `${frame.comment} | ${cellRepeat.x} x ${cellRepeat.y} x ${cellRepeat.z}`),
    "xyz"
  );
  clearMeasurement();
  viewer.setClickable({}, true, function(atom) {
    handleMeasurementClick(atom);
  });

  applyStyleToViewer(viewer);
  addLatticeBox(viewer, getDisplayLattice(currentLattice));
  addAxes(viewer, getDisplayLattice(currentLattice));

  if (preserveView && savedView) {
    viewer.setView(savedView);
  } else {
    viewer.zoomTo();
  }

  viewer.resize();
  viewer.render();

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

function resetView() {
  if (viewer) renderFrame(currentStep, false);
  if (originalViewer) renderOriginalStructure(false);
}

function toggleMeasureMode() {
  measureMode = !measureMode;
  const button = document.getElementById("measureToggle");
  if (button) {
    button.textContent = measureMode ? "Exit Measure" : "Measure Distance";
  }
  clearMeasurement();
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

function drawSeriesChart(canvasId, existingChart, data, label, color, yTitle, targetValue = null, targetLabel = null) {
  const visibleData = data.slice(-10);
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (existingChart) existingChart.destroy();

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
        x: { title: { display: true, text: "Step" } },
        y: { title: { display: true, text: yTitle } }
      }
    }
  });
}

function formatScientific(value, digits = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return value ?? "-";
  return num.toExponential(digits);
}

function renderStatus(status, job) {
  document.getElementById("status").innerHTML = `
    <div><b>Job:</b> ${status.job ?? job.label ?? "-"}</div>
    <div><b>Converged:</b> ${status.converged ?? "-"}</div>
    <div><b>Latest energy:</b> ${status.latest_energy_ry ?? "-"}</div>
    <div><b>Latest gradient error:</b> ${formatScientific(status.latest_gradient_error_ry_bohr)}</div>
    <div><b>BFGS steps:</b> ${status.bfgs_steps ?? "-"}</div>
    <div><b>SCF cycles:</b> ${status.scf_cycles ?? "-"}</div>
    <div><b>Atoms:</b> ${status.nat_latest ?? "-"}</div>
    <div><b>Geometry steps:</b> ${status.num_structure_steps ?? "-"}</div>
    <div><b>Last update:</b> ${status.last_update ?? "-"}</div>
    ${job.note ? `<div><b>Note:</b> ${job.note}</div>` : ""}
  `;
}

async function refreshJob() {
  const jobs = await loadJobs();
  const job = jobs.find(j => j.job_id === currentJob);

  if (!job) {
    document.getElementById("status").innerHTML = "Job not found in jobs.json.";
    return;
  }

  document.getElementById("jobTitle").textContent = job.label;

  if (job.status !== "ok") {
    document.getElementById("status").innerHTML = `
      <div><b>Job:</b> ${job.label}</div>
      <div><b>Status:</b> ${job.status}</div>
      <div><b>Source dir:</b> ${job.source_dir ?? "-"}</div>
      <div><b>Output file:</b> ${job.output_file ?? "-"}</div>
      <div><b>Error:</b> ${job.error ?? "-"}</div>
    `;
    document.getElementById("outputTail").textContent = "No output data available.";
    return;
  }

  const status = await loadJSON(`data/${job.job_id}/status.json`);
  renderStatus(status, job);

  try {
    const csv = await loadText(`data/${job.job_id}/energy.csv`);
    const parsed = parseSeriesCSV(csv);
    if (parsed.length > 0) {
      energyChart = drawSeriesChart(
        "energyChart",
        energyChart,
        parsed,
        "Total Energy (Ry)",
        "#2563eb",
        "Energy (Ry)"
      );
    }
  } catch (e) {
    console.error(e);
  }

  try {
    const csv = await loadText(`data/${job.job_id}/gradient_error.csv`);
    const parsed = parseSeriesCSV(csv);
    if (parsed.length > 0) {
      gradientChart = drawSeriesChart(
        "gradientChart",
        gradientChart,
        parsed,
        "Gradient Error (Ry/Bohr)",
        "#16a34a",
        "Gradient Error (Ry/Bohr)",
        status.target_gradient_error_ry_bohr ?? null,
        "Target Gradient Error (Ry/Bohr)"
      );
    }
    else if (gradientChart) {
      gradientChart.destroy();
      gradientChart = null;
    }
  } catch (e) {
    if (gradientChart) {
      gradientChart.destroy();
      gradientChart = null;
    }
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

      if (!originalStructure) {
        useTrajectoryAsOriginalFallback();
      }

      updateOriginalStructureSource();

      if (trajectoryFrames.length > 0) {
        renderOriginalStructure(false);
        renderFrame(trajectoryFrames.length - 1);
      } else {
        viewerDiv.innerHTML = "<p>No structure frames available.</p>";
      }
    } catch (e) {
      viewerDiv.innerHTML = "<p>Structure file could not be loaded.</p>";
      console.error(e);
    }
  } else {
    viewerDiv.innerHTML = "<p>No structure available for this calculation output.</p>";
  }
}

async function main() {
  currentJob = getJobId();
  if (!currentJob) {
    document.getElementById("status").innerHTML = "No job selected.";
    return;
  }

  try {
    await refreshJob();
  } catch (e) {
    document.getElementById("status").innerHTML = "Failed to load job data.";
    console.error(e);
  }
}

main();
setInterval(main, 60000);



