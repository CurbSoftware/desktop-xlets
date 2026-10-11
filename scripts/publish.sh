#!/usr/bin/env bash
# Zip each published spice, copy the zips into the local publish directory,
# and attach them to a GitHub release.
# This repo has no single version, so the tag is v0.0.0-<shortsha> of current main.
# Each zip still uses the version stored in that spice's metadata.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_NAME="desktop-xlets"
DEST="/home/user/projects/published/${REPO_NAME}"
GH_REPO="CurbSoftware/${REPO_NAME}"

cd "$ROOT"

short="$(git rev-parse --short HEAD)"
tag="v0.0.0-${short}"
echo "No single version in this project. Using tag ${tag} from current main."

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

ROOT="$ROOT" OUT="$stage" python3 - <<'PY'
import json
import os
import zipfile
from pathlib import Path

root = Path(os.environ["ROOT"])
out_dir = Path(os.environ["OUT"])
skip_parts = {"__pycache__", ".DS_Store"}

def skip(rel: Path) -> bool:
    return any(part in skip_parts or part.endswith(".pyc") for part in rel.parts)

spices = []
for kind, base in (("gnome", root / "gnome"), ("kde", root / "kde")):
    for folder in sorted(path for path in base.iterdir() if path.is_dir()):
        if (folder / "metadata.json").is_file():
            spices.append((kind, folder))

for folder in sorted(path for path in (root / "cinnamon").iterdir() if path.is_dir()):
    if not (folder / "metadata.json").is_file():
        continue
    if folder.name.startswith(("gnome-", "kde-")):
        continue
    spices.append(("cinnamon", folder))

if not spices:
    raise SystemExit("no spices found")

for kind, folder in spices:
    meta = json.loads((folder / "metadata.json").read_text())
    if kind == "kde":
        version = str(meta["KPlugin"]["Version"])
        ident = str(meta["KPlugin"]["Id"])
    else:
        version = str(meta["version"])
        ident = str(meta["uuid"])
    dest = out_dir / f"{ident}-{version}.zip"
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        files = sorted(path for path in folder.rglob("*") if path.is_file())
        for path in files:
            rel = path.relative_to(folder)
            if skip(rel):
                continue
            arc = rel.as_posix() if kind == "kde" else f"{ident}/{rel.as_posix()}"
            archive.write(path, arc)
    print(dest.name)
PY

mkdir -p "$DEST"
find "$DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$stage"/*.zip "$DEST/"

notes="$(mktemp)"
cat >"$notes" <<EOF
No single version is set in this repository. This release is current main, tagged ${tag}.

Each zip uses the version in that spice's metadata. GNOME and Cinnamon zips contain the spice uuid directory. KDE zips have metadata.json at the archive root.
EOF

mapfile -t artifacts < <(find "$DEST" -maxdepth 1 -type f -name '*.zip' | sort)
if [[ "${#artifacts[@]}" -eq 0 ]]; then
  echo "no spice zips were written" >&2
  exit 1
fi

if gh release view "$tag" --repo "$GH_REPO" >/dev/null 2>&1; then
  mapfile -t existing < <(gh release view "$tag" --repo "$GH_REPO" --json assets --jq '.assets[].name')
  for artifact in "${artifacts[@]}"; do
    name="$(basename "$artifact")"
    have_it=0
    for have in "${existing[@]+"${existing[@]}"}"; do
      if [[ "$have" == "$name" ]]; then
        have_it=1
        break
      fi
    done
    if [[ "$have_it" -eq 0 ]]; then
      gh release upload "$tag" "$artifact" --repo "$GH_REPO"
    else
      echo "release $tag already has $name"
    fi
  done
else
  gh release create "$tag" "${artifacts[@]}" \
    --repo "$GH_REPO" \
    --target main \
    --title "$tag" \
    --notes-file "$notes"
fi
rm -f "$notes"
