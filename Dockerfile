FROM node:20-alpine AS deps

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
RUN npm ci

# ---- Lambda runtime image ----
FROM public.ecr.aws/lambda/nodejs:20

WORKDIR /var/task

# Copy runtime deps + JS source
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY src ./src

# Lambda handler wrapper exporting Lambda handler
COPY lambda.js ./lambda.js

COPY openapi.yaml ./openapi.yaml

# Lambda handler: <file>.<export>
CMD ["lambda.handler"]

