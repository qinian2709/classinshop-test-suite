#!/usr/bin/env bash
# CI test-suite runner:
# - schedule / web: TEST_SUITE_PROJECTS selects api | e2e-web | e2e-mobile; default api (full suite)
# - push / MR no longer create pipelines (see .gitlab-ci.yml workflow)
set -euo pipefail

API_DEMO_SPEC='tests/api/api-demo.spec.ts'

normalize_list() {
  echo "$1" | tr ',' '\n' | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed '/^$/d'
}

parse_projects() {
  local raw="$1"
  projects=()
  while IFS= read -r line; do
    [ -n "$line" ] && projects+=("$line")
  done <<EOF
$(normalize_list "$raw")
EOF
}

validate_projects() {
  if [ "${#projects[@]}" -eq 0 ]; then
    echo "[ci-test-suite] ERROR: no projects selected" >&2
    exit 1
  fi

  local allowed=(api e2e-web e2e-mobile)
  for project in "${projects[@]}"; do
    local ok=false
    for name in "${allowed[@]}"; do
      if [ "$project" = "$name" ]; then
        ok=true
        break
      fi
    done
    if [ "$ok" = false ]; then
      echo "[ci-test-suite] ERROR: unsupported project '$project'. Allowed: api, e2e-web, e2e-mobile" >&2
      exit 1
    fi
  done
}

pipeline="${CI_PIPELINE_SOURCE:-local}"
api_spec=""

if [ "$pipeline" = "schedule" ] || [ "$pipeline" = "web" ]; then
  parse_projects "${TEST_SUITE_PROJECTS:-api}"
  validate_projects
  echo "[ci-test-suite] ${pipeline} run, projects=$(IFS=+; echo "${projects[*]}")"
  if printf '%s\n' "${projects[@]}" | grep -qx api; then
    echo "[ci-test-suite] api scope: full tests/api"
  fi
else
  projects=(api)
  api_spec="$API_DEMO_SPEC"
  echo "[ci-test-suite] unexpected source '${pipeline}': api demo (${API_DEMO_SPEC})"
fi

echo "NOTIFY_TARGET=all" > notify.env
echo "NOTIFY_SCOPE=$(IFS=,; echo "${projects[*]}")" >> notify.env

cmd=(pnpm exec playwright test --workers=1)
for project in "${projects[@]}"; do
  cmd+=(--project="$project")
done
if [ -n "$api_spec" ]; then
  cmd+=("$api_spec")
fi

printf '[ci-test-suite] exec'
printf ' %q' "${cmd[@]}"
printf '\n'
exec "${cmd[@]}"
