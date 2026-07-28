import os, time, paramiko, sys
host=os.environ['DEPLOY_HOST']; user=os.environ['DEPLOY_USER']; pwd=os.environ['DEPLOY_PASS']
remote_dir='/opt/aistudio-to-api'
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=pwd, timeout=30, look_for_keys=False, allow_agent=False)

def run(cmd, timeout=None, check=True):
    print(f'\n>>> {cmd}', flush=True)
    stdin, stdout, stderr = c.exec_command(cmd, get_pty=False, timeout=timeout)
    chan=stdout.channel
    while True:
        if chan.recv_ready():
            data=chan.recv(8192).decode('utf-8','replace')
            print(data, end='', flush=True)
        if chan.recv_stderr_ready():
            data=chan.recv_stderr(8192).decode('utf-8','replace')
            print(data, end='', flush=True)
        if chan.exit_status_ready():
            while chan.recv_ready(): print(chan.recv(8192).decode('utf-8','replace'), end='', flush=True)
            while chan.recv_stderr_ready(): print(chan.recv_stderr(8192).decode('utf-8','replace'), end='', flush=True)
            code=chan.recv_exit_status(); print(f'\n<<< exit {code}', flush=True)
            if check and code != 0: raise SystemExit(code)
            return code
        time.sleep(0.5)

try:
    run('docker version && docker compose version', timeout=120)
    run(f'cd {remote_dir} && docker compose ps || true', timeout=120, check=False)
    run(f'cd {remote_dir} && docker compose build --progress=plain', timeout=1800)
    run(f'cd {remote_dir} && docker compose up -d', timeout=300)
    run(f'cd {remote_dir} && docker compose ps', timeout=120)
    run('curl -fsS http://127.0.0.1:7860/health || true', timeout=60, check=False)
    run('ss -ltnp | grep -E ":7860\\b" || true', timeout=60, check=False)
    run('ufw allow 7860/tcp >/dev/null 2>&1 || true; ufw status || true', timeout=60, check=False)
    run('docker logs --tail=120 aistudio-to-api || true', timeout=120, check=False)
finally:
    c.close()
