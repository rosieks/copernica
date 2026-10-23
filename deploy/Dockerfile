# syntax=docker/dockerfile:1
# Build: docker build -f deploy/Dockerfile -t copernica .
# Multi-arch: docker buildx build --platform linux/amd64,linux/arm64 -f deploy/Dockerfile .

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web
WORKDIR /src/src/web
COPY src/web/package.json src/web/package-lock.json ./
RUN npm ci
COPY src/web/ ./
# The type check also covers unit tests, which import the shared anchoring fixtures.
COPY tests/fixtures/anchoring/ /src/tests/fixtures/anchoring/
RUN npm run build

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/Copernica/Copernica.csproj src/Copernica/packages.lock.json src/Copernica/
# RuntimeIdentifiers in the project cover all target platforms, so one locked restore serves every RID.
RUN dotnet restore src/Copernica --locked-mode
COPY src/Copernica/ src/Copernica/
COPY --from=web /src/src/web/dist src/web/dist
# Folder publish (not single-file): nothing is extracted at runtime, so the root FS can stay read-only.
RUN RID=linux-$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x64) \
 && dotnet publish src/Copernica -c Release -r "$RID" --self-contained --no-restore \
      -p:SkipWebBuild=true -o /app \
 && mkdir -p /empty-data

FROM mcr.microsoft.com/dotnet/runtime-deps:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app ./
# Pre-create the data directory owned by the app user so new Docker volumes are writable.
COPY --from=build --chown=1654:1654 /empty-data /data
ENV Copernica__DataDirectory=/data \
    DOTNET_gcServer=0
VOLUME /data
EXPOSE 8080
# Non-root user built into .NET images (UID 1654).
USER 1654
ENTRYPOINT ["/app/copernica"]
