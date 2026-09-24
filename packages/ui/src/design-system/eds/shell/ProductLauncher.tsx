"use client";

/**
 * EDS ProductLauncher — D09 candidate.
 *
 * One canonical launcher. Grouping, display names, lifecycle states and
 * availability arrive through the `products` prop, sourced from the
 * portfolio authority by the caller. Unavailable entries render honestly
 * under "In development" with no active affordance.
 */
import * as React from "react";
import { useOverlay } from "../../../overlay";
import { Icon, type IconName } from "../../../icons";

export interface EdsLauncherProduct {
  id: string;
  displayName: string;
  group: string;
  icon: IconName;
  href?: string;
  lifecycleLabel?: string;
  available: boolean;
}

export interface EdsProductLauncherProps {
  open: boolean;
  products: readonly EdsLauncherProduct[];
  onClose: () => void;
  onSelect?: (product: EdsLauncherProduct) => void;
  title?: string;
  className?: string;
}

export function EdsProductLauncher({
  open,
  products,
  onClose,
  onSelect,
  title = "Products",
  className,
}: EdsProductLauncherProps) {
  const { ref, onBackdropMouseDown } = useOverlay(open, onClose);

  if (!open) return null;

  const available = products.filter((product) => product.available);
  const unavailable = products.filter((product) => !product.available);
  const groups = [...new Set(available.map((product) => product.group))].sort();

  return (
    <div className="eds-launcher__scrim" onMouseDown={onBackdropMouseDown}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={["eds-launcher", className].filter(Boolean).join(" ")}
      >
        <h2 className="eds-launcher__title">{title}</h2>
        {groups.map((group) => (
          <section key={group} aria-label={group} className="eds-launcher__group">
            <h3 className="eds-launcher__group-title">{group}</h3>
            <ul className="eds-launcher__list">
              {available
                .filter((product) => product.group === group)
                .map((product) => (
                  <li key={product.id}>
                    <a
                      href={product.href ?? "#"}
                      className="eds-launcher__item"
                      onClick={
                        onSelect
                          ? (event) => {
                              if (!product.href || product.href === "#") event.preventDefault();
                              onSelect(product);
                            }
                          : undefined
                      }
                    >
                      <span aria-hidden className="eds-launcher__icon">
                        <Icon name={product.icon} size={16} />
                      </span>
                      <span className="eds-launcher__name">{product.displayName}</span>
                      {product.lifecycleLabel ? <span className="eds-launcher__lifecycle">{product.lifecycleLabel}</span> : null}
                    </a>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {unavailable.length > 0 ? (
          <section aria-label="In development" className="eds-launcher__group eds-launcher__group--unavailable">
            <h3 className="eds-launcher__group-title">In development</h3>
            <ul className="eds-launcher__list">
              {unavailable.map((product) => (
                // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- aria-disabled is a global ARIA state, valid on any element
                <li key={product.id} className="eds-launcher__item eds-launcher__item--unavailable" aria-disabled="true">
                  <span aria-hidden className="eds-launcher__icon">
                    <Icon name={product.icon} size={16} />
                  </span>
                  <span className="eds-launcher__name">{product.displayName}</span>
                  {product.lifecycleLabel ? <span className="eds-launcher__lifecycle">{product.lifecycleLabel}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
