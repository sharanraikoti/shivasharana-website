"""QR codes for the published website.

The production QR code may only point at a public HTTPS address; localhost,
127.0.0.1 and private network addresses are refused.
"""
from __future__ import annotations

import io
import ipaddress
from urllib.parse import urlparse

import qrcode
import qrcode.image.svg
from qrcode.constants import ERROR_CORRECT_M


def url_problem(url: str) -> str | None:
    """Return why a URL is unsuitable for a printed QR code, or None if it is fine."""
    if not url:
        return "PUBLIC_SITE_URL is not set. Deploy the website first, then set it to the public https:// address."
    p = urlparse(url)
    if p.scheme != "https":
        return "The website address must start with https://"
    host = (p.hostname or "").lower()
    if not host:
        return "The website address has no host name."
    if host == "localhost" or host.endswith(".local") or host.endswith(".localhost"):
        return f"'{host}' only works on this computer. Use the deployed public address."
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_unspecified:
            return f"{host} is a local/private address. Use the deployed public address."
    except ValueError:
        pass
    if "." not in host:
        return f"'{host}' is not a public domain name."
    return None


def _qr(data: str) -> qrcode.QRCode:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=20, border=4)  # 4-module quiet zone
    qr.add_data(data)
    qr.make(fit=True)
    return qr


def png_bytes(data: str, box_size: int = 20) -> bytes:
    qr = _qr(data)
    qr.box_size = box_size
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def svg_bytes(data: str) -> bytes:
    img = _qr(data).make_image(image_factory=qrcode.image.svg.SvgPathFillImage)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue()
