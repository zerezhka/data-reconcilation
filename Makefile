.PHONY: up down build run dev clean frontend embed desktop desktop-dist

GOOS   ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)

# Docker
up:
	docker-compose up -d
	@echo "PostgreSQL: localhost:5432 (recon/recon123, db: source_of_truth)"
	@echo "ClickHouse: localhost:8123 (recon/recon123, db: analytics)"

down:
	docker-compose down

reset: down
	docker volume rm data-reconcilation_pg_data data-reconcilation_ch_data 2>/dev/null || true
	$(MAKE) up

# Frontend
frontend:
	cd web && npm ci && npm run build

# Copy frontend into Go embed directory
embed: frontend
	rm -rf cmd/server/static/*
	cp -r web/dist/* cmd/server/static/

# Go backend (with embedded frontend)
build: embed
	go build -o bin/reconciler ./cmd/server

# Go backend (dev, no embed — uses ./web/dist at runtime)
build-dev:
	go build -o bin/reconciler ./cmd/server

run: build-dev
	./bin/reconciler -port 8080

# Development (with hot reload if air is installed)
dev:
	@if command -v air > /dev/null; then \
		air; \
	else \
		echo "Install 'air' for hot reload: go install github.com/air-verse/air@latest"; \
		$(MAKE) run; \
	fi

# Build Go binary for specific platform (used by CI)
build-platform: embed
	mkdir -p bin/$(GOOS)
	GOOS=$(GOOS) GOARCH=$(GOARCH) CGO_ENABLED=1 go build -o bin/$(GOOS)/reconciler ./cmd/server

# Desktop (Electron)
desktop: build
	cd desktop && npm ci && npm start

desktop-dist: build-platform
	cd desktop && npm version $$(cat ../VERSION) --no-git-tag-version --allow-same-version
	cd desktop && npm ci && npx electron-builder

clean:
	rm -rf bin/ cmd/server/static/*
	touch cmd/server/static/.gitkeep
	docker-compose down -v
