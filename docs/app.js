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

// ========== Simple Difference Calculator ==========
const DIFF_SELECT_IDS = ["diffA", "diffB"];
const DIFF_SELECTION_STORAGE_KEY = "qeDashboard.diffSelections";

function updateDiffCalculator() {
  const unit = selectedEnergyUnit();
  const unitLabel = energyUnitLabel(unit);

  DIFF_SELECT_IDS.forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    Array.from(select.options).forEach((opt) => {
      const ry = Number(opt.dataset.energyRy);
      if (opt.dataset.label && Number.isFinite(ry)) {
        opt.textContent = `${opt.dataset.label} (${formatEnergy(convertEnergyFromRy(ry, unit))} ${unitLabel})`;
      }
    });
  });

  const values = DIFF_SELECT_IDS.map((id) => {
    const select = document.getElementById(id);
    const opt = select?.options[select.selectedIndex];
    return { label: opt?.dataset.label ?? opt?.textContent ?? "-", energyRy: Number(opt?.dataset.energyRy) };
  });
  const [a, b] = values;

  document.getElementById("diffFormula").textContent = `${a.label} − ${b.label}`;
  if (values.every((v) => Number.isFinite(v.energyRy))) {
    const resultRy = a.energyRy - b.energyRy;
    document.getElementById("diffResult").textContent = `${formatEnergy(convertEnergyFromRy(resultRy, unit))} ${unitLabel}`;
  } else {
    document.getElementById("diffResult").textContent = "-";
  }
}

function saveDiffSelections() {
  saveStoredSelections(DIFF_SELECTION_STORAGE_KEY, DIFF_SELECT_IDS.map((id) => document.getElementById(id)?.value ?? ""));
}

function renderDiffCalculator(jobs) {
  const options = buildEnergyOptions(jobs);
  const storedValues = loadStoredSelections(DIFF_SELECTION_STORAGE_KEY, DIFF_SELECT_IDS.length);
  const unitSelect = document.getElementById("energyUnit");

  if (unitSelect && !unitSelect.dataset.boundDiff) {
    unitSelect.addEventListener("change", () => updateDiffCalculator());
    unitSelect.dataset.boundDiff = "true";
  }

  DIFF_SELECT_IDS.forEach((id, index) => {
    const select = document.getElementById(id);
    if (!select) return;
    const previousValue = select.value || storedValues[index];
    populateSelect(select, options, index);
    if (previousValue && options.some((o) => o.value === previousValue)) select.value = previousValue;
    if (!select.dataset.bound) {
      select.addEventListener("change", () => { saveDiffSelections(); updateDiffCalculator(); });
      select.dataset.bound = "true";
    }
  });

  updateDiffCalculator();
}

// ========== Reaction Energy Calculator ==========
const RXN_SELECT_IDS = ["rxnA", "rxnB", "rxnC", "rxnD"];
const RXN_OPTIONAL_FLAGS = [false, true, false, true];
const RXN_DEFAULT_OPTION_INDICES = [0, 0, 1, 0];
const RXN_SELECTION_STORAGE_KEY = "qeDashboard.rxnSelections";

function populateSelectNullable(select, options, includeNone) {
  select.innerHTML = "";
  const unit = selectedEnergyUnit();
  const unitLabel = energyUnitLabel(unit);

  if (includeNone) {
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "None";
    select.appendChild(none);
  }

  for (const option of options) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = `${option.label} (${formatEnergy(convertEnergyFromRy(option.energyRy, unit))} ${unitLabel})`;
    el.dataset.label = option.label;
    el.dataset.energyRy = String(option.energyRy);
    select.appendChild(el);
  }

  if (!options.length && !includeNone) {
    const empty = document.createElement("option");
    empty.textContent = "No converged energies available";
    empty.value = "";
    select.appendChild(empty);
    select.disabled = true;
    return;
  }
  select.disabled = false;
}

