import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ExitIcon, KeyboardIcon, PersonIcon } from '@radix-ui/react-icons';
import { api, type Schemas } from '../api/client';
import { Avatar, Button, Menu } from '../ui';
import { useShell } from './ShellContext';

export function UserMenu({ user }: { user: Schemas['User'] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setHelpOpen } = useShell();

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    queryClient.clear();
    window.location.assign('/signin');
  }

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="ghost" aria-label={`Account: ${user.displayName}`}>
          <Avatar name={user.displayName ?? '?'} />
          <span className="header__user-name">{user.displayName}</span>
        </Button>
      </Menu.Trigger>
      <Menu.Content label="Account">
        <Menu.Label>{user.displayName}</Menu.Label>
        <Menu.Item icon={<PersonIcon />} onSelect={() => navigate('/profile')}>
          Profile
        </Menu.Item>
        <Menu.Item icon={<KeyboardIcon />} onSelect={() => setHelpOpen(true)}>
          Keyboard shortcuts
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item icon={<ExitIcon />} onSelect={() => void signOut()}>
          Sign out
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
}
