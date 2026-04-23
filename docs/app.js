async function loadJobs() {
  const res = await fetch("data/jobs.json?t=" + Date.now());
  return await res.json();
}

const RY_TO_EV = 13.6057039763;
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
const COMPARISON_SELECT_IDS = [
  "inputCompareA",
  "inputCompareB",
  "inputCompareC",
  "inputCompareD"
];
const ENERGY_SELECT_IDS = ["energyA", "energyB", "energyC"];
const ENERGY_SELECTION_STORAGE_KEY = "qeDashboard.energySelections";
const ENERGY_UNIT_STORAGE_KEY = "qeDashboard.energyUnit";
const INPUT_COMPARISON_STORAGE_KEY = "qeDashboard.inputComparisonSelections";

function loadStoredSelections(key, expectedLength) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return Array(expectedLength).fill(undefined);
    return Array.from({ length: expectedLength }, (_, index) => parsed[index]);
  } catch (e) {
    return Array(expectedLength).fill(undefined);
  }
}

function saveStoredSelections(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch (e) {
    console.warn("Could not save dashboard selections.", e);
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatEnergy(value) {
  return Number.isFinite(value) ? value.toFixed(8) : "-";
}

function ryToEv(value) {
  return Number.isFinite(value) ? value * RY_TO_EV : NaN;
}

function energyUnitLabel(unit) {
  return unit === "ry" ? "Ry" : "eV";
}

function convertEnergyFromRy(value, unit) {
  if (!Number.isFinite(value)) return NaN;
  return unit === "ry" ? value : ryToEv(value);
}

function selectedEnergyUnit() {
  const select = document.getElementById("energyUnit");
  return select?.value === "ry" ? "ry" : "ev";
}

function loadStoredEnergyUnit() {
  try {
    const stored = localStorage.getItem(ENERGY_UNIT_STORAGE_KEY);
    return stored === "ry" ? "ry" : "ev";
  } catch (e) {
    return "ev";
  }
}

function saveEnergyUnit() {
  try {
    localStorage.setItem(ENERGY_UNIT_STORAGE_KEY, selectedEnergyUnit());
  } catch (e) {
    console.warn("Could not save dashboard energy unit.", e);
  }
}

function buildEnergyOptions(jobs) {
  return jobs
    .filter((job) => Number.isFinite(job.latest_energy_ry))
    .map((job) => ({
      value: job.job_id,
      label: job.label,
      energyRy: job.latest_energy_ry
    }));
}

function populateSelect(select, options, preferredIndex) {
  select.innerHTML = "";
  const unit = selectedEnergyUnit();
  const unitLabel = energyUnitLabel(unit);

  for (const option of options) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = `${option.label} (${formatEnergy(convertEnergyFromRy(option.energyRy, unit))} ${unitLabel})`;
    el.dataset.label = option.label;
    el.dataset.energyRy = String(option.energyRy);
    select.appendChild(el);
  }

  if (!options.length) {
    const empty = document.createElement("option");
    empty.textContent = "No converged energies available";
    empty.value = "";
    select.appendChild(empty);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.selectedIndex = Math.min(preferredIndex, options.length - 1);
}

function updateEnergyOptionLabels() {
  const unit = selectedEnergyUnit();
  const unitLabel = energyUnitLabel(unit);

  ENERGY_SELECT_IDS.forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;

    Array.from(select.options).forEach((option) => {
      const energyRy = Number(option.dataset.energyRy);
      const label = option.dataset.label;
      if (label && Number.isFinite(energyRy)) {
        option.textContent = `${label} (${formatEnergy(convertEnergyFromRy(energyRy, unit))} ${unitLabel})`;
      }
    });
  });
}

