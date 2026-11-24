# ==============================================================================
# VectorLab - Production Docker Container
# Built by SPManchester Private Limited
# Website: https://www.spmanchester.com | Contact: info@spmanchester.com
# ==============================================================================

FROM node:22-alpine AS runtime

# Label metadata for OCI image
LABEL org.opencontainers.image.title="VectorLab" \
      org.opencontainers.image.description="Transparent Vector Search & Deterministic K-Means Clustering Playground" \
      org.opencontainers.image.vendor="SPManchester Private Limited" \
      org.opencontainers.image.authors="Sayed Mudassar Akbar <info@spmanchester.com>" \
      org.opencontainers.image.url="https://www.spmanchester.com" \
      org.opencontainers.image.source="https://github.com/serviceprovidermanchester/SPM-Aidev-VectorLab-Agent" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    DB_PATH=/app/data/vectorlab.sqlite

# Create dedicated non-root application user and group for security
RUN addgroup -S spmgroup && adduser -S spmuser -G spmgroup && \
    mkdir -p /app/data && chown -R spmuser:spmgroup /app

# Copy application assets
COPY --chown=spmuser:spmgroup backend /app/backend
COPY --chown=spmuser:spmgroup database /app/database
COPY --chown=spmuser:spmgroup web /app/web
COPY --chown=spmuser:spmgroup package.json /app/

# Switch to unprivileged user
USER spmuser

EXPOSE 4000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "backend/src/server.js"]
