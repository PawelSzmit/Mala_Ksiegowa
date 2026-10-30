// Minimalny czytnik XML na potrzeby faktur FA(3): elementy, tekst, encje. Bez atrybutów i bez DTD.
// Faktury z KSeF są sprawdzone schematem po stronie MF, więc nie potrzebujemy pełnego parsera.
export interface XmlNode {
  /** Nazwa bez prefiksu przestrzeni nazw (np. „Faktura”, „P_15”). */
  name: string;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? whole;
  });
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#document', children: [], text: '' };
  const stack: XmlNode[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([\w.:-]+)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/y;
  let m: RegExpExecArray | null;
  let position = 0;
  while (position < xml.length) {
    re.lastIndex = position;
    m = re.exec(xml);
    if (!m) throw new Error(`Niepoprawny XML w pozycji ${position}`);
    position = re.lastIndex;
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += decodeEntities(m[6]);
    else if (m[3]) {
      const name = m[3].includes(':') ? m[3].slice(m[3].indexOf(':') + 1) : m[3];
      if (m[2]) {
        if (top.name !== name) throw new Error(`Niepoprawny XML: zamknięcie </${name}> zamiast </${top.name}>`);
        stack.pop();
      } else {
        const node: XmlNode = { name, children: [], text: '' };
        top.children.push(node);
        if (!m[5]) stack.push(node);
      }
    }
  }
  if (stack.length !== 1) throw new Error(`Niepoprawny XML: niezamknięty element <${stack[stack.length - 1]!.name}>`);
  return root;
}

/** Pierwszy element o danej ścieżce, np. child(root, 'Faktura', 'Fa', 'P_15'). */
export function child(node: XmlNode | undefined, ...path: string[]): XmlNode | undefined {
  let current = node;
  for (const name of path) current = current?.children.find((c) => c.name === name);
  return current;
}

export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((c) => c.name === name) ?? [];
}

/** Tekst elementu bez białych znaków na brzegach; undefined, gdy elementu nie ma albo jest pusty. */
export function textOf(node: XmlNode | undefined, ...path: string[]): string | undefined {
  const t = child(node, ...path)?.text.trim();
  return t ? t : undefined;
}
