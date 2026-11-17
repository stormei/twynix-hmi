import type { ProcessConnection, Screen, Widget } from '@twynix/model';
import { routeConnection } from './pipe-routing';
import { buildPipeBridges } from './pipe-bridges';
import { signalStyles, signalDecorations } from './signals';

/** Same rendered geometry for authoring previews and published operator screens. */
export function screenConnections(
  screen: Screen,
  widgets: Widget[],
  connections: ProcessConnection[] = screen.connections,
) {
  const routes = connections.map((connection) => {
    const link = connection;
    const route = routeConnection(link, widgets, screen);
    const medium = link.medium && link.medium !== 'process' ? link.medium : null;
    return {
      link,
      ...route,
      signalStyle: medium ? signalStyles[medium] : null,
      signalMarks: medium ? signalDecorations(route.points, medium) : { slashes: [], circles: [] },
    };
  });
  return buildPipeBridges(
    routes,
    widgets.filter((widget) => widget.visible),
    screen,
  );
}
