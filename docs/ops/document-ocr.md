# OCR local de documentos

O OCR é opcional e vem **desligado**. Sem `DOCUMENT_OCR_ENABLED=true`, PDFs sem camada de texto e imagens continuam `unsupported`, exatamente como no extrator sem OCR.

## Desenvolvimento

O serviço interno usa Tesseract em português e Poppler a 200 dpi. Para ligar a stack completa:

```sh
DOCUMENT_OCR_ENABLED=true docker compose --profile ocr up --build
```

A API envia o arquivo por HTTP somente na rede do Compose (`http://ocr:8080`). Não publique a porta 8080 em produção. O profile expõe essa porta no host apenas para diagnóstico de desenvolvimento.

Variáveis:

| Variável | Padrão | Uso |
|---|---:|---|
| `DOCUMENT_OCR_ENABLED` | `false` | habilita o roteamento de PDFs digitalizados e JPG/PNG/TIFF |
| `DOCUMENT_OCR_URL` | `http://ocr:8080` | endpoint interno |
| `DOCUMENT_OCR_MAX_PAGES` | `40` | teto por arquivo |
| `DOCUMENT_OCR_PAGE_TIMEOUT_MS` | `30000` | prazo total de renderização + Tesseract por página |
| `OCR_LOW_CONFIDENCE_THRESHOLD` | `35` | páginas abaixo desse valor são marcadas |
| `AI_QUEUE_MAX_DEPTH_DOCUMENT_OCR` | `1000` | profundidade máxima da fila durável |

O consumidor de `document_ocr` tem concorrência fixa em 1 por processo. Uma página a 200 dpi costuma ocupar um núcleo durante alguns segundos e pode usar dezenas de MB; dimensione o worker para um núcleo disponível e cerca de 512 MiB adicionais. O pior caso padrão ocupa a fila por até aproximadamente 20 minutos (40 × 30 s), com retentativas duráveis e backoff.

## Compose do servidor

Adicione o mesmo container de `ops/ocr/Dockerfile` à rede privada da aplicação, sem porta pública, e configure no processo que consome `ai_jobs`:

```yaml
services:
  ocr:
    build: ./ops/ocr
    expose: ["8080"]
    environment:
      DOCUMENT_OCR_MAX_PAGES: "40"
      DOCUMENT_OCR_PAGE_TIMEOUT_MS: "30000"
  worker:
    environment:
      DOCUMENT_OCR_ENABLED: "true"
      DOCUMENT_OCR_URL: http://ocr:8080
```

Em implantação de processo único (`APP_ROLE=all`), as duas variáveis ficam no serviço da API. Com papéis separados, a flag deve permanecer igual em API e worker para o fingerprint do índice ser consistente.

## Validação

Sem Docker, os parsers e a chamada local podem ser testados com:

```sh
python3 -m unittest ops/ocr/test_service.py -v
```

O teste de integração é pulado com uma explicação quando `tesseract` não existe no host. Para validar a imagem, faça `docker build -t pardal-ocr-test ops/ocr`, suba o container e envie uma imagem ou PDF rasterizado para `POST /ocr` com `content-type: application/octet-stream`.
