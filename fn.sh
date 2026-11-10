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

# Run gcloud attached to the real terminal, even when this script arrives
# through "curl | bash": Cloud Shell's own sign-in needs the terminal, and
# without it gcloud wrongly reports that no account is signed in.
TTY=/dev/null
if [ -r /dev/tty ] && (exec </dev/tty) 2>/dev/null; then TTY=/dev/tty; fi
g() { gcloud "$@" <"$TTY"; }

# Everything runs inside main(), and "main" is the last line, so bash has read
# the whole script before anything runs.
main() {
  local PROJECT="greek-vocab-leaderboard"
  local FN="getPassageInterpretations"
  local RAW="https://raw.githubusercontent.com/9Average9/Greek-Vocab/main"

  say "Checking your Google sign-in…"
  if ! g auth print-access-token >/dev/null; then
    # Cloud Shell sometimes has your account but none selected: pick it.
    local acct
    acct=$(g auth list --format="value(account)" 2>/dev/null | head -1)
    if [ -n "$acct" ]; then
      g config set account "$acct" --quiet >/dev/null 2>&1
      echo "Using $acct"
    else
      echo "(Couldn't confirm the sign-in. Trying the deploy anyway.)"
    fi
  fi
  g config set project "$PROJECT" --quiet >/dev/null 2>&1

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
  if g functions deploy "$FN" \
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

main "$@"
