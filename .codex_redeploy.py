import os, time, paramiko
from pathlib import Path
host=os.environ['DEPLOY_HOST']; user=os.environ['DEPLOY_USER']; pwd=os.environ['DEPLOY_PASS']
local=Path('.codex_deploy.tar.gz').resolve(); remote_dir='/opt/aistudio-to-api'; remote_tar='/tmp/aistudio-to-api.deploy.tar.gz'
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(host, username=user, password=pwd, timeout=30, look_for_keys=False, allow_agent=False)
def run(cmd, timeout=None, check=True):
    print(f'\n>>> {cmd}', flush=True)
    stdin, stdout, stderr = c.exec_command(cmd, get_pty=False, timeout=timeout)
    chan=stdout.channel
    while True:
        if chan.recv_ready(): print(chan.recv(8192).decode('utf-8','replace'), end='', flush=True)
        if chan.recv_stderr_ready(): print(chan.recv_stderr(8192).decode('utf-8','replace'), end='', flush=True)
        if chan.exit_status_ready():
            while chan.recv_ready(): print(chan.recv(8192).decode('utf-8','replace'), end='', flush=True)
            while chan.recv_stderr_ready(): print(chan.recv_stderr(8192).decode('utf-8','replace'), end='', flush=True)
            code=chan.recv_exit_status(); print(f'\n<<< exit {code}', flush=True)
            if check and code: raise SystemExit(code)
            return code
        time.sleep(0.3)
try:
    print(f'>>> upload {local} -> {remote_tar}', flush=True)
    sftp=c.open_sftp(); sftp.put(str(local), remote_tar); sftp.close(); print('upload done', flush=True)
    run(f'cd {remote_dir} && docker compose down || true', timeout=180, check=False)
    run(f'mkdir -p {remote_dir} && tar -xzf {remote_tar} -C {remote_dir} && mkdir -p {remote_dir}/auth {remote_dir}/data', timeout=180)
    run(f'test -f {remote_dir}/src/auth/AuthSource.js && echo src-auth-ok', timeout=30)
    run(f'cd {remote_dir} && docker compose build --progress=plain', timeout=1200)
    run(f'cd {remote_dir} && docker compose up -d', timeout=300)
    run('sleep 5; docker ps --filter name=aistudio-to-api --format "{{.Names}} {{.Status}} {{.Ports}}"', timeout=60)
    run('curl -i --max-time 10 http://127.0.0.1:7860/health || true', timeout=60, check=False)
    run('curl -I --max-time 10 http://127.0.0.1:7860/ || true', timeout=60, check=False)
    run('ss -ltnp | grep -E ":7860\\b" || true', timeout=60, check=False)
    run('docker logs --tail=160 aistudio-to-api || true', timeout=120, check=False)
finally:
    c.close()
