import os, sys, time, paramiko
from pathlib import Path
host=os.environ['DEPLOY_HOST']; user=os.environ['DEPLOY_USER']; pwd=os.environ['DEPLOY_PASS']
local=Path('.codex_deploy.tar.gz').resolve()
remote_dir='/opt/aistudio-to-api'
remote_tar='/tmp/aistudio-to-api.deploy.tar.gz'

def connect():
    c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username=user, password=pwd, timeout=30, look_for_keys=False, allow_agent=False)
    return c

def run(c, cmd, timeout=None):
    print(f'\n>>> {cmd}')
    stdin, stdout, stderr = c.exec_command(cmd, get_pty=True, timeout=timeout)
    chan=stdout.channel
    out=[]
    while True:
        while chan.recv_ready():
            data=chan.recv(4096).decode(errors='replace')
            print(data, end='')
            out.append(data)
        while chan.recv_stderr_ready():
            data=chan.recv_stderr(4096).decode(errors='replace')
            print(data, end='')
        if chan.exit_status_ready():
            while chan.recv_ready():
                data=chan.recv(4096).decode(errors='replace'); print(data,end=''); out.append(data)
            code=chan.recv_exit_status()
            print(f'\n<<< exit {code}')
            if code != 0:
                raise SystemExit(f'Command failed ({code}): {cmd}')
            return ''.join(out)
        time.sleep(0.2)

c=connect()
try:
    run(c, 'mkdir -p /opt')
    # Install Docker + compose plugin if missing
    run(c, "if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then apt-get update && apt-get install -y ca-certificates curl gnupg lsb-release && curl -fsSL https://get.docker.com | sh; fi", timeout=1200)
    run(c, 'systemctl enable --now docker || service docker start || true', timeout=120)
    # Upload archive
    print(f'\n>>> upload {local} -> {remote_tar}')
    sftp=c.open_sftp()
    sftp.put(str(local), remote_tar)
    sftp.close()
    print('upload done')
    # Extract fresh app dir safely
    run(c, f'mkdir -p {remote_dir} && tar -xzf {remote_tar} -C {remote_dir} && mkdir -p {remote_dir}/auth {remote_dir}/data')
    # Ensure compose uses explicit host and current API key already in file
    run(c, f'cd {remote_dir} && docker compose up -d --build', timeout=1800)
    run(c, f'cd {remote_dir} && docker compose ps && docker logs --tail=120 aistudio-to-api', timeout=180)
    run(c, 'ss -ltnp | grep -E ":7860\\b" || true')
    run(c, 'ufw allow 7860/tcp >/dev/null 2>&1 || true; ufw status || true')
finally:
    c.close()
