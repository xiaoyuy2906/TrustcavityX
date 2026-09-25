import json
import sys

import tools

req = json.load(sys.stdin)
print(req, file=sys.stderr)
func = getattr(tools, req['tool'])
print(json.dumps(func(**req['args'])))
