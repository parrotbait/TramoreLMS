#!/usr/bin/env bash
# Created by Claude driven by Eddie Long on 2026-11-22.
#
# Makes the key pair that encrypts the database backups.
#
#   scripts/make-backup-key.sh [folder]
#
# The folder defaults to ~/lms-backup-keys. It must be OUTSIDE any git
# repository, because a private key in a repository is a leaked key. The script
# refuses otherwise. It never prints the private key. The public key is copied
# to the clipboard (on a Mac) for pasting into BACKUP_PUBLIC_KEY in Vercel.
#
# The private key is the only way to open a backup. Keep it in a password
# manager, and give a copy to a second person at the club.

set -euo pipefail

folder=${1:-"$HOME/lms-backup-keys"}
stamp=$(date +%Y%m%d)
private_key="$folder/lms-backup-private-$stamp.pem"
public_key="$folder/lms-backup-public-$stamp.pem"

# Check before making anything: the nearest folder that exists must not be inside a repository.
nearest=$folder
while [[ ! -d $nearest ]]; do
    nearest=$(dirname "$nearest")
done
if git -C "$nearest" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "Refusing: $folder is inside a git repository. Choose a folder outside every repository." >&2
    exit 1
fi

mkdir -p "$folder"
chmod 700 "$folder"

if [[ -e $private_key || -e $public_key ]]; then
    echo "Refusing: a key pair from today already exists in $folder. Move it or choose another folder." >&2
    exit 1
fi

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$private_key" 2> /dev/null
chmod 600 "$private_key"
openssl pkey -in "$private_key" -pubout -out "$public_key"
chmod 644 "$public_key"

# Prove the pair works the way the backup uses it: wrap a random key with the public half
# (RSA-OAEP, SHA-256), and unwrap it with the private half.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
openssl rand -out "$work/secret" 32
openssl pkeyutl -encrypt -pubin -inkey "$public_key" \
    -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
    -in "$work/secret" -out "$work/wrapped"
openssl pkeyutl -decrypt -inkey "$private_key" \
    -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
    -in "$work/wrapped" -out "$work/unwrapped"
if ! cmp -s "$work/secret" "$work/unwrapped"; then
    echo "The new key pair failed its self-test. Do not use it." >&2
    exit 1
fi

echo "Made a new key pair in $folder:"
echo "  private (keep secret): $(basename "$private_key")"
echo "  public  (goes in Vercel as BACKUP_PUBLIC_KEY): $(basename "$public_key")"
echo "The pair passed its self-test."

if command -v pbcopy > /dev/null 2>&1; then
    pbcopy < "$public_key"
    echo "The public key is on your clipboard. Paste it into BACKUP_PUBLIC_KEY in Vercel."
else
    echo "Copy the contents of $(basename "$public_key") into BACKUP_PUBLIC_KEY in Vercel."
fi

echo "Next: put the private key in your password manager, and give a copy to a second person."