function updateCalculator() {
  const unit = selectedEnergyUnit();
  const unitLabel = energyUnitLabel(unit);
  const chosen = ENERGY_SELECT_IDS.map((id) => {
    const select = document.getElementById(id);
    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption) {
      return { label: "-", energyRy: NaN };
    }

    return {
      label: selectedOption.textContent,
      energyRy: Number(selectedOption.dataset.energyRy)
    };
  });

  const [energyA, energyB, energyC] = chosen;
  const formulaEl = document.getElementById("energyFormula");
  const resultEl = document.getElementById("energyResult");

  formulaEl.textContent = `${energyA.label} - ${energyB.label} - ${energyC.label}`;

  if (chosen.every((item) => Number.isFinite(item.energyRy))) {
    const resultRy = energyA.energyRy - energyB.energyRy - energyC.energyRy;
    resultEl.textContent = `${formatEnergy(convertEnergyFromRy(resultRy, unit))} ${unitLabel}`;
  } else {
    resultEl.textContent = "-";
  }
}

function saveEnergySelections() {
  saveStoredSelections(
    ENERGY_SELECTION_STORAGE_KEY,
    ENERGY_SELECT_IDS.map((id) => document.getElementById(id)?.value ?? "")
  );
}

function renderCalculator(jobs) {
  const options = buildEnergyOptions(jobs);
  const storedValues = loadStoredSelections(ENERGY_SELECTION_STORAGE_KEY, ENERGY_SELECT_IDS.length);
  const unitSelect = document.getElementById("energyUnit");

  if (unitSelect) {
    if (!unitSelect.dataset.bound) {
      unitSelect.value = loadStoredEnergyUnit();
      unitSelect.addEventListener("change", () => {
        saveEnergyUnit();
        updateEnergyOptionLabels();
        updateCalculator();
      });
      unitSelect.dataset.bound = "true";
    }
  }

  ENERGY_SELECT_IDS.forEach((id, index) => {
    const select = document.getElementById(id);
    const previousValue = select.value || storedValues[index];
    populateSelect(select, options, index);

    if (previousValue && options.some((option) => option.value === previousValue)) {
      select.value = previousValue;
    }

    if (!select.dataset.bound) {
      select.addEventListener("change", () => {
        saveEnergySelections();
        updateCalculator();
      });
      select.dataset.bound = "true";
    }
  });

  updateCalculator();
}

function formatInputValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return escapeHTML(value);
}

function buildInputComparisonOptions(jobs) {
  return jobs.filter((job) => job.input_parameters || job.input_file_name || job.status === "OK");
}

function populateComparisonSelect(select, jobs, preferredJobId, preferredIndex, hasStoredPreference) {
  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "None";
  select.appendChild(empty);

  for (const job of jobs) {
    const option = document.createElement("option");
    option.value = job.job_id;
    option.textContent = `${job.label} (${job.input_file_name ?? "no input file"})`;
    select.appendChild(option);
  }

  if (preferredJobId && jobs.some((job) => job.job_id === preferredJobId)) {
    select.value = preferredJobId;
  } else if (hasStoredPreference) {
    select.value = "";
  } else if (jobs[preferredIndex]) {
    select.value = jobs[preferredIndex].job_id;
  } else {
    select.value = "";
  }
}

function saveInputComparisonSelections() {
  saveStoredSelections(
    INPUT_COMPARISON_STORAGE_KEY,
    COMPARISON_SELECT_IDS.map((id) => document.getElementById(id)?.value ?? "")
  );
}

function selectedComparisonJobs(jobs) {
  const selectedIds = COMPARISON_SELECT_IDS
    .map((id) => document.getElementById(id)?.value)
    .filter(Boolean);
  const seen = new Set();

  return selectedIds
    .filter((jobId) => {
      if (seen.has(jobId)) return false;
      seen.add(jobId);
      return true;
    })
    .map((jobId) => jobs.find((job) => job.job_id === jobId))
    .filter(Boolean);
}

