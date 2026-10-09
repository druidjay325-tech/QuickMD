import { IconCheck, IconSaving, IconUnsaved } from "./Icons";

interface SaveStatusIconProps {
  status: string;
}

/** Pure presentational: renders the appropriate icon for a save status string. */
export function SaveStatusIcon({ status }: SaveStatusIconProps) {
  if (status === "saved") return <IconCheck />;
  if (status === "saving") return <IconSaving />;
  return <IconUnsaved />;
}
