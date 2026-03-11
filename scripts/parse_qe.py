import os
import re
import json
from datetime import datetime

BOHR_TO_ANG = 0.529177210903

energy_pattern = re.compile(r'!\s+total energy\s+=\s+([-0-9.Ee+]+)\s+Ry')
total_force_pattern = re.compile(r'[Tt]otal\s+force\s*=\s*([-0-9.Ee+]+)')
gradient_error_pattern = re.compile(r'Gradient\s+error\s*=\s*([-0-9.Ee+]+)\s+Ry/Bohr', re.IGNORECASE)
force_target_pattern = re.compile(r'criteria:\s*energy\s*<\s*[-0-9.Ee+]+\s+Ry,\s*force\s*<\s*([-0-9.Ee+]+)\s+Ry/Bohr', re.IGNORECASE)
bfgs_pattern = re.compile(r'number of bfgs steps\s+=\s+(\d+)', re.IGNORECASE)
scf_pattern = re.compile(r'number of scf cycles\s+=\s+(\d+)', re.IGNORECASE)

cell_header_pattern = re.compile(r'^CELL_PARAMETERS\s*\((.*?)\)', re.IGNORECASE)
atomic_header_pattern = re.compile(r'^ATOMIC_POSITIONS\s*\((.*?)\)', re.IGNORECASE)
alat_value_pattern = re.compile(r'alat\s*=\s*([-0-9.Ee+]+)', re.IGNORECASE)

alat_line_pattern = re.compile(r'lattice parameter \(alat\)\s*=\s*([-0-9.Ee+]+)\s+a\.u\.', re.IGNORECASE)
crystal_axes_header_pattern = re.compile(r'crystal axes:\s*\(cart\. coord\. in units of alat\)', re.IGNORECASE)
a_vector_pattern = re.compile(
    r'a\((\d)\)\s*=\s*\(\s*([-0-9.Ee+]+)\s+([-0-9.Ee+]+)\s+([-0-9.Ee+]+)\s*\)',
    re.IGNORECASE
)

def dot3(v, m):
    return [
        v[0] * m[0][0] + v[1] * m[1][0] + v[2] * m[2][0],
        v[0] * m[0][1] + v[1] * m[1][1] + v[2] * m[2][1],
        v[0] * m[0][2] + v[1] * m[1][2] + v[2] * m[2][2],
    ]

def parse_cell_matrix(lines, start_idx):
    header = lines[start_idx].strip()
    m = cell_header_pattern.match(header)
    if not m:
        return None

    unit_text = m.group(1).strip().lower()

    matrix_raw = []
    for j in range(start_idx + 1, min(start_idx + 4, len(lines))):
        parts = lines[j].split()
        if len(parts) < 3:
            return None
        try:
            row = [float(parts[0]), float(parts[1]), float(parts[2])]
        except ValueError:
            return None
        matrix_raw.append(row)

    if len(matrix_raw) != 3:
        return None

    if "angstrom" in unit_text:
        matrix_ang = matrix_raw
    elif "bohr" in unit_text:
        matrix_ang = [[x * BOHR_TO_ANG for x in row] for row in matrix_raw]
    elif "alat" in unit_text:
        m_alat = alat_value_pattern.search(unit_text)
        if not m_alat:
            raise ValueError(f"Could not parse alat value from header: {header}")
        alat_bohr = float(m_alat.group(1))
        scale = alat_bohr * BOHR_TO_ANG
        matrix_ang = [[x * scale for x in row] for row in matrix_raw]
    else:
        raise ValueError(f"Unsupported CELL_PARAMETERS unit in header: {header}")

    return {
        "header": header,
        "matrix_angstrom": matrix_ang,
        "next_idx": start_idx + 4,
        "source": "CELL_PARAMETERS"
    }

def parse_output_header_cell(lines):
    alat_bohr = None
    for line in lines:
        m = alat_line_pattern.search(line)
        if m:
            alat_bohr = float(m.group(1))
            break

    if alat_bohr is None:
        return None

    for i, line in enumerate(lines):
        if crystal_axes_header_pattern.search(line):
            vecs = []
            for j in range(i + 1, min(i + 6, len(lines))):
                mm = a_vector_pattern.search(lines[j])
                if mm:
                    vecs.append([
                        float(mm.group(2)),
                        float(mm.group(3)),
                        float(mm.group(4)),
                    ])
            if len(vecs) == 3:
                scale = alat_bohr * BOHR_TO_ANG
                matrix_ang = [[x * scale for x in row] for row in vecs]
                return {
                    "header": "crystal axes from output header",
                    "matrix_angstrom": matrix_ang,
                    "next_idx": i + 4,
                    "source": "output_header"
                }

    return None

