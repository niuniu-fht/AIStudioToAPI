import os, paramiko, time
host=os.environ['DEPLOY_HOST']; user=os.environ['DEPLOY_USER']; pwd=os.environ['DEPLOY_PASS']
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(host, username=user, password=pwd, timeout=30, look_for_keys=False, allow_agent=False)
cmds=[
'hostname -I; curl -s ifconfig.me || true; echo',
'ss -ltnp | grep -E ":(22|7860)\\b" || true',
'iptables -S INPUT || true; iptables -S DOCKER-USER || true',
'nft list ruleset 2>/dev/null | head -200 || true',
'docker ps --filter name=aistudio-to-api --format "{{.Names}} {{.Status}} {{.Ports}}"',
]
for cmd in cmds:
    print('\n>>> '+cmd)
    stdin,stdout,stderr=c.exec_command(cmd, get_pty=False, timeout=60)
    out=stdout.read().decode('utf-8','replace'); err=stderr.read().decode('utf-8','replace')
    print(out, end='')
    if err: print(err, end='')
c.close()
