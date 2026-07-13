import { For, Show } from "solid-js";
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu";
import { Icon } from "@opencode-ai/ui/icon";

import { DESKTOP_MENU, type MenuAction, type MenuGroup } from "~/desktop-menu";
import { runMenuAction } from "~/lib/window";

/**
 * The ☰ app menu — opencode's WindowsAppMenu, ported.
 *
 * One dropdown whose top level is File / Edit / View / Help, each opening a
 * submenu. The metrics live in styles/app-menu.css (copied from theirs), which
 * is what makes it feel like an OS menu rather than a web dropdown.
 */
export function AppMenu() {
  return (
    <DropdownMenu placement="bottom-start" gutter={4}>
      <DropdownMenu.Trigger
        aria-label="Menu"
        class="flex size-7 shrink-0 items-center justify-center rounded text-v2-icon-icon-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      >
        <Icon name="menu" size="small" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Content class="desktop-app-menu">
        <For each={DESKTOP_MENU}>{(group) => <MenuGroupItem group={group} />}</For>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

function MenuGroupItem(props: { group: MenuGroup }) {
  return (
    <DropdownMenu.Sub overlap gutter={4} shift={-4}>
      <DropdownMenu.SubTrigger>
        {/* A plain span, not ItemLabel: a SubTrigger provides no menu-item
            context, and ItemLabel throws without one. Their markup, exactly. */}
        <span data-slot="dropdown-menu-item-label">{props.group.label}</span>
        <span data-slot="desktop-app-menu-chevron">
          <Icon name="chevron-right" size="small" />
        </span>
      </DropdownMenu.SubTrigger>

      <DropdownMenu.Portal>
        <DropdownMenu.SubContent class="desktop-app-menu">
          <For each={props.group.items}>
            {(entry) => (
              <Show
                when={entry.type === "item" ? entry : undefined}
                fallback={<DropdownMenu.Separator />}
              >
                {(item) => (
                  <DropdownMenu.Item onSelect={() => runMenuAction(item().action as MenuAction)}>
                    <DropdownMenu.ItemLabel>{item().label}</DropdownMenu.ItemLabel>
                    <Show when={item().accelerator}>
                      <span data-slot="desktop-app-menu-keybind">{item().accelerator}</span>
                    </Show>
                  </DropdownMenu.Item>
                )}
              </Show>
            )}
          </For>
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}
