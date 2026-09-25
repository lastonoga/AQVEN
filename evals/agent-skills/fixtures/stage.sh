#!/usr/bin/env bash
set -euo pipefail

fixtures="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case_dir="$1"
shift

project="$fixtures/lumen_trimmed/lumen"
if [ ! -f "$project/aqven.yaml" ]; then
  echo "stage: $project is missing; run fixtures/make_fixture.py" >&2
  exit 1
fi
cp -R "$project/." .

for extra in "$@"; do
  if [ ! -d "$fixtures/$extra" ]; then
    echo "stage: fixture $extra is missing under $fixtures" >&2
    exit 1
  fi
  mkdir -p "inbox"
  cp -R "$fixtures/$extra/." "inbox/"
done

if [ -d "$case_dir/overlay" ]; then
  cp -R "$case_dir/overlay/." .
fi
