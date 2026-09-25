import json
import sys

out = sys.stdout  # keep the real stdout for the result only
sys.stdout = sys.stderr  # everything printed from here on (tidy3d log, print) goes to stderr

import tools

req = json.load(sys.stdin)
# print( 'python: sys.stdin: ')
# print(req, file=sys.stderr)
func = getattr(tools, req['tool'])
out.write(json.dumps(func(**req['args']), default=str))
