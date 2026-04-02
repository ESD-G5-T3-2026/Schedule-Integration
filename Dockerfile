FROM node:20-alpine AS build

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
RUN npm install

# Build TS -> dist/
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY openapi.yaml ./openapi.yaml
RUN npm run build


# ---- Lambda runtime image ----
FROM public.ecr.aws/lambda/nodejs:20

WORKDIR /var/task

# Copy runtime deps + compiled output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist

# Lambda handler wrapper exporting Lambda handler
COPY lambda.js ./lambda.js

# Lambda handler: <file>.<export>
CMD ["lambda.handler"]