function updateRxnCalculator() {
  const unit = selectedEnergyUnit();
  const unitLabel = energyUnitLabel(unit);

  RXN_SELECT_IDS.forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    Array.from(select.options).forEach((opt) => {
      const ry = Number(opt.dataset.energyRy);
      if (opt.dataset.label && Number.isFinite(ry)) {
        opt.textContent = `${opt.dataset.label} (${formatEnergy(convertEnergyFromRy(ry, unit))} ${unitLabel})`;
      }
    });
  });

  const values = RXN_SELECT_IDS.map((id) => {
    const select = document.getElementById(id);
    const opt = select?.options[select.selectedIndex];
    if (!opt || !opt.value) return null;
    return { label: opt.dataset.label || opt.textContent, energyRy: Number(opt.dataset.energyRy) };
  });
  const [a, b, c, d] = values;

  let formula = a?.label ?? "-";
  if (b) formula += ` + ${b.label}`;
  formula += ` − ${c?.label ?? "-"}`;
  if (d) formula += ` − ${d.label}`;
  document.getElementById("rxnFormula").textContent = formula;

  if (a && Number.isFinite(a.energyRy) && c && Number.isFinite(c.energyRy)) {
    let resultRy = a.energyRy - c.energyRy;
    if (b && Number.isFinite(b.energyRy)) resultRy += b.energyRy;
    if (d && Number.isFinite(d.energyRy)) resultRy -= d.energyRy;
    document.getElementById("rxnResult").textContent = `${formatEnergy(convertEnergyFromRy(resultRy, unit))} ${unitLabel}`;
  } else {
    document.getElementById("rxnResult").textContent = "-";
  }
}

function saveRxnSelections() {
  saveStoredSelections(RXN_SELECTION_STORAGE_KEY, RXN_SELECT_IDS.map((id) => document.getElementById(id)?.value ?? ""));
}

function renderRxnCalculator(jobs) {
  const options = buildEnergyOptions(jobs);
  const storedValues = loadStoredSelections(RXN_SELECTION_STORAGE_KEY, RXN_SELECT_IDS.length);
  const unitSelect = document.getElementById("energyUnit");

  if (unitSelect && !unitSelect.dataset.boundRxn) {
    unitSelect.addEventListener("change", () => updateRxnCalculator());
    unitSelect.dataset.boundRxn = "true";
  }

  RXN_SELECT_IDS.forEach((id, index) => {
    const select = document.getElementById(id);
    if (!select) return;
    const isOptional = RXN_OPTIONAL_FLAGS[index];
    const previousValue = select.value || storedValues[index];

    populateSelectNullable(select, options, isOptional);

    if (previousValue && options.some((o) => o.value === previousValue)) {
      select.value = previousValue;
    } else if (isOptional) {
      select.value = "";
    } else {
      select.selectedIndex = Math.min(RXN_DEFAULT_OPTION_INDICES[index], options.length - 1);
    }

    if (!select.dataset.bound) {
      select.addEventListener("change", () => { saveRxnSelections(); updateRxnCalculator(); });
      select.dataset.bound = "true";
    }
  });

  updateRxnCalculator();
}

// ========== Energy per Atom Calculator ==========
const PER_ATOM_STORAGE_KEY = "qeDashboard.perAtomSelections";

function buildPerAtomOptions(jobs) {
  return jobs
    .filter((job) => Number.isFinite(job.latest_energy_ry))
    .map((job) => ({
      value: job.job_id,
      label: job.label,
      energyRy: job.latest_energy_ry,
      natLatest: job.nat_latest ?? 0
    }));
}

