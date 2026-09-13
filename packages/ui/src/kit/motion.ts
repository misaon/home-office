/**
 * How long to keep something in the document after asking it to leave. React has to know `--duration-base`
 * from `styles.css`: an element removed the moment it is dismissed takes its own exit with it, so whatever
 * animates on the way out is unmounted on a timer instead, and that timer has to outlast the transition
 * rather than cut it short.
 */
export const EXIT_MS = 220;
