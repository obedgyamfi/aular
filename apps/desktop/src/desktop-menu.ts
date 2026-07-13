/**
 * The application menu, as data.
 *
 * opencode's pattern: one declarative spec drives both the native menubar and
 * the in-app ☰ menu, so the two can never disagree. Actions are plain string
 * ids the shell knows how to run.
 */
export type MenuAction =
  | "app.settings"
  | "app.reload"
  | "app.quit"
  | "edit.undo"
  | "edit.redo"
  | "edit.cut"
  | "edit.copy"
  | "edit.paste"
  | "edit.selectAll"
  | "view.toggleSidebar"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.zoomReset"
  | "agent.new"
  | "help.docs"
  | "help.about";

export type MenuEntry =
  | { type: "separator" }
  | { type: "item"; label: string; action: MenuAction; accelerator?: string };

export interface MenuGroup {
  id: string;
  label: string;
  items: MenuEntry[];
}

export const DESKTOP_MENU: MenuGroup[] = [
  {
    id: "file",
    label: "File",
    items: [
      { type: "item", label: "New Agent", action: "agent.new", accelerator: "Ctrl+N" },
      { type: "separator" },
      { type: "item", label: "Settings", action: "app.settings", accelerator: "Ctrl+," },
      { type: "separator" },
      { type: "item", label: "Quit", action: "app.quit", accelerator: "Ctrl+Q" },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      { type: "item", label: "Undo", action: "edit.undo", accelerator: "Ctrl+Z" },
      { type: "item", label: "Redo", action: "edit.redo", accelerator: "Ctrl+Y" },
      { type: "separator" },
      { type: "item", label: "Cut", action: "edit.cut", accelerator: "Ctrl+X" },
      { type: "item", label: "Copy", action: "edit.copy", accelerator: "Ctrl+C" },
      { type: "item", label: "Paste", action: "edit.paste", accelerator: "Ctrl+V" },
      { type: "item", label: "Select All", action: "edit.selectAll", accelerator: "Ctrl+A" },
    ],
  },
  {
    id: "view",
    label: "View",
    items: [
      { type: "item", label: "Toggle Sidebar", action: "view.toggleSidebar", accelerator: "Ctrl+B" },
      { type: "separator" },
      { type: "item", label: "Zoom In", action: "view.zoomIn", accelerator: "Ctrl+=" },
      { type: "item", label: "Zoom Out", action: "view.zoomOut", accelerator: "Ctrl+-" },
      { type: "item", label: "Reset Zoom", action: "view.zoomReset", accelerator: "Ctrl+0" },
      { type: "separator" },
      { type: "item", label: "Reload", action: "app.reload" },
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [
      { type: "item", label: "Documentation", action: "help.docs" },
      { type: "item", label: "About AULAR", action: "help.about" },
    ],
  },
];
