#!/usr/bin/env python3
import json
import os
import re
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


def positive_int(name, fallback):
    try:
        value = int(os.environ.get(name, fallback))
        return value if value > 0 else fallback
    except ValueError:
        return fallback


MAX_BYTES = positive_int("OCR_MAX_BYTES", 25 * 1024 * 1024)
MAX_PAGES = positive_int("DOCUMENT_OCR_MAX_PAGES", 40)
PAGE_TIMEOUT_MS = positive_int("DOCUMENT_OCR_PAGE_TIMEOUT_MS", 30_000)
LOW_CONFIDENCE = positive_int("OCR_LOW_CONFIDENCE_THRESHOLD", 35)


def parse_tesseract_tsv(tsv):
    words = []
    confidences = []
    current_line = None
    line_words = []
    for raw in tsv.splitlines()[1:]:
        columns = raw.split("\t", 11)
        if len(columns) != 12:
            continue
        text = columns[11].strip()
        if not text:
            continue
        line = tuple(columns[1:5])
        if current_line is not None and line != current_line and line_words:
            words.append(" ".join(line_words))
            line_words = []
        current_line = line
        line_words.append(text)
        try:
            confidence = float(columns[10])
            if confidence >= 0:
                confidences.append(confidence)
        except ValueError:
            pass
    if line_words:
        words.append(" ".join(line_words))
    confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return "\n".join(words).strip(), round(confidence, 2)


def run(command, timeout_seconds):
    return subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout_seconds)


def ocr_image(path, timeout_seconds):
    result = run(["tesseract", str(path), "stdout", "-l", "por", "--psm", "6", "tsv"], timeout_seconds)
    return parse_tesseract_tsv(result.stdout)


def pdf_page_count(path):
    result = run(["pdfinfo", str(path)], 10)
    match = re.search(r"^Pages:\s+(\d+)\s*$", result.stdout, re.MULTILINE)
    if not match:
        raise RuntimeError("pdfinfo did not return a page count")
    return int(match.group(1))


def recognize(path, kind, max_pages, page_timeout_ms):
    timeout_seconds = page_timeout_ms / 1000
    pages = []
    if kind == "pdf":
        count = pdf_page_count(path)
        if count > max_pages:
            raise ValueError(f"PDF_PAGE_LIMIT:{count}")
        for page_number in range(1, count + 1):
            started = time.monotonic()
            prefix = path.parent / f"page-{page_number}"
            run(["pdftoppm", "-f", str(page_number), "-l", str(page_number), "-r", "200", "-png", "-singlefile", str(path), str(prefix)], timeout_seconds)
            elapsed = time.monotonic() - started
            remaining = max(0.1, timeout_seconds - elapsed)
            text, confidence = ocr_image(prefix.with_suffix(".png"), remaining)
            pages.append({"page": page_number, "text": text, "confidence": confidence, "lowConfidence": confidence < LOW_CONFIDENCE})
    else:
        text, confidence = ocr_image(path, timeout_seconds)
        pages.append({"page": 1, "text": text, "confidence": confidence, "lowConfidence": confidence < LOW_CONFIDENCE})
    average = sum(page["confidence"] for page in pages) / len(pages) if pages else 0.0
    return {"pages": pages, "averageConfidence": round(average, 2)}


def detected_kind(data):
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG") or data.startswith(b"II*\x00") or data.startswith(b"MM\x00*"):
        return "image"
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "PardalOCR/1"

    def json_response(self, status, payload):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path == "/healthz":
            self.json_response(200, {"ok": True})
        else:
            self.json_response(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/ocr":
            self.json_response(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
        except ValueError:
            length = 0
        if length < 1 or length > MAX_BYTES:
            self.json_response(413, {"error": "size_limit"})
            return
        data = self.rfile.read(length)
        kind = detected_kind(data)
        if kind is None or self.headers.get("x-document-kind") not in (None, kind):
            self.json_response(415, {"error": "unsupported_format"})
            return
        try:
            requested_pages = int(self.headers.get("x-max-pages", str(MAX_PAGES)))
            requested_timeout = int(self.headers.get("x-page-timeout-ms", str(PAGE_TIMEOUT_MS)))
            max_pages = min(MAX_PAGES, max(1, requested_pages))
            timeout_ms = min(PAGE_TIMEOUT_MS, max(1, requested_timeout))
            with tempfile.TemporaryDirectory(prefix="pardal-ocr-") as temporary:
                suffix = ".pdf" if kind == "pdf" else ".img"
                path = Path(temporary) / f"input{suffix}"
                path.write_bytes(data)
                self.json_response(200, recognize(path, kind, max_pages, timeout_ms))
        except ValueError as error:
            self.json_response(422, {"error": str(error)})
        except subprocess.TimeoutExpired:
            self.json_response(504, {"error": "page_timeout"})
        except subprocess.CalledProcessError as error:
            self.json_response(422, {"error": "ocr_failed", "detail": error.stderr[-500:]})
        except Exception as error:
            self.json_response(500, {"error": "internal_error", "detail": str(error)[:500]})

    def log_message(self, message, *args):
        print(f"ocr {self.address_string()} {message % args}", flush=True)


if __name__ == "__main__":
    port = positive_int("PORT", 8080)
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
