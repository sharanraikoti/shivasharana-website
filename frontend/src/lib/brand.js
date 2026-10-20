// Shop branding shown on the public website (same as the visiting card).
export const BRAND = {
  kannadaName: "ಶಿವಶರಣ ಡಿಸ್ಟ್ರಿಬ್ಯೂಟರ್",
  tagline: ["Healthcare", "Quality", "Trust"],
  role: "Wholesale Pharmaceutical & Healthcare Distributors",
  owner: "Shiva Raikoti",
  phones: ["8970631566", "9482460666"],
  whatsapp: "9482460666",
  sister: { name: "Sri Gowri Associates", line: "IV Fluids (Aculife Healthcare) & Surgical Supplies" },
};

// Friendly colours for company initials, picked from the name so each company keeps its colour.
const TINTS = [
  "bg-brand-100 text-brand-800",
  "bg-aqua-100 text-aqua-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-800",
  "bg-fuchsia-100 text-fuchsia-700",
];
export function tintFor(name = "") {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}
