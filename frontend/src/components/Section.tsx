import type { ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** Short line under the title. */
  description?: string;
}

/** A labelled landmark region with a consistent card style. */
export function Section({ id, title, icon, children, actions, description }: Props) {
  return (
    <section aria-labelledby={`${id}-title`} className="card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon && (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-iris text-snow shadow-md shadow-iris/30 [&>svg]:h-5 [&>svg]:w-5">
              {icon}
            </span>
          )}
          <div>
            <h2 id={`${id}-title`} className="text-xl font-semibold text-slate-950">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-slate-700">{description}</p>}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
