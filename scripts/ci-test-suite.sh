#!/usr/bin/env bash
# Resolve CI test plan and run a single Playwright invocation for test-suite job.
set -euo pipefail

normalize_list() {
  echo "$1" | tr ',' '\n' | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed '/^$/d'
}

resolve_default_projects() {
  case "${CI_PIPELINE_SOURCE:-local}" in
    schedule)
      echo "${SCHEDULE_TEST_SUITE_PROJECTS:-api,e2e-web,e2e-mobile}"
      ;;
    merge_request_event)
      echo "${MR_TEST_SUITE_PROJECTS:-api}"
      ;;
    *)
      echo "${BRANCH_TEST_SUITE_PROJECTS:-api}"
      ;;
  esac
}

resolve_default_api_spec() {
  case "${CI_PIPELINE_SOURCE:-local}" in
    schedule)
      echo "${SCHEDULE_TEST_SUITE_API_SPEC:-}"
      ;;
    merge_request_event)
      echo "${MR_TEST_SUITE_API_SPEC:-tests/api/api-demo.spec.ts}"
      ;;
    *)
      echo "${BRANCH_TEST_SUITE_API_SPEC:-tests/api/api-demo.spec.ts}"
      ;;
  esac
}

projects_raw="${TEST_SUITE_PROJECTS:-$(resolve_default_projects)}"
projects=()
while IFS= read -r line; do
  [ -n "$line" ] && projects+=("$line")
done <<EOF
$(normalize_list "$projects_raw")
EOF

if [ "${#projects[@]}" -eq 0 ]; then
  echo "[ci-test-suite] ERROR: no projects selected. Set TEST_SUITE_PROJECTS=api,e2e-web,e2e-mobile" >&2
  exit 1
fi

allowed=(api e2e-web e2e-mobile)
for project in "${projects[@]}"; do
  ok=false
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

notify_target="$(IFS=+; echo "${projects[*]}")"
echo "NOTIFY_TARGET=${notify_target}" > notify.env

api_spec="${TEST_SUITE_API_SPEC:-$(resolve_default_api_spec)}"
if [ -n "$api_spec" ] && [[ "$api_spec" != tests/* ]]; then
  echo "[ci-test-suite] ERROR: TEST_SUITE_API_SPEC must be under tests/ (got: $api_spec)" >&2
  exit 1
fi

echo "[ci-test-suite] pipeline=${CI_PIPELINE_SOURCE:-local} projects=${notify_target}"
if printf '%s\n' "${projects[@]}" | grep -qx api; then
  if [ -n "$api_spec" ]; then
    echo "[ci-test-suite] api scope: ${api_spec}"
  else
    echo "[ci-test-suite] api scope: full tests/api"
  fi
fi

cmd=(pnpm exec playwright test --workers=1)
for project in "${projects[@]}"; do
  cmd+=(--project="$project")
done
if printf '%s\n' "${projects[@]}" | grep -qx api && [ -n "$api_spec" ]; then
  cmd+=("$api_spec")
fi

printf '[ci-test-suite] exec'
printf ' %q' "${cmd[@]}"
printf '\n'
exec "${cmd[@]}"
