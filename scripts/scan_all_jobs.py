import os
import json
import re
import shutil
from datetime import datetime
from parse_qe import (
    INPUT_COMPARE_KEYS,
    export_neb_input_structure,
    export_neb_structure,
    export_qe_run,
    parse_qe_input_details,
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
BASE_DIR = os.environ.get("QE_BASE_DIR", "/media/node1/Fairus2TB/fairus/Nguyen")
DASHBOARD_DIR = os.environ.get("QE_DASHBOARD_DIR", REPO_DIR)
DATA_DIR = os.path.join(DASHBOARD_DIR, "docs", "data")
STATUS_NOT_FOUND = "not found"
STATUS_OK = "OK"
STATUS_CALCULATING = "calculating..."

# Ordered to match your notebook workflow
OUTPUT_PRIORITY = [
    "output_relax.pw.x",
    "output_scf.pw.x",
    "nscf_output.pw.x",
    "bands_output.pw.x",
    "output.neb.x",
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

INPUT_PRIORITY = [
    "input.pw_relax.x",
    "input.pw.x",
    "nscf_input.pw.x",
    "bands_input.pw.x",
    "input.neb.x",
]

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

def find_input_file(job_dir):
    if not os.path.isdir(job_dir):
        return None

    for name in INPUT_PRIORITY:
        candidate = os.path.join(job_dir, name)
        if os.path.isfile(candidate):
            return candidate

    input_files = []
    for f in os.listdir(job_dir):
        full = os.path.join(job_dir, f)
        lower_name = f.lower()
        if os.path.isfile(full) and lower_name.startswith(JOB_MARKER_PREFIXES):
            input_files.append(f)

    if input_files:
        input_files.sort()
        return os.path.join(job_dir, input_files[0])

    return None

def find_neb_input_file(job_dir):
    candidate = os.path.join(job_dir, "input.neb.x")
    return candidate if os.path.isfile(candidate) else None

def find_axsf_file(job_dir):
    for f in sorted(os.listdir(job_dir)):
        if f.endswith(".axsf") and os.path.isfile(os.path.join(job_dir, f)):
            return os.path.join(job_dir, f)
    return None

def find_bader_charge_changes_file(job_dir):
    candidate = os.path.join(job_dir, "bader_charge_changes.csv")
    return candidate if os.path.isfile(candidate) else None

def copy_bader_charge_changes(job_dir, outdir):
    source = find_bader_charge_changes_file(job_dir)
    if not source:
        return None

    os.makedirs(outdir, exist_ok=True)
    dest = os.path.join(outdir, "bader_charge_changes.csv")
    shutil.copy2(source, dest)
    return dest

def attach_input_details(item, input_details, job_id):
    if input_details:
        item["input_file"] = input_details.get("input_file")
        item["input_file_name"] = input_details.get("input_file_name")
        item["input_parameters"] = input_details.get("parameters") or {
            key: None for key in INPUT_COMPARE_KEYS
        }
        item["input_file_data"] = f"data/{job_id}/input.json"
    else:
        item["input_file"] = None
        item["input_file_name"] = None
        item["input_parameters"] = {key: None for key in INPUT_COMPARE_KEYS}

def write_standalone_input_json(input_details, outdir):
    if not input_details:
        return

    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "input.json"), "w", encoding="utf-8") as f:
        json.dump(input_details, f, indent=2)

