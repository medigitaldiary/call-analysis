#!/bin/bash
find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './.next/*' | while read -r f; do
  if head -c 12 "$f" 2>/dev/null | grep -q '^{"data":"'; then
    python3 -c "
import re, base64
with open('$f','rb') as fh:
    raw = fh.read().decode('utf-8', errors='replace')
chunks = re.findall(r'\"data\":\"([^\"]*)\"', raw)
if not chunks:
    print('  skip (no data field): $f')
else:
    out = b''.join(base64.b64decode(c) for c in chunks)
    with open('$f','wb') as fh:
        fh.write(out)
    print('  decoded (' + str(len(chunks)) + ' chunk(s)): $f')
" || echo "  ERROR on: $f"
  fi
done
echo "Done."
