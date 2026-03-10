import os
import json
from parse_qe import export_qe_run

BASE_DIR = "/media/node1/Fairus2TB/fairus/Nguyen"
DASHBOARD_DIR = "/media/node1/Fairus2TB/fairus/qe-live-monitor"
DATA_DIR = os.path.join(DASHBOARD_DIR, "docs", "data")

JOBS = [
    ("Bulk__Ni", "Bulk / Ni", os.path.join(BASE_DIR, "Bulk", "Ni")),
    ("Bulk__Cu", "Bulk / Cu", os.path.join(BASE_DIR, "Bulk", "Cu")),
    ("Slab__Ni_only", "Slab / Ni_only", os.path.join(BASE_DIR, "Slab", "Ni_only")),
    ("Slab__Ni_Cu_only", "Slab / Ni_Cu_only", os.path.join(BASE_DIR, "Slab", "Ni_Cu_only")),
    ("Adsorption__Ni_ads", "Adsorption / Ni_ads", os.path.join(BASE_DIR, "Adsorption", "Ni_ads")),
    ("Adsorption__Ni_Cu_ads", "Adsorption / Ni_Cu_ads", os.path.join(BASE_DIR, "Adsorption", "Ni_Cu_ads")),
    ("DOS", "DOS", os.path.join(BASE_DIR, "DOS")),
    ("NEB", "NEB", os.path.join(BASE_DIR, "NEB")),
]

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

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    jobs_summary = []

    for job_id, label, job_dir in JOBS:
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
            item["converged"] = result["converged"]
            item["nat_latest"] = len(result["latest_atoms_ang"])
            item["has_structure"] = len(result["latest_atoms_ang"]) > 0
            item["num_structure_steps"] = len(result["position_blocks"])

            item["status_file"] = f"data/{job_id}/status.json"
            item["energy_file"] = f"data/{job_id}/energy.csv"
            item["total_force_file"] = f"data/{job_id}/total_force.csv"
            item["structure_file"] = f"data/{job_id}/structure.xyz"
            item["trajectory_file"] = f"data/{job_id}/trajectory.xyz"
            item["lattice_file"] = f"data/{job_id}/lattice.json"
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

    print("Updated docs/data/jobs.json")

if __name__ == "__main__":
    main()