def write_neb_input_status(neb, output_path, job_name):
    status = {
        "job": job_name,
        "last_update": datetime.now().isoformat(),
        "status": "input structure available",
        "converged": None,
        "job_done": False,
        "nat_latest": neb["nat"],
        "num_structure_steps": neb["num_images"],
        "positions_format": "NEB images from input.neb.x",
        "cell_format": None,
        "cell_source": os.path.basename(neb["source_file"]),
        "xyz_units": "angstrom",
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(status, f, indent=2)

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

        # Once a directory is identified as a QE job, its child directories are
        # internal implementation details (for example pseudo/output folders),
        # not separate jobs to publish on the dashboard index.
        if not has_job_markers:
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
            "status": STATUS_NOT_FOUND,
            "structure_capable": False,
        }

        if not os.path.isdir(job_dir):
            jobs_summary.append(item)
            continue

        input_file = find_input_file(job_dir)
        input_details = parse_qe_input_details(input_file) if input_file else None
        attach_input_details(item, input_details, job_id)
        if input_details:
            write_standalone_input_json(input_details, os.path.join(DATA_DIR, job_id))

        outdir = os.path.join(DATA_DIR, job_id)
        neb_input = find_neb_input_file(job_dir)
        neb_input_result = None
        if neb_input:
            try:
                neb_input_result = export_neb_input_structure(neb_input, outdir)
                item["structure_capable"] = True
                item["has_structure"] = True
                item["nat_latest"] = neb_input_result["nat"]
                item["num_structure_steps"] = neb_input_result["num_images"]
                item["structure_source_file"] = neb_input
                item["structure_file"] = f"data/{job_id}/structure.xyz"
                item["original_structure_file"] = f"data/{job_id}/original_structure.xyz"
                item["trajectory_file"] = f"data/{job_id}/trajectory.xyz"
                item["lattice_file"] = f"data/{job_id}/lattice.json"
                item["original_lattice_file"] = f"data/{job_id}/original_lattice.json"
                item["original_constraints_file"] = f"data/{job_id}/original_constraints.json"
                item["atomic_positions_file"] = f"data/{job_id}/latest_atomic_positions.txt"
            except Exception as e:
                item["neb_input_structure_error"] = str(e)

        output_file = find_output_file(job_dir)
        if output_file is None:
            item["status"] = STATUS_NOT_FOUND
            if neb_input_result:
                write_neb_input_status(
                    neb_input_result,
                    os.path.join(outdir, "status.json"),
                    label,
                )
                item["status_file"] = f"data/{job_id}/status.json"
                item["note"] = "No output file found; showing NEB images from input.neb.x."
            jobs_summary.append(item)
            continue

        item["found"] = True
        item["output_file"] = output_file
        try:
            item["output_mtime"] = os.path.getmtime(output_file)
        except OSError:
            item["output_mtime"] = None

        basename = os.path.basename(output_file)
        item["structure_capable"] = basename in STRUCTURE_FRIENDLY

        try:
            result = export_qe_run(output_file, outdir, job_name=label)

            item["status"] = STATUS_OK if result.get("job_done") else STATUS_CALCULATING
            item["latest_energy_ry"] = result["latest_energy"]
            item["latest_total_force_ry_bohr"] = result["latest_total_force"]
            item["latest_gradient_error_ry_bohr"] = result["latest_gradient_error"]
            item["converged"] = result["converged"]
            item["nat_latest"] = len(result["latest_atoms_ang"])
            item["has_structure"] = len(result["latest_atoms_ang"]) > 0
            item["num_structure_steps"] = len(result["position_blocks"])
            if item["has_structure"]:
                item["structure_source_file"] = output_file

            input_details = result.get("input_details") or input_details
            attach_input_details(item, input_details, job_id)

            item["status_file"] = f"data/{job_id}/status.json"
            item["energy_file"] = f"data/{job_id}/energy.csv"
            item["total_force_file"] = f"data/{job_id}/total_force.csv"
            item["gradient_error_file"] = f"data/{job_id}/gradient_error.csv"
            item["scf_accuracy_file"] = f"data/{job_id}/scf_accuracy.csv"
            item["conv_thr_file"] = f"data/{job_id}/conv_thr.csv"
            item["total_magnetization_file"] = f"data/{job_id}/total_magnetization.csv"
            item["structure_file"] = f"data/{job_id}/structure.xyz"
            item["original_structure_file"] = f"data/{job_id}/original_structure.xyz"
            item["trajectory_file"] = f"data/{job_id}/trajectory.xyz"
            item["lattice_file"] = f"data/{job_id}/lattice.json"
            item["original_lattice_file"] = f"data/{job_id}/original_lattice.json"
            item["original_constraints_file"] = f"data/{job_id}/original_constraints.json"
            item["input_file_data"] = f"data/{job_id}/input.json"
            item["output_tail_file"] = f"data/{job_id}/latest_output_tail.txt"
            item["atomic_positions_file"] = f"data/{job_id}/latest_atomic_positions.txt"

            if copy_bader_charge_changes(job_dir, outdir):
                item["bader_charge_changes_file"] = f"data/{job_id}/bader_charge_changes.csv"

            if not item["has_structure"] and not item["structure_capable"]:
                item["note"] = "Output parsed, but this calculation type usually does not contain a final structure block."
            elif not item["has_structure"]:
                item["note"] = "Output parsed, but no final structure block was found."
        except Exception as e:
            item["status"] = STATUS_CALCULATING
            item["error"] = str(e)

        if basename == "output.neb.x":
            axsf_file = find_axsf_file(job_dir)
            if axsf_file:
                try:
                    neb = export_neb_structure(axsf_file, outdir)
                    if neb["nat"] > 0:
                        item["structure_capable"] = True
                        item["has_structure"] = True
                        item["nat_latest"] = neb["nat"]
                        item["num_structure_steps"] = neb["num_images"]
                        item["structure_source_file"] = axsf_file
                        item.pop("note", None)
                except Exception as e:
                    item["neb_structure_error"] = str(e)
            elif neb_input_result and not item.get("has_structure"):
                item["structure_capable"] = True
                item["has_structure"] = True
                item["nat_latest"] = neb_input_result["nat"]
                item["num_structure_steps"] = neb_input_result["num_images"]
                item["structure_source_file"] = neb_input
                item.pop("note", None)

        jobs_summary.append(item)

    with open(os.path.join(DATA_DIR, "jobs.json"), "w", encoding="utf-8") as f:
        json.dump(jobs_summary, f, indent=2)

    print(f"Updated docs/data/jobs.json with {len(jobs_summary)} jobs")

if __name__ == "__main__":
    main()
