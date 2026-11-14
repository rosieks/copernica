import type { Schemas } from '../api/client';
import { Callout } from '../ui';
import './frontmatter.css';

type FrontMatter = Schemas['FrontMatter'];
type PropertyValue = Schemas['FrontMatterValue'];

/** Status banners (010 contracts/ui.md): the state is in the title text, not only the colour. */
const STATUS: Record<NonNullable<FrontMatter['status']>, { tone: 'info' | 'warning'; title: string; text: string }> = {
  draft: { tone: 'info', title: 'Draft', text: 'This page is a draft and may be incomplete.' },
  deprecated: { tone: 'warning', title: 'Deprecated', text: 'This page is deprecated. Its content may be out of date.' },
  archived: { tone: 'warning', title: 'Archived', text: 'This page is archived and kept for reference.' },
};

/**
 * Page metadata from front matter (010 contracts/ui.md "Page metadata"), shown above the article,
 * the Markdown preview and earlier versions. Every value is rendered as text; property values the
 * server marked as web addresses become links.
 */
export function PageMeta({ frontMatter }: { frontMatter: FrontMatter | null | undefined }) {
  if (!frontMatter) return null;

  if (!frontMatter.readable) {
    return (
      <section aria-label="Page metadata" className="page-meta">
        <Callout tone="warning" role="note" title="This page's metadata could not be read.">
          <details className="page-meta__raw">
            <summary>Show metadata source</summary>
            <pre>{frontMatter.raw}</pre>
          </details>
        </Callout>
      </section>
    );
  }

  const status = frontMatter.status ? STATUS[frontMatter.status] : null;
  const people = [
    frontMatter.owners.length > 0 && { label: frontMatter.owners.length === 1 ? 'Owner' : 'Owners', names: frontMatter.owners },
    frontMatter.authors.length > 0 && { label: frontMatter.authors.length === 1 ? 'Author' : 'Authors', names: frontMatter.authors },
  ].filter((p) => !!p);
  const hasProperties = frontMatter.aliases.length > 0 || frontMatter.properties.length > 0;

  if (!status && !frontMatter.description && people.length === 0 && frontMatter.tags.length === 0 && !hasProperties) return null;

  return (
    <section aria-label="Page metadata" className="page-meta">
      {status && (
        <Callout tone={status.tone} role="note" title={status.title}>
          {status.text}
        </Callout>
      )}
      {frontMatter.description && <p className="page-meta__description">{frontMatter.description}</p>}
      {people.length > 0 && (
        <dl className="page-meta__people">
          {people.map((p) => (
            <div key={p.label} className="page-meta__pair">
              <dt>{p.label}</dt>
              <dd>{p.names.join(', ')}</dd>
            </div>
          ))}
        </dl>
      )}
      {frontMatter.tags.length > 0 && (
        <ul aria-label="Tags" className="page-meta__tags">
          {frontMatter.tags.map((tag) => (
            <li key={tag} className="page-meta__tag">
              {tag}
            </li>
          ))}
        </ul>
      )}
      {hasProperties && (
        <details className="page-meta__properties">
          <summary>Properties</summary>
          <dl>
            {frontMatter.aliases.length > 0 && (
              <div className="page-meta__pair">
                <dt>Also known as</dt>
                <dd>{frontMatter.aliases.join(', ')}</dd>
              </div>
            )}
            {frontMatter.properties.map((property, index) => (
              <Property key={index} property={property} />
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}

function Property({ property }: { property: Schemas['FrontMatterProperty'] }) {
  return (
    <div className="page-meta__pair">
      <dt>{property.name}</dt>
      <dd>
        <Value value={property.value} />
      </dd>
    </div>
  );
}

function Value({ value }: { value: PropertyValue }) {
  switch (value.kind) {
    case 'text':
      // The server sets href only for http, https and mailto addresses (010 contracts/api.md).
      if (value.href) {
        return (
          <a href={value.href} rel="noopener noreferrer">
            {value.text}
          </a>
        );
      }
      return value.text ? (
        <>{value.text}</>
      ) : (
        <>
          <span aria-hidden="true">—</span>
          <span className="visually-hidden">empty</span>
        </>
      );
    case 'list':
      return (
        <ul className="page-meta__list">
          {value.items.map((item, index) => (
            <li key={index}>
              <Value value={item} />
            </li>
          ))}
        </ul>
      );
    case 'map':
      return (
        <dl className="page-meta__map">
          {value.entries.map((entry, index) => (
            <Property key={index} property={entry} />
          ))}
        </dl>
      );
  }
}
