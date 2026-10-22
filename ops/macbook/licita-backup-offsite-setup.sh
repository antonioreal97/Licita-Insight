#!/usr/bin/env bash
# One-time setup, run by the owner from their own Mac, of the encrypted off-machine backup copy:
# MacBook server (licita-worker) -> Oracle edge VM (abriu-edge), over Tailscale.
# The dump is encrypted on the server to the "Pardal Digital backup" OpenPGP public key; the private key stays on the
# owner's Mac (and in their password manager), so neither the server nor the edge can read the copies.
# Safe to run again: every step checks before it changes anything.
set -Eeuo pipefail

# Piped into bash ("git show ... | bash"), the script is bash's standard input and the first ssh would read the rest
# of it as its own input. Inside braces bash reads the whole body before running any of it. Not indented: the
# remote heredoc below needs its terminator at the start of the line.
{
server=${SETUP_SERVER:-licita-worker}
edge=${SETUP_EDGE:-abriu-edge}
edge_tailscale_ip=100.100.59.75
edge_public_ip=137.131.233.192
server_tailscale_ip=100.76.192.116
key_uid='Pardal Digital backup'
branch=origin/ops/macbook-worker
clone='~/Documentos/LICITA/Licita-Insight'

say() { printf '\n== %s\n' "$*"; }

say "Chave pública do backup (gpg local)"
fpr=$(gpg --list-keys --with-colons "$key_uid" 2>/dev/null | awk -F: '/^fpr/{print $10; exit}')
[[ -n "$fpr" ]] || { printf 'Nenhuma chave "%s" no gpg deste Mac.\n' "$key_uid" >&2; exit 1; }
gpg --list-secret-keys "$fpr" >/dev/null 2>&1 || { printf 'A chave privada %s não está neste Mac.\n' "$fpr" >&2; exit 1; }
printf '%s\n' "$fpr"

say "Scripts do servidor a partir de $branch (sem mexer na cópia de trabalho)"
ssh -o BatchMode=yes "$server" "cd $clone && git fetch -q origin && git show $branch:ops/macbook/licita-backup.sh | grep -q BACKUP_COPY_PUBKEY" || {
  printf 'O %s ainda não tem a cópia criptografada: faça o merge do PR antes de rodar este script.\n' "$branch" >&2
  exit 1
}
ssh -o BatchMode=yes "$server" "cd $clone && t=\$(mktemp -d) &&
  git show $branch:ops/macbook/licita-backup.sh >\$t/b && install -m 755 \$t/b ~/.local/bin/licita-backup &&
  git show $branch:ops/macbook/monitor/licita_monitor.py >\$t/m && install -m 755 \$t/m ~/licita-monitor/licita_monitor.py &&
  rm -rf \$t && echo instalados"

say "Chave SSH dedicada do servidor (só para o backup)"
ssh -o BatchMode=yes "$server" 'test -f ~/.ssh/licita-backup_ed25519 || ssh-keygen -q -t ed25519 -N "" -C "licita-backup@kruid-dev" -f ~/.ssh/licita-backup_ed25519'
server_key=$(ssh -o BatchMode=yes "$server" cat .ssh/licita-backup_ed25519.pub)
[[ "$server_key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+\ licita-backup@kruid-dev$ ]] || { printf 'Chave inesperada: %s\n' "$server_key" >&2; exit 1; }

say "Usuário licitabackup na borda: sem sudo, chave restrita ao IP Tailscale do servidor"
ssh -o BatchMode=yes "$edge" "set -e
  id licitabackup >/dev/null 2>&1 || sudo useradd --create-home --shell /bin/bash --comment 'Pardal backup (dumps criptografados)' licitabackup
  sudo install -d -m 700 -o licitabackup -g licitabackup /home/licitabackup/.ssh /home/licitabackup/backups /home/licitabackup/backups/licita
  printf '%s\n' 'restrict,from=\"$server_tailscale_ip\" $server_key' | sudo tee /home/licitabackup/.ssh/authorized_keys >/dev/null
  sudo chown licitabackup:licitabackup /home/licitabackup/.ssh/authorized_keys
  sudo chmod 600 /home/licitabackup/.ssh/authorized_keys
  id licitabackup; df -h /home | tail -1"

say "Servidor: chave de host da borda (a já verificada neste Mac), alias SSH e chave pública"
host_key=$(ssh-keygen -F "$edge_public_ip" | awk '$2 == "ssh-ed25519" {print $2, $3; exit}')
[[ -n "$host_key" ]] || { printf 'Sem chave ed25519 verificada para %s no known_hosts deste Mac.\n' "$edge_public_ip" >&2; exit 1; }
ssh -o BatchMode=yes "$server" "set -e
  touch ~/.ssh/known_hosts ~/.ssh/config && chmod 600 ~/.ssh/config
  ssh-keygen -F $edge_tailscale_ip >/dev/null || echo '$edge_tailscale_ip $host_key' >>~/.ssh/known_hosts
  grep -q '^Host licita-backup-edge\$' ~/.ssh/config || printf '\nHost licita-backup-edge\n    # Cópia criptografada do backup na VM Oracle (licita-backup-offsite-setup.sh)\n    HostName $edge_tailscale_ip\n    User licitabackup\n    IdentityFile ~/.ssh/licita-backup_ed25519\n    IdentitiesOnly yes\n' >>~/.ssh/config
  ssh -o BatchMode=yes licita-backup-edge 'echo borda-ok \$(whoami)'"
gpg --armor --export "$fpr" | ssh -o BatchMode=yes "$server" 'umask 077; cat >~/licita-monitor/backup-pubkey.asc'

say "Ativação (~/licita-monitor/backup.env)"
ssh -o BatchMode=yes "$server" 'umask 077; cat >~/licita-monitor/backup.env <<ENV
BACKUP_COPY_TARGET=licita-backup-edge:/home/licitabackup/backups/licita
BACKUP_COPY_PUBKEY=/home/kruid/licita-monitor/backup-pubkey.asc
ENV
cat ~/licita-monitor/backup.env'

say "Backup de teste agora (cerca de 3 min)"
ssh -o BatchMode=yes "$server" 'systemctl --user start licita-backup.service; journalctl --user -u licita-backup.service -n 3 --no-pager -o cat; cat ~/backups/licita/last-backup.json'
ssh -o BatchMode=yes "$edge" 'sudo ls -la /home/licitabackup/backups/licita'

say "Pronto. Guarde a chave privada fora do MacBook (gerenciador de senhas):"
printf '  gpg --armor --export-secret-keys %s > pardal-backup-privada.asc\n' "$fpr"
printf 'e depois apague esse arquivo exportado. Sem ela as cópias da borda não podem ser lidas.\n'

exit 0
}
