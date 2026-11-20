import type { ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}

/** A labelled landmark region with a consistent card style. */
export function Section({ id, title, icon, children, actions }: Props) {
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-xl font-bold text-slate-900">
          {icon}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
