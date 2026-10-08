FROM python:3.13-slim

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-por poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py /app/server.py

ENV PORT=8080 \
    DOCUMENT_OCR_MAX_PAGES=40 \
    DOCUMENT_OCR_PAGE_TIMEOUT_MS=30000 \
    OMP_THREAD_LIMIT=1

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2)"]
USER nobody
CMD ["python3", "/app/server.py"]
