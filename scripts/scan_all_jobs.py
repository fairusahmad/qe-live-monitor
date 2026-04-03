import os
import json
import re
from parse_qe import export_qe_run

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
BASE_DIR = os.environ.get("QE_BASE_DIR", "/media/node1/Fairus2TB/fairus/Nguyen")
DASHBOARD_DIR = os.environ.get("QE_DASHBOARD_DIR", REPO_DIR)
DATA_DIR = os.path.join(DASHBOARD_DIR, "docs", "data")

# Ordered to match your notebook workflow
OUTPUT_PRIORITY = [
    "output_relax.pw.x",
    "output_scf.pw.x",
    "nscf_output.pw.x",
    "bands_output.pw.x",
    "bands_post_output.x",
    "projwfc.out",
    "potential_pp.out",
    "potential_average.out",
    "ph.out",
    "q2r.out",
    "matdyn.out",
    "plotband.out",
    # fallback legacy names
    "relax.out",
    "vc-relax.out",
    "scf.out",
    "nscf.out",
    "pw.out",
    "neb.out",
]

JOB_MARKER_SUFFIXES = (
    ".out",
    ".pw.x",
    ".x",
    ".cif",
    ".xsf",
    ".upf",
)

JOB_MARKER_PREFIXES = (
    "input.",
    "nscf_input.",
    "bands_input.",
)

SKIP_DIR_NAMES = {
    ".git",
    "__pycache__",
    "output",
}

STRUCTURE_FRIENDLY = {
    "output_relax.pw.x",
    "output_scf.pw.x",
    "nscf_output.pw.x",
    "bands_output.pw.x",
    "relax.out",
    "vc-relax.out",
    "scf.out",
    "nscf.out",
    "pw.out",
}

def find_output_file(job_dir):
    if not os.path.isdir(job_dir):
        return None

    for name in OUTPUT_PRIORITY:
        candidate = os.path.join(job_dir, name)
        if os.path.isfile(candidate):
            return candidate

    out_files = []
    for f in os.listdir(job_dir):
        full = os.path.join(job_dir, f)
        if os.path.isfile(full) and (f.endswith(".out") or f.endswith(".pw.x") or f.endswith(".x")):
            out_files.append(f)

    if out_files:
        out_files.sort()
        return os.path.join(job_dir, out_files[0])

    return None

def natural_sort_key(value):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]

def make_job_id(relative_path):
    parts = [segment for segment in relative_path.split(os.sep) if segment]
    safe_parts = [re.sub(r"[^A-Za-z0-9_-]+", "_", segment) for segment in parts]
    return "__".join(safe_parts)

def iter_child_dirs(path):
    try:
        with os.scandir(path) as entries:
            child_dirs = [
                entry.path for entry in entries
                if entry.is_dir() and entry.name not in SKIP_DIR_NAMES and not entry.name.startswith(".")
            ]
    except FileNotFoundError:
        return []

    return sorted(child_dirs, key=natural_sort_key)

def dir_has_job_markers(path):
    try:
        with os.scandir(path) as entries:
            for entry in entries:
                if not entry.is_file():
                    continue

                name = entry.name
                lower_name = name.lower()
                if lower_name.endswith(JOB_MARKER_SUFFIXES):
                    return True
                if lower_name.startswith(JOB_MARKER_PREFIXES):
                    return True
    except FileNotFoundError:
        return False

    return False

def discover_jobs(base_dir):
    if not os.path.isdir(base_dir):
        return []

    jobs = []
    stack = iter_child_dirs(base_dir)

    while stack:
        current_dir = stack.pop(0)
        child_dirs = iter_child_dirs(current_dir)
        has_job_markers = dir_has_job_markers(current_dir)
        is_leaf = len(child_dirs) == 0

        if has_job_markers or is_leaf:
            relative_path = os.path.relpath(current_dir, base_dir)
            jobs.append((
                make_job_id(relative_path),
                relative_path.replace(os.sep, " / "),
                current_dir,
            ))

        stack[0:0] = child_dirs

    jobs.sort(key=lambda item: natural_sort_key(item[1]))
    return jobs

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    jobs_summary = []
    jobs = discover_jobs(BASE_DIR)

    for job_id, label, job_dir in jobs:
        item = {
            "job_id": job_id,
            "label": label,
            "source_dir": job_dir,
            "found": False,
            "output_file": None,
            "status": "missing",
            "structure_capable": False,
        }

        if not os.path.isdir(job_dir):
            jobs_summary.append(item)
            continue

        output_file = find_output_file(job_dir)
        if output_file is None:
            item["status"] = "no_output_found"
            jobs_summary.append(item)
            continue

        item["found"] = True
        item["output_file"] = output_file

        basename = os.path.basename(output_file)
        item["structure_capable"] = basename in STRUCTURE_FRIENDLY

        outdir = os.path.join(DATA_DIR, job_id)

        try:
            result = export_qe_run(output_file, outdir, job_name=label)

            item["status"] = "ok"
            item["latest_energy_ry"] = result["latest_energy"]
            item["latest_total_force_ry_bohr"] = result["latest_total_force"]
            item["latest_gradient_error_ry_bohr"] = result["latest_gradient_error"]
            item["converged"] = result["converged"]
            item["nat_latest"] = len(result["latest_atoms_ang"])
            item["has_structure"] = len(result["latest_atoms_ang"]) > 0
            item["num_structure_steps"] = len(result["position_blocks"])

            item["status_file"] = f"data/{job_id}/status.json"
            item["energy_file"] = f"data/{job_id}/energy.csv"
            item["total_force_file"] = f"data/{job_id}/total_force.csv"
            item["gradient_error_file"] = f"data/{job_id}/gradient_error.csv"
            item["structure_file"] = f"data/{job_id}/structure.xyz"
            item["original_structure_file"] = f"data/{job_id}/original_structure.xyz"
            item["trajectory_file"] = f"data/{job_id}/trajectory.xyz"
            item["lattice_file"] = f"data/{job_id}/lattice.json"
            item["original_lattice_file"] = f"data/{job_id}/original_lattice.json"
            item["output_tail_file"] = f"data/{job_id}/latest_output_tail.txt"

            if not item["has_structure"] and not item["structure_capable"]:
                item["note"] = "Output parsed, but this calculation type usually does not contain a final structure block."
            elif not item["has_structure"]:
                item["note"] = "Output parsed, but no final structure block was found."
        except Exception as e:
            item["status"] = "error"
            item["error"] = str(e)

        jobs_summary.append(item)

    with open(os.path.join(DATA_DIR, "jobs.json"), "w", encoding="utf-8") as f:
        json.dump(jobs_summary, f, indent=2)

    print(f"Updated docs/data/jobs.json with {len(jobs_summary)} jobs")

if __name__ == "__main__":
    main()

