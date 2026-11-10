#!/usr/bin/env bash
# One-line deploy of the "See interpretations" Cloud Function from Google
# Cloud Shell (works from a phone browser). In Cloud Shell, type:
#   curl -sL 9average9.github.io/Greek-Vocab/fn.sh | bash
# It deploys only getPassageInterpretations. It reuses the ANTHROPIC_API_KEY
# secret your other functions already use, and never asks you to paste anything.
set -u

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok() { printf '\n\033[1;32m✔ %s\033[0m\n\n' "$*"; exit 0; }

# Everything runs inside main(), so bash reads the whole script before running
# any of it (piped into bash, a command could otherwise eat the rest).
main() {
  local PROJECT="greek-vocab-leaderboard"
  local FN="getPassageInterpretations"
  local REPO="https://github.com/9Average9/Greek-Vocab.git"

  say "Getting the latest app code…"
  cd ~ && rm -rf Greek-Vocab && git clone -q --depth 1 "$REPO" Greek-Vocab || { echo "Couldn't download the code."; exit 1; }
  cd ~/Greek-Vocab || exit 1

  gcloud config set project "$PROJECT" --quiet >/dev/null 2>&1

  # 1) The normal Firebase way, if Firebase CLI is already signed in here.
  say "Trying the Firebase deploy…"
  if (cd functions && npm ci --no-audit --no-fund --loglevel=error) &&
     npx -y firebase-tools@latest deploy --only "functions:$FN" --project "$PROJECT" --non-interactive; then
    ok "Deploy complete! See interpretations is ready."
  fi

  # 2) Otherwise deploy the same function with gcloud, which Cloud Shell has
  #    already signed in. Same settings Firebase would use: Node 22,
  #    us-central1, 5-minute timeout, 512MB, the shared Anthropic key.
  say "Firebase CLI isn't signed in here, so deploying with gcloud instead…"
  rm -rf functions/node_modules
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
      --memory=512MB \
      --timeout=300s \
      --set-secrets="ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" \
      --set-env-vars="^@^FIREBASE_CONFIG=$CONFIG@GCLOUD_PROJECT=$PROJECT"; then
    ok "Deploy complete! See interpretations is ready."
  fi

  printf '\n\033[1;31m✘ The deploy didn’t finish.\033[0m Send a screenshot of the lines above and I’ll sort it out.\n\n'
  exit 1
}

main "$@" </dev/null
