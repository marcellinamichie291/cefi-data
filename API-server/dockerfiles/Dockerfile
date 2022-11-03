FROM node:14 as base

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

WORKDIR /home/node/app


# Copy configuration files
COPY configs/${SERVICE_NAME}/package*.json configs/${SERVICE_NAME}/package*.json
COPY configs/${SERVICE_NAME}/tsconfig.json configs/${SERVICE_NAME}/tsconfig.json
COPY src/libs src/libs

# Copy service files
COPY src/${SERVICE_NAME} src/${SERVICE_NAME}

# Compile
RUN tsc -p configs/${SERVICE_NAME}/tsconfig.json

# TODO : finish this generic dockerfile
# https://sxia.medium.com/typescript-microservice-project-from-0-to-1-e962325e79ef
# https://medium.com/@fmoessle/typescript-paths-with-ts-node-ts-node-dev-and-jest-671deacf6428

