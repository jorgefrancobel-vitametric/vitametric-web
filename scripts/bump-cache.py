#!/usr/bin/env python3
"""Cache-busting por hash de contenido.

POR QUE EXISTE
--------------
El sitio se sirve por GitHub Pages detras de Cloudflare. GitHub Pages NO respeta el
archivo `_headers` (eso es de Cloudflare Pages / Netlify) y sirve los assets con
`cache-control: max-age=14400` — cuatro horas — sin forma de cambiarlo desde el repo.

Consecuencia: si se edita `css/style.css` y el HTML lo sigue pidiendo como
`style.css?v=15`, la URL no cambio, y el navegador del visitante sigue usando la copia
vieja hasta que expiren las 4 horas. Los cambios quedan invisibles aunque el deploy
haya salido bien. En Safari iOS ni siquiera hay un "hard reload" comodo para forzarlo.

La unica palanca confiable es cambiar la URL cuando cambia el contenido. Este script
recorre los HTML y reescribe cada `?v=` con los primeros 8 chars del sha256 del archivo
referenciado. Si el archivo no cambio, el hash no cambia y el cache se sigue usando.

USO
---
    python3 scripts/bump-cache.py            # reescribe los HTML
    python3 scripts/bump-cache.py --check    # no escribe; exit 1 si algo esta desfasado

Correr SIEMPRE antes de commitear cambios en css/ o js/.
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSET_RE = re.compile(r'(?P<attr>href|src)="(?P<path>[^"?#]+\.(?:css|js))(?:\?v=[^"#]*)?"')

_hashes: dict[pathlib.Path, str] = {}


def asset_hash(path: pathlib.Path) -> str | None:
    if path not in _hashes:
        if not path.is_file():
            return None
        _hashes[path] = hashlib.sha256(path.read_bytes()).hexdigest()[:8]
    return _hashes[path]


def process(html: pathlib.Path, write: bool) -> bool:
    original = html.read_text(encoding="utf-8")
    missing: list[str] = []

    def repl(m: re.Match) -> str:
        rel = m.group("path")
        if rel.startswith(("http://", "https://", "//")):
            return m.group(0)
        target = (html.parent / rel).resolve()
        h = asset_hash(target)
        if h is None:
            missing.append(rel)
            return m.group(0)
        return f'{m.group("attr")}="{rel}?v={h}"'

    updated = ASSET_RE.sub(repl, original)
    for rel in missing:
        print(f"  aviso: {html.relative_to(ROOT)} referencia {rel} y no existe en disco")
    if updated == original:
        return False
    if write:
        html.write_text(updated, encoding="utf-8")
    return True


def main() -> int:
    check = "--check" in sys.argv
    htmls = sorted(p for p in ROOT.rglob("*.html") if ".git" not in p.parts)
    changed = [h for h in htmls if process(h, write=not check)]
    for h in changed:
        print(("desfasado: " if check else "actualizado: ") + str(h.relative_to(ROOT)))
    if check and changed:
        print(f"\n{len(changed)} archivo(s) con ?v= desfasado. Corre: python3 scripts/bump-cache.py")
        return 1
    print(f"\n{len(changed)}/{len(htmls)} HTML {'desfasados' if check else 'actualizados'}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
