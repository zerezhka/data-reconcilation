.PHONY: up down build run dev clean frontend desktop desktop-dist

BACKEND_VERSION  = $(shell grep '^backend=' VERSION | cut -d= -f2)
FRONTEND_VERSION = $(shell grep '^frontend=' VERSION | cut -d= -f2)
DESKTOP_VERSION  = $(shell grep '^desktop=' VERSION | cut -d= -f2)
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

# Backend
build:
	go build -ldflags "-X main.version=$(BACKEND_VERSION)" -o bin/reconciler ./cmd/server

run: build
	./bin/reconciler -port 8080

dev:
	@if command -v air > /dev/null; then \
		air; \
	else \
		echo "Install 'air' for hot reload: go install github.com/air-verse/air@latest"; \
		$(MAKE) run; \
	fi

# Frontend
frontend:
	cd web && npm ci && npm run build

# Desktop (dev)
desktop: build frontend
	cd desktop && npm ci && npm start

# Desktop (dist)
desktop-dist: frontend
	mkdir -p bin/$(GOOS)
	GOOS=$(GOOS) GOARCH=$(GOARCH) go build -ldflags "-s -w -X main.version=$(BACKEND_VERSION)" -o bin/$(GOOS)/reconciler ./cmd/server
	cd desktop && npm version $(DESKTOP_VERSION) --no-git-tag-version --allow-same-version
	cd desktop && npm ci && npx electron-builder

# Version info
version:
	@echo "Backend:  $(BACKEND_VERSION)"
	@echo "Frontend: $(FRONTEND_VERSION)"
	@echo "Desktop:  $(DESKTOP_VERSION)"

clean:
	rm -rf bin/
	docker-compose down -v
