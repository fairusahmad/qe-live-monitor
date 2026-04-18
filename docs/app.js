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

function buildEnergyOptions(jobs) {
  return jobs
    .filter((job) => Number.isFinite(job.latest_energy_ry))
    .map((job) => ({
      value: job.job_id,
      label: `${job.label} (${formatEnergy(ryToEv(job.latest_energy_ry))} eV)`,
      energy: ryToEv(job.latest_energy_ry)
    }));
}

function populateSelect(select, options, preferredIndex) {
  select.innerHTML = "";

  for (const option of options) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    el.dataset.energy = String(option.energy);
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

function updateCalculator() {
  const selectIds = ["energyA", "energyB", "energyC"];
  const chosen = selectIds.map((id) => {
    const select = document.getElementById(id);
    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption) {
      return { label: "-", energy: NaN };
    }

    return {
      label: selectedOption.textContent,
      energy: Number(selectedOption.dataset.energy)
    };
  });

  const [energyA, energyB, energyC] = chosen;
  const formulaEl = document.getElementById("energyFormula");
  const resultEl = document.getElementById("energyResult");

  formulaEl.textContent = `${energyA.label} - ${energyB.label} - ${energyC.label}`;

  if (chosen.every((item) => Number.isFinite(item.energy))) {
    resultEl.textContent = `${formatEnergy(energyA.energy - energyB.energy - energyC.energy)} eV`;
  } else {
    resultEl.textContent = "-";
  }
}

function renderCalculator(jobs) {
  const options = buildEnergyOptions(jobs);
  const selectIds = ["energyA", "energyB", "energyC"];

  selectIds.forEach((id, index) => {
    const select = document.getElementById(id);
    const previousValue = select.value;
    populateSelect(select, options, index);

    if (previousValue && options.some((option) => option.value === previousValue)) {
      select.value = previousValue;
    }

    if (!select.dataset.bound) {
      select.addEventListener("change", updateCalculator);
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
  return jobs.filter((job) => job.input_parameters || job.input_file_name || job.status === "ok");
}

function populateComparisonSelect(select, jobs, preferredJobId, preferredIndex) {
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
  } else if (jobs[preferredIndex]) {
    select.value = jobs[preferredIndex].job_id;
  } else {
    select.value = "";
  }
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

  const previousValues = COMPARISON_SELECT_IDS.map((id) => document.getElementById(id)?.value);

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
    populateComparisonSelect(select, options, previousValues[index], index);
    select.addEventListener("change", () => renderInputComparisonTable(jobs));
  });

  renderInputComparisonTable(jobs);
}

function renderJobs(jobs) {
  const el = document.getElementById("jobs");
  el.innerHTML = "";

  for (const job of jobs) {
    const card = document.createElement("div");
    card.className = "card";

    let statusClass = job.status === "ok" ? "ok" : "bad";

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
