// Tiny rune store so any component can flip the permissions panel
// open. Used by the MenuBar's "Manage > Permissions" entry and by
// auto-pop logic inside the panel itself when there are un-decided
// permissions on first load.

export const permissionsPanel = $state({ open: false });
