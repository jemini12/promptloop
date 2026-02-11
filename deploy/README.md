# VM deployment (Linux)

Recommended: run everything via Docker Compose. This avoids installing Node/Go on the VM for runtime.

## 1) Bootstrap the VM (Ubuntu/Debian)

```bash
sudo ./deploy/bootstrap-ubuntu.sh
```

- Installs Docker Engine + Compose plugin
- Installs `golang-go` by default (use `--no-go` to skip)
- Enables UFW and opens port `3000/tcp` (use `--no-open-port` to skip)

## 2) Place the repo on the VM

Suggested:

```bash
sudo mkdir -p /opt/promptly
sudo chown -R $USER:$USER /opt/promptly
git clone <your-repo-url> /opt/promptly
cd /opt/promptly
```

## 3) Create `.env`

```bash
./deploy/generate-env.sh --url "http://VM_IP:3000"
```

Then edit `.env` and set:

- `OPENAI_API_KEY`
- OAuth credentials (`AUTH_*`) and update provider callback URLs to match `NEXTAUTH_URL`

Security note: the repo's `.env.example` currently contains real-looking secrets. Assume they are compromised and rotate them.

## 4) Deploy

```bash
./deploy/deploy.sh
docker compose logs -f web worker
```

## 5) Optional: start on boot (systemd)

```bash
sudo ./deploy/install-systemd.sh /opt/promptly
```
