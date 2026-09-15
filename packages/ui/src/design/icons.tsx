/**
 * The shapes the drawing uses more than once. Every other mark in the office is drawn a single time
 * and stays inline beside the thing it marks, where its geometry is easier to read than a prop list
 * would be. The chevron and the plus take the size and the stroke width they are drawn at, because
 * the office draws each of them at four.
 *
 * `stroke="currentColor"` is unconditional: a `stroke-*` class on the element beats a presentation
 * attribute, so the sites that paint their mark with a class keep painting it with that class.
 */

type Mark = {
  size: number;
  strokeWidth: number;
  className?: string;
};

/** The disclosure arrow an expanding row wears; `rotate-90` in the class turns it downwards. */
export function Chevron({ size, strokeWidth, className }: Mark): React.JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    >
      <polyline points="4.5,3 8,6 4.5,9" />
    </svg>
  );
}

/** What every button that adds something carries. */
export function Plus({ size, strokeWidth, className }: Mark): React.JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    >
      <line x1="6" y1="2" x2="6" y2="10" />
      <line x1="2" y1="6" x2="10" y2="6" />
    </svg>
  );
}

/** The one mark the office draws twice over: a picked card wears it in its corner. */
export function Tick(): React.JSX.Element {
  return (
    <svg
      className="stroke-accent-ink"
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1.8,5.2 4,7.4 8.2,2.6" />
    </svg>
  );
}
