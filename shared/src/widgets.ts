// Per-widget data shapes — see docs/Architecture.md §3.
//
// Each `services/<name>` module augments this interface with its own widget
// keys ('service.widget' → data shape) via `declare module`, so a view and
// its server fetch() cannot drift apart. Empty until the first service is
// implemented.

// oxlint-disable-next-line no-empty-object-type
export interface WidgetDataMap {}
