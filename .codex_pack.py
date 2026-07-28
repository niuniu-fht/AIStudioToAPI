import tarfile, os
out='.codex_deploy.tar.gz'
try:
    os.remove(out)
except FileNotFoundError:
    pass
exclude_top={'.git','node_modules','auth','data'}
exclude_files={'.codex_deploy.tar.gz','.codex_pack.py','.codex_deploy.py','.codex_continue.py'}
with tarfile.open(out,'w:gz') as tar:
    for root, dirs, files in os.walk('.'):
        relroot=os.path.relpath(root,'.')
        if relroot == '.':
            dirs[:] = [d for d in dirs if d not in exclude_top]
        # avoid shipping credential jsons under configs/auth if any
        for f in files:
            if f in exclude_files:
                continue
            p=os.path.join(root,f)
            rel=os.path.relpath(p,'.')
            if rel.startswith(os.path.join('configs','auth') + os.sep) and rel.endswith('.json'):
                continue
            tar.add(p, arcname=rel)
print(os.path.abspath(out), os.path.getsize(out))
