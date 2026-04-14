async function loadJobs() {
  const res = await fetch("data/jobs.json?t=" + Date.now());
  return await res.json();
}

const RY_TO_EV = 13.6057039763;

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

function renderJobs(jobs) {
  const el = document.getElementById("jobs");
  el.innerHTML = "";

  for (const job of jobs) {
    const card = document.createElement("div");
    card.className = "card";

    let statusClass = job.status === "ok" ? "ok" : "bad";

    card.innerHTML = `
      <div class="title">${job.label}</div>
      <div class="meta"><b>Status:</b> <span class="${statusClass}">${job.status}</span></div>
      <div class="meta"><b>Source dir:</b> ${job.source_dir}</div>
      <div class="meta"><b>Picked output:</b> ${job.output_file ?? "-"}</div>
      <div class="meta"><b>Latest energy:</b> ${job.latest_energy_ry ?? "-"}</div>
      <div class="meta"><b>Converged:</b> ${job.converged ?? "-"}</div>
      <div class="meta"><b>Atoms:</b> ${job.nat_latest ?? "-"}</div>
      <div class="meta"><b>Has structure:</b> ${job.has_structure ?? "-"}</div>
      <a class="button" href="job.html?job=${encodeURIComponent(job.job_id)}">Open job</a>
    `;

    el.appendChild(card);
  }
}

async function main() {
  try {
    const jobs = await loadJobs();
    renderCalculator(jobs);
    renderJobs(jobs);
  } catch (e) {
    document.getElementById("energyFormula").textContent = "Unable to load energy data";
    document.getElementById("energyResult").textContent = "-";
    document.getElementById("jobs").innerHTML = "<p>Failed to load jobs.json</p>";
    console.error(e);
  }
}

main();
setInterval(main, 60000);
