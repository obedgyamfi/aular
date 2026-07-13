import { settings } from "~/lib/settings";
import { avatarSvgUri } from "~/lib/avatar";

export function Avatar(props: { name: string; size?: number }) {
  const size = () => props.size ?? 36;
  return (
    <img
      src={avatarSvgUri(props.name, settings.avatarStyle)}
      alt={props.name}
      class="shrink-0 rounded-full"
      style={{ width: `${size()}px`, height: `${size()}px` }}
    />
  );
}
