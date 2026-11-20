#!/bin/sh
# Restores the archive files over 5 MiB (the ladder pilot's hidden cases.json
# files and brag-output/brag.mp4) at their original paths. They live in a
# GitHub release so every tracked file stays under the Claude plugin
# directory's 5 MiB limit. Run from anywhere: sh archive/fetch-large-files.sh
# The tarball's paths start with experiments/, this folder's old name.
set -eu
cd "$(dirname "$0")"
base=https://github.com/lunox-work/duediligence/releases/download/experiments-large-files-2026-11-11
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$base/duediligence-experiments-large-files.tar.xz" -o "$tmp/files.tar.xz"
curl -fsSL "$base/duediligence-experiments-large-files.sha256" -o "$tmp/files.sha256"
tar -xJf "$tmp/files.tar.xz" --strip-components 1
sed 's#  experiments/#  #' "$tmp/files.sha256" | shasum -a 256 -c - >/dev/null
echo "restored $(wc -l < "$tmp/files.sha256" | tr -d ' ') files"