function renderInputComparisonTable(jobs) {
  const tableEl = document.getElementById("inputComparisonTable");
  const selectedJobs = selectedComparisonJobs(jobs);

  if (!selectedJobs.length) {
    tableEl.innerHTML = "<p>Choose up to 4 input files to compare.</p>";
    return;
  }

  const headerCells = selectedJobs
    .map((job) => `<th><a href="job.html?job=${encodeURIComponent(job.job_id)}">${escapeHTML(job.label)}</a><div class="subtle">${escapeHTML(job.input_file_name ?? "no input file")}</div></th>`)
    .join("");

  const rows = INPUT_COMPARE_KEYS.map((key) => {
    const valueCells = selectedJobs
      .map((job) => `<td>${formatInputValue(job.input_parameters?.[key])}</td>`)
      .join("");
    return `<tr><th>${escapeHTML(key)}</th>${valueCells}</tr>`;
  }).join("");

  tableEl.innerHTML = `
    <div class="table-wrap">
      <table class="compare-table">
        <thead>
          <tr><th>Input setting</th>${headerCells}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderInputComparison(jobs) {
  const el = document.getElementById("inputComparison");
  const options = buildInputComparisonOptions(jobs);

  if (!options.length) {
    el.innerHTML = "<p>No parsed jobs available for input comparison.</p>";
    return;
  }

  const storedValues = loadStoredSelections(INPUT_COMPARISON_STORAGE_KEY, COMPARISON_SELECT_IDS.length);
  const previousValues = COMPARISON_SELECT_IDS.map((id, index) => {
    const existingSelect = document.getElementById(id);
    return existingSelect ? existingSelect.value : storedValues[index];
  });

  el.innerHTML = `
    <div class="comparison-controls">
      ${COMPARISON_SELECT_IDS.map((id, index) => `
        <div class="field">
          <label for="${id}">Input file ${index + 1}</label>
          <select id="${id}"></select>
        </div>
      `).join("")}
    </div>
    <div id="inputComparisonTable"></div>
  `;

  COMPARISON_SELECT_IDS.forEach((id, index) => {
    const select = document.getElementById(id);
    const hasStoredPreference = previousValues[index] !== undefined;
    populateComparisonSelect(select, options, previousValues[index], index, hasStoredPreference);
    select.addEventListener("change", () => {
      saveInputComparisonSelections();
      renderInputComparisonTable(jobs);
    });
  });

  renderInputComparisonTable(jobs);
}

function renderJobs(jobs) {
  const el = document.getElementById("jobs");
  el.innerHTML = "";

  for (const job of jobs) {
    const card = document.createElement("div");
    card.className = "card";

    let statusClass = job.status === "OK" ? "ok" : (job.status === "calculating..." ? "calculating" : "bad");

    card.innerHTML = `
      <div class="title">${escapeHTML(job.label)}</div>
      <div class="meta"><b>Status:</b> <span class="${statusClass}">${escapeHTML(job.status)}</span></div>
      <div class="meta"><b>Source dir:</b> ${escapeHTML(job.source_dir)}</div>
      <div class="meta"><b>Picked output:</b> ${escapeHTML(job.output_file ?? "-")}</div>
      <div class="meta"><b>Input file:</b> ${escapeHTML(job.input_file_name ?? "-")}</div>
      <div class="meta"><b>Latest energy:</b> ${escapeHTML(job.latest_energy_ry ?? "-")}</div>
      <div class="meta"><b>Converged:</b> ${escapeHTML(job.converged ?? "-")}</div>
      <div class="meta"><b>Atoms:</b> ${escapeHTML(job.nat_latest ?? "-")}</div>
      <div class="meta"><b>Has structure:</b> ${escapeHTML(job.has_structure ?? "-")}</div>
      <a class="button" href="job.html?job=${encodeURIComponent(job.job_id)}">Open job</a>
    `;

    el.appendChild(card);
  }
}

async function main() {
  try {
    const jobs = await loadJobs();
    renderCalculator(jobs);
    renderInputComparison(jobs);
    renderJobs(jobs);
  } catch (e) {
    document.getElementById("energyFormula").textContent = "Unable to load energy data";
    document.getElementById("energyResult").textContent = "-";
    document.getElementById("inputComparison").innerHTML = "<p>Failed to load input comparison.</p>";
    document.getElementById("jobs").innerHTML = "<p>Failed to load jobs.json</p>";
    console.error(e);
  }
}

main();
setInterval(main, 60000);
