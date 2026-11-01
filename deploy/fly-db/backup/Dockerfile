FROM postgres:18-bookworm

RUN apt-get update \
    && apt-get install --yes --no-install-recommends awscli ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backup.sh /usr/local/bin/licitai-backup

RUN chmod 0555 /usr/local/bin/licitai-backup

USER postgres
ENTRYPOINT ["/usr/local/bin/licitai-backup"]
