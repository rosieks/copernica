import { Link } from 'react-router';

/** Folder segments of the page path; folders are not pages, so only the space root links. */
export function Breadcrumbs({ spaceId, spaceName, path }: { spaceId: string; spaceName: string; path: string }) {
  const segments = path.split('/');
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        <li>
          <Link to={`/s/${encodeURIComponent(spaceId)}/`}>{spaceName}</Link>
        </li>
        {segments.map((segment, i) => (
          <li key={i} aria-current={i === segments.length - 1 ? 'page' : undefined}>
            {segment}
          </li>
        ))}
      </ol>
    </nav>
  );
}
