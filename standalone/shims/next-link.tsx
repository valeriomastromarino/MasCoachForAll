// Stand-in for next/link: plain anchors to "#/path" (prefetching has no meaning without a server).
import type { AnchorHTMLAttributes } from "react";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; prefetch?: boolean };

export default function Link({ href, ...rest }: Props) {
  delete (rest as { prefetch?: boolean }).prefetch;
  return <a href={href.startsWith("/") ? `#${href}` : href} {...rest} />;
}
