import argparse
import json
import os

from parse_qe import parse_qe_input_file, write_xyz


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://3Dmol.org/build/3Dmol-min.js"></script>
  <style>
    :root {{
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #172033;
      --muted: #5c677d;
      --border: #d8deea;
    }}
    body {{
      margin: 0;
      padding: 24px;
      font-family: "Segoe UI", Arial, sans-serif;
      background: linear-gradient(180deg, #eef3fb 0%, var(--bg) 100%);
      color: var(--text);
    }}
    .card {{
      max-width: 1200px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 10px 35px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }}
    .header {{
      padding: 20px 24px 12px;
      border-bottom: 1px solid var(--border);
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: 26px;
    }}
    .meta {{
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }}
    .viewer {{
      width: 100%;
      height: 72vh;
      min-height: 520px;
      background: #ffffff;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>{title}</h1>
      <div class="meta">Input file: {input_file}</div>
      <div class="meta">Atoms: {nat}</div>
      <div class="meta">Cell format: {cell_format}</div>
    </div>
    <div id="viewer" class="viewer"></div>
  </div>

  <script>
    const xyz = {xyz_json};
    const lattice = {lattice_json};
    const viewer = $3Dmol.createViewer("viewer", {{ backgroundColor: "white" }});

    const colors = {{
      H: "white",
      C: "gray",
      O: "red",
      Ni: "green",
      Cu: "orange"
    }};

    function addLatticeBox(targetViewer, matrix) {{
      if (!matrix) return;

      const a = matrix[0];
      const b = matrix[1];
      const c = matrix[2];

      const O   = {{ x: 0, y: 0, z: 0 }};
      const A   = {{ x: a[0], y: a[1], z: a[2] }};
      const B   = {{ x: b[0], y: b[1], z: b[2] }};
      const C   = {{ x: c[0], y: c[1], z: c[2] }};
      const AB  = {{ x: a[0] + b[0], y: a[1] + b[1], z: a[2] + b[2] }};
      const AC  = {{ x: a[0] + c[0], y: a[1] + c[1], z: a[2] + c[2] }};
      const BC  = {{ x: b[0] + c[0], y: b[1] + c[1], z: b[2] + c[2] }};
      const ABC = {{ x: a[0] + b[0] + c[0], y: a[1] + b[1] + c[1], z: a[2] + b[2] + c[2] }};

      const edges = [
        [O, A], [O, B], [O, C],
        [A, AB], [A, AC],
        [B, AB], [B, BC],
        [C, AC], [C, BC],
        [AB, ABC], [AC, ABC], [BC, ABC]
      ];

      for (const [start, end] of edges) {{
        targetViewer.addLine({{
          start,
          end,
          color: "black",
          linewidth: 2
        }});
      }}
    }}

    function addAxes(targetViewer, matrix) {{
      if (!matrix) return;
      const O = {{ x: 0, y: 0, z: 0 }};
      const labels = [
        ["a", matrix[0], "red"],
        ["b", matrix[1], "green"],
        ["c", matrix[2], "blue"]
      ];

      for (const [name, vec, color] of labels) {{
        const end = {{ x: vec[0], y: vec[1], z: vec[2] }};
        targetViewer.addArrow({{ start: O, end, radius: 0.08, color }});
        targetViewer.addLabel(name, {{
          position: end,
          fontColor: color,
          backgroundOpacity: 0
        }});
      }}
    }}

    viewer.addModel(xyz, "xyz");
    viewer.setStyle({{}}, {{
      stick: {{ radius: 0.16, colorscheme: colors }},
      sphere: {{ scale: 0.32, colorscheme: colors }}
    }});
    addLatticeBox(viewer, lattice);
    addAxes(viewer, lattice);
    viewer.zoomTo();
    viewer.render();
    window.addEventListener("resize", () => {{
      viewer.resize();
      viewer.render();
    }});
  </script>
</body>
</html>
"""


def write_text(path, content):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)


def main():
    parser = argparse.ArgumentParser(
        description="Plot the original structure from a Quantum ESPRESSO input file."
    )
    parser.add_argument("input_file", help="Path to the QE input file")
    parser.add_argument(
        "--outdir",
        default=None,
        help="Output directory for generated files (default: <input_dir>/plot_input_structure)"
    )
    args = parser.parse_args()

    input_file = os.path.abspath(args.input_file)
    outdir = args.outdir or os.path.join(os.path.dirname(input_file), "plot_input_structure")
    outdir = os.path.abspath(outdir)
    os.makedirs(outdir, exist_ok=True)

    parsed = parse_qe_input_file(input_file)
    if parsed is None:
        raise SystemExit(
            "Could not find a supported ATOMIC_POSITIONS block in the QE input file."
        )

    atoms_ang = parsed["atoms_ang"]
    xyz_path = os.path.join(outdir, "original_structure.xyz")
    lattice_path = os.path.join(outdir, "original_lattice.json")
    html_path = os.path.join(outdir, "original_structure_viewer.html")

    write_xyz(
        atoms_ang,
        xyz_path,
        comment="Original structure exported from QE input in Cartesian Angstrom"
    )

    lattice_payload = {
        "input_file": input_file,
        "cell_format": parsed["cell_block"]["header"] if parsed["cell_block"] else None,
        "matrix_angstrom": parsed["cell_block"]["matrix_angstrom"] if parsed["cell_block"] else None,
    }
    write_text(lattice_path, json.dumps(lattice_payload, indent=2))

    with open(xyz_path, "r", encoding="utf-8") as handle:
        xyz_text = handle.read()

    html = HTML_TEMPLATE.format(
        title="Quantum ESPRESSO Original Input Structure",
        input_file=input_file,
        nat=len(atoms_ang),
        cell_format=lattice_payload["cell_format"] or "not available",
        xyz_json=json.dumps(xyz_text),
        lattice_json=json.dumps(lattice_payload["matrix_angstrom"]),
    )
    write_text(html_path, html)

    print(f"Wrote XYZ: {xyz_path}")
    print(f"Wrote lattice JSON: {lattice_path}")
    print(f"Wrote viewer HTML: {html_path}")


if __name__ == "__main__":
    main()
