let viewer = null;
let chart = null;
let currentJob = null;

let trajectoryFrames = [];
let currentStep = 0;
let currentLattice = null;
let showCell = true;
let showAxes = true;
let currentStyle = "ballstick";

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

function initViewer() {
  if (!viewer) {
    viewer = $3Dmol.createViewer("viewer", { backgroundColor: "white" });
    window.addEventListener("resize", () => {
      if (viewer) {
        viewer.resize();
        viewer.render();
      }
    });
  }
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

function getColorScheme() {
  return {
    H: "white",
    C: "gray",
    O: "red",
    Ni: "green",
    Cu: "orange"
  };
}

function applyStyle() {
  if (!viewer) return;

  const colorScheme = getColorScheme();

  if (currentStyle === "stick") {
    viewer.setStyle({}, {
      stick: { radius: 0.18, colorscheme: colorScheme }
    });
  } else if (currentStyle === "sphere") {
    viewer.setStyle({}, {
      sphere: { scale: 0.60, colorscheme: colorScheme }
    });
  } else {
    viewer.setStyle({}, {
      stick: { radius: 0.16, colorscheme: colorScheme },
      sphere: { scale: 0.32, colorscheme: colorScheme }
    });
  }
}

function addLatticeBox(matrix) {
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
    viewer.addLine({
      start: p1,
      end: p2,
      color: "black",
      linewidth: 2
    });
  }
}

function addAxes(matrix) {
  if (!showAxes || !matrix) return;

  const a = matrix[0];
  const b = matrix[1];
  const c = matrix[2];

  const O = { x: 0, y: 0, z: 0 };
  const A = { x: a[0], y: a[1], z: a[2] };
  const B = { x: b[0], y: b[1], z: b[2] };
  const C = { x: c[0], y: c[1], z: c[2] };

  viewer.addArrow({ start: O, end: A, radius: 0.08, color: "red" });
  viewer.addArrow({ start: O, end: B, radius: 0.08, color: "green" });
  viewer.addArrow({ start: O, end: C, radius: 0.08, color: "blue" });

  viewer.addLabel("a", {
    position: A,
    fontColor: "red",
    backgroundOpacity: 0
  });
  viewer.addLabel("b", {
    position: B,
    fontColor: "green",
    backgroundOpacity: 0
  });
  viewer.addLabel("c", {
    position: C,
    fontColor: "blue",
    backgroundOpacity: 0
  });
}

function renderFrame(index, preserveView = false) {
  if (!trajectoryFrames.length) return;

  currentStep = Math.max(0, Math.min(index, trajectoryFrames.length - 1));
  const frame = trajectoryFrames[currentStep];

  initViewer();

  let savedView = null;
  if (preserveView) savedView = viewer.getView();

  viewer.clear();
  viewer.addModel(frame.xyz, "xyz");

  applyStyle();
  addLatticeBox(currentLattice);
  addAxes(currentLattice);

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
}

function setStick() {
  currentStyle = "stick";
  renderFrame(currentStep, true);
}

function setSphere() {
  currentStyle = "sphere";
  renderFrame(currentStep, true);
}

function toggleCell() {
  showCell = !showCell;
  renderFrame(currentStep, true);
}

function toggleAxes() {
  showAxes = !showAxes;
  renderFrame(currentStep, true);
}

function resetView() {
  if (!viewer) return;
  renderFrame(currentStep, false);
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



function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const [step, energy] = lines[i].split(",");
    const s = Number(step);
    const e = Number(energy);
    if (!Number.isNaN(s) && !Number.isNaN(e)) {
      data.push({ step: s, energy: e });
    }
  }
  return data;
}

function drawChart(data) {
  const ctx = document.getElementById("energyChart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(d => d.step),
      datasets: [{
        label: "Total Energy (Ry)",
        data: data.map(d => d.energy),
        tension: 0.15
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: { title: { display: true, text: "Step" } },
        y: { title: { display: true, text: "Energy (Ry)" } }
      }
    }
  });
}

function renderStatus(status, job) {
  document.getElementById("status").innerHTML = `
    <div><b>Job:</b> ${status.job ?? job.label ?? "-"}</div>
    <div><b>Status:</b> ${status.status ?? job.status ?? "-"}</div>
    <div><b>Converged:</b> ${status.converged ?? "-"}</div>
    <div><b>Latest energy:</b> ${status.latest_energy_ry ?? "-"}</div>
    <div><b>BFGS steps:</b> ${status.bfgs_steps ?? "-"}</div>
    <div><b>SCF cycles:</b> ${status.scf_cycles ?? "-"}</div>
    <div><b>Atoms:</b> ${status.nat_latest ?? "-"}</div>
    <div><b>Geometry steps:</b> ${status.num_structure_steps ?? "-"}</div>
    <div><b>Positions format:</b> ${status.positions_format ?? "-"}</div>
    <div><b>Cell format:</b> ${status.cell_format ?? "-"}</div>
    <div><b>Cell source:</b> ${status.cell_source ?? "-"}</div>
    <div><b>Output file:</b> ${job.output_file ?? "-"}</div>
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
    const parsed = parseCSV(csv);
    if (parsed.length > 0) drawChart(parsed);
  } catch (e) {
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

	if (trajectoryFrames.length > 0) {
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
