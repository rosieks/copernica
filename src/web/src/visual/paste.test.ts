import { describe, expect, it } from 'vitest';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { cleanPastedHtml, cleanPastedSlice } from './paste';
import { parse, schema, serialize } from './markdown';

/** Parses clipboard HTML the way ProseMirror does: in a detached document, through the schema. */
function pasteAsMarkdown(html: string): { markdown: string; dropped: number } {
  const detached = document.implementation.createHTMLDocument('paste');
  const container = detached.createElement('div');
  container.innerHTML = cleanPastedHtml(html);
  const slice = PMDOMParser.fromSchema(schema).parseSlice(container);
  const { slice: cleaned, droppedImages } = cleanPastedSlice(slice);
  const doc = schema.nodes.doc.create(null, cleaned.content);
  const { snapshot } = parse('');
  return { markdown: serialize(doc, snapshot), dropped: droppedImages };
}

const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>p.MsoNormal{mso-style-name:x}</style></head>
<body><!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->
<h1 style="mso-outline-level:1">Release <span style="color:red">notes</span></h1>
<p class="MsoNormal" style="mso-margin-top-alt:auto" onclick="alert(1)">Some <b>bold</b> and <i>italic</i> text with a <a href="https://example.com/docs" style="color:blue">link</a>.<o:p></o:p></p>
<ul><li>first</li><li>second</li></ul>
<table><tr><th>Name</th><th>Value</th></tr><tr><td>a</td><td>1</td></tr></table>
<p><img src="https://example.com/x.png" alt="logo"><img src="data:image/png;base64,AAAA"></p>
<p><a href="javascript:alert(1)">bad link</a></p>
<script>window.__pwned = true</script>
</body></html>`;

describe('pasting formatted content (FR-024)', () => {
  it('keeps supported structure and drops styles, scripts and office markup', () => {
    const { markdown, dropped } = pasteAsMarkdown(word);
    expect(markdown).toContain('# Release notes');
    expect(markdown).toContain('Some **bold** and *italic* text with a [link](https://example.com/docs).');
    expect(markdown).toContain('- first\n- second');
    expect(markdown).toContain('| Name | Value |');
    expect(markdown).toContain('bad link');
    expect(markdown).not.toMatch(/style|mso|onclick|<|javascript|__pwned|o:p/i);
    expect(dropped).toBe(2);
  });

  it('removes event handler attributes before the HTML is parsed', () => {
    expect(cleanPastedHtml('<p onclick="x()" class="a" ONMOUSEOVER=\'y\' onload=z>t</p>')).toBe('<p class="a">t</p>');
  });

  it('removes conditional comments and office tags from the HTML', () => {
    const html = cleanPastedHtml('<!--[if gte mso 9]>x<![endif]--><p>a<o:p></o:p></p><w:Sdt>b</w:Sdt><style>.x{}</style>');
    expect(html).toBe('<p>a</p>b');
  });

  it('keeps images of this wiki referenced by path', () => {
    const { markdown, dropped } = pasteAsMarkdown('<p><img data-src="../.attachments/a.png" alt="A"></p>');
    expect(markdown).toBe('![A](../.attachments/a.png)\n');
    expect(dropped).toBe(0);
  });
});
