# Two stages: build a static binary, then copy it alone into distroless.

FROM golang:1.26-alpine AS build
WORKDIR /src
# Dependencies first, so source changes don't re-download modules.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# CGO off: a static binary needs no libc, so it runs on distroless/static.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/search-service ./cmd/search-service

# No shell, no package manager, and a non-root user (uid 65532).
FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/search-service /search-service
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/search-service"]
