import { Dialog, Kbd } from '../ui';
import { useSingleKeyShortcuts } from './preference';
import { useRegisteredShortcuts, type Shortcut, type ShortcutGroup } from './useShortcuts';
import './shortcuts.css';

const GROUPS: ShortcutGroup[] = ['Global', 'Page', 'Page tree', 'Editor', 'Discussions'];

/** Always available; overlays close with Escape (Radix). */
const BUILT_IN: Pick<Shortcut, 'label' | 'description' | 'group' | 'single'>[] = [
  { label: 'Esc', description: 'Close the dialog, menu or panel', group: 'Global', single: false },
  { label: 'F8', description: 'Go to notifications', group: 'Global', single: false },
];

export function SingleKeyToggle() {
  const [enabled, setEnabled] = useSingleKeyShortcuts();
  return (
    <label className="ui-check">
      <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      <span>
        Enable single-key shortcuts (e, c, ?)
        <br />
        <span className="muted">Shortcuts with Ctrl/⌘ always work.</span>
      </span>
    </label>
  );
}

/** Lists the shortcuts of the current screen (FR-015) and the single-key toggle (FR-017). */
export function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const registered = useRegisteredShortcuts();
  const [enabled] = useSingleKeyShortcuts();
  const unique = new Map<string, Pick<Shortcut, 'label' | 'description' | 'group' | 'single'>>();
  for (const s of [...BUILT_IN, ...registered]) unique.set(`${s.group}:${s.label}`, s);
  const all = [...unique.values()];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" size="md">
      {GROUPS.map((group) => {
        const items = all.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`shortcuts-${group}`}>
            <h3 id={`shortcuts-${group}`} className="shortcuts__group">
              {group}
            </h3>
            <dl className="shortcuts__list">
              {items.map((s) => (
                <div key={s.label} className="shortcuts__row">
                  <dt>
                    <Kbd>{s.label}</Kbd>
                  </dt>
                  <dd>
                    {s.description}
                    {s.single && !enabled && <span className="muted"> (off)</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      <SingleKeyToggle />
    </Dialog>
  );
}
