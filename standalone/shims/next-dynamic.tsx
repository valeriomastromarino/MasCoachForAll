// Stand-in for next/dynamic: React.lazy with the same loading placeholder.
import { type ComponentType, lazy, Suspense } from "react";

export default function dynamic<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  opts: { ssr?: boolean; loading?: () => React.ReactNode } = {},
) {
  const Lazy = lazy(loader);
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={opts.loading ? opts.loading() : null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