def parse_atomic_positions_block(lines, start_idx):
    header = lines[start_idx].strip()
    m = atomic_header_pattern.match(header)
    if not m:
        return None

    coord_type = m.group(1).strip().lower()
    atoms = []
    i = start_idx + 1

    while i < len(lines):
        line = lines[i].strip()
        if not line:
            break
        if line.startswith("CELL_PARAMETERS"):
            break
        if line.startswith("ATOMIC_POSITIONS"):
            break
        if line.startswith("End final coordinates"):
            break
        if line.startswith("Begin final coordinates"):
            i += 1
            continue
        if line.startswith("Writing output data file"):
            break

        parts = line.split()
        if len(parts) < 4:
            break

        try:
            atoms.append((parts[0], float(parts[1]), float(parts[2]), float(parts[3])))
        except ValueError:
            break

        i += 1

    return {
        "header": header,
        "coord_type": coord_type,
        "atoms_raw": atoms,
        "next_idx": i,
    }

def read_file_lines_if_exists(path):
    if path and os.path.isfile(path):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.readlines()
    return None

def find_position_blocks_in_lines(lines, cell_block):
    if not lines:
        return []

    position_blocks = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("ATOMIC_POSITIONS"):
            parsed_pos = parse_atomic_positions_block(lines, i)
            if parsed_pos is not None:
                atoms_ang = convert_atoms_to_angstrom(parsed_pos, cell_block)
                position_blocks.append({
                    "header": parsed_pos["header"],
                    "coord_type": parsed_pos["coord_type"],
                    "nat": len(atoms_ang),
                    "atoms_ang": atoms_ang,
                })
                i = parsed_pos["next_idx"]
                continue
        i += 1

    return position_blocks

def find_latest_cell_block_in_lines(lines):
    if not lines:
        return None

    latest_cell_block = None
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("CELL_PARAMETERS"):
            parsed = parse_cell_matrix(lines, i)
            if parsed is not None:
                latest_cell_block = parsed
                i = parsed["next_idx"]
                continue
        i += 1

    if latest_cell_block is None:
        latest_cell_block = parse_output_header_cell(lines)

    return latest_cell_block

def guess_input_files_from_output(qe_output):
    job_dir = os.path.dirname(os.path.abspath(qe_output))
    candidates = [
        "input.pw_relax.x",
        "input.pw.x",
        "nscf_input.pw.x",
        "bands_input.pw.x",
    ]
    return [os.path.join(job_dir, x) for x in candidates]

def find_fallback_cell_block(qe_output):
    for inp in guess_input_files_from_output(qe_output):
        lines = read_file_lines_if_exists(inp)
        block = find_latest_cell_block_in_lines(lines)
        if block is not None:
            return block, inp
    return None, None

def parse_input_structure(qe_output):
    for inp in guess_input_files_from_output(qe_output):
        lines = read_file_lines_if_exists(inp)
        if not lines:
            continue

        cell_block = find_latest_cell_block_in_lines(lines)
        try:
            position_blocks = find_position_blocks_in_lines(lines, cell_block)
        except ValueError:
            continue
        if not position_blocks:
            continue

        return {
            "input_file": inp,
            "cell_block": cell_block,
            "position_block": position_blocks[0],
            "atoms_ang": position_blocks[0]["atoms_ang"],
        }

    return None