function updatePerAtomCalculator() {
  const unit = selectedEnergyUnit();
  const unitLabel = energyUnitLabel(unit);
  const select = document.getElementById("perAtomJob");
  const nInput = document.getElementById("perAtomN");
  if (!select || !nInput) return;

  Array.from(select.options).forEach((opt) => {
    const ry = Number(opt.dataset.energyRy);
    if (opt.dataset.label && Number.isFinite(ry)) {
      opt.textContent = `${opt.dataset.label} (${formatEnergy(convertEnergyFromRy(ry, unit))} ${unitLabel})`;
    }
  });

  const opt = select.options[select.selectedIndex];
  const energyRy = Number(opt?.dataset.energyRy);
  const label = opt?.dataset.label ?? "-";
  const n = Number(nInput.value);

  document.getElementById("perAtomFormula").textContent = `${label} / ${n > 0 ? n : "N"}`;

  if (Number.isFinite(energyRy) && n > 0) {
    const resultRy = energyRy / n;
    document.getElementById("perAtomResult").textContent = `${formatEnergy(convertEnergyFromRy(resultRy, unit))} ${unitLabel}/atom`;
  } else {
    document.getElementById("perAtomResult").textContent = "-";
  }
}

function renderPerAtomCalculator(jobs) {
  const options = buildPerAtomOptions(jobs);
  const select = document.getElementById("perAtomJob");
  const nInput = document.getElementById("perAtomN");
  if (!select || !nInput) return;

  const unitSelect = document.getElementById("energyUnit");
  if (unitSelect && !unitSelect.dataset.boundPerAtom) {
    unitSelect.addEventListener("change", () => updatePerAtomCalculator());
    unitSelect.dataset.boundPerAtom = "true";
  }

  const storedValues = loadStoredSelections(PER_ATOM_STORAGE_KEY, 1);
  const previousJobId = select.value || storedValues[0];
  const unit = selectedEnergyUnit();
  const unitLabel = energyUnitLabel(unit);

  select.innerHTML = "";
  if (!options.length) {
    const empty = document.createElement("option");
    empty.textContent = "No converged energies available";
    empty.value = "";
    select.appendChild(empty);
    select.disabled = true;
  } else {
    select.disabled = false;
    for (const opt of options) {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = `${opt.label} (${formatEnergy(convertEnergyFromRy(opt.energyRy, unit))} ${unitLabel})`;
      el.dataset.label = opt.label;
      el.dataset.energyRy = String(opt.energyRy);
      el.dataset.natLatest = String(opt.natLatest);
      select.appendChild(el);
    }
    if (previousJobId && options.some((o) => o.value === previousJobId)) {
      select.value = previousJobId;
    }
  }

  function autoFillN() {
    const selectedOpt = select.options[select.selectedIndex];
    if (selectedOpt) {
      const nat = Number(selectedOpt.dataset.natLatest);
      if (nat > 0) nInput.value = nat;
    }
  }

  if (!nInput.value) autoFillN();

  if (!select.dataset.bound) {
    select.addEventListener("change", () => {
      saveStoredSelections(PER_ATOM_STORAGE_KEY, [select.value]);
      autoFillN();
      updatePerAtomCalculator();
    });
    select.dataset.bound = "true";
  }

  if (!nInput.dataset.bound) {
    nInput.addEventListener("input", () => updatePerAtomCalculator());
    nInput.dataset.bound = "true";
  }

  updatePerAtomCalculator();
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
    renderDiffCalculator(jobs);
    renderRxnCalculator(jobs);
    renderPerAtomCalculator(jobs);
    renderInputComparison(jobs);
    renderJobs(jobs);
  } catch (e) {
    document.getElementById("energyFormula").textContent = "Unable to load energy data";
    document.getElementById("energyResult").textContent = "-";
    document.getElementById("diffFormula").textContent = "Unable to load energy data";
    document.getElementById("diffResult").textContent = "-";
    document.getElementById("rxnFormula").textContent = "Unable to load energy data";
    document.getElementById("rxnResult").textContent = "-";
    document.getElementById("perAtomFormula").textContent = "Unable to load energy data";
    document.getElementById("perAtomResult").textContent = "-";
    document.getElementById("inputComparison").innerHTML = "<p>Failed to load input comparison.</p>";
    document.getElementById("jobs").innerHTML = "<p>Failed to load jobs.json</p>";
    console.error(e);
  }
}

main();
setInterval(main, 60000);
