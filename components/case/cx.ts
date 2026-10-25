// Joins class names without tailwind-merge: `cn` treats our custom type scale (text-hero,
// text-meta, …) as colors and drops it next to text-ink and friends.
export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");
