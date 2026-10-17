import { useNavigate, useParams } from 'react-router';
import { CaretSortIcon, CheckIcon } from '@radix-ui/react-icons';
import { useSpaces } from '../pages/SpaceList';
import { Button, Menu } from '../ui';

/** Header menu listing the readable spaces; shows the current one. */
export function SpaceSwitcher() {
  const spaces = useSpaces();
  const navigate = useNavigate();
  const { spaceId } = useParams();
  const current = spaces.data?.find((s) => s.id === spaceId);
  if (!spaces.data || spaces.data.length === 0) return null;

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="ghost" className="header__space" aria-label={`Space: ${current?.displayName ?? 'choose a space'}`}>
          <span className="header__space-name">{current?.displayName ?? 'Spaces'}</span>
          <CaretSortIcon aria-hidden="true" />
        </Button>
      </Menu.Trigger>
      <Menu.Content align="start" label="Spaces">
        {spaces.data.map((space) => (
          <Menu.Item
            key={space.id}
            disabled={space.state === 'unavailable'}
            icon={space.id === spaceId ? <CheckIcon /> : <span className="header__space-spacer" />}
            onSelect={() => navigate(`/s/${encodeURIComponent(space.id)}/`)}
          >
            {space.displayName}
          </Menu.Item>
        ))}
        <Menu.Separator />
        <Menu.Item onSelect={() => navigate('/')}>All spaces</Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
}
