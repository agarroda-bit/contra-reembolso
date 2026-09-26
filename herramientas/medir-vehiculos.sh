#!/bin/sh
# Mide aceleración, frenada y giro de los vehículos (sin render).
node herramientas/captura.mjs --page "pruebas/vehiculos.html?medir=${1:-van,scooter,compact,taxi,sports,suv,truck,police}" --port ${PORT:-5198} --shots '[{"wait":9000,"log":"window.__tuning"}]' 2>&1 | python3 -c "
import sys,json
for line in sys.stdin:
  if line.startswith('[log]'):
    d=json.loads(line[6:])
    for k,v in (d or {}).items(): print(k.ljust(9), ' '.join(f'{a}={b}' for a,b in v.items()))
  elif 'ERROR' in line or line.startswith(' -'): print(line.strip())
"
