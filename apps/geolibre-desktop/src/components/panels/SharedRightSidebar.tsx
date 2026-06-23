import {
  collapseRightPanel,
  getRightPanel,
  openRightPanel,
} from "@geolibre/plugins";
import { cn } from "@geolibre/ui";
import { PanelRight, SlidersHorizontal } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { MapController } from "@geolibre/map";
import { useRightPanelState } from "../../hooks/useRightPanels";
import { isImageSource } from "../../lib/icon-source";
import { PluginRightPanel } from "./PluginRightPanel";
import { StylePanel } from "./StylePanel";

interface SharedRightSidebarProps {
  /** Id of the active plugin panel docked with `replace-style`. */
  pluginId: string;
  /** The active panel's shared content host (see {@link PluginRightPanel}). */
  pluginContentEl: HTMLElement;
  /** Shared plugin-panel width in px, owned by the shell. */
  pluginWidth: number;
  /** Update the shared plugin-panel width. */
  onPluginWidthChange: (width: number) => void;
  /** Whether the built-in Style panel is part of this layout. */
  stylePanelVisible: boolean;
  mapControllerRef: RefObject<MapController | null>;
  /** Begin a Style-panel resize drag. */
  onStyleResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

interface RailEntry {
  id: string;
  title: string;
  icon: ReactNode;
  /** Whether this entry's panel is currently expanded. */
  active: boolean;
  /** Toggle the entry: expand it, or collapse it when already expanded. */
  onToggle: () => void;
}

/**
 * The shared right-sidebar surface for the `replace-style` docking mode.
 *
 * When a plugin panel docks with `dock: "replace-style"`, it shares the Style
 * panel's right-sidebar area instead of appearing as a separate rail beside it.
 * This component renders a single far-right rail listing both the plugin panel
 * (the workbench) and Style; selecting one expands it to the left of the rail
 * while the other stays as a rail entry. The two are mutually exclusive, so the
 * user never sees two adjacent rails (issue #765).
 *
 * Style starts collapsed so the workbench reads as the active workspace; the
 * user can expand Style at any time, which collapses the workbench, and vice
 * versa. Both child panels stay mounted while collapsed (they render nothing via
 * their `hideOwnRail`/shared-rail modes) so their state survives toggling.
 */
export function SharedRightSidebar({
  pluginId,
  pluginContentEl,
  pluginWidth,
  onPluginWidthChange,
  stylePanelVisible,
  mapControllerRef,
  onStyleResizeStart,
}: SharedRightSidebarProps) {
  const { t } = useTranslation();
  const { activeId, collapsed } = useRightPanelState();
  // Style is collapsed by default while the workbench is active; the user opts
  // it in. This state resets when the sidebar unmounts (the workbench closes),
  // which is the desired "Style collapsed by default" behavior on reopen.
  const [styleOptedIn, setStyleOptedIn] = useState(false);

  const pluginExpanded = activeId === pluginId && !collapsed;
  // The plugin displaces Style: while the workbench is expanded, Style cannot
  // also be expanded (one shared surface, one expanded panel at a time).
  const styleExpanded = stylePanelVisible && !pluginExpanded && styleOptedIn;

  const expandPlugin = () => openRightPanel(pluginId);
  const collapsePlugin = () => collapseRightPanel(pluginId);
  const expandStyle = () => {
    setStyleOptedIn(true);
    // Collapse the workbench so it yields the surface to Style.
    collapseRightPanel(pluginId);
  };
  const collapseStyle = () => setStyleOptedIn(false);

  const panel = getRightPanel(pluginId);
  const pluginIcon =
    panel?.icon && isImageSource(panel.icon) ? (
      <img src={panel.icon} alt="" className="h-4 w-4 object-contain" />
    ) : (
      <PanelRight className="h-4 w-4" />
    );

  const entries: RailEntry[] = [
    {
      id: pluginId,
      title: panel?.title ?? pluginId,
      icon: pluginIcon,
      active: pluginExpanded,
      onToggle: pluginExpanded ? collapsePlugin : expandPlugin,
    },
  ];
  if (stylePanelVisible) {
    entries.push({
      id: "__style__",
      title: t("sharedRail.style"),
      icon: <SlidersHorizontal className="h-4 w-4" />,
      active: styleExpanded,
      onToggle: styleExpanded ? collapseStyle : expandStyle,
    });
  }

  return (
    <>
      {/* The plugin panel renders its content here when expanded, and nothing
          (but stays mounted) when collapsed. */}
      <PluginRightPanel
        dock="replace-style"
        contentEl={pluginContentEl}
        width={pluginWidth}
        onWidthChange={onPluginWidthChange}
      />
      {/* Style stays mounted across toggles; `hideOwnRail` makes it render
          nothing while collapsed so only the shared rail shows. */}
      {stylePanelVisible ? (
        <StylePanel
          mapControllerRef={mapControllerRef}
          onResizeStart={onStyleResizeStart}
          collapsed={!styleExpanded}
          onCollapsedChange={(next) => {
            if (next) collapseStyle();
            else expandStyle();
          }}
          hideOwnRail
        />
      ) : null}
      <aside
        aria-label={t("sharedRail.label")}
        className="flex w-full shrink-0 items-center gap-1 border-t bg-card px-2 py-1 md:h-auto md:w-11 md:flex-col md:border-l md:border-t-0 md:px-0 md:py-2"
      >
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.active}
            title={
              entry.active
                ? t("sharedRail.collapse", { title: entry.title })
                : t("sharedRail.expand", { title: entry.title })
            }
            aria-label={
              entry.active
                ? t("sharedRail.collapse", { title: entry.title })
                : t("sharedRail.expand", { title: entry.title })
            }
            onClick={entry.onToggle}
            className={cn(
              "flex items-center gap-2 rounded px-1.5 py-1.5 md:flex-col md:px-1 md:py-2",
              entry.active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {entry.icon}
            <span className="text-[10px] font-semibold uppercase tracking-wide md:[writing-mode:vertical-rl] md:rotate-180">
              {entry.title}
            </span>
          </button>
        ))}
      </aside>
    </>
  );
}