def convert_atoms_to_angstrom(pos_block, cell_block):
    coord_type = pos_block["coord_type"]
    atoms_raw = pos_block["atoms_raw"]

    if not atoms_raw:
        return []

    atoms_ang = []

    if "angstrom" in coord_type:
        for sym, x, y, z in atoms_raw:
            atoms_ang.append((sym, x, y, z))

    elif "bohr" in coord_type:
        for sym, x, y, z in atoms_raw:
            atoms_ang.append((sym, x * BOHR_TO_ANG, y * BOHR_TO_ANG, z * BOHR_TO_ANG))

    elif "crystal" in coord_type:
        if cell_block is None:
            raise ValueError("ATOMIC_POSITIONS (crystal) found, but no lattice information was available.")
        cell = cell_block["matrix_angstrom"]
        for sym, x, y, z in atoms_raw:
            cx, cy, cz = dot3([x, y, z], cell)
            atoms_ang.append((sym, cx, cy, cz))

    else:
        raise ValueError(f"Unsupported ATOMIC_POSITIONS unit/type: {pos_block['header']}")

    return atoms_ang

def parse_qe_output(filename):
    with open(filename, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    energies = []
    total_forces = []
    gradient_errors = []
    target_total_force = None
    for line in lines:
        m = energy_pattern.search(line)
        if m:
            energies.append(float(m.group(1)))
        mf = total_force_pattern.search(line)
        if mf:
            total_forces.append(float(mf.group(1)))
        mg = gradient_error_pattern.search(line)
        if mg:
            gradient_errors.append(float(mg.group(1)))
        mt = force_target_pattern.search(line)
        if mt:
            target_total_force = float(mt.group(1))

    bfgs_steps = None
    scf_cycles = None
    for line in reversed(lines):
        if bfgs_steps is None:
            mb = bfgs_pattern.search(line)
            if mb:
                bfgs_steps = int(mb.group(1))
        if scf_cycles is None:
            ms = scf_pattern.search(line)
            if ms:
                scf_cycles = int(ms.group(1))
        if bfgs_steps is not None and scf_cycles is not None:
            break

    text = "".join(lines)
    converged = (
        "End of BFGS Geometry Optimization" in text
        or "convergence has been achieved" in text.lower()
    )

    latest_cell_block = find_latest_cell_block_in_lines(lines)
    cell_source = latest_cell_block["source"] if latest_cell_block is not None else None

    if latest_cell_block is None:
        fallback_cell_block, fallback_file = find_fallback_cell_block(filename)
        if fallback_cell_block is not None:
            latest_cell_block = fallback_cell_block
            cell_source = f"input:{os.path.basename(fallback_file)}"

    position_blocks = find_position_blocks_in_lines(lines, latest_cell_block)
    latest_pos_block = position_blocks[-1] if position_blocks else None

    latest_atoms_ang = position_blocks[-1]["atoms_ang"] if position_blocks else []
    input_structure = parse_input_structure(filename)

    return {
        "energies": energies,
        "latest_energy": energies[-1] if energies else None,
        "total_forces": total_forces,
        "latest_total_force": total_forces[-1] if total_forces else None,
        "gradient_errors": gradient_errors,
        "latest_gradient_error": gradient_errors[-1] if gradient_errors else None,
        "target_total_force": target_total_force,
        "bfgs_steps": bfgs_steps,
        "scf_cycles": scf_cycles,
        "converged": converged,
        "latest_cell_block": latest_cell_block,
        "latest_pos_block": latest_pos_block,
        "latest_atoms_ang": latest_atoms_ang,
        "position_blocks": position_blocks,
        "cell_source": cell_source,
        "input_structure": input_structure,
    }

def write_xyz(atoms_ang, output_xyz, comment="Latest structure exported from QE output in Cartesian Angstrom"):
    if not atoms_ang:
        return
    with open(output_xyz, "w", encoding="utf-8") as f:
        f.write(f"{len(atoms_ang)}\n")
        f.write(comment + "\n")
        for sym, x, y, z in atoms_ang:
            f.write(f"{sym:<3s} {x:16.10f} {y:16.10f} {z:16.10f}\n")

def write_trajectory_xyz(position_blocks, output_xyz):
    if not position_blocks:
        return
    with open(output_xyz, "w", encoding="utf-8") as f:
        for i, block in enumerate(position_blocks, start=1):
            atoms = block["atoms_ang"]
            f.write(f"{len(atoms)}\n")
            f.write(f"Step {i} | {block['header']} | Cartesian Angstrom\n")
            for sym, x, y, z in atoms:
                f.write(f"{sym:<3s} {x:16.10f} {y:16.10f} {z:16.10f}\n")

def write_energy_csv(energies, output_csv):
    with open(output_csv, "w", encoding="utf-8") as f:
        f.write("step,energy_ry\n")
        for i, e in enumerate(energies, start=1):
            f.write(f"{i},{e}\n")

def write_total_force_csv(total_forces, output_csv):
    with open(output_csv, "w", encoding="utf-8") as f:
        f.write("step,total_force_ry_bohr\n")
        for i, force in enumerate(total_forces, start=1):
            f.write(f"{i},{force}\n")

def write_gradient_error_csv(gradient_errors, output_csv):
    with open(output_csv, "w", encoding="utf-8") as f:
        f.write("step,gradient_error_ry_bohr\n")
        for i, gradient_error in enumerate(gradient_errors, start=1):
            f.write(f"{i},{gradient_error}\n")

def write_output_tail(filename, output_tail, nlines=300):
    with open(filename, "r", encoding="utf-8", errors="ignore") as f:
        tail = f.readlines()[-nlines:]
    with open(output_tail, "w", encoding="utf-8") as f:
        f.writelines(tail)

def write_status_json(result, output_json, job_name="QE Job"):
    cell_header = result["latest_cell_block"]["header"] if result["latest_cell_block"] else None
    pos_header = result["latest_pos_block"]["header"] if result["latest_pos_block"] else None

    status = {
        "job": job_name,
        "last_update": datetime.now().isoformat(),
        "status": "finished" if result["converged"] else "running",
        "latest_energy_ry": result["latest_energy"],
        "num_energy_points": len(result["energies"]),
        "latest_total_force_ry_bohr": result["latest_total_force"],
        "target_total_force_ry_bohr": result["target_total_force"],
        "num_total_force_points": len(result["total_forces"]),
        "latest_gradient_error_ry_bohr": result["latest_gradient_error"],
        "target_gradient_error_ry_bohr": result["target_total_force"],
        "num_gradient_error_points": len(result["gradient_errors"]),
        "bfgs_steps": result["bfgs_steps"],
        "scf_cycles": result["scf_cycles"],
        "converged": result["converged"],
        "positions_format": pos_header,
        "cell_format": cell_header,
        "cell_source": result.get("cell_source"),
        "nat_latest": len(result["latest_atoms_ang"]),
        "num_structure_steps": len(result["position_blocks"]),
        "xyz_units": "angstrom"
    }

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(status, f, indent=2)


def write_lattice_json(result, output_json):
    data = {
        "cell_format": result["latest_cell_block"]["header"] if result["latest_cell_block"] else None,
        "cell_source": result.get("cell_source"),
        "matrix_angstrom": result["latest_cell_block"]["matrix_angstrom"] if result["latest_cell_block"] else None,
    }
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def write_original_lattice_json(result, output_json):
    input_structure = result.get("input_structure")
    data = {
        "input_file": input_structure["input_file"] if input_structure else None,
        "cell_format": input_structure["cell_block"]["header"] if input_structure else None,
        "cell_source": os.path.basename(input_structure["input_file"]) if input_structure else None,
        "matrix_angstrom": input_structure["cell_block"]["matrix_angstrom"] if input_structure else None,
    }
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def export_qe_run(qe_output, outdir, job_name="QE Job"):
    os.makedirs(outdir, exist_ok=True)
    result = parse_qe_output(qe_output)

    write_status_json(result, os.path.join(outdir, "status.json"), job_name=job_name)
    write_energy_csv(result["energies"], os.path.join(outdir, "energy.csv"))
    write_total_force_csv(result["total_forces"], os.path.join(outdir, "total_force.csv"))
    write_gradient_error_csv(result["gradient_errors"], os.path.join(outdir, "gradient_error.csv"))
    write_xyz(result["latest_atoms_ang"], os.path.join(outdir, "structure.xyz"))
    write_trajectory_xyz(result["position_blocks"], os.path.join(outdir, "trajectory.xyz"))
    write_lattice_json(result, os.path.join(outdir, "lattice.json"))
    write_xyz(
        result["input_structure"]["atoms_ang"] if result.get("input_structure") else [],
        os.path.join(outdir, "original_structure.xyz"),
        comment="Original structure exported from QE input in Cartesian Angstrom"
    )
    write_original_lattice_json(result, os.path.join(outdir, "original_lattice.json"))
    write_output_tail(qe_output, os.path.join(outdir, "latest_output_tail.txt"))

    return result


