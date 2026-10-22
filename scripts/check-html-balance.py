#!/usr/bin/env python3
"""check-html-balance.py — red de seguridad de HTML bienformado.

Bloquea el patrón que dejó ozonoterapia en blanco en móvil (20-ago → 22-oct,
commit d2603c1): un `<div ...>` cuyo cierre `</div>` se pierde, con lo que TODO
el resto de la página queda anidado dentro — invisible si el CSS oculta ese
div (`.subpage-nav-overlay { display: none }` a ≤768px).

Comprueba:
  1. cierres huérfanos (</div> sin apertura correspondiente);
  2. tags estructurales sin cerrar al final del documento
     (div/section/main/header/footer/nav/article/aside/a/ul/ol/table/form/h*),
     tolerando los tags que HTML5 cierra implícitamente (p, li, td, tr, option...).

Uso:  python3 scripts/check-html-balance.py [dir...]   (exit 1 si hay errores)
Sin args valida el directorio raíz del repo.
"""

import sys
from html.parser import HTMLParser
from pathlib import Path

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
    # SVG/MathML self-closing
    "path", "circle", "ellipse", "line", "polygon", "polyline", "rect",
    "use", "stop", "feGaussianBlur", "feOffset", "feMerge", "feMergeNode",
    "feColorMatrix", "feComposite", "feBlend", "linearGradient",
    "radialGradient", "clipPath", "mask", "animate", "set", "image",
}

# HTML5 los cierra solo al encontrar el siguiente de la misma familia o el
# cierre del contenedor; no son errores.
IMPLICIT = {
    "p", "li", "dt", "dd", "td", "th", "tr", "thead", "tbody", "tfoot",
    "option", "optgroup", "colgroup", "caption", "legend",
}

# No son HTML a validar.
SKIP_DIRS = {
    ".git", ".lighthouseci", ".lhci-debug", "node_modules", ".raw",
    "trash", ".trash", "qa-reel", "shots", ".obsidian", ".github",
}


class Balance(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # [(tag, linea)]
        self.errors = []         # [(linea, msg)]

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        # Un tag de apertura sin cerrar delante de un comentario roto
        # (`<div id="x"><  <!-- ... -->`) deja el div colgando: se detecta
        # al final o cuando llega un cierre que no corresponde.
        self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        pass  # <tag/> auto-cerrado

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append((self.getpos()[0], f"cierre huérfano </{tag}> sin apertura"))
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        # Buscar arriba: lo que quede por cerrar entre medio es un error.
        nombres = [t for t, _ in self.stack]
        if tag in nombres:
            while self.stack and self.stack[-1][0] != tag:
                t, ln = self.stack.pop()
                if t not in IMPLICIT:
                    errors = self.errors
                    errors.append((ln, f"<{t}> nunca cerrado (cierre de </{tag}> en línea {self.getpos()[0]})"))
            if self.stack:
                self.stack.pop()
        else:
            self.errors.append((self.getpos()[0], f"cierre huérfano </{tag}> sin apertura"))


def check(path: Path):
    try:
        texto = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return [(0, f"no se pudo leer: {exc}")]
    p = Balance()
    p.feed(texto)
    p.close()
    for t, ln in p.stack:
        if t not in IMPLICIT and t != "html":
            p.errors.append((ln, f"<{t}> abierto y nunca cerrado al final del documento"))
    return p.errors


def main(argv):
    raiz = Path(__file__).resolve().parent.parent
    args = [Path(a).resolve() for a in argv[1:]] or [raiz]
    fallas = 0
    for base in args:
        if base.is_file():
            archivos = [base]
        else:
            archivos = [
                f for f in sorted(base.rglob("*.html"))
                if not (set(f.relative_to(base).parts) & SKIP_DIRS)
            ]
        for f in archivos:
            errs = check(f)
            for ln, msg in errs:
                fallas += 1
                rel = f.relative_to(raiz) if f.is_relative_to(raiz) else f
                print(f"{rel}:{ln}: {msg}")
    total_txt = f"{fallas} problema(s)" if fallas else "HTML bienformado: todo limpio"
    print(total_txt)
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
