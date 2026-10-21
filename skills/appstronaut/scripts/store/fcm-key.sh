#!/usr/bin/env bash
# Make the FCM V1 service-account key EAS needs for Android push, into the shared
# credentials folder, for a Firebase project created in a Google Workspace organization.
#
#   fcm-key.sh <firebase-project-id> <name>      e.g.  fcm-key.sh myapp-1a2b3 myapp
#
# Writes ~/Projects/Operations/credentials/google/<name>-fcm-service-account.json (mode 600)
# and never prints it. Organizations created since 2024 enforce
# iam.disableServiceAccountKeyCreation, so the console's "Generate new private key" fails with
# "Key creation is not allowed on this service account". This lifts the policy for that one
# project, creates the key (retrying while the change propagates), then restores the
# organization's policy. It also enables the FCM API.
#
# Needs: gcloud signed in as an org admin (run `gcloud auth login` first if it says reauth).
set -euo pipefail
PROJECT="${1:?firebase project id}"; NAME="${2:?short app name}"
OUT="$HOME/Projects/Operations/credentials/google/${NAME}-fcm-service-account.json"
[ -e "$OUT" ] && { echo "✗ $OUT already exists — delete it first if you mean to replace it"; exit 1; }

SA=$(gcloud iam service-accounts list --project="$PROJECT" --format="value(email)" | grep -m1 firebase-adminsdk || true)
[ -n "$SA" ] || { echo "✗ no firebase-adminsdk service account in $PROJECT (open the project once in the Firebase console)"; exit 1; }
echo "service account: $SA"

restore() { gcloud resource-manager org-policies delete iam.disableServiceAccountKeyCreation --project="$PROJECT" >/dev/null 2>&1 || true; }
trap restore EXIT
gcloud resource-manager org-policies disable-enforce iam.disableServiceAccountKeyCreation --project="$PROJECT" >/dev/null
echo "key creation allowed for $PROJECT only (restored on exit)"

umask 077
for i in 1 2 3 4 5 6 7 8 9 10; do
  if gcloud iam service-accounts keys create "$OUT" --iam-account="$SA" --project="$PROJECT" >/dev/null 2>&1; then
    echo "✓ key saved: $OUT"; break
  fi
  rm -f "$OUT"; echo "  policy still propagating (try $i), waiting 30s"; sleep 30
done
[ -s "$OUT" ] || { echo "✗ key not created"; exit 1; }

gcloud services enable fcm.googleapis.com --project="$PROJECT" >/dev/null && echo "✓ FCM API enabled"
echo "Next: eas credentials -p android → production → Google Service Account →"
echo "  FCM V1 → Set up → [Upload a new service account key] → $OUT"
