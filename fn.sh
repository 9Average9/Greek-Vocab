#!/usr/bin/env bash
# One-line deploy of the "See interpretations" Cloud Function from Google
# Cloud Shell (works from a phone browser). In Cloud Shell, type:
#   curl https://9average9.github.io/Greek-Vocab/fn.sh | bash
# It deploys only getPassageInterpretations with gcloud (already signed in
# inside Cloud Shell), reusing the ANTHROPIC_API_KEY secret your other
# functions use. It never asks you to paste anything.
set -u

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok() { printf '\n\033[1;32m✔ %s\033[0m\n\n' "$*"; exit 0; }
fail() { printf '\n\033[1;31m✘ %s\033[0m\n\n' "$*"; exit 1; }

signed_in() { gcloud auth print-access-token >/dev/null 2>&1; }

# Everything runs inside main(), so bash reads the whole script before running
# any of it (piped into bash, a command could otherwise eat the rest).
main() {
  local PROJECT="greek-vocab-leaderboard"
  local FN="getPassageInterpretations"
  local RAW="https://raw.githubusercontent.com/9Average9/Greek-Vocab/main"

  say "Checking your Google sign-in…"
  if ! signed_in; then
    # Cloud Shell often has your account but none selected: pick it.
    local acct
    acct=$(gcloud auth list --format="value(account)" 2>/dev/null | head -1)
    [ -n "$acct" ] && gcloud config set account "$acct" --quiet >/dev/null 2>&1
  fi
  if ! signed_in; then
    fail "Cloud Shell isn't signed in to Google right now.
  Fix: tap the X at the top left to close Cloud Shell, open it again,
  and if a box asks to \"Authorize Cloud Shell\", tap Authorize.
  Then type the same curl line again."
  fi
  gcloud config set project "$PROJECT" --quiet >/dev/null 2>&1

  # Only the 3 small files the function needs, not the whole (large) app repo,
  # in a temp folder so it never fills your Cloud Shell home drive.
  say "Getting the latest function code…"
  rm -rf ~/Greek-Vocab 2>/dev/null   # leftover from older versions of this script
  local DIR
  DIR=$(mktemp -d /tmp/rhema-fn.XXXXXX) || exit 1
  mkdir -p "$DIR/functions" && cd "$DIR" || exit 1
  for f in index.js package.json package-lock.json; do
    curl -fsSL "$RAW/functions/$f?nocache=$RANDOM" -o "functions/$f" || fail "Couldn't download functions/$f. Check your connection and try again."
  done

  # Same settings Firebase would use: 1st gen, Node 22, us-central1,
  # 2-minute timeout, 256MB, the shared Anthropic key, Firebase config.
  say "Deploying See interpretations (2–4 minutes)…"
  local CONFIG='{"projectId":"greek-vocab-leaderboard","storageBucket":"greek-vocab-leaderboard.firebasestorage.app","locationId":"us-central"}'
  if gcloud functions deploy "$FN" \
      --quiet \
      --no-gen2 \
      --region=us-central1 \
      --runtime=nodejs22 \
      --trigger-http \
      --allow-unauthenticated \
      --entry-point="$FN" \
      --source=functions \
      --memory=256MB \
      --timeout=120s \
      --set-secrets="ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" \
      --set-env-vars="^@^FIREBASE_CONFIG=$CONFIG@GCLOUD_PROJECT=$PROJECT"; then
    ok "Deploy complete! See interpretations is ready."
  fi
  fail "The deploy didn’t finish. Send a screenshot of the lines above and I’ll sort it out."
}

main "$@" </dev/null
