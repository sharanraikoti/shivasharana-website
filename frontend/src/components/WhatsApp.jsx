import { BRAND } from "../lib/brand";

export const WA_DEFAULT_TEXT = "Hello Shivasharana Distributor, I would like to enquire about medicines.";

/** WhatsApp chat link (wa.me) for the shop's phone number, with an optional pre-filled message. */
export function whatsappLink(shop, text = WA_DEFAULT_TEXT) {
  let digits = String(shop?.whatsapp || shop?.phone || BRAND.whatsapp).replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits; // Indian mobile number
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function WhatsAppIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.7a10.7 10.7 0 0 1-5.5-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7zm5.9-8c-.3-.2-1.9-1-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.8 8.8 0 0 1-4.4-3.8c-.3-.6.3-.5 1-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.7 3.7 0 0 0-1.1 2.7 6.5 6.5 0 0 0 1.3 3.4 14.6 14.6 0 0 0 5.7 5c2.1.9 2.9 1 4 .8a3.4 3.4 0 0 0 2.2-1.6 2.8 2.8 0 0 0 .2-1.6c-.1-.2-.3-.3-.6-.4z" />
    </svg>
  );
}

export function WhatsAppButton({ shop, text, className = "", children = "Chat on WhatsApp" }) {
  return (
    <a
      href={whatsappLink(shop, text)}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 font-semibold text-white shadow-card transition hover:bg-[#1ebe5b] " +
        className
      }
    >
      <WhatsAppIcon /> {children}
    </a>
  );
}

/** Round button fixed to the bottom-right corner of the public pages. */
export function WhatsAppFloat({ shop }) {
  return (
    <a
      href={whatsappLink(shop)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lift ring-4 ring-white transition hover:scale-105 print:hidden"
    >
      <WhatsAppIcon className="h-7 w-7" />
    </a>
  );
}
