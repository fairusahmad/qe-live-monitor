async function loadJobs() {
  const res = await fetch("data/jobs.json?t=" + Date.now());
  return await res.json();
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
    renderJobs(jobs);
  } catch (e) {
    document.getElementById("jobs").innerHTML = "<p>Failed to load jobs.json</p>";
    console.error(e);
  }
}

main();
setInterval(main, 60000);
